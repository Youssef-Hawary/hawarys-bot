import { Hono, type Context, type Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { db, getSetting, setSetting, audit, now } from './db.ts';
import { createSession, createUser, deleteSession, login, userCount, userFromToken, hashPassword, type User } from './auth.ts';
import { GAMES, GAME_NAMES, TIERS, ladder, type Game } from './ranks.ts';
import { REGIONS, REGION_NAMES, POINTS_LABEL, SERVICE_KEYS, SERVICE_INFO, getPricing, savePricing, defaultPricing, migratePricing, normalizeRequest, quote } from './pricing.ts';
import { eldorado, getCreds, hasCreds } from './eldorado.ts';
import { backupNow } from './backup.ts';
import { getDiscord, sendDiscord } from './discord.ts';
import { analytics, workerSummary, workerPay, getFees, LIVE_STATES, type OrderRow } from './money.ts';
import {
  bus, log, changed, getBot, getMessages, setRunning, receiveDetails, heartbeat, liveClients, outboxFor, outboxResult, chatMessage, fill, isLeader,
  pollNow, detailsFailed,
} from './engine.ts';

type Env = { Variables: { user: User; token: string } };
export const api = new Hono<Env>();

const COOKIE = 'hb_session';
const secure = () => process.env.SECURE_COOKIES === '1';

// ---------------- auth ----------------

const attempts = new Map<string, { n: number; until: number }>();
function rateLimited(c: Context) {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0] ?? c.req.header('x-real-ip') ?? 'local';
  const a = attempts.get(ip);
  if (a && a.until > now() && a.n >= 8) return true;
  attempts.set(ip, { n: (a && a.until > now() ? a.n : 0) + 1, until: now() + 10 * 60_000 });
  return false;
}

api.get('/auth/status', c => c.json({ needsSetup: userCount() === 0 }));

api.post('/auth/setup', async c => {
  if (userCount() > 0) return c.json({ error: 'Already set up' }, 400);
  const { username, displayName, password } = await c.req.json();
  if (!username || !password || password.length < 8) return c.json({ error: 'Username and a password of 8+ characters are required' }, 400);
  const id = createUser({ username, displayName: displayName || username, password, role: 'owner' });
  audit(id, 'setup.owner_created');
  const token = createSession(id);
  setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: secure(), path: '/', maxAge: 30 * 86400 });
  return c.json({ ok: true });
});

api.post('/auth/login', async c => {
  if (rateLimited(c)) return c.json({ error: 'Too many attempts. Wait 10 minutes.' }, 429);
  const { username, password } = await c.req.json();
  const user = login(String(username ?? ''), String(password ?? ''));
  if (!user) return c.json({ error: 'Wrong username or password' }, 401);
  const token = createSession(user.id);
  setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: secure(), path: '/', maxAge: 30 * 86400 });
  audit(user.id, 'auth.login');
  return c.json({ ok: true });
});

// The extension logs in with the same accounts but gets a bearer token instead of a cookie.
api.post('/ext/login', async c => {
  if (rateLimited(c)) return c.json({ error: 'Too many attempts. Wait 10 minutes.' }, 429);
  const { username, password } = await c.req.json();
  const user = login(String(username ?? ''), String(password ?? ''));
  if (!user) return c.json({ error: 'Wrong username or password' }, 401);
  audit(user.id, 'extension.login');
  return c.json({ token: createSession(user.id, 'extension'), user: { name: user.display_name, role: user.role } });
});

async function requireUser(c: Context<Env>, next: Next) {
  const bearer = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const token = bearer || getCookie(c, COOKIE);
  const user = userFromToken(token);
  if (!user) return c.json({ error: 'Not logged in' }, 401);
  c.set('user', user);
  c.set('token', token!);
  await next();
}
const ownerOnly = async (c: Context<Env>, next: Next) => {
  if (c.get('user').role !== 'owner') return c.json({ error: 'Owner only' }, 403);
  await next();
};

api.use('/*', async (c, next) => {
  const open = ['/api/auth/status', '/api/auth/setup', '/api/auth/login', '/api/ext/login'];
  if (open.includes(c.req.path)) return next();
  return requireUser(c, next);
});

api.post('/auth/logout', c => {
  deleteSession(c.get('token'));
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

const publicUser = (u: User) => ({ id: u.id, username: u.username, name: u.display_name, role: u.role, color: u.color });
api.get('/auth/me', c => c.json(publicUser(c.get('user'))));

// ---------------- live events (SSE) ----------------

api.get('/events', c => streamSSE(c, async stream => {
  const onLog = (l: unknown) => stream.writeSSE({ event: 'log', data: JSON.stringify(l) });
  const onChange = (topic: string) => stream.writeSSE({ event: 'change', data: topic });
  bus.on('log', onLog);
  bus.on('change', onChange);
  stream.onAbort(() => { bus.off('log', onLog); bus.off('change', onChange); });
  while (!stream.aborted) { await stream.writeSSE({ event: 'ping', data: '' }); await stream.sleep(25_000); }
}));

api.get('/logs', c => {
  const limit = Math.min(Number(c.req.query('limit') ?? 150), 1000);
  return c.json((db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all(limit) as any[]).reverse());
});

// ---------------- overview + bot ----------------

function botStatus() {
  const bot = getBot();
  return {
    ...bot,
    hasCreds: hasCreds(),
    extensions: liveClients().map(e => ({ name: e.name, onEldorado: e.onEldorado, leader: e.leader, version: e.version })),
    recording: getSetting('recording', false),
  };
}

api.get('/overview', c => {
  const user = c.get('user');
  const owner = user.role === 'owner';
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekStart = now() - 7 * 86400_000;
  const count = (sql: string, ...a: any[]) => (db.prepare(sql).get(...a) as { n: number }).n;
  const board = {
    unassigned: count(`SELECT COUNT(*) AS n FROM orders WHERE state = 'Paid' AND assigned_to IS NULL`),
    inProgress: count(`SELECT COUNT(*) AS n FROM orders WHERE state = 'Paid' AND assigned_to IS NOT NULL`),
    mine: count(`SELECT COUNT(*) AS n FROM orders WHERE state = 'Paid' AND assigned_to = ?`, user.id),
    dueSoon: count(`SELECT COUNT(*) AS n FROM orders WHERE state = 'Paid' AND deadline < ?`, now() + 6 * 3600_000),
  };
  const offers = {
    today: count('SELECT COUNT(*) AS n FROM requests WHERE offered_at >= ?', dayStart.getTime()),
    week: count('SELECT COUNT(*) AS n FROM requests WHERE offered_at >= ?', weekStart),
    wouldToday: count(`SELECT COUNT(*) AS n FROM requests WHERE status = 'would_offer' AND seen_at >= ?`, dayStart.getTime()),
    pendingDetails: count(`SELECT COUNT(*) AS n FROM requests WHERE status = 'needs_details' AND seen_at >= ?`, now() - 86400_000),
  };
  const today = analytics(1, owner ? null : user).totals;
  const week = analytics(7, owner ? null : user).totals;
  return c.json({ bot: botStatus(), board, offers, today, week, me: workerSummary(user.id) });
});

api.post('/bot/start', async c => { await setRunning(true, c.get('user').display_name); audit(c.get('user').id, 'bot.start'); return c.json(botStatus()); });
api.post('/bot/stop', async c => { await setRunning(false, c.get('user').display_name); audit(c.get('user').id, 'bot.stop'); return c.json(botStatus()); });

// ---------------- orders board ----------------

function orderView(o: OrderRow, viewer: User, users: Map<number, User>) {
  const worker = o.assigned_to ? users.get(o.assigned_to) : undefined;
  const canSeePay = viewer.role === 'owner' || viewer.id === o.assigned_to;
  return {
    ...o,
    assignee: worker ? { id: worker.id, name: worker.display_name, color: worker.color } : null,
    workerPay: canSeePay && worker ? workerPay(o, worker) : null,
    worker_pay_override: canSeePay ? o.worker_pay_override : null,
  };
}

const usersMap = () => new Map((db.prepare('SELECT * FROM users').all() as unknown as User[]).map(u => [u.id, u]));
const getOrder = (id: string) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;

api.get('/orders', c => {
  const days = Number(c.req.query('days') ?? 30);
  const rows = db.prepare(`SELECT * FROM orders WHERE state = 'Paid' OR created_at >= ? ORDER BY created_at DESC LIMIT 500`).all(now() - days * 86400_000) as unknown as OrderRow[];
  const users = usersMap();
  return c.json(rows.map(o => orderView(o, c.get('user'), users)));
});

api.post('/orders/:id/take', c => {
  const user = c.get('user');
  const o = getOrder(c.req.param('id'));
  if (!o) return c.json({ error: 'Order not found' }, 404);
  if (o.assigned_to && o.assigned_to !== user.id && user.role !== 'owner') return c.json({ error: 'Someone already took this order' }, 409);
  db.prepare('UPDATE orders SET assigned_to = ?, assigned_at = ? WHERE id = ?').run(user.id, now(), o.id);
  audit(user.id, 'order.take', { order: o.id, title: o.title });
  log('info', `🙋 ${user.display_name} took ${o.title}`);
  changed('orders');
  return c.json({ ok: true });
});

api.post('/orders/:id/release', c => {
  const user = c.get('user');
  const o = getOrder(c.req.param('id'));
  if (!o) return c.json({ error: 'Order not found' }, 404);
  if (o.assigned_to !== user.id && user.role !== 'owner') return c.json({ error: 'Not your order' }, 403);
  db.prepare('UPDATE orders SET assigned_to = NULL, assigned_at = NULL WHERE id = ?').run(o.id);
  audit(user.id, 'order.release', { order: o.id, title: o.title });
  changed('orders');
  return c.json({ ok: true });
});

api.post('/orders/:id/assign', ownerOnly, async c => {
  const { userId } = await c.req.json();
  const o = getOrder(c.req.param('id'));
  const target = usersMap().get(Number(userId));
  if (!o || !target) return c.json({ error: 'Not found' }, 404);
  db.prepare('UPDATE orders SET assigned_to = ?, assigned_at = ? WHERE id = ?').run(target.id, now(), o.id);
  audit(c.get('user').id, 'order.assign', { order: o.id, title: o.title, to: target.display_name });
  log('info', `🔁 ${c.get('user').display_name} assigned ${o.title} to ${target.display_name}`);
  changed('orders');
  return c.json({ ok: true });
});

api.put('/orders/:id/pay', ownerOnly, async c => {
  const { amount } = await c.req.json();
  db.prepare('UPDATE orders SET worker_pay_override = ? WHERE id = ?').run(amount === null || amount === '' ? null : Number(amount), c.req.param('id'));
  audit(c.get('user').id, 'order.pay_override', { order: c.req.param('id'), amount });
  changed('orders');
  return c.json({ ok: true });
});

const canAct = (u: User, o: OrderRow) => u.role === 'owner' || o.assigned_to === u.id || !o.assigned_to;

api.post('/orders/:id/deliver', async c => {
  const user = c.get('user');
  const o = getOrder(c.req.param('id'));
  if (!o) return c.json({ error: 'Order not found' }, 404);
  if (!canAct(user, o)) return c.json({ error: 'Not your order' }, 403);
  await eldorado.deliver(o.id);
  db.prepare(`UPDATE orders SET state = 'Delivered', delivered_at = ?, assigned_to = COALESCE(assigned_to, ?), updated_at = ? WHERE id = ?`).run(now(), user.id, now(), o.id);
  const m = getMessages().delivered;
  if (m.enabled) db.prepare(`INSERT INTO outbox (kind, conversation_id, order_id, text, not_before, created_at) VALUES ('delivered', ?, ?, ?, ?, ?)`)
    .run(o.conversation_id, o.id, fill(m.text, { name: o.buyer }), now(), now());
  audit(user.id, 'order.deliver', { order: o.id, title: o.title });
  log('success', `📦 ${user.display_name} delivered ${o.title}`);
  changed('orders');
  return c.json({ ok: true });
});

api.post('/orders/:id/cancel', async c => {
  const user = c.get('user');
  const o = getOrder(c.req.param('id'));
  if (!o) return c.json({ error: 'Order not found' }, 404);
  if (!canAct(user, o)) return c.json({ error: 'Not your order' }, 403);
  const { reason, message } = await c.req.json();
  await eldorado.cancel(o.id, reason || 'Other', message);
  db.prepare(`UPDATE orders SET state = 'Canceled', updated_at = ? WHERE id = ?`).run(now(), o.id);
  audit(user.id, 'order.cancel', { order: o.id, title: o.title, reason });
  log('warn', `✖ ${user.display_name} canceled ${o.title} (${reason})`);
  changed('orders');
  return c.json({ ok: true });
});

api.post('/orders/:id/extend', async c => {
  const user = c.get('user');
  const o = getOrder(c.req.param('id'));
  if (!o) return c.json({ error: 'Order not found' }, 404);
  const { time, reason, message } = await c.req.json();
  await eldorado.extend(o.id, time, reason, message);
  const add: Record<string, number> = { Minute5: 5, Minute15: 15, Minute30: 30, Hour1: 60, Hour3: 180, Hour6: 360 };
  db.prepare('UPDATE orders SET deadline = deadline + ?, deadline_alerted = 0 WHERE id = ?').run((add[time] ?? 0) * 60_000, o.id);
  audit(user.id, 'order.extend', { order: o.id, title: o.title, time });
  changed('orders');
  return c.json({ ok: true });
});

// ---------------- requests / offers ----------------

api.get('/requests', c => {
  const rows = db.prepare('SELECT * FROM requests ORDER BY seen_at DESC LIMIT 300').all() as any[];
  return c.json(rows.map(r => {
    const details = r.details ? JSON.parse(r.details) : null;
    const norm = details && r.game ? normalizeRequest(r.game, `${r.category ?? ''} ${details.title ?? ''}`, details.fields) : null;
    return { ...r, details, summary: norm };
  }));
});

api.post('/requests/:id/retry', async c => {
  db.prepare(`UPDATE requests SET status = 'needs_details', reason = NULL WHERE id = ? AND status IN ('skipped', 'error', 'would_offer')`).run(c.req.param('id'));
  const { processRequest } = await import('./engine.ts');
  await processRequest(c.req.param('id'));
  return c.json({ ok: true });
});

// ---------------- pricing ----------------

api.get('/pricing', c => c.json({
  games: Object.fromEntries(GAMES.map(g => [g, getPricing(g)])),
  meta: Object.fromEntries(GAMES.map(g => [g, {
    name: GAME_NAMES[g], tiers: TIERS[g].map(t => t.name), ranks: ladder(g).map(r => r.label), regions: REGIONS[g], points: POINTS_LABEL[g],
    regionNames: Object.fromEntries(REGIONS[g].map(r => [r, REGION_NAMES[r] ?? r])),
    services: SERVICE_KEYS.map(k => ({ key: k, ...SERVICE_INFO[k] })),
  }])),
}));

api.put('/pricing/:game', async c => {
  const game = c.req.param('game') as Game;
  if (!GAMES.includes(game)) return c.json({ error: 'Unknown game' }, 404);
  savePricing(game, migratePricing(game, await c.req.json()));
  audit(c.get('user').id, 'pricing.save', { game });
  log('info', `💲 ${c.get('user').display_name} updated ${GAME_NAMES[game]} pricing`);
  changed('pricing');
  return c.json({ ok: true });
});

api.post('/pricing/:game/reset', c => {
  const game = c.req.param('game') as Game;
  savePricing(game, defaultPricing(game));
  audit(c.get('user').id, 'pricing.reset', { game });
  changed('pricing');
  return c.json(getPricing(game));
});

api.post('/pricing/:game/quote', async c => {
  const game = c.req.param('game') as Game;
  const { fields, category, pricing } = await c.req.json();
  return c.json(quote(normalizeRequest(game, category ?? 'Rank Boost', fields ?? {}), pricing ? migratePricing(game, pricing) : getPricing(game)));
});

// ---------------- messages ----------------

api.get('/messages', c => c.json(getMessages()));
api.put('/messages', async c => {
  setSetting('messages', await c.req.json());
  audit(c.get('user').id, 'messages.save');
  log('info', `💬 ${c.get('user').display_name} updated auto-chat messages`);
  return c.json({ ok: true });
});
// ---- opener image per game (sent in chat after the opening message) ----
const IMAGE_TYPES: Record<string, (b: Uint8Array) => boolean> = {
  'image/png': b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8,
  'image/webp': b => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  'image/gif': b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
};
const imageGame = (g: string) => (GAMES as string[]).includes(g) ? g as Game : null;

api.get('/messages/images', c => {
  const rows = db.prepare(`SELECT key, name, mime, length(data) AS size, updated_at FROM files WHERE key LIKE 'opener:%'`).all() as any[];
  return c.json(Object.fromEntries(GAMES.map(g => [g, rows.find(r => r.key === `opener:${g}`) ?? null])));
});

api.put('/messages/images/:game', async c => {
  const game = imageGame(c.req.param('game'));
  if (!game) return c.json({ error: 'Unknown game' }, 404);
  const mime = String(c.req.header('content-type') ?? '').split(';')[0].trim();
  const data = new Uint8Array(await c.req.arrayBuffer());
  if (!IMAGE_TYPES[mime] || data.length < 12 || !IMAGE_TYPES[mime](data)) return c.json({ error: 'Use a PNG, JPG, WEBP or GIF image' }, 400);
  if (data.length > 5 * 1024 * 1024) return c.json({ error: 'Image is too big (max 5 MB)' }, 400);
  const name = String(c.req.header('x-file-name') ?? `${game}.${mime.split('/')[1]}`).replace(/[^\w.\- ]/g, '').slice(0, 80) || `${game}.png`;
  db.prepare('INSERT OR REPLACE INTO files (key, name, mime, data, updated_at) VALUES (?, ?, ?, ?, ?)').run(`opener:${game}`, name, mime, data, now());
  audit(c.get('user').id, 'messages.image', { game, size: data.length });
  log('info', `🖼️ ${c.get('user').display_name} set the ${GAME_NAMES[game]} opener image`);
  changed('messages');
  return c.json({ ok: true });
});

api.delete('/messages/images/:game', c => {
  const game = imageGame(c.req.param('game'));
  if (!game) return c.json({ error: 'Unknown game' }, 404);
  db.prepare('DELETE FROM files WHERE key = ?').run(`opener:${game}`);
  audit(c.get('user').id, 'messages.image_remove', { game });
  changed('messages');
  return c.json({ ok: true });
});

// The image itself (dashboard preview, and the extension when it sends the opener).
api.get('/messages/images/:game/file', c => {
  const row = db.prepare('SELECT name, mime, data FROM files WHERE key = ?').get(`opener:${c.req.param('game')}`) as any;
  if (!row) return c.json({ error: 'No image' }, 404);
  c.header('Content-Type', row.mime);
  c.header('Cache-Control', 'private, max-age=60');
  return c.body(row.data);
});

api.get('/outbox', c => c.json(db.prepare('SELECT * FROM outbox ORDER BY id DESC LIMIT 100').all()));

// ---------------- team + money ----------------

api.get('/me/summary', c => c.json({ summary: workerSummary(c.get('user').id), analytics: analytics(Number(c.req.query('days') ?? 30), c.get('user')) }));

api.get('/team', c => {
  const users = db.prepare('SELECT id, username, display_name, role, pay_type, pay_value, color, active, created_at FROM users ORDER BY id').all() as any[];
  if (c.get('user').role !== 'owner') return c.json(users.filter(u => u.active).map(u => ({ id: u.id, name: u.display_name, color: u.color, role: u.role })));
  return c.json(users.map(u => ({ ...u, summary: workerSummary(u.id) })));
});

api.post('/team', ownerOnly, async c => {
  const { username, displayName, password, payType, payValue } = await c.req.json();
  if (!username || !password || password.length < 8) return c.json({ error: 'Username and a password of 8+ characters are required' }, 400);
  try {
    const id = createUser({ username, displayName: displayName || username, password, role: 'worker', payType, payValue: Number(payValue ?? 50) });
    audit(c.get('user').id, 'team.add', { username });
    return c.json({ id });
  } catch { return c.json({ error: 'That username is taken' }, 409); }
});

api.put('/team/:id', ownerOnly, async c => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json();
  const target = usersMap().get(id);
  if (!target) return c.json({ error: 'Not found' }, 404);
  if (target.role === 'owner' && b.active === 0) return c.json({ error: "You can't disable the owner" }, 400);
  db.prepare('UPDATE users SET display_name = ?, pay_type = ?, pay_value = ?, color = ?, active = ? WHERE id = ?')
    .run(b.display_name ?? target.display_name, b.pay_type ?? target.pay_type, Number(b.pay_value ?? target.pay_value),
      b.color ?? target.color, b.active ?? target.active, id);
  if (b.password) {
    if (String(b.password).length < 8) return c.json({ error: 'Password must be 8+ characters' }, 400);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(b.password), id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
  if (b.active === 0) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  audit(c.get('user').id, 'team.update', { user: target.username, fields: Object.keys(b).filter(k => k !== 'password'), password: !!b.password });
  return c.json({ ok: true });
});

api.get('/team/:id/payouts', ownerOnly, c =>
  c.json(db.prepare('SELECT * FROM payouts WHERE user_id = ? ORDER BY id DESC').all(Number(c.req.param('id')))));

api.post('/team/:id/payout', ownerOnly, async c => {
  const { amount, note } = await c.req.json();
  if (!(Number(amount) > 0)) return c.json({ error: 'Amount must be positive' }, 400);
  db.prepare('INSERT INTO payouts (user_id, amount, note, created_at, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(Number(c.req.param('id')), Number(amount), note ?? null, now(), c.get('user').id);
  audit(c.get('user').id, 'team.payout', { user: Number(c.req.param('id')), amount });
  return c.json({ ok: true });
});

api.get('/analytics', c => {
  const user = c.get('user');
  const days = Math.min(Number(c.req.query('days') ?? 30), 365);
  if (user.role !== 'owner') return c.json({ ...analytics(days, user), workers: [workerSummary(user.id)] });
  const ids = (db.prepare('SELECT id FROM users WHERE active = 1').all() as { id: number }[]).map(r => r.id);
  return c.json({ ...analytics(days, null), workers: ids.map(workerSummary), fees: getFees() });
});

// ---------------- buyers ----------------

api.get('/buyers', c => {
  const owner = c.get('user').role === 'owner';
  const rows = db.prepare(`
    SELECT b.username, b.note, b.blacklisted, COUNT(o.id) AS orders,
           COALESCE(SUM(CASE WHEN o.state IN (${LIVE_STATES.map(() => '?').join(',')}) THEN o.price END), 0) AS spent,
           MAX(o.created_at) AS last_order,
           (SELECT COUNT(*) FROM requests r WHERE r.buyer = b.username) AS requests
    FROM buyers b LEFT JOIN orders o ON o.buyer = b.username
    GROUP BY b.username ORDER BY orders DESC, last_order DESC LIMIT 500`).all(...LIVE_STATES) as any[];
  return c.json(rows.map(r => ({ ...r, spent: owner ? r.spent : null })));
});

api.put('/buyers/:name', async c => {
  const name = c.req.param('name');
  const { note, blacklisted } = await c.req.json();
  const b = db.prepare('SELECT * FROM buyers WHERE username = ?').get(name) as any;
  if (!b) return c.json({ error: 'Buyer not found' }, 404);
  db.prepare('UPDATE buyers SET note = ?, blacklisted = ? WHERE username = ?').run(note ?? b.note, blacklisted ? 1 : 0, name);
  if (b.buyer_id && hasCreds() && Boolean(blacklisted) !== Boolean(b.blacklisted)) {
    try { blacklisted ? await eldorado.muteBuyer(b.buyer_id) : await eldorado.unmuteBuyer(b.buyer_id); }
    catch (e) { log('warn', `Couldn't ${blacklisted ? 'mute' : 'unmute'} ${name} on Eldorado: ${(e as Error).message}`); }
  }
  audit(c.get('user').id, 'buyer.update', { buyer: name, blacklisted: !!blacklisted });
  return c.json({ ok: true });
});

// ---------------- audit ----------------

api.get('/audit', ownerOnly, c => c.json(db.prepare(`
  SELECT a.*, u.display_name AS user FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 500`).all()));

// ---------------- settings (owner) ----------------

api.get('/settings', ownerOnly, c => {
  const creds = getCreds();
  return c.json({
    bot: getBot(), discord: getDiscord(), fees: getFees(), gameIds: getSetting('gameIds', {}), recording: getSetting('recording', false),
    eldorado: { clientId: creds.clientId, hasSecret: !!creds.clientSecret, secretLast4: creds.clientSecret.slice(-4) },
  });
});

// Settings file: everything you set up (bot, prices, messages, fees, Discord), but never the Eldorado API keys.
const EXPORT_KEYS = ['bot', 'discord', 'fees', 'gameIds', 'messages', 'pricing:valorant', 'pricing:lol'];
api.get('/settings/export', ownerOnly, c => {
  const settings: Record<string, unknown> = {};
  for (const k of EXPORT_KEYS) {
    const v = k.startsWith('pricing:') ? getPricing(k.slice(8) as Game)
      : k === 'bot' ? getBot() : k === 'messages' ? getMessages() : k === 'fees' ? getFees() : k === 'discord' ? getDiscord() : getSetting(k, null);
    if (v != null) settings[k] = v;
  }
  if (settings.bot) settings.bot = { ...(settings.bot as object), running: false };
  c.header('Content-Disposition', `attachment; filename="hawarys-bot-settings-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json({ app: "Hawary's Bot", kind: 'settings', version: 1, exportedAt: new Date().toISOString(), settings });
});

api.post('/settings/import', ownerOnly, async c => {
  const b = await c.req.json().catch(() => null);
  if (b?.kind !== 'settings' || typeof b.settings !== 'object') return c.json({ error: "That isn't a Hawary's Bot settings file" }, 400);
  const done: string[] = [];
  for (const k of EXPORT_KEYS) {
    const v = b.settings[k];
    if (v == null) continue;
    if (k.startsWith('pricing:')) savePricing(k.slice(8) as Game, migratePricing(k.slice(8) as Game, v));
    else if (k === 'bot') setSetting('bot', { ...getBot(), ...v, running: getBot().running });
    else setSetting(k, v);
    done.push(k);
  }
  audit(c.get('user').id, 'settings.import', { keys: done });
  log('info', `📥 ${c.get('user').display_name} imported settings (${done.length} sections)`);
  changed('bot'); changed('pricing'); changed('messages');
  return c.json({ ok: true, imported: done });
});

api.post('/settings/backup', ownerOnly, c => {
  const file = backupNow();
  return c.json({ ok: true, file });
});

api.put('/settings', ownerOnly, async c => {
  const b = await c.req.json();
  if (b.bot) setSetting('bot', { ...getBot(), ...b.bot, running: getBot().running });
  if (b.discord) setSetting('discord', { ...getDiscord(), ...b.discord });
  if (b.fees) setSetting('fees', { ...getFees(), ...b.fees });
  if (b.gameIds) setSetting('gameIds', b.gameIds);
  if (typeof b.recording === 'boolean') setSetting('recording', b.recording);
  if (b.eldorado) {
    const cur = getCreds();
    setSetting('eldorado', { clientId: b.eldorado.clientId ?? cur.clientId, clientSecret: b.eldorado.clientSecret || cur.clientSecret });
  }
  audit(c.get('user').id, 'settings.save', { sections: Object.keys(b) });
  changed('bot');
  return c.json({ ok: true });
});

api.post('/settings/eldorado/test', ownerOnly, async c => {
  try { await eldorado.testToken(); return c.json({ ok: true }); }
  catch (e) { return c.json({ ok: false, error: (e as Error).message }); }
});

api.post('/settings/discord/test', ownerOnly, async c => {
  try { await sendDiscord('👋 Hawary\'s Bot is connected', 'Alerts will show up in this channel.'); return c.json({ ok: true }); }
  catch (e) { return c.json({ ok: false, error: (e as Error).message }); }
});

api.get('/captures', ownerOnly, c => c.json(db.prepare('SELECT * FROM captures ORDER BY id DESC LIMIT 300').all()));
api.delete('/captures', ownerOnly, c => { db.prepare('DELETE FROM captures').run(); return c.json({ ok: true }); });

// ---------------- extension ----------------

api.post('/ext/heartbeat', async c => {
  const { clientId, onEldorado, version } = await c.req.json();
  const user = c.get('user');
  const leader = heartbeat(String(clientId), { userId: user.id, name: user.display_name, onEldorado: !!onEldorado, version: String(version ?? '') });
  return c.json({ leader, recording: getSetting('recording', false), running: getBot().running, template: getSetting('requestUrlTemplate', null), user: { name: user.display_name, role: user.role } });
});

// Before making new keys, the extension asks whether the current ones still work (Eldorado allows only a few keys).
api.post('/ext/eldorado-status', ownerOnly, async c => {
  if (!hasCreds()) return c.json({ ok: false, clientId: null });
  try { await eldorado.testToken(); return c.json({ ok: true, clientId: getCreds().clientId }); }
  catch (e) { return c.json({ ok: false, clientId: getCreds().clientId, error: (e as Error).message }); }
});

// The owner's extension creates Eldorado API keys from the logged-in Eldorado tab and hands them over here.
api.post('/ext/eldorado-keys', ownerOnly, async c => {
  const { clientId, clientSecret } = await c.req.json();
  if (!clientId || !clientSecret) return c.json({ error: 'clientId and clientSecret required' }, 400);
  setSetting('eldorado', { clientId: String(clientId), clientSecret: String(clientSecret) });
  audit(c.get('user').id, 'settings.eldorado_keys', { via: 'extension' });
  log('success', `🔑 ${c.get('user').display_name} connected the Eldorado API from the extension`);
  changed('bot');
  try { await eldorado.testToken(); return c.json({ tested: true }); }
  catch (e) { return c.json({ tested: false, testError: (e as Error).message }); }
});

// Eldorado's live feed said a new boosting request was created: check right away.
api.post('/ext/poke', async c => c.json({ fresh: await pollNow() }));

api.post('/ext/details-failed', async c => {
  const { requestId, error } = await c.req.json();
  if (requestId) detailsFailed(String(requestId), String(error ?? 'unknown').slice(0, 200));
  return c.json({ ok: true });
});

// The extension reports problems here so they show up in the Activity log.
const lastReports = new Map<string, number>();
api.post('/ext/report', async c => {
  const { message, level } = await c.req.json();
  const msg = String(message ?? '').slice(0, 300);
  const key = msg.replace(/[0-9a-f]{8}/g, '');
  if (msg && Date.now() - (lastReports.get(key) ?? 0) > 120_000) { lastReports.set(key, Date.now()); log(level === 'info' ? 'info' : 'warn', `🧩 Extension (${c.get('user').display_name}): ${msg}`); }
  return c.json({ ok: true });
});

api.post('/ext/request-details', async c => {
  const b = await c.req.json();
  if (!b.requestId || !b.fields) return c.json({ error: 'requestId and fields required' }, 400);
  const it = b.item && typeof b.item === 'object' ? b.item : null;
  const item = it && String(it.id) === String(b.requestId) ? {
    id: String(it.id), gameId: it.gameId == null ? '' : String(it.gameId), boostingCategoryId: String(it.boostingCategoryId ?? ''),
    boostingCategoryTitle: String(it.boostingCategoryTitle ?? ''), createdDate: String(it.createdDate ?? ''),
    buyerId: String(it.buyerId ?? ''), buyerUsername: String(it.buyerUsername ?? b.buyer ?? ''), isBuyerMuted: !!it.isBuyerMuted,
  } : undefined;
  await receiveDetails({ requestId: String(b.requestId), title: b.title, fields: b.fields, buyer: b.buyer, fast: !!b.fast, item });
  const row = db.prepare('SELECT status, reason, price FROM requests WHERE id = ?').get(String(b.requestId));
  return c.json(row);
});

api.post('/ext/captures', async c => {
  if (!getSetting('recording', false)) return c.json({ ok: false, recording: false });
  const items = (await c.req.json()) as any[];
  const ins = db.prepare('INSERT INTO captures (ts, method, url, status, req_body, resp_body) VALUES (?, ?, ?, ?, ?, ?)');
  for (const it of items.slice(0, 50)) ins.run(now(), it.method, String(it.url).slice(0, 1000), it.status ?? null,
    it.reqBody ? String(it.reqBody).slice(0, 20_000) : null, it.respBody ? String(it.respBody).slice(0, 100_000) : null);
  db.prepare('DELETE FROM captures WHERE id NOT IN (SELECT id FROM captures ORDER BY id DESC LIMIT 2000)').run();
  return c.json({ ok: true });
});

// Requests the leader extension should open to read ranks/RR/server (the API list doesn't include them).
api.get('/ext/pending-details', c => {
  if (!isLeader(String(c.req.query('clientId'))) || !getBot().running) return c.json({ template: getSetting('requestUrlTemplate', null), ids: [] });
  const ids = (db.prepare(`SELECT id FROM requests WHERE status = 'needs_details' AND seen_at > ? ORDER BY seen_at DESC LIMIT 5`)
    .all(now() - 2 * 3600_000) as { id: string }[]).map(r => r.id);
  return c.json({ template: getSetting('requestUrlTemplate', null), ids });
});

// The extension learns the request page address from a page a human opened, e.g. /boosting-request/{id}.
api.post('/ext/request-url-template', async c => {
  const { template } = await c.req.json();
  if (typeof template !== 'string' || !template.includes('{id}') || !template.startsWith('https://')) return c.json({ error: 'bad template' }, 400);
  if (getSetting('requestUrlTemplate', null) !== template) { setSetting('requestUrlTemplate', template); log('info', `🧭 Learned the request page address: ${template}`); }
  return c.json({ ok: true });
});

api.get('/ext/outbox', async c => c.json(await outboxFor(String(c.req.query('clientId')))));
api.post('/ext/outbox/:id', async c => {
  const { ok, error, conversationId } = await c.req.json();
  outboxResult(Number(c.req.param('id')), !!ok, error, typeof conversationId === 'string' && conversationId ? conversationId : undefined);
  return c.json({ ok: true });
});

// A chat message the extension saw in Eldorado chat (live). Only buyers' messages matter.
api.post('/ext/chat-message', async c => {
  const b = await c.req.json();
  if (!b.conversationId) return c.json({ error: 'conversationId required' }, 400);
  return c.json(chatMessage({ conversationId: String(b.conversationId), text: String(b.text ?? '').slice(0, 4000), sender: b.sender ? String(b.sender) : null, byMe: !!b.byMe }));
});

api.onError((err, c) => {
  log('error', `${c.req.method} ${c.req.path}: ${err.message}`);
  return c.json({ error: err.message }, 500);
});

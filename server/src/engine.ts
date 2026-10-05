// The bot: watches Eldorado requests + orders, prices, sends offers, queues chat messages, fires alerts.
import { EventEmitter } from 'node:events';
import { db, getSetting, setSetting, now } from './db.ts';
import { eldorado, hasCreds, EldoradoError, type BoostingRequestItem } from './eldorado.ts';
import { detectGame, normalizeRequest, quote } from './pricing.ts';
import { type Game, rankIndex } from './ranks.ts';
import { getDiscord, sendDiscord } from './discord.ts';
import { analytics } from './money.ts';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

export type BotSettings = { running: boolean; dryRun: boolean; pollSeconds: number; maxOffersPerHour: number; syncOnlineStatus: boolean; deadlineAlertHours: number };
export const getBot = () => getSetting<BotSettings>('bot', { running: false, dryRun: true, pollSeconds: 10, maxOffersPerHour: 30, syncOnlineStatus: false, deadlineAlertHours: 2 });

export type Template = { enabled: boolean; text: string };
export type Messages = {
  openers: { id: string; enabled: boolean; text: string }[];
  followUp: Template & { delayMinutes: number };
  accepted: Template;
  delivered: Template;
  received: Template;
};
export const getMessages = () => getSetting<Messages>('messages', {
  openers: [
    { id: 'A', enabled: true, text: "Hi {name}! I just sent you my offer: {price}, done in {time}. Experienced booster, safe and fast. Ask me anything!" },
    { id: 'B', enabled: false, text: "Hey {name} 👋 Ready to start right now. {price} with delivery in {time}. Happy to answer any questions before you pick." },
  ],
  followUp: { enabled: false, delayMinutes: 20, text: "Hi {name}, just checking in. I'm online and can start your boost right away if you accept my offer 🙂" },
  accepted: { enabled: true, text: "Thanks for your order {name}! Please send your login details here so we can start right away." },
  delivered: { enabled: true, text: "All done {name}! Your order is delivered. Please check and confirm with the Order Received button 🙏" },
  received: { enabled: true, text: "Thank you {name}! It was a pleasure. A review helps us a lot, and we're here whenever you need another boost." },
});

// ---------------- logging ----------------

export function log(level: 'info' | 'success' | 'warn' | 'error' | 'skip', msg: string) {
  const ts = now();
  const res = db.prepare('INSERT INTO logs (ts, level, msg) VALUES (?, ?, ?)').run(ts, level, msg);
  bus.emit('log', { id: Number(res.lastInsertRowid), ts, level, msg });
  if (level === 'error') console.error(msg);
}

export const changed = (topic: string) => bus.emit('change', topic);

// ---------------- helpers ----------------

const DELIVERY_TEXT: Record<string, string> = {
  Hour1: '1 hour', Hour2: '2 hours', Hour3: '3 hours', Hour5: '5 hours', Hour8: '8 hours', Hour12: '12 hours', Day1: '1 day',
  Day2: '2 days', Day3: '3 days', Day5: '5 days', Day7: '7 days', Day10: '10 days', Day14: '14 days', Day28: '28 days',
};
const ENUM_HOURS: Record<string, number> = { Minute5: 0.1, Minute20: 0.34, Instant: 0, Hour1: 1, Hour2: 2, Hour3: 3, Hour5: 5, Hour8: 8, Hour12: 12, Day1: 24, Day2: 48, Day3: 72, Day5: 120, Day7: 168, Day10: 240, Day14: 336, Day28: 672 };

export function fill(text: string, v: { name?: string | null; price?: number | null; time?: string | null }) {
  return text
    .replaceAll('{name}', v.name || 'there')
    .replaceAll('{price}', v.price != null ? `$${v.price.toFixed(2)}` : '')
    .replaceAll('{time}', v.time ?? '');
}

/** .NET TimeSpan "d.hh:mm:ss" or "hh:mm:ss" → ms */
export function parseTimespan(s: string | null | undefined) {
  if (!s) return null;
  const m = s.match(/^(?:(\d+)\.)?(\d+):(\d+):(\d+)/);
  if (!m) return null;
  return (((Number(m[1] ?? 0) * 24 + Number(m[2])) * 60 + Number(m[3])) * 60 + Number(m[4])) * 1000;
}

function gameFor(item: { gameId?: string | null; title?: string | null }): Game | null {
  const byText = detectGame(item.title ?? '');
  const map = getSetting<Record<string, Game>>('gameIds', {});
  if (byText && item.gameId && !map[item.gameId]) { map[item.gameId] = byText; setSetting('gameIds', map); }
  return byText ?? (item.gameId ? map[item.gameId] ?? null : null);
}

function queue(kind: string, text: string, ids: { orderId?: string; requestId?: string; conversationId?: string | null }, delayMs = 0) {
  db.prepare('INSERT INTO outbox (kind, conversation_id, order_id, request_id, text, not_before, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(kind, ids.conversationId ?? null, ids.orderId ?? null, ids.requestId ?? null, text, now() + delayMs, now());
  changed('outbox');
}

const isBlacklisted = (buyer: string | null) =>
  !!buyer && !!(db.prepare('SELECT blacklisted FROM buyers WHERE username = ? AND blacklisted = 1').get(buyer));

// ---------------- requests ----------------

export function ingestRequest(r: BoostingRequestItem) {
  const exists = db.prepare('SELECT 1 FROM requests WHERE id = ?').get(r.id);
  if (exists) return false;
  db.prepare(`INSERT INTO requests (id, game, game_id, category, buyer, buyer_id, created_at, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(r.id, gameFor({ gameId: r.gameId, title: r.boostingCategoryTitle }), r.gameId, r.boostingCategoryTitle, r.buyerUsername,
      r.buyerId, Date.parse(r.createdDate) || now(), now());
  db.prepare('INSERT OR IGNORE INTO buyers (username, buyer_id, blacklisted) VALUES (?, ?, ?)').run(r.buyerUsername, r.buyerId, r.isBuyerMuted ? 1 : 0);
  return true;
}

/** Details read from the request page by the extension. */
export async function receiveDetails(input: { requestId: string; title?: string; fields: Record<string, string>; buyer?: string }) {
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(input.requestId) as any;
  if (!row) {
    db.prepare('INSERT INTO requests (id, game, category, buyer, created_at, seen_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(input.requestId, detectGame(input.title ?? ''), input.title ?? null, input.buyer ?? null, now(), now());
  } else if (!row.game && input.title) {
    db.prepare('UPDATE requests SET game = ? WHERE id = ?').run(gameFor({ gameId: row.game_id, title: input.title }), input.requestId);
  }
  db.prepare('UPDATE requests SET details = ? WHERE id = ?').run(JSON.stringify({ title: input.title, fields: input.fields }), input.requestId);
  changed('requests');
  await processRequest(input.requestId);
}

export async function processRequest(id: string) {
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
  if (!row || row.status !== 'needs_details' || !row.details) return;
  const details = JSON.parse(row.details);
  const game: Game | null = row.game ?? detectGame(details.title ?? '');
  const set = (status: string, extra: Record<string, unknown> = {}) => {
    const cols = Object.keys(extra);
    db.prepare(`UPDATE requests SET status = ?${cols.map(c => `, ${c} = ?`).join('')} WHERE id = ?`).run(status, ...(Object.values(extra) as any[]), id);
    changed('requests');
  };
  if (!game) { set('skipped', { reason: 'not Valorant/LoL' }); return; }
  if (isBlacklisted(row.buyer)) { set('skipped', { reason: 'buyer is blacklisted' }); log('skip', `Skipped ${row.buyer}: blacklisted`); return; }

  const norm = normalizeRequest(game, `${row.category ?? ''} ${details.title ?? ''}`, details.fields);
  const q = quote(norm);
  const label = `${game === 'lol' ? 'LoL' : 'Valorant'} ${norm.currentRank ?? ''} → ${norm.desiredRank ?? ''} ${norm.region ?? ''}`.replace(/\s+/g, ' ');
  if (!q.ok) { set('skipped', { reason: q.reason }); log('skip', `Skipped ${label}: ${q.reason}`); return; }

  const bot = getBot();
  const messages = getMessages();
  const openers = messages.openers.filter(o => o.enabled && o.text.trim());
  const opener = openers.length ? openers[Math.floor(Math.random() * openers.length)] : null;
  const time = DELIVERY_TEXT[q.delivery] ?? q.delivery;
  const text = opener ? fill(opener.text, { name: row.buyer, price: q.price, time }) : '';

  if (bot.dryRun) {
    set('would_offer', { price: q.price, hours: q.hours, variant: opener?.id ?? null });
    log('info', `🧪 DRY RUN would offer $${q.price} (${time}) on ${label}`);
    return;
  }
  const lastHour = (db.prepare('SELECT COUNT(*) AS n FROM requests WHERE offered_at > ?').get(now() - 3600_000) as { n: number }).n;
  if (lastHour >= bot.maxOffersPerHour) { set('skipped', { reason: 'hourly offer limit reached' }); log('warn', `Hourly offer limit (${bot.maxOffersPerHour}) reached`); return; }

  try {
    const offer = await eldorado.createOffer(id, q.price, q.delivery, text);
    set('offered', { price: q.price, hours: q.hours, offer_id: offer?.id ?? null, variant: opener?.id ?? null, offered_at: now() });
    log('success', `✅ Offered $${q.price} (${time}) on ${label}`);
    const d = getDiscord();
    if (d.newOffer) sendDiscord('📨 Offer sent', label, [{ name: 'Price', value: `$${q.price}`, inline: true }, { name: 'Delivery', value: time, inline: true }]).catch(() => {});
    if (messages.followUp.enabled) queue('follow_up', fill(messages.followUp.text, { name: row.buyer, price: q.price, time }), { requestId: id }, messages.followUp.delayMinutes * 60_000);
  } catch (e) {
    set('error', { reason: String((e as Error).message).slice(0, 300) });
    log('error', `Offer failed on ${label}: ${(e as Error).message}`);
  }
}

async function pollRequests() {
  const res = await eldorado.listRequests('ActiveRequests');
  let fresh = 0;
  for (const r of res.results ?? []) if (ingestRequest(r)) fresh++;
  if (fresh) { log('info', `📥 ${fresh} new request(s), waiting for details from the extension`); changed('requests'); }
}

async function pollOutcomes() {
  for (const [filter, outcome] of [['OfferWon', 'won'], ['OfferLost', 'lost']] as const) {
    const res = await eldorado.listRequests(filter);
    for (const r of res.results ?? []) db.prepare('UPDATE requests SET outcome = ? WHERE id = ? AND outcome IS NULL').run(outcome, r.id);
  }
  // A won/lost request needs no follow-up anymore.
  db.prepare(`UPDATE outbox SET status = 'dropped' WHERE status = 'pending' AND kind = 'follow_up'
              AND request_id IN (SELECT id FROM requests WHERE outcome IS NOT NULL)`).run();
}

// ---------------- orders ----------------

export function upsertOrder(o: any, alert: boolean) {
  const d = o.orderOfferDetails ?? {};
  const title: string = d.offerTitle || d.gameCategoryTitle || 'Order';
  const created = Date.parse(o.createdDate) || now();
  const span = parseTimespan(o.deliveryTime) ?? (ENUM_HOURS[d.guaranteedDeliveryTime] ?? 0) * 3600_000;
  const state: string = o.state?.state ?? 'Paid';
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id) as any;
  let divisions: number | null = null;
  if (d.boostingRequestId) {
    const req = db.prepare('SELECT game, details FROM requests WHERE id = ?').get(d.boostingRequestId) as any;
    if (req?.details && req.game) {
      const n = normalizeRequest(req.game, '', JSON.parse(req.details).fields);
      const a = rankIndex(req.game, n.currentRank), b = rankIndex(req.game, n.desiredRank);
      if (a != null && b != null && b > a) divisions = b - a;
    }
    db.prepare(`UPDATE requests SET outcome = 'won' WHERE id = ?`).run(d.boostingRequestId);
  }
  const game = gameFor({ gameId: d.gameId, title: `${d.gameCategoryTitle ?? ''} ${title}` });
  const msgs = getMessages();
  const name = o.buyerUsername;

  if (!existing) {
    db.prepare(`INSERT INTO orders (id, game, title, buyer, buyer_id, price, state, created_at, deadline, request_id, conversation_id, divisions, raw, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(o.id, game, title, name, o.buyerId, o.totalPrice?.amount ?? 0, state, created, span ? created + span : null,
        d.boostingRequestId ?? null, o.talkJsConversationId ?? null, divisions, JSON.stringify(o), now());
    db.prepare('INSERT OR IGNORE INTO buyers (username, buyer_id) VALUES (?, ?)').run(name, o.buyerId);
    if (alert) {
      log('success', `🛒 New order from ${name}: ${title} ($${o.totalPrice?.amount})`);
      if (getDiscord().newOrder) sendDiscord('🛒 New order. Open the board and take it!', title, [
        { name: 'Buyer', value: name ?? '?', inline: true }, { name: 'Price', value: `$${o.totalPrice?.amount}`, inline: true },
        { name: 'Deadline', value: span ? `<t:${Math.floor((created + span) / 1000)}:R>` : '?', inline: true },
      ]).catch(e => log('warn', `Discord: ${e.message}`));
      if (msgs.accepted.enabled && state === 'Paid') queue('accepted', fill(msgs.accepted.text, { name, price: o.totalPrice?.amount }), { orderId: o.id, conversationId: o.talkJsConversationId });
    }
  } else if (existing.state !== state) {
    const extra = state === 'Delivered' ? ', delivered_at = COALESCE(delivered_at, ?)' : ['Received', 'Completed'].includes(state) ? ', completed_at = COALESCE(completed_at, ?)' : '';
    db.prepare(`UPDATE orders SET state = ?, raw = ?, updated_at = ?${extra} WHERE id = ?`)
      .run(...([state, JSON.stringify(o), now(), ...(extra ? [now()] : []), o.id] as any[]));
    if (alert) {
      log('info', `📦 Order ${title} (${name}): ${existing.state} → ${state}`);
      const conv = { orderId: o.id, conversationId: o.talkJsConversationId ?? existing.conversation_id };
      if (state === 'Delivered' && msgs.delivered.enabled) queue('delivered', fill(msgs.delivered.text, { name }), conv);
      if (['Received', 'Completed'].includes(state) && !['Received', 'Completed'].includes(existing.state) && msgs.received.enabled)
        queue('received', fill(msgs.received.text, { name }), conv);
      if (state.includes('Disputed')) sendDiscord('⚠️ Order disputed', `${title} by ${name}`, [], 0xf87171).catch(() => {});
    }
  }
  changed('orders');
}

async function pollOrders() {
  const res = await eldorado.listOrders();
  const seeded = getSetting('ordersSeeded', false);
  for (const o of res.results ?? []) upsertOrder(o, seeded);
  if (!seeded) { setSetting('ordersSeeded', true); log('info', `Synced ${res.results?.length ?? 0} existing orders`); }
}

// ---------------- alerts ----------------

function checkDeadlines() {
  const bot = getBot();
  const soon = db.prepare(`SELECT o.*, u.display_name AS worker FROM orders o LEFT JOIN users u ON u.id = o.assigned_to
                           WHERE o.state = 'Paid' AND o.deadline IS NOT NULL AND o.deadline_alerted = 0 AND o.deadline < ?`)
    .all(now() + bot.deadlineAlertHours * 3600_000) as any[];
  for (const o of soon) {
    db.prepare('UPDATE orders SET deadline_alerted = 1 WHERE id = ?').run(o.id);
    const who = o.worker ?? 'NOBODY (unassigned!)';
    log('warn', `⏰ Deadline soon: ${o.title} (${who})`);
    if (getDiscord().deadlines) sendDiscord('⏰ Deadline coming up', `${o.title}, assigned to **${who}**`, [
      { name: 'Due', value: `<t:${Math.floor(o.deadline / 1000)}:R>`, inline: true }, { name: 'Buyer', value: o.buyer ?? '?', inline: true },
    ], 0xfbbf24).catch(() => {});
  }
}

async function dailyReport() {
  const d = getDiscord();
  const today = new Date().toISOString().slice(0, 10);
  if (!d.dailyReport || !d.webhook || new Date().getHours() < d.dailyReportHour || getSetting('lastDailyReport', '') === today) return;
  setSetting('lastDailyReport', today);
  const a = analytics(1, null).totals as any;
  const active = (db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE state = 'Paid'`).get() as { n: number }).n;
  await sendDiscord('📊 Daily report', `Here's today at a glance`, [
    { name: 'Orders', value: String(a.orders), inline: true }, { name: 'Revenue', value: `$${a.revenue}`, inline: true },
    { name: 'Offers sent', value: String(a.offers), inline: true }, { name: 'Win rate', value: a.winRate == null ? '–' : `${a.winRate}%`, inline: true },
    { name: 'Active orders', value: String(active), inline: true },
  ]);
}

// ---------------- loop ----------------

let busy = false;
let lastPoll = 0, lastOutcomes = 0, lastErrorMsg = '';

async function safe(name: string, fn: () => Promise<unknown> | unknown) {
  try { await fn(); lastErrorMsg = ''; }
  catch (e) {
    const msg = e instanceof EldoradoError ? `${name}: Eldorado ${e.status}` : `${name}: ${(e as Error).message}`;
    if (msg !== lastErrorMsg) log('error', msg); // don't spam the console with the same error
    lastErrorMsg = msg;
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const bot = getBot();
    await safe('deadlines', checkDeadlines);
    await safe('daily report', dailyReport);
    if (!bot.running || !hasCreds()) return;
    if (now() - lastPoll >= bot.pollSeconds * 1000) {
      lastPoll = now();
      await safe('requests', pollRequests);
      await safe('orders', pollOrders);
    }
    if (now() - lastOutcomes >= 5 * 60_000) { lastOutcomes = now(); await safe('offer results', pollOutcomes); }
  } finally { busy = false; }
}

/** Checks Eldorado for new requests right now. Called when the extension sees Eldorado's live
 * "BoostingRequestCreated" notification, so the bot reacts in about a second instead of waiting for the next poll. */
let pollingNow: Promise<number> | null = null;
export function pollNow(): Promise<number> {
  if (!getBot().running || !hasCreds()) return Promise.resolve(0);
  pollingNow ??= (async () => {
    try {
      lastPoll = now();
      const before = (db.prepare(`SELECT COUNT(*) AS n FROM requests WHERE status = 'needs_details'`).get() as { n: number }).n;
      await safe('requests', pollRequests);
      return (db.prepare(`SELECT COUNT(*) AS n FROM requests WHERE status = 'needs_details'`).get() as { n: number }).n - before;
    } finally { pollingNow = null; }
  })();
  return pollingNow;
}

export function startEngine() {
  setInterval(tick, 5000);
  tick();
}

export async function setRunning(running: boolean, by: string) {
  const bot = getBot();
  setSetting('bot', { ...bot, running });
  log(running ? 'success' : 'warn', running ? `▶️ Bot started by ${by}${bot.dryRun ? ' (DRY RUN)' : ''}` : `⏹ Bot stopped by ${by}`);
  if (bot.syncOnlineStatus && hasCreds()) await safe('online status', () => running ? eldorado.switchOnline() : eldorado.switchOffline());
  if (running) lastPoll = 0;
  changed('bot');
}

// ---------------- extension coordination ----------------

const clients = new Map<string, { userId: number; name: string; lastSeen: number; since: number; onEldorado: boolean; version: string }>();

export function heartbeat(clientId: string, info: { userId: number; name: string; onEldorado: boolean; version: string }) {
  const prev = clients.get(clientId);
  clients.set(clientId, { ...info, lastSeen: now(), since: prev?.since ?? now() });
  return leaderId() === clientId;
}

export function liveClients() {
  for (const [id, c] of clients) if (now() - c.lastSeen > 45_000) clients.delete(id);
  return [...clients.entries()].map(([id, c]) => ({ id, ...c, leader: id === leaderId() }));
}

export const isLeader = (clientId: string) => leaderId() === clientId;

/** Only one extension sends chat messages: the longest-connected one with an Eldorado tab open. */
function leaderId() {
  const live = [...clients.entries()].filter(([, c]) => now() - c.lastSeen <= 45_000 && c.onEldorado).sort((a, b) => a[1].since - b[1].since);
  return live[0]?.[0] ?? null;
}

export async function outboxFor(clientId: string) {
  if (leaderId() !== clientId) return [];
  const items = db.prepare(`SELECT * FROM outbox WHERE status = 'pending' AND not_before <= ? ORDER BY id LIMIT 5`).all(now()) as any[];
  const ready = [];
  for (const it of items) {
    // Messages older than 12h no longer fit the conversation.
    if (now() - it.not_before > 12 * 3600_000) { db.prepare(`UPDATE outbox SET status = 'dropped', error = 'too old' WHERE id = ?`).run(it.id); continue; }
    if (!it.conversation_id && it.request_id && hasCreds()) {
      try {
        const conv = await eldorado.createConversation(it.request_id);
        it.conversation_id = conv?.talkJsConversationId ?? null;
        db.prepare('UPDATE outbox SET conversation_id = ? WHERE id = ?').run(it.conversation_id, it.id);
      } catch (e) { log('warn', `Couldn't open chat for follow-up: ${(e as Error).message}`); }
    }
    if (it.conversation_id) ready.push(it);
  }
  return ready;
}

export function outboxResult(id: number, ok: boolean, error?: string) {
  db.prepare(`UPDATE outbox SET status = ?, sent_at = ?, error = ? WHERE id = ?`).run(ok ? 'sent' : 'failed', now(), error ?? null, id);
  const it = db.prepare('SELECT kind, order_id, request_id FROM outbox WHERE id = ?').get(id) as any;
  log(ok ? 'success' : 'error', ok ? `💬 Sent ${it?.kind?.replace('_', '-')} message` : `💬 Message failed: ${error}`);
  changed('outbox');
}

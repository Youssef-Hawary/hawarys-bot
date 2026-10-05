// Fills a SEPARATE demo database (data/demo.db) with fake orders, workers and offers so the dashboard can be explored.
// Never run this against the real database.
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const DEMO = resolve(import.meta.dirname, '../data/demo.db');
if (process.env.DB_PATH !== DEMO) process.env.DB_PATH = DEMO;
for (const f of [DEMO, `${DEMO}-wal`, `${DEMO}-shm`]) rmSync(f, { force: true });

const { db, setSetting } = await import('./db.ts');
const { createUser } = await import('./auth.ts');
const { ladder } = await import('./ranks.ts');
const { defaultPricing, quote, deliveryEnum } = await import('./pricing.ts');

const owner = createUser({ username: 'hawary', displayName: 'Hawary', password: 'demo1234', role: 'owner' });
const workers = [
  createUser({ username: 'ahmed', displayName: 'Ahmed', password: 'demo1234', role: 'worker', payType: 'percent', payValue: 60 }),
  createUser({ username: 'omar', displayName: 'Omar', password: 'demo1234', role: 'worker', payType: 'per_division', payValue: 2.5 }),
  createUser({ username: 'youssef', displayName: 'Youssef', password: 'demo1234', role: 'worker', payType: 'fixed', payValue: 8 }),
];
const team = [owner, ...workers];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const uuid = () => crypto.randomUUID();
const buyers = ['PlumpScore-bDI9', 'NightOwl77', 'xSkyz', 'ValoKing', 'Mira_lol', 'Jinxed', 'TTV_Ryze', 'Kabuto', 'SoloQHero', 'AstraMain', 'ZedOrFeed', 'Phoenixx'];
const now = Date.now();

for (const b of buyers) db.prepare('INSERT INTO buyers (username, buyer_id) VALUES (?, ?)').run(b, uuid());
db.prepare(`UPDATE buyers SET blacklisted = 1, note = 'Asked to move to Discord' WHERE username = 'Kabuto'`).run();
db.prepare(`UPDATE buyers SET note = 'Repeat buyer, always tips' WHERE username = 'NightOwl77'`).run();

const reqIns = db.prepare(`INSERT INTO requests (id, game, category, buyer, created_at, seen_at, details, status, reason, price, hours, variant, offered_at, outcome)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const ordIns = db.prepare(`INSERT INTO orders (id, game, title, buyer, price, state, created_at, deadline, request_id, divisions, assigned_to, assigned_at, delivered_at, completed_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

for (let i = 0; i < 260; i++) {
  const game = Math.random() < 0.6 ? 'valorant' : 'lol';
  const lad = ladder(game);
  const from = Math.floor(rnd(0, lad.length - 6));
  const to = from + Math.floor(rnd(1, 5));
  const region = game === 'valorant' ? pick(['EU', 'NA', 'EU', 'KR']) : pick(['EUW', 'EUNE', 'NA', 'EUW']);
  const fields = {
    'Current Rank': lad[from].label, [game === 'lol' ? 'Current LP' : 'Current RR']: String(Math.floor(rnd(0, 90))),
    'Desired Rank': lad[to].label, Server: region, 'Completion Method': Math.random() < 0.25 ? 'Duo' : 'Solo',
  };
  const ts = now - Math.pow(Math.random(), 1.4) * 30 * 86400_000;
  const q = quote({ game, service: 'rank', currentRank: fields['Current Rank'], desiredRank: fields['Desired Rank'], region,
    points: 0, completion: fields['Completion Method'], amount: null, platform: null, description: '' }, defaultPricing(game));
  const title = `${game === 'lol' ? 'League of Legends' : 'Valorant'} - Rank Boost`;
  const id = uuid();
  const buyer = pick(buyers);
  if (!q.ok) { reqIns.run(id, game, 'Rank Boost', buyer, ts, ts, JSON.stringify({ title, fields }), 'skipped', q.reason, null, null, null, null, null); continue; }
  const offered = Math.random() < 0.85;
  const outcome = !offered ? null : ts > now - 3600_000 ? null : Math.random() < 0.34 ? 'won' : 'lost';
  reqIns.run(id, game, 'Rank Boost', buyer, ts, ts, JSON.stringify({ title, fields }), offered ? 'offered' : 'skipped',
    offered ? null : pick(['region KR is off', 'description has a link/contact (scam filter)', 'console player']),
    q.price, q.hours, offered ? (Math.random() < 0.5 ? 'A' : 'B') : null, offered ? ts + 4000 : null, outcome);

  if (outcome === 'won') {
    const created = ts + rnd(10, 90) * 60_000;
    const age = now - created;
    const deadline = created + q.hours * 3600_000;
    let state = age > (q.hours + 30) * 3600_000 ? pick(['Completed', 'Completed', 'Completed', 'Received', 'Canceled']) : age > q.hours * 0.6 * 3600_000 ? pick(['Delivered', 'Paid']) : 'Paid';
    const assignee = state === 'Paid' && Math.random() < 0.3 ? null : pick(team);
    const delivered = ['Delivered', 'Received', 'Completed'].includes(state) ? Math.min(now, created + q.hours * rnd(0.4, 0.95) * 3600_000) : null;
    ordIns.run(uuid(), game, `${title}: ${lad[from].label} → ${lad[to].label}`, buyer, q.price, state, created, deadline, id, to - from,
      assignee, assignee ? created + 600_000 : null, delivered, ['Received', 'Completed'].includes(state) ? delivered! + 3600_000 : null, now);
  }
}
// A couple of orders about to hit their deadline.
for (const [g, label, mins] of [['valorant', 'Valorant - Rank Boost: Silver 2 → Gold 1', 75], ['lol', 'League of Legends - Rank Boost: Gold IV → Gold II', 200]] as const) {
  ordIns.run(uuid(), g, label, pick(buyers), rnd(12, 30), 'Paid', now - 20 * 3600_000, now + mins * 60_000, null, 2, null, null, null, null, now);
}

for (const w of workers) for (let i = 0; i < 3; i++)
  db.prepare('INSERT INTO payouts (user_id, amount, note, created_at, created_by) VALUES (?, ?, ?, ?, ?)').run(w, Math.round(rnd(20, 60)), pick(['Vodafone Cash', 'InstaPay', 'Cash']), now - rnd(1, 25) * 86400_000, owner);

const logs = ['🚀 Server started', '▶️ Bot started by Hawary', '📥 3 new request(s)', '✅ Offered $18.50 (1 day) on Valorant Gold 2 → Platinum 1 EU',
  '🛒 New order from NightOwl77', '🙋 Ahmed took Valorant - Rank Boost', '💬 Sent accepted message', '📦 Omar delivered League of Legends - Rank Boost'];
for (let i = 0; i < logs.length; i++) db.prepare('INSERT INTO logs (ts, level, msg) VALUES (?, ?, ?)').run(now - (logs.length - i) * 90_000, i % 4 === 3 ? 'success' : 'info', logs[i]);

setSetting('bot', { running: true, dryRun: true, pollSeconds: 20, maxOffersPerHour: 200, syncOnlineStatus: false, deadlineAlertHours: 2 });
void deliveryEnum;
console.log('Demo data ready in data/demo.db. Log in as hawary / demo1234 (owner) or ahmed / demo1234 (worker).');

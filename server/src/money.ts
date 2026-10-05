import { db, getSetting } from './db.ts';
import type { User } from './auth.ts';

export type Fees = { eldoradoFeePct: number };
export const getFees = () => getSetting<Fees>('fees', { eldoradoFeePct: 10 });

/** States where the money is real (not canceled). */
export const LIVE_STATES = ['Paid', 'Delivered', 'Received', 'Completed', 'Disputed', 'DeliveredDisputed', 'PendingReview'];
/** States where the worker has done the job and earned their cut. */
export const DONE_STATES = ['Delivered', 'Received', 'Completed'];

export type OrderRow = {
  id: string; game: string | null; title: string | null; buyer: string | null; price: number; state: string;
  created_at: number; deadline: number | null; assigned_to: number | null; assigned_at: number | null;
  delivered_at: number | null; completed_at: number | null; divisions: number | null; worker_pay_override: number | null;
  request_id: string | null; conversation_id: string | null;
};

export const net = (price: number) => price * (1 - getFees().eldoradoFeePct / 100);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function workerPay(order: OrderRow, worker: Pick<User, 'role' | 'pay_type' | 'pay_value'> | undefined) {
  if (!worker) return 0;
  if (order.worker_pay_override != null) return order.worker_pay_override;
  if (worker.role === 'owner') return 0; // owner's own orders are profit, not pay
  switch (worker.pay_type) {
    case 'percent': return r2(net(order.price) * worker.pay_value / 100);
    case 'fixed': return worker.pay_value;
    case 'per_division': return r2(worker.pay_value * (order.divisions ?? 1));
    default: return 0; // manual: owner sets worker_pay_override per order
  }
}

const usersById = () => new Map((db.prepare('SELECT * FROM users').all() as unknown as User[]).map(u => [u.id, u]));

export function workerSummary(userId: number) {
  const users = usersById();
  const user = users.get(userId)!;
  const orders = db.prepare(`SELECT * FROM orders WHERE assigned_to = ? AND state IN (${DONE_STATES.map(() => '?').join(',')})`)
    .all(userId, ...DONE_STATES) as unknown as OrderRow[];
  const earned = r2(orders.reduce((a, o) => a + workerPay(o, user), 0));
  const paid = r2((db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payouts WHERE user_id = ?').get(userId) as { s: number }).s);
  const active = (db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE assigned_to = ? AND state = 'Paid'`).get(userId) as { n: number }).n;
  return {
    userId, name: user.display_name, color: user.color, role: user.role, payType: user.pay_type, payValue: user.pay_value,
    ordersDone: orders.length, divisionsDone: orders.reduce((a, o) => a + (o.divisions ?? 0), 0),
    revenue: r2(orders.reduce((a, o) => a + o.price, 0)), earned, paid, owed: r2(earned - paid), active,
  };
}

const DAY = 86400_000;
const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** Analytics for the dashboard. With `onlyUser`, everything is limited to that worker's own orders and pay. */
export function analytics(days: number, onlyUser: User | null) {
  const users = usersById();
  const since = Date.now() - days * DAY;
  const orders = (onlyUser
    ? db.prepare('SELECT * FROM orders WHERE created_at >= ? AND assigned_to = ?').all(since, onlyUser.id)
    : db.prepare('SELECT * FROM orders WHERE created_at >= ?').all(since)) as unknown as OrderRow[];
  const live = orders.filter(o => LIVE_STATES.includes(o.state));
  const offers = db.prepare(`SELECT offered_at, outcome, variant, price FROM requests WHERE offered_at >= ?`).all(since) as
    { offered_at: number; outcome: string | null; variant: string | null; price: number }[];

  const series: Record<string, { day: string; revenue: number; profit: number; orders: number; offers: number; pay: number }> = {};
  for (let t = since; t <= Date.now() + DAY; t += DAY) { const d = dayKey(t); series[d] = { day: d, revenue: 0, profit: 0, orders: 0, offers: 0, pay: 0 }; }
  for (const o of live) {
    const s = series[dayKey(o.created_at)]; if (!s) continue;
    const pay = DONE_STATES.includes(o.state) ? workerPay(o, users.get(o.assigned_to ?? -1)) : 0;
    s.orders++;
    if (onlyUser) { s.revenue += pay; s.pay += pay; }
    else { s.revenue += o.price; s.pay += pay; s.profit += net(o.price) - pay; }
  }
  if (!onlyUser) for (const of of offers) { const s = series[dayKey(of.offered_at)]; if (s) s.offers++; }

  const byGame: Record<string, { game: string; orders: number; revenue: number }> = {};
  for (const o of live) {
    const g = o.game ?? 'other';
    byGame[g] ??= { game: g, orders: 0, revenue: 0 };
    byGame[g].orders++;
    byGame[g].revenue += onlyUser ? workerPay(o, onlyUser) : o.price;
  }

  const won = offers.filter(o => o.outcome === 'won').length, decided = offers.filter(o => o.outcome).length;
  const variants: Record<string, { variant: string; sent: number; won: number }> = {};
  for (const o of offers) {
    if (!o.variant) continue;
    variants[o.variant] ??= { variant: o.variant, sent: 0, won: 0 };
    variants[o.variant].sent++;
    if (o.outcome === 'won') variants[o.variant].won++;
  }

  const revenue = r2(live.reduce((a, o) => a + o.price, 0));
  const pay = r2(live.filter(o => DONE_STATES.includes(o.state)).reduce((a, o) => a + workerPay(o, users.get(o.assigned_to ?? -1)), 0));
  const totals = onlyUser
    ? { orders: live.length, earned: pay }
    : { orders: live.length, revenue, fees: r2(revenue - net(revenue)), workerPay: pay, profit: r2(net(revenue) - pay),
        offers: offers.length, winRate: decided ? Math.round((won / decided) * 100) : null };

  return {
    totals,
    series: Object.values(series).map(s => ({ ...s, revenue: r2(s.revenue), profit: r2(s.profit), pay: r2(s.pay) })),
    byGame: Object.values(byGame).map(g => ({ ...g, revenue: r2(g.revenue) })),
    variants: onlyUser ? [] : Object.values(variants),
  };
}

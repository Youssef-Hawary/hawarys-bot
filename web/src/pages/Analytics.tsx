import { useState } from 'react';
import { DollarSign, Landmark, Users, TrendingUp, Send, Trophy } from 'lucide-react';
import { useData, usd } from '../api.ts';
import { Avatar, CountUp, PageHeader, Section, Stat, Tabs } from '../components/ui.tsx';
import { BarsChart, Donut, RevenueChart } from '../components/Charts.tsx';
import { useMe } from '../components/Shell.tsx';
import { Earnings } from './Earnings.tsx';

const GAME = { valorant: { name: 'Valorant', color: '#FF4655' }, lol: { name: 'League', color: '#C89B3C' }, other: { name: 'Other', color: '#77808F' } } as Record<string, { name: string; color: string }>;

export function Analytics() {
  const me = useMe();
  const [days, setDays] = useState<'7' | '30' | '90' | '365'>('30');
  const { data: a } = useData<any>(me.role === 'owner' ? `/analytics?days=${days}` : null, ['orders']);
  if (me.role !== 'owner') return <Earnings />;
  const t = a?.totals ?? {};

  return (
    <>
      <PageHeader title="Analytics" subtitle="Money in, money out, and how the bot is performing."
        actions={<Tabs value={days} onChange={setDays} tabs={[{ id: '7', label: '7d' }, { id: '30', label: '30d' }, { id: '90', label: '90d' }, { id: '365', label: '1y' }]} />} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <Stat icon={<DollarSign size={22} />} label="Revenue (money in)" value={<CountUp value={t.revenue ?? 0} format={n => usd(n)} />} sub={`${t.orders ?? 0} orders`} />
        <Stat delay={.04} tone="warn" icon={<Landmark size={22} />} label={`Eldorado fees (${a?.fees?.eldoradoFeePct ?? 0}%)`} value={<CountUp value={t.fees ?? 0} format={n => usd(n)} />} />
        <Stat delay={.08} tone="violet" icon={<Users size={22} />} label="Worker pay (money out)" value={<CountUp value={t.workerPay ?? 0} format={n => usd(n)} />} />
        <Stat delay={.12} tone="ok" icon={<TrendingUp size={22} />} label="Your profit" value={<CountUp value={t.profit ?? 0} format={n => usd(n)} />} />
        <Stat delay={.16} icon={<Send size={22} />} label="Offers sent" value={<CountUp value={t.offers ?? 0} />} />
        <Stat delay={.2} tone="ok" icon={<Trophy size={22} />} label="Offer win rate" value={t.winRate == null ? '–' : <CountUp value={t.winRate} format={n => `${Math.round(n)}%`} />} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Section title="Revenue, profit & worker pay" subtitle="Per day, by order date">
          {a ? <RevenueChart height={300} data={a.series} keys={[{ key: 'revenue', name: 'Revenue', color: '#38C6F4' }, { key: 'profit', name: 'Profit', color: '#34D399' }, { key: 'pay', name: 'Worker pay', color: '#A78BFA' }]} /> : <div className="skeleton h-[300px]" />}
        </Section>
        <Section title="Revenue by game">
          {a?.byGame?.length ? (<>
            <Donut data={a.byGame.map((g: any) => ({ name: GAME[g.game]?.name ?? g.game, value: g.revenue, color: GAME[g.game]?.color ?? '#77808F' }))} />
            <div className="mt-2 space-y-1.5">{a.byGame.map((g: any) => (
              <div key={g.game} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-fg-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: GAME[g.game]?.color }} />{GAME[g.game]?.name ?? g.game} · {g.orders}</span><b>{usd(g.revenue)}</b></div>
            ))}</div>
          </>) : <p className="py-10 text-center text-sm text-fg-3">No orders yet.</p>}
        </Section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Section title="Team performance" subtitle="All time: orders delivered, revenue they handled, and what they earned">
          {a ? (<>
            <BarsChart data={a.workers.map((w: any) => ({ name: w.name, revenue: w.revenue, earned: w.earned }))} xKey="name"
              bars={[{ key: 'revenue', name: 'Revenue handled', color: '#38C6F4' }, { key: 'earned', name: 'Earned', color: '#A78BFA' }]} />
            <div className="mt-3 divide-y divide-white/[.05]">
              {a.workers.map((w: any) => (
                <div key={w.userId} className="flex items-center gap-3 py-2.5 text-sm">
                  <Avatar name={w.name} color={w.color} />
                  <span className="font-semibold">{w.name}</span>
                  <span className="text-fg-3">{w.ordersDone} orders · {w.divisionsDone} divs</span>
                  <span className="ml-auto text-fg-3">owed</span><b className={w.owed > 0 ? 'text-warn' : 'text-fg-2'}>{usd(w.owed)}</b>
                </div>
              ))}
            </div>
          </>) : <div className="skeleton h-[240px]" />}
        </Section>
        <Section title="Opening message A/B test" subtitle="Which message wins more buyers">
          {a?.variants?.length ? (
            <BarsChart money={false} data={a.variants.map((v: any) => ({ name: `Message ${v.variant}`, rate: v.sent ? Math.round((v.won / v.sent) * 100) : 0, sent: v.sent }))} xKey="name"
              bars={[{ key: 'rate', name: 'Win rate %', color: '#34D399' }, { key: 'sent', name: 'Offers sent', color: '#38C6F4' }]} />
          ) : <p className="py-10 text-center text-sm text-fg-3">Enable two opening messages in Auto-chat to start an A/B test.</p>}
        </Section>
      </div>
    </>
  );
}

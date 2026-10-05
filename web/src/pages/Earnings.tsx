import { useState } from 'react';
import { Wallet, HandCoins, PiggyBank, Swords, Layers } from 'lucide-react';
import { useData, usd } from '../api.ts';
import { CountUp, PageHeader, Section, Stat, Tabs } from '../components/ui.tsx';
import { Donut, RevenueChart } from '../components/Charts.tsx';
import { useMe } from '../components/Shell.tsx';

const PAY_TEXT: Record<string, (v: number) => string> = {
  percent: v => `${v}% of each order (after Eldorado's fee)`,
  fixed: v => `${usd(v)} per order`,
  per_division: v => `${usd(v)} per division`,
  manual: () => 'Set by the owner per order',
};

export function Earnings() {
  const me = useMe();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { data } = useData<any>(`/me/summary?days=${days}`, ['orders']);
  const s = data?.summary;

  return (
    <>
      <PageHeader title="My earnings" subtitle={me.role === 'owner' ? 'Orders you boosted yourself. Your business profit is in Analytics.' : 'Only you (and the owner) can see this page.'}
        actions={<Tabs value={days} onChange={setDays} tabs={[{ id: '7', label: '7d' }, { id: '30', label: '30d' }, { id: '90', label: '90d' }]} />} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat icon={<Wallet size={16} />} tone="ok" label="Earned (all time)" value={<CountUp value={s?.earned ?? 0} format={n => usd(n)} />} />
        <Stat icon={<HandCoins size={16} />} label="Paid out" value={<CountUp value={s?.paid ?? 0} format={n => usd(n)} />} />
        <Stat icon={<PiggyBank size={16} />} tone="warn" label="Owed to you" value={<CountUp value={s?.owed ?? 0} format={n => usd(n)} />} />
        <Stat icon={<Swords size={16} />} tone="violet" label="Orders done" value={<CountUp value={s?.ordersDone ?? 0} />} sub={`${s?.active ?? 0} in progress`} />
        <Stat icon={<Layers size={16} />} label="Divisions boosted" value={<CountUp value={s?.divisionsDone ?? 0} />} />
      </div>

      {s && me.role !== 'owner' && <p className="mt-4 text-sm text-fg-3">Your pay: <b className="text-fg-2">{PAY_TEXT[s.payType]?.(s.payValue)}</b></p>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Section title="Earnings per day" subtitle="Counted when the order is delivered">
          {data ? <RevenueChart data={data.analytics.series} keys={[{ key: 'revenue', name: 'Earned', color: '#34D399' }]} /> : <div className="skeleton h-[260px]" />}
        </Section>
        <Section title="By game">
          {data?.analytics.byGame?.length ? (<>
            <Donut data={data.analytics.byGame.map((g: any) => ({ name: g.game === 'lol' ? 'League' : g.game === 'valorant' ? 'Valorant' : 'Other', value: g.revenue, color: g.game === 'lol' ? '#C89B3C' : g.game === 'valorant' ? '#FF4655' : '#77808F' }))} />
            <div className="mt-2 space-y-1.5">
              {data.analytics.byGame.map((g: any) => (
                <div key={g.game} className="flex justify-between text-sm"><span className="text-fg-2">{g.game === 'lol' ? 'League of Legends' : g.game === 'valorant' ? 'Valorant' : 'Other'} · {g.orders} orders</span><b>{usd(g.revenue)}</b></div>
              ))}
            </div>
          </>) : <p className="py-10 text-center text-sm text-fg-3">No orders in this period yet.</p>}
        </Section>
      </div>
    </>
  );
}

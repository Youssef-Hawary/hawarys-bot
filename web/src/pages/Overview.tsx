import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Power, Send, DollarSign, Trophy, Package, Clock, Wallet, ArrowRight } from 'lucide-react';
import { api, useData, usd } from '../api.ts';
import { Button, Card, CountUp, PageHeader, Section, Stat, Tabs, clsx, useAction } from '../components/ui.tsx';
import { Console } from '../components/Console.tsx';
import { RevenueChart } from '../components/Charts.tsx';
import { useMe } from '../components/Shell.tsx';

function Check({ ok, label, value }: { ok: boolean | 'info'; label: string; value: string }) {
  return (
    <div className="well flex items-center gap-3 px-3 py-2.5">
      <span className={clsx('dot', ok === 'info' ? 'bg-violet' : ok ? 'bg-ok' : 'bg-warn')} />
      <div className="min-w-0">
        <div className="label-caps !text-[10.5px]">{label}</div>
        <div className={clsx('truncate text-[13px] font-semibold', ok === 'info' ? 'text-violet' : ok ? 'text-fg' : 'text-warn')}>{value}</div>
      </div>
    </div>
  );
}

export function Overview() {
  const me = useMe();
  const owner = me.role === 'owner';
  const { data, reload } = useData<any>('/overview', ['bot', 'orders', 'requests']);
  const [days, setDays] = useState<'7' | '30'>('7');
  const { data: an } = useData<any>(`/analytics?days=${days}`, ['orders']);
  const { busy, run } = useAction();
  const bot = data?.bot;

  const toggle = () => run('bot', async () => { await api(bot?.running ? '/bot/stop' : '/bot/start', { method: 'POST' }); await reload(); }, bot?.running ? 'Bot stopped' : 'Bot started');

  const t = data?.today ?? {}, w = data?.week ?? {};
  return (
    <>
      <PageHeader title="Overview" subtitle={`Signed in as ${me.name}`} />

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card className="relative overflow-hidden">
          <span className={clsx('absolute inset-x-0 top-0 h-[2px]', bot?.running ? 'bg-ok' : 'bg-ink-600')} />
          <div className="flex flex-wrap items-center gap-5 p-6">
            <div className={clsx('grid h-16 w-16 shrink-0 place-items-center rounded-[10px] border',
              bot?.running ? 'border-ok/40 bg-ok/[.08] text-ok' : 'border-white/10 bg-black/30 text-fg-3')}>
              <Power size={28} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="label-caps">Bot engine</div>
              <div className={clsx('mt-0.5 text-[30px] font-extrabold leading-none tracking-tight', bot?.running ? 'text-ok' : 'text-fg-2')}>{bot ? (bot.running ? 'Online' : 'Offline') : '…'}</div>
              <p className="mt-1.5 text-[13.5px] text-fg-3">{bot?.running ? 'Watching Eldorado for boosting requests and orders.' : 'Start it to begin auto-offering on new requests.'}</p>
            </div>
            <Button variant={bot?.running ? 'danger' : 'primary'} className="!h-11 min-w-[150px] !text-[14px]" icon={<Power size={16} />} loading={busy === 'bot'} onClick={toggle} disabled={!bot}>
              {bot?.running ? 'Stop bot' : 'Start bot'}
            </Button>
          </div>
          <div className="grid gap-2 border-t border-white/[.06] p-4 sm:grid-cols-3">
            <Check ok={!!bot?.hasCreds} label="Eldorado API" value={bot?.hasCreds ? 'Connected' : 'Keys missing'} />
            <Check ok={!!bot?.extensions?.length} label="Extensions" value={bot?.extensions?.length ? `${bot.extensions.length} online` : 'None online'} />
            <Check ok={bot?.dryRun ? 'info' : true} label="Mode" value={bot?.dryRun ? 'Dry run (no real offers)' : 'Live offers'} />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Stat icon={<Send size={16} />} label="Offers today" value={<CountUp value={data?.offers?.today ?? 0} />}
            sub={data?.offers?.wouldToday ? `${data.offers.wouldToday} would-offer (dry run)` : `${data?.offers?.week ?? 0} this week`} />
          {owner
            ? <Stat tone="ok" icon={<DollarSign size={16} />} label="Revenue today" value={<CountUp value={t.revenue ?? 0} format={n => usd(n)} />} sub={`${usd(w.revenue)} this week`} />
            : <Stat tone="ok" icon={<Wallet size={16} />} label="I earned today" value={<CountUp value={t.earned ?? 0} format={n => usd(n)} />} sub={`${usd(w.earned)} this week`} />}
          <Stat tone="violet" icon={<Package size={16} />} label="Orders waiting" value={<CountUp value={data?.board?.unassigned ?? 0} />} sub={`${data?.board?.inProgress ?? 0} in progress · ${data?.board?.mine ?? 0} mine`} />
          {owner
            ? <Stat tone="warn" icon={<Trophy size={16} />} label="Offer win rate (7d)" value={w.winRate == null ? '–' : <CountUp value={w.winRate} format={n => `${Math.round(n)}%`} />} sub={`${usd(w.profit)} profit this week`} />
            : <Stat tone="warn" icon={<Clock size={16} />} label="Due in 6h" value={<CountUp value={data?.board?.dueSoon ?? 0} />} sub="across the team" />}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Section title={owner ? 'Revenue & profit' : 'My earnings'} subtitle={owner ? 'Order value vs. what you keep after fees and worker pay' : 'What you earned per day'}
          actions={<Tabs value={days} onChange={setDays} tabs={[{ id: '7', label: '7d' }, { id: '30', label: '30d' }]} />}>
          {an ? (
            <RevenueChart data={an.series} keys={owner
              ? [{ key: 'revenue', name: 'Revenue', color: '#38C6F4' }, { key: 'profit', name: 'Profit', color: '#3DD68C' }]
              : [{ key: 'revenue', name: 'Earned', color: '#3DD68C' }]} />
          ) : <div className="skeleton h-[260px]" />}
        </Section>

        <Section title="Live console" subtitle="Everything the bot does, as it happens" actions={<Link to="/activity" className="flex items-center gap-1 text-[13px] font-semibold text-fg-2 hover:text-neon">View full <ArrowRight size={14} /></Link>}>
          <Console height={262} limit={80} />
        </Section>
      </div>
    </>
  );
}

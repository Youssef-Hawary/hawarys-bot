import { useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Power, Send, DollarSign, Trophy, Package, Clock, Plug, KeyRound, FlaskConical, Wallet, ArrowRight } from 'lucide-react';
import { api, useData, usd } from '../api.ts';
import { Badge, Card, CountUp, PageHeader, Section, Stat, Tabs, clsx, useAction } from '../components/ui.tsx';
import { Console } from '../components/Console.tsx';
import { RevenueChart } from '../components/Charts.tsx';
import { useMe } from '../components/Shell.tsx';

function Reactor({ running, onToggle, busy }: { running: boolean; onToggle: () => void; busy: boolean }) {
  return (
    <button onClick={onToggle} disabled={busy} aria-label={running ? 'Stop bot' : 'Start bot'}
      className="group relative grid h-40 w-40 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-neon">
      <span className={clsx('reactor-ring absolute inset-0 rounded-full', running && 'fast')}
        style={{ background: running ? 'conic-gradient(from 0deg, transparent, #34D399, #38C6F4, transparent 70%)' : 'conic-gradient(from 0deg, transparent, #414A5E, transparent 60%)', mask: 'radial-gradient(circle, transparent 66%, #000 67%)', WebkitMask: 'radial-gradient(circle, transparent 66%, #000 67%)' }} />
      <span className="absolute inset-3 rounded-full border border-white/10" />
      <motion.span animate={{ scale: running ? [1, 1.06, 1] : 1, opacity: running ? [.5, .9, .5] : .25 }} transition={{ duration: 2.4, repeat: Infinity }}
        className="absolute inset-6 rounded-full blur-xl" style={{ background: running ? 'radial-gradient(circle, #34D39999, transparent 70%)' : 'radial-gradient(circle, #38C6F433, transparent 70%)' }} />
      <span className={clsx('relative grid h-24 w-24 place-items-center rounded-full transition-all duration-500 group-hover:scale-105 group-active:scale-95',
        running ? 'bg-gradient-to-b from-ok/90 to-emerald-600 text-ink-950 shadow-[0_0_40px_rgb(52_211_153/.6)]' : 'bg-gradient-to-b from-ink-700 to-ink-800 text-fg-2 ring-1 ring-white/10')}>
        {busy ? <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-current border-t-transparent" /> : <Power size={34} strokeWidth={2.6} />}
      </span>
    </button>
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
      <PageHeader title="Overview" subtitle={`Welcome back, ${me.name}. Here's what's happening.`} />

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card className="relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-neon/10 blur-3xl" />
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <Reactor running={!!bot?.running} onToggle={toggle} busy={busy === 'bot'} />
            <div className="flex-1 text-center sm:text-left">
              <div className="text-[13px] font-semibold uppercase tracking-[.2em] text-fg-3">Bot status</div>
              <div className={clsx('mt-1 text-4xl font-black', bot?.running ? 'text-ok' : 'text-fg-2')}>{bot ? (bot.running ? 'ONLINE' : 'OFFLINE') : '…'}</div>
              <p className="mt-1 text-sm text-fg-3">{bot?.running ? 'Watching Eldorado for boosting requests and orders.' : 'Press the button to start auto-offering.'}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Badge tone={bot?.hasCreds ? 'ok' : 'warn'}><KeyRound size={12} /> {bot?.hasCreds ? 'Eldorado API connected' : 'Eldorado API keys missing'}</Badge>
                <Badge tone={bot?.extensions?.length ? 'ok' : 'warn'}><Plug size={12} /> {bot?.extensions?.length ? `${bot.extensions.length} extension${bot.extensions.length > 1 ? 's' : ''} online` : 'No extension online'}</Badge>
                {bot?.dryRun && <Badge tone="violet"><FlaskConical size={12} /> Dry run: no real offers</Badge>}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Stat delay={.05} icon={<Send size={22} />} label="Offers today" value={<CountUp value={data?.offers?.today ?? 0} />}
            sub={data?.offers?.wouldToday ? `${data.offers.wouldToday} would-offer (dry run)` : `${data?.offers?.week ?? 0} this week`} />
          {owner
            ? <Stat delay={.1} tone="ok" icon={<DollarSign size={22} />} label="Revenue today" value={<CountUp value={t.revenue ?? 0} format={n => usd(n)} />} sub={`${usd(w.revenue)} this week`} />
            : <Stat delay={.1} tone="ok" icon={<Wallet size={22} />} label="I earned today" value={<CountUp value={t.earned ?? 0} format={n => usd(n)} />} sub={`${usd(w.earned)} this week`} />}
          <Stat delay={.15} tone="violet" icon={<Package size={22} />} label="Orders waiting" value={<CountUp value={data?.board?.unassigned ?? 0} />} sub={`${data?.board?.inProgress ?? 0} in progress · ${data?.board?.mine ?? 0} mine`} />
          {owner
            ? <Stat delay={.2} tone="warn" icon={<Trophy size={22} />} label="Offer win rate (7d)" value={w.winRate == null ? '–' : <CountUp value={w.winRate} format={n => `${Math.round(n)}%`} />} sub={`${usd(w.profit)} profit this week`} />
            : <Stat delay={.2} tone="warn" icon={<Clock size={22} />} label="Due in 6h" value={<CountUp value={data?.board?.dueSoon ?? 0} />} sub="across the team" />}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Section title={owner ? 'Revenue & profit' : 'My earnings'} subtitle={owner ? 'Order value vs. what you keep after fees and worker pay' : 'What you earned per day'}
          actions={<Tabs value={days} onChange={setDays} tabs={[{ id: '7', label: '7d' }, { id: '30', label: '30d' }]} />}>
          {an ? (
            <RevenueChart data={an.series} keys={owner
              ? [{ key: 'revenue', name: 'Revenue', color: '#38C6F4' }, { key: 'profit', name: 'Profit', color: '#34D399' }]
              : [{ key: 'revenue', name: 'Earned', color: '#34D399' }]} />
          ) : <div className="skeleton h-[260px]" />}
        </Section>

        <Section title="Live console" subtitle="Everything the bot does, as it happens" actions={<Link to="/activity" className="flex items-center gap-1 text-sm font-semibold text-neon hover:underline">View full <ArrowRight size={14} /></Link>}>
          <Console height={262} limit={80} />
        </Section>
      </div>
    </>
  );
}

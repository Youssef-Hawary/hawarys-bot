import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Radar, RotateCcw, Trophy, XCircle, SkipForward, Send, Hourglass, FlaskConical } from 'lucide-react';
import { api, ago, useData, usd } from '../api.ts';
import { Badge, Button, Card, CountUp, Empty, GameBadge, PageHeader, Stat, Tabs, useAction } from '../components/ui.tsx';

type Req = {
  id: string; game: string | null; category: string | null; buyer: string | null; seen_at: number; status: string; reason: string | null;
  price: number | null; hours: number | null; outcome: string | null; variant: string | null;
  summary: { currentRank: string | null; desiredRank: string | null; region: string | null; completion: string | null; points: number | null; service: string } | null;
};

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neon' | 'muted' | 'violet' }> = {
  needs_details: { label: 'Waiting for details', tone: 'warn' },
  offered: { label: 'Offer sent', tone: 'neon' },
  would_offer: { label: 'Dry run', tone: 'violet' },
  skipped: { label: 'Skipped', tone: 'muted' },
  error: { label: 'Error', tone: 'bad' },
};

export function Offers() {
  const { data, reload } = useData<Req[]>('/requests', ['requests']);
  const [filter, setFilter] = useState<'all' | 'offered' | 'won' | 'skipped'>('all');
  const { busy, run } = useAction();

  const rows = useMemo(() => (data ?? []).filter(r =>
    filter === 'all' || (filter === 'won' ? r.outcome === 'won' : filter === 'offered' ? ['offered', 'would_offer'].includes(r.status) : r.status === filter)), [data, filter]);
  const all = data ?? [];
  const offered = all.filter(r => r.status === 'offered').length;
  const won = all.filter(r => r.outcome === 'won').length, lost = all.filter(r => r.outcome === 'lost').length;

  return (
    <>
      <PageHeader title="Live offers" subtitle="Every boosting request the bot saw, what it decided, and whether we won." />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={<Radar size={22} />} label="Requests seen" value={<CountUp value={all.length} />} />
        <Stat delay={.05} tone="violet" icon={<Send size={22} />} label="Offers sent" value={<CountUp value={offered} />} sub={`${all.filter(r => r.status === 'would_offer').length} dry-run`} />
        <Stat delay={.1} tone="ok" icon={<Trophy size={22} />} label="Won" value={<CountUp value={won} />} sub={won + lost ? `${Math.round((won / (won + lost)) * 100)}% win rate` : 'no results yet'} />
        <Stat delay={.15} tone="warn" icon={<SkipForward size={22} />} label="Skipped" value={<CountUp value={all.filter(r => r.status === 'skipped').length} />} sub="filters & limits" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.06] px-5 py-3.5">
          <h3 className="font-bold text-neon">Activity log</h3>
          <Tabs value={filter} onChange={setFilter} tabs={[{ id: 'all', label: 'All' }, { id: 'offered', label: 'Offered' }, { id: 'won', label: 'Won' }, { id: 'skipped', label: 'Skipped' }]} />
        </div>
        {rows.length === 0 ? <Empty icon={<Radar />} title="No requests yet" text="Start the bot. New Eldorado boosting requests appear here within seconds." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-[12px] uppercase tracking-wider text-fg-3">
                <tr>{['Time', 'Game', 'Boost', 'Region', 'Buyer', 'Price', 'Status', 'Result', ''].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => {
                  const s = STATUS[r.status] ?? { label: r.status, tone: 'muted' as const };
                  return (
                    <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * .012, .4) }} className="border-t border-white/[.04] hover:bg-white/[.02]">
                      <td className="whitespace-nowrap px-4 py-3 text-fg-3">{ago(r.seen_at)}</td>
                      <td className="px-4 py-3"><GameBadge game={r.game} /></td>
                      <td className="px-4 py-3 font-semibold">
                        {r.summary?.currentRank ? <>{r.summary.currentRank} <span className="text-neon">→</span> {r.summary.desiredRank}</> : <span className="text-fg-3">{r.category ?? '–'}</span>}
                        {r.summary?.completion?.toLowerCase().includes('duo') && <Badge tone="violet" className="ml-2">Duo</Badge>}
                        {r.summary?.points ? <span className="ml-2 text-[12px] text-fg-3">{r.summary.points} {r.game === 'lol' ? 'LP' : 'RR'}</span> : null}
                      </td>
                      <td className="px-4 py-3">{r.summary?.region ?? '–'}</td>
                      <td className="px-4 py-3 text-fg-2">{r.buyer ?? '–'}</td>
                      <td className="px-4 py-3 font-bold">{r.price != null ? usd(r.price) : '–'}{r.variant && <span className="ml-1.5 text-[11px] font-semibold text-fg-3">msg {r.variant}</span>}</td>
                      <td className="px-4 py-3"><Badge tone={s.tone}>{r.status === 'would_offer' && <FlaskConical size={11} />}{r.status === 'needs_details' && <Hourglass size={11} />}{s.label}</Badge>
                        {r.reason && <div className="mt-1 max-w-[220px] text-[12px] text-fg-3">{r.reason}</div>}</td>
                      <td className="px-4 py-3">{r.outcome === 'won' ? <Badge tone="ok"><Trophy size={11} /> Won</Badge> : r.outcome === 'lost' ? <Badge tone="bad"><XCircle size={11} /> Lost</Badge> : <span className="text-fg-3">–</span>}</td>
                      <td className="px-4 py-3">{['skipped', 'error', 'would_offer'].includes(r.status) && r.summary && (
                        <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} loading={busy === r.id} title="Run pricing again"
                          onClick={() => run(r.id, async () => { await api(`/requests/${r.id}/retry`, { method: 'POST' }); await reload(); }, 'Re-checked')}>Retry</Button>)}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

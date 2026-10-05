import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Save, Plus, Trash2, Calculator, RotateCcw, Sparkles } from 'lucide-react';
import { api, useData, usd } from '../api.ts';
import { Badge, Button, Card, Field, Num, PageHeader, Section, Tabs, Toggle, clsx, useAction } from '../components/ui.tsx';

type Tier = { name: string; price: number; hours: number; skip: boolean };
type P = any;
type Game = 'valorant' | 'lol';

function TierTable({ tiers, onChange, priceLabel, hoursLabel }: { tiers: Tier[]; onChange: (t: Tier[]) => void; priceLabel: string; hoursLabel: string }) {
  const set = (i: number, patch: Partial<Tier>) => onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] text-sm">
        <thead className="text-left text-[12px] uppercase tracking-wider text-fg-3">
          <tr><th className="pb-2 font-semibold">Tier</th><th className="pb-2 font-semibold">{priceLabel}</th><th className="pb-2 font-semibold">{hoursLabel}</th><th className="pb-2 text-center font-semibold">Skip</th></tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={t.name} className={clsx('border-t border-white/[.04] transition', t.skip && 'opacity-45')}>
              <td className="py-2 font-semibold">{t.name}</td>
              <td className="w-32 py-2 pr-3"><Num prefix="$" step={0.5} min={0} value={t.price} onChange={v => set(i, { price: v })} /></td>
              <td className="w-28 py-2 pr-3"><Num step={1} min={0} value={t.hours} onChange={v => set(i, { hours: v })} /></td>
              <td className="py-2 text-center"><div className="inline-block"><Toggle checked={t.skip} onChange={v => set(i, { skip: v })} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pricing() {
  const { data, reload } = useData<{ games: Record<Game, P>; meta: Record<Game, { name: string; tiers: string[]; ranks: string[]; regions: string[]; points: string }> }>('/pricing', ['pricing']);
  const [game, setGame] = useState<Game>('valorant');
  const [draft, setDraft] = useState<Record<Game, P> | null>(null);
  const { busy, run } = useAction();

  useEffect(() => { if (data && !draft) setDraft(structuredClone(data.games)); }, [data, draft]);
  const p = draft?.[game];
  const meta = data?.meta[game];
  const dirty = useMemo(() => !!(draft && data && JSON.stringify(draft[game]) !== JSON.stringify(data.games[game])), [draft, data, game]);
  const set = (fn: (p: P) => void) => setDraft(d => { const n = structuredClone(d!); fn(n[game]); return n; });

  if (!p || !meta) return <><PageHeader title="Pricing" /><div className="skeleton h-96" /></>;

  const save = () => run('save', async () => { await api(`/pricing/${game}`, { method: 'PUT', body: p }); await reload(); }, `${meta.name} pricing saved. The bot uses it right away.`);
  const reset = () => { if (confirm(`Reset ${meta.name} pricing to the defaults?`)) run('reset', async () => { const fresh = await api(`/pricing/${game}/reset`, { method: 'POST' }); setDraft(d => ({ ...d!, [game]: fresh })); await reload(); }, 'Reset to defaults'); };

  return (
    <>
      <PageHeader title="Pricing" subtitle="Everyone on the team can edit. Changes apply to the next request."
        actions={<>
          <Tabs value={game} onChange={setGame} tabs={[{ id: 'valorant', label: 'Valorant' }, { id: 'lol', label: 'League of Legends' }]} />
          <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={reset} loading={busy === 'reset'}>Defaults</Button>
        </>} />

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Section title="General" subtitle={`Turn ${meta.name} on/off, pick regions, and set safety filters.`}>
            <div className="grid gap-4 md:grid-cols-2">
              <Toggle checked={p.enabled} onChange={v => set(x => { x.enabled = v; })} label={`Offer on ${meta.name} requests`} hint="Master switch for this game" />
              <Field label="Minimum offer price"><Num prefix="$" value={p.minPrice} step={0.5} onChange={v => set(x => { x.minPrice = v; })} /></Field>
              <Toggle checked={p.filters.rejectConsole} onChange={v => set(x => { x.filters.rejectConsole = v; })} label="Reject console requests" hint="Skips PS4/PS5/Xbox players" />
              <Toggle checked={p.filters.rejectLinks} onChange={v => set(x => { x.filters.rejectLinks = v; })} label="Reject requests with links" hint="Usually scams moving you to Discord/Telegram. '3.5 hours' is not a link." />
            </div>
            <div className="mt-5">
              <div className="mb-2 text-[13px] font-semibold text-fg-2">Active regions <span className="font-normal text-fg-3">· price multiplier per region</span></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {meta.regions.map(r => (
                  <div key={r} className={clsx('flex items-center gap-2 rounded-xl p-2 ring-1 transition', p.regions[r] ? 'bg-neon/[.07] ring-neon/30' : 'bg-white/[.02] ring-white/[.06]')}>
                    <button onClick={() => set(x => { x.regions[r] = !x.regions[r]; })} className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-md text-[13px] font-black', p.regions[r] ? 'bg-neon text-on-neon' : 'bg-ink-700 text-fg-3')}>{p.regions[r] ? '✓' : ''}</button>
                    <span className="w-14 font-bold">{r}</span>
                    <span className="text-fg-3">×</span>
                    <Num className="w-20" step={0.05} value={p.regionMultipliers[r] ?? 1} onChange={v => set(x => { x.regionMultipliers[r] = v; })} />
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Rank boost" subtitle="Price per division by tier. The bot adds up every division between current and desired rank."
            actions={<Toggle checked={p.rankBoost.enabled} onChange={v => set(x => { x.rankBoost.enabled = v; })} />}>
            <div className={clsx(!p.rankBoost.enabled && 'pointer-events-none opacity-40')}>
              <TierTable tiers={p.rankBoost.tiers} onChange={t => set(x => { x.rankBoost.tiers = t; })} priceLabel="$ / division" hoursLabel="Hours / div" />
              <div className="mt-6 rounded-2xl bg-white/[.02] p-4 ring-1 ring-white/[.05]">
                <Toggle checked={p.rankBoost.pointsDiscount.enabled} onChange={v => set(x => { x.rankBoost.pointsDiscount.enabled = v; })}
                  label={`${meta.points} discount`} hint={`If the buyer already has ${meta.points} in their current division, the first division costs less.`} />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {p.rankBoost.pointsDiscount.bands.map((b: any, i: number) => (
                    <div key={i} className="rounded-xl bg-ink-950/50 p-2.5 ring-1 ring-white/[.05]">
                      <div className="mb-1 text-[12px] text-fg-3">From {meta.points}</div>
                      <Num value={b.from} onChange={v => set(x => { x.rankBoost.pointsDiscount.bands[i].from = v; })} />
                      <div className="mb-1 mt-2 text-[12px] text-fg-3">Discount %</div>
                      <Num value={b.pct} onChange={v => set(x => { x.rankBoost.pointsDiscount.bands[i].pct = v; })} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Modifiers" subtitle="Extra multipliers. Detected from the Completion Method and the buyer's description. Skip = never offer when present. Max rank = hard limit.">
            <div className="space-y-2">
              {p.modifiers.map((m: any, i: number) => (
                <div key={m.key} className={clsx('grid items-center gap-3 rounded-xl bg-white/[.02] p-3 ring-1 ring-white/[.05] md:grid-cols-[1fr_110px_70px_170px]', m.skip && 'opacity-60')}>
                  <div>
                    <div className="font-semibold">{m.label}</div>
                    <input className="field mt-1 !py-1 text-[12px]" value={m.keywords.join(', ')} title="Words that trigger this modifier"
                      onChange={e => set(x => { x.modifiers[i].keywords = e.target.value.split(',').map(s => s.trim()).filter(Boolean); })} />
                  </div>
                  <Field label="Multiplier"><Num step={0.05} value={m.multiplier} onChange={v => set(x => { x.modifiers[i].multiplier = v; })} /></Field>
                  <Field label="Skip"><Toggle checked={m.skip} onChange={v => set(x => { x.modifiers[i].skip = v; })} /></Field>
                  <Field label="Max rank">
                    <select className="field !py-1.5" value={m.maxRank ?? ''} onChange={e => set(x => { x.modifiers[i].maxRank = e.target.value || null; })}>
                      {meta.ranks.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </Field>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Custom price overrides" subtitle="Exact from → to rules with a fixed final price (no multipliers). Region-specific rules beat 'All regions'. Skip flags still apply."
            actions={<Button size="sm" icon={<Plus size={14} />} onClick={() => set(x => { x.customRules.push({ id: crypto.randomUUID(), enabled: true, from: meta.ranks[9], to: meta.ranks[12], region: 'ALL', price: 20 }); })}>Add rule</Button>}>
            {p.customRules.length === 0 ? <p className="text-sm text-fg-3">No custom rules. The bot uses tier pricing for everything.</p> : (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {p.customRules.map((r: any, i: number) => {
                    const regionOff = r.region !== 'ALL' && p.regions[r.region] === false;
                    return (
                      <motion.div key={r.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }}
                        className={clsx('grid items-end gap-2 rounded-xl p-3 ring-1 sm:grid-cols-[auto_1fr_1fr_120px_110px_auto]', regionOff ? 'bg-bad/[.06] ring-bad/30' : 'bg-white/[.02] ring-white/[.05]')}>
                        <Toggle checked={r.enabled} onChange={v => set(x => { x.customRules[i].enabled = v; })} />
                        <Field label="From"><select className="field !py-1.5" value={r.from} onChange={e => set(x => { x.customRules[i].from = e.target.value; })}>{meta.ranks.map(k => <option key={k}>{k}</option>)}</select></Field>
                        <Field label="To"><select className="field !py-1.5" value={r.to} onChange={e => set(x => { x.customRules[i].to = e.target.value; })}>{meta.ranks.map(k => <option key={k}>{k}</option>)}</select></Field>
                        <Field label="Region"><select className="field !py-1.5" value={r.region} onChange={e => set(x => { x.customRules[i].region = e.target.value; })}><option value="ALL">All regions</option>{meta.regions.map(k => <option key={k}>{k}</option>)}</select></Field>
                        <Field label="Final price"><Num prefix="$" step={0.5} value={r.price} onChange={v => set(x => { x.customRules[i].price = v; })} /></Field>
                        <Button variant="ghost" size="sm" aria-label="Delete rule" onClick={() => set(x => { x.customRules.splice(i, 1); })}><Trash2 size={15} /></Button>
                        {regionOff && <div className="text-[12px] text-bad sm:col-span-6">Region {r.region} is turned off above, so this rule won't match.</div>}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </Section>

          <div className="grid gap-5 2xl:grid-cols-2">
            <Section title="Placements" subtitle="Price per game × games requested." actions={<Toggle checked={p.placements.enabled} onChange={v => set(x => { x.placements.enabled = v; })} />}>
              <div className={clsx(!p.placements.enabled && 'pointer-events-none opacity-40')}>
                <Field label="Default number of games" className="mb-4 max-w-[180px]"><Num value={p.placements.defaultGames} onChange={v => set(x => { x.placements.defaultGames = v; })} /></Field>
                <TierTable tiers={p.placements.tiers} onChange={t => set(x => { x.placements.tiers = t; })} priceLabel="$ / game" hoursLabel="Hours / game" />
              </div>
            </Section>
            <Section title="Net wins" subtitle="Price per win × wins requested." actions={<Toggle checked={p.netWins.enabled} onChange={v => set(x => { x.netWins.enabled = v; })} />}>
              <div className={clsx(!p.netWins.enabled && 'pointer-events-none opacity-40')}>
                <TierTable tiers={p.netWins.tiers} onChange={t => set(x => { x.netWins.tiers = t; })} priceLabel="$ / win" hoursLabel="Hours / win" />
              </div>
            </Section>
          </div>

          <Section title="Coaching" actions={<Toggle checked={p.coaching.enabled} onChange={v => set(x => { x.coaching.enabled = v; })} />}>
            <div className={clsx('grid max-w-md grid-cols-2 gap-4', !p.coaching.enabled && 'pointer-events-none opacity-40')}>
              <Field label="Price per hour"><Num prefix="$" value={p.coaching.pricePerHour} onChange={v => set(x => { x.coaching.pricePerHour = v; })} /></Field>
              <Field label="Default hours"><Num value={p.coaching.defaultHours} onChange={v => set(x => { x.coaching.defaultHours = v; })} /></Field>
            </div>
          </Section>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start"><QuoteTester game={game} pricing={p} meta={meta} /></div>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="glass fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 py-3 pl-5 pr-3 lg:ml-[136px]">
            <span className="text-sm font-semibold">Unsaved {meta.name} changes</span>
            <Button variant="ghost" size="sm" onClick={() => setDraft(d => ({ ...d!, [game]: structuredClone(data!.games[game]) }))}>Discard</Button>
            <Button variant="primary" icon={<Save size={15} />} loading={busy === 'save'} onClick={save}>Save pricing</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function QuoteTester({ game, pricing, meta }: { game: Game; pricing: P; meta: { ranks: string[]; regions: string[]; points: string } }) {
  const [f, setF] = useState({ current: meta.ranks[12], points: 0, desired: meta.ranks[15], region: meta.regions[1] ?? meta.regions[0], duo: false, description: '' });
  const [q, setQ] = useState<any>(null);
  useEffect(() => { setF(x => ({ ...x, current: meta.ranks[12], desired: meta.ranks[15], region: meta.regions[1] ?? meta.regions[0] })); }, [game]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => {
      api(`/pricing/${game}/quote`, { body: { pricing, category: 'Rank Boost', fields: {
        'Current Rank': f.current, [`Current ${meta.points}`]: String(f.points), 'Desired Rank': f.desired, Server: f.region, 'Completion Method': f.duo ? 'Duo' : 'Solo', Description: f.description,
      } } }).then(setQ).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [f, pricing, game, meta.points]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[.06] px-5 py-3.5"><Calculator size={17} className="text-neon" /><h3 className="font-bold text-neon">Quote tester</h3><Badge tone="violet" className="ml-auto">uses unsaved changes</Badge></div>
      <div className="space-y-3 p-5">
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <Field label="Current rank"><select className="field" value={f.current} onChange={e => setF({ ...f, current: e.target.value })}>{meta.ranks.map(r => <option key={r}>{r}</option>)}</select></Field>
          <Field label={meta.points}><Num value={f.points} onChange={v => setF({ ...f, points: v })} /></Field>
        </div>
        <Field label="Desired rank"><select className="field" value={f.desired} onChange={e => setF({ ...f, desired: e.target.value })}>{meta.ranks.map(r => <option key={r}>{r}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Server"><select className="field" value={f.region} onChange={e => setF({ ...f, region: e.target.value })}>{meta.regions.map(r => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Completion"><select className="field" value={f.duo ? 'Duo' : 'Solo'} onChange={e => setF({ ...f, duo: e.target.value === 'Duo' })}><option>Solo</option><option>Duo</option></select></Field>
        </div>
        <Field label="Buyer description"><input className="field" placeholder="e.g. please stream, no 5 stack" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>

        <div className="relative mt-2 overflow-hidden rounded-2xl p-5 text-center ring-1 ring-white/10" style={{ background: q?.ok ? 'radial-gradient(circle at 50% 0%, rgb(56 198 244 / .22), transparent 70%)' : 'radial-gradient(circle at 50% 0%, rgb(248 113 113 / .15), transparent 70%)' }}>
          {q?.ok ? (<>
            <div className="text-[12px] font-semibold uppercase tracking-[.2em] text-fg-3">Bot would offer</div>
            <motion.div key={q.price} initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-1 text-5xl font-black text-neon text-glow">{usd(q.price)}</motion.div>
            <div className="mt-1 text-sm text-fg-2">{q.hours}h of work · delivery <b>{q.delivery}</b></div>
            <ul className="mt-3 space-y-1 text-left text-[12.5px] text-fg-3">{q.breakdown.map((b: string) => <li key={b} className="flex gap-2"><Sparkles size={12} className="mt-1 shrink-0 text-neon" />{b}</li>)}</ul>
          </>) : (<>
            <div className="text-[12px] font-semibold uppercase tracking-[.2em] text-fg-3">Bot would skip</div>
            <div className="mt-2 font-semibold text-bad">{q?.reason ?? '…'}</div>
          </>)}
        </div>
      </div>
    </Card>
  );
}

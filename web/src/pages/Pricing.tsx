import { Fragment, useEffect, useMemo, useState } from 'react';
import { Save, Plus, Trash2, RotateCcw, Copy, X, Ban, Check } from 'lucide-react';
import { api, useData, usd } from '../api.ts';
import { Badge, Button, Card, Field, Num, PageHeader, Section, Tabs, Toggle, clsx, useAction } from '../components/ui.tsx';

type Game = 'valorant' | 'lol';
type ServiceKey = 'rank' | 'derank' | 'placements' | 'netwins' | 'coaching';
type Tier = { name: string; price: number; hours: number; skip: boolean };
type Adjust = { mult: number; skip: boolean; maxRank: string | null };
type ServiceCfg = { enabled: boolean; tiers: Tier[]; completion: { solo: Adjust; duo: Adjust }; modifiers: Record<string, Adjust>; defaultAmount: number };
type Table = Record<ServiceKey, ServiceCfg>;
type ModDef = { key: string; label: string; hint: string; keywords: string[] };
type Rule = { id: string; enabled: boolean; from: string; to: string; region: string; price: number; hours: number; refuse: boolean };
type P = {
  version: 2; enabled: boolean; minPrice: number; regions: Record<string, boolean>; services: Table; regionTables: Record<string, Table>;
  modifierDefs: ModDef[]; pointsDiscount: { enabled: boolean; bands: { from: number; pct: number }[] }; customRules: Rule[];
  filters: { rejectConsole: boolean; rejectLinks: boolean; catchHiddenDuo: boolean };
};
type SvcInfo = { key: ServiceKey; label: string; unit: string; formula: string; usesModifiers: boolean };
type Meta = { name: string; tiers: string[]; ranks: string[]; regions: string[]; regionNames: Record<string, string>; points: string; services: SvcInfo[] };

const TIER_COLORS: Record<string, string> = {
  Iron: '#7B7F86', Bronze: '#A9714B', Silver: '#B8C2CC', Gold: '#E2B44B', Platinum: '#3FB8B0', Emerald: '#2FBF71',
  Diamond: '#9C8CF0', Ascendant: '#3FBF86', Immortal: '#D0485F', Radiant: '#F4E4A0', Master: '#A35BD9', Grandmaster: '#D9434A', Challenger: '#F2C94C',
};

const GLOBAL = 'GLOBAL';

export function Pricing() {
  const { data, reload } = useData<{ games: Record<Game, P>; meta: Record<Game, Meta> }>('/pricing', ['pricing']);
  const [game, setGame] = useState<Game>('valorant');
  const [draft, setDraft] = useState<Record<Game, P> | null>(null);
  const [scope, setScope] = useState<string>(GLOBAL);
  const [svc, setSvc] = useState<ServiceKey>('rank');
  const { busy, run } = useAction();

  useEffect(() => { if (data && !draft) setDraft(structuredClone(data.games)); }, [data, draft]);
  useEffect(() => { setScope(GLOBAL); }, [game]);
  const p = draft?.[game];
  const meta = data?.meta[game];
  const dirty = useMemo(() => !!(draft && data && JSON.stringify(draft[game]) !== JSON.stringify(data.games[game])), [draft, data, game]);
  const set = (fn: (p: P) => void) => setDraft(d => { const n = structuredClone(d!); fn(n[game]); return n; });

  if (!p || !meta) return <><PageHeader title="Pricing" /><div className="skeleton h-96" /></>;

  const hasOwn = scope !== GLOBAL && !!p.regionTables[scope];
  const table: Table = hasOwn ? p.regionTables[scope] : p.services;
  const editable = scope === GLOBAL || hasOwn;
  const setTable = (fn: (t: Table) => void) => set(x => fn(scope !== GLOBAL && x.regionTables[scope] ? x.regionTables[scope] : x.services));
  const cfg = table[svc];
  const info = meta.services.find(s => s.key === svc)!;

  const save = () => run('save', async () => { await api(`/pricing/${game}`, { method: 'PUT', body: p }); await reload(); }, `${meta.name} pricing saved. The bot uses it from the next request.`);
  const reset = () => { if (confirm(`Reset all ${meta.name} pricing to the defaults?`)) run('reset', async () => { const fresh = await api(`/pricing/${game}/reset`, { method: 'POST' }); setDraft(d => ({ ...d!, [game]: fresh as P })); await reload(); }, 'Reset to defaults'); };

  return (
    <>
      <PageHeader title="Pricing" subtitle="How the bot prices every request. Anyone on the team can edit. Changes apply from the next request."
        actions={<>
          <Tabs value={game} onChange={setGame} tabs={[{ id: 'valorant', label: 'Valorant' }, { id: 'lol', label: 'League of Legends' }]} />
          <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={reset} loading={busy === 'reset'}>Defaults</Button>
        </>} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {/* ---------- general ---------- */}
          <Section title="General" subtitle={`Applies to every ${meta.name} request.`}
            actions={<Toggle checked={p.enabled} onChange={v => set(x => { x.enabled = v; })} />}>
            <div className={clsx('grid gap-x-8 gap-y-2 md:grid-cols-2', !p.enabled && 'opacity-45')}>
              <Toggle checked={p.filters.rejectConsole} onChange={v => set(x => { x.filters.rejectConsole = v; })} label="Refuse console players" hint="PS4, PS5 and Xbox, found in the request or the text" />
              <Toggle checked={p.filters.rejectLinks} onChange={v => set(x => { x.filters.rejectLinks = v; })} label="Refuse requests with links" hint="Usually scams moving you to Discord/Telegram" />
              <Toggle checked={p.filters.catchHiddenDuo} onChange={v => set(x => { x.filters.catchHiddenDuo = v; })} label="Catch hidden Duo" hint="Treat as Duo when the text says duo, even if the field says Solo" />
              <div className="flex items-center justify-between gap-4 py-1">
                <span><span className="block text-[14px] font-semibold">Minimum offer</span><span className="block text-[12.5px] text-fg-3">Cheaper quotes are raised to this</span></span>
                <Num className="w-28" prefix="$" step={0.5} value={p.minPrice} onChange={v => set(x => { x.minPrice = v; })} />
              </div>
            </div>
          </Section>

          {/* ---------- regions ---------- */}
          <Section title="Regions & price tables" subtitle="Switch a region off to never offer there. Give a region its own price table to charge it differently.">
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {meta.regions.map(r => {
                const on = p.regions[r] !== false;
                const own = !!p.regionTables[r];
                return (
                  <div key={r} className={clsx('flex items-center gap-3 rounded-[8px] border px-3 py-2', on ? 'border-white/[.09] bg-white/[.025]' : 'border-white/[.05] bg-black/20 opacity-60')}>
                    <Toggle size="sm" checked={on} onChange={v => set(x => { x.regions[r] = v; })} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold">{r}</div>
                      <div className="truncate text-[11.5px] text-fg-3">{meta.regionNames[r]}</div>
                    </div>
                    {own
                      ? <button onClick={() => setScope(r)} className="rounded-[5px] border border-neon/30 bg-neon/10 px-1.5 py-[1px] text-[11px] font-bold text-neon hover:bg-neon/20">Own table</button>
                      : <span className="text-[11px] text-fg-3">Global</span>}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ---------- order types ---------- */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-white/[.06] px-5 py-3">
              <h3 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[.12em]"><span className="h-3 w-[3px] rounded-sm bg-neon" />Order types</h3>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="label-caps">Price table</span>
                <select className="field !w-auto !py-1 text-[13px] font-semibold" value={scope} onChange={e => setScope(e.target.value)}>
                  <option value={GLOBAL}>Global (all regions)</option>
                  {meta.regions.map(r => <option key={r} value={r}>{r}{p.regionTables[r] ? ' · own table' : ''}</option>)}
                </select>
              </div>
            </div>

            {scope !== GLOBAL && (
              <div className={clsx('flex flex-wrap items-center gap-3 border-b px-5 py-2.5 text-[13px]', hasOwn ? 'border-neon/15 bg-neon/[.04]' : 'border-white/[.06] bg-black/20')}>
                {hasOwn ? <>
                  <span className="text-fg-2"><b className="text-neon">{scope}</b> uses its own prices below. Everything else uses Global.</span>
                  <Button size="sm" variant="ghost" className="ml-auto" icon={<X size={13} />} onClick={() => set(x => { delete x.regionTables[scope]; })}>Remove {scope} table</Button>
                </> : <>
                  <span className="text-fg-3">{scope} uses the Global table (shown below, read-only here).</span>
                  <Button size="sm" variant="soft" className="ml-auto" icon={<Copy size={13} />} onClick={() => set(x => { x.regionTables[scope] = structuredClone(x.services); })}>Give {scope} its own table</Button>
                </>}
              </div>
            )}

            {/* service tabs */}
            <div className="flex overflow-x-auto border-b border-white/[.06] bg-black/20">
              {meta.services.map(s => (
                <button key={s.key} onClick={() => setSvc(s.key)}
                  className={clsx('relative flex shrink-0 items-center gap-2 px-4 py-3 text-[13.5px] font-semibold transition-colors',
                    svc === s.key ? 'bg-ink-850 text-fg' : 'text-fg-3 hover:text-fg-2')}>
                  {svc === s.key && <span className="absolute inset-x-0 top-0 h-[2px] bg-neon" />}
                  <span className={clsx('dot', table[s.key].enabled ? 'bg-ok' : 'bg-ink-600')} />
                  {s.label}
                </button>
              ))}
            </div>

            <fieldset disabled={!editable} className={clsx('p-5', !editable && 'opacity-60')}>
              <div className="mb-5 flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-bold">{info.label}</div>
                  <div className="text-[13px] text-fg-3">{info.formula}{svc === 'derank' && ' · used when the desired rank is below the current one'}</div>
                </div>
                {['placements', 'netwins', 'coaching'].includes(svc) && (
                  <div className="flex items-center gap-2 text-[13px] text-fg-2">Default {info.unit}s
                    <Num className="w-20" min={1} value={cfg.defaultAmount} onChange={v => setTable(t => { t[svc].defaultAmount = v; })} /></div>
                )}
                <Toggle checked={cfg.enabled} onChange={v => setTable(t => { t[svc].enabled = v; })} label={cfg.enabled ? 'On' : 'Off'} />
              </div>

              <div className={clsx('grid gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]', !cfg.enabled && 'opacity-45')}>
                <TierTable tiers={cfg.tiers} unit={info.unit} onChange={(i, patch) => setTable(t => { Object.assign(t[svc].tiers[i], patch); })} />
                <AdjustTable cfg={cfg} defs={p.modifierDefs} usesModifiers={info.usesModifiers} ranks={meta.ranks}
                  onChange={(key, patch) => setTable(t => {
                    const target = key === 'solo' || key === 'duo' ? t[svc].completion[key] : (t[svc].modifiers[key] ??= { mult: 1, skip: false, maxRank: null });
                    Object.assign(target, patch);
                  })} />
              </div>

              {svc === 'rank' && (
                <div className="well mt-5 p-4">
                  <Toggle checked={p.pointsDiscount.enabled} onChange={v => set(x => { x.pointsDiscount.enabled = v; })}
                    label={`${meta.points} discount`} hint={`When the buyer already has ${meta.points} in their current division, the first division costs less. Same for every price table.`} />
                  <div className={clsx('mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4', !p.pointsDiscount.enabled && 'opacity-45')}>
                    {p.pointsDiscount.bands.map((b, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-[7px] border border-white/[.06] bg-black/20 p-2">
                        <Num className="w-16" value={b.from} onChange={v => set(x => { x.pointsDiscount.bands[i].from = v; })} />
                        <span className="text-[12px] text-fg-3">{meta.points}+</span>
                        <Num className="ml-auto w-[72px]" suffix="%" value={b.pct} onChange={v => set(x => { x.pointsDiscount.bands[i].pct = v; })} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>
          </Card>

          {/* ---------- custom rules ---------- */}
          <Section title="Custom rank rules" subtitle="Pin an exact from → to pair to a final price (nothing multiplies it), or refuse it. A region rule beats an all-regions rule."
            bodyClass="!p-0"
            actions={<Button size="sm" icon={<Plus size={14} />} onClick={() => set(x => { x.customRules.push({ id: crypto.randomUUID(), enabled: true, from: meta.ranks[9], to: meta.ranks[12], region: 'ALL', price: 20, hours: 0, refuse: false }); })}>Add rule</Button>}>
            {p.customRules.length === 0 ? <p className="px-5 py-6 text-[13.5px] text-fg-3">No custom rules. Every rank boost uses the tier prices.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13.5px]">
                  <thead><tr className="label-caps text-left">{['On', 'From', 'To', 'Region', 'Action', 'Final price', 'Hours', ''].map(h => <th key={h} className="px-3 py-2.5 first:pl-5 font-bold">{h}</th>)}</tr></thead>
                  <tbody>
                    {p.customRules.map((r, i) => {
                      const up = (patch: Partial<Rule>) => set(x => { Object.assign(x.customRules[i], patch); });
                      const regionOff = r.region !== 'ALL' && p.regions[r.region] === false;
                      return (
                        <tr key={r.id} className={clsx('border-t border-white/[.05]', !r.enabled && 'opacity-50')}>
                          <td className="py-2 pl-5 pr-3"><Toggle size="sm" checked={r.enabled} onChange={v => up({ enabled: v })} /></td>
                          <td className="px-3 py-2"><select className="field !py-1" value={r.from} onChange={e => up({ from: e.target.value })}>{meta.ranks.map(k => <option key={k}>{k}</option>)}</select></td>
                          <td className="px-3 py-2"><select className="field !py-1" value={r.to} onChange={e => up({ to: e.target.value })}>{meta.ranks.map(k => <option key={k}>{k}</option>)}</select></td>
                          <td className="px-3 py-2">
                            <select className={clsx('field !py-1', regionOff && '!border-bad/50')} value={r.region} onChange={e => up({ region: e.target.value })} title={regionOff ? `${r.region} is switched off, so this rule never runs` : undefined}>
                              <option value="ALL">All regions</option>{meta.regions.map(k => <option key={k}>{k}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2"><Segment value={r.refuse ? 'refuse' : 'price'} onChange={v => up({ refuse: v === 'refuse' })} options={[{ id: 'price', label: 'Price' }, { id: 'refuse', label: 'Refuse' }]} /></td>
                          <td className="w-28 px-3 py-2">{r.refuse ? <span className="text-fg-3">–</span> : <Num prefix="$" step={0.5} value={r.price} onChange={v => up({ price: v })} />}</td>
                          <td className="w-24 px-3 py-2">{r.refuse ? <span className="text-fg-3">–</span> : <Num value={r.hours} onChange={v => up({ hours: v })} />}</td>
                          <td className="px-3 py-2 pr-5 text-right"><Button variant="ghost" size="sm" aria-label="Delete rule" onClick={() => set(x => { x.customRules.splice(i, 1); })}><Trash2 size={14} /></Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="border-t border-white/[.05] px-5 py-2.5 text-[12px] text-fg-3">Hours 0 = use the tier hours for the delivery time.</p>
              </div>
            )}
          </Section>

          {/* ---------- detection words ---------- */}
          <Section title="Modifier detection" subtitle="Words in the buyer's description that switch a modifier on. Separate with commas.">
            <div className="grid gap-3 md:grid-cols-2">
              {p.modifierDefs.map((d, i) => (
                <Field key={d.key} label={<span>{d.label} <span className="font-normal text-fg-3">· {d.hint}</span></span>}>
                  <input className="field font-mono !text-[12.5px]" value={d.keywords.join(', ')}
                    onChange={e => set(x => { x.modifierDefs[i].keywords = e.target.value.split(',').map(s => s.trimStart()); })}
                    onBlur={() => set(x => { x.modifierDefs[i].keywords = x.modifierDefs[i].keywords.map(s => s.trim()).filter(Boolean); })} />
                </Field>
              ))}
            </div>
          </Section>
        </div>

        <div className="xl:sticky xl:top-[72px] xl:self-start"><QuoteTester game={game} pricing={p} meta={meta} /></div>
      </div>

      {dirty && (
        <div className="panel fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 !border-neon/30 py-2.5 pl-5 pr-2.5 lg:ml-[124px]">
          <span className="dot bg-warn" />
          <span className="text-[13.5px] font-semibold">Unsaved {meta.name} changes</span>
          <Button variant="ghost" size="sm" onClick={() => setDraft(d => ({ ...d!, [game]: structuredClone(data!.games[game]) }))}>Discard</Button>
          <Button variant="primary" icon={<Save size={14} />} loading={busy === 'save'} onClick={save}>Save pricing</Button>
        </div>
      )}
    </>
  );
}

function Segment<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-[6px] border border-white/[.08] bg-black/30 p-[2px]">
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={clsx('rounded-[4px] px-2 py-[3px] text-[12px] font-bold transition-colors',
            value === o.id ? (o.id === 'refuse' || o.id === 'skip' ? 'bg-bad/20 text-bad' : 'bg-ink-700 text-fg') : 'text-fg-3 hover:text-fg-2')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TierTable({ tiers, unit, onChange }: { tiers: Tier[]; unit: string; onChange: (i: number, patch: Partial<Tier>) => void }) {
  return (
    <div className="well overflow-hidden">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="label-caps text-left">
            <th className="px-3 py-2.5 font-bold">Tier</th>
            <th className="px-2 py-2.5 text-right font-bold">$ / {unit}</th>
            <th className="px-2 py-2.5 text-right font-bold">Hours / {unit}</th>
            <th className="px-3 py-2.5 text-right font-bold">Take</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={t.name} className="border-t border-white/[.04]">
              <td className={clsx('px-3 py-1.5', t.skip && 'opacity-45')}>
                <span className="flex items-center gap-2 font-semibold">
                  <span className="h-3.5 w-1 rounded-sm" style={{ background: TIER_COLORS[t.name] ?? '#6E7888' }} />{t.name}
                </span>
              </td>
              <td className={clsx('w-28 px-2 py-1.5', t.skip && 'opacity-45')}><Num prefix="$" step={0.5} min={0} value={t.price} onChange={v => onChange(i, { price: v })} /></td>
              <td className={clsx('w-24 px-2 py-1.5', t.skip && 'opacity-45')}><Num step={1} min={0} value={t.hours} onChange={v => onChange(i, { hours: v })} /></td>
              <td className="px-3 py-1.5 text-right"><Toggle size="sm" checked={!t.skip} onChange={v => onChange(i, { skip: !v })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdjustTable({ cfg, defs, usesModifiers, ranks, onChange }: {
  cfg: ServiceCfg; defs: ModDef[]; usesModifiers: boolean; ranks: string[]; onChange: (key: string, patch: Partial<Adjust>) => void;
}) {
  const rows: { key: string; label: string; hint: string; a: Adjust; group: string }[] = [
    { key: 'solo', label: 'Solo', hint: 'You play the account alone', a: cfg.completion.solo, group: 'Completion method' },
    { key: 'duo', label: 'Duo', hint: 'Buyer plays alongside you', a: cfg.completion.duo, group: 'Completion method' },
    ...(usesModifiers ? defs.map(d => ({ key: d.key, label: d.label, hint: d.hint, a: cfg.modifiers[d.key] ?? { mult: 1, skip: false, maxRank: null }, group: 'Modifiers (stack)' })) : []),
  ];
  return (
    <div className="well overflow-hidden">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="label-caps text-left">
            <th className="px-3 py-2.5 font-bold">When the order has</th>
            <th className="px-2 py-2.5 font-bold">Action</th>
            <th className="px-2 py-2.5 text-right font-bold">Price ×</th>
            <th className="px-3 py-2.5 font-bold">Only up to</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (<Fragment key={r.key}>
            {(i === 0 || rows[i - 1].group !== r.group) && (
              <tr className="border-t border-white/[.04] bg-white/[.015]"><td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-fg-3">{r.group}</td></tr>
            )}
            <tr className="border-t border-white/[.04]">
              <td className="px-3 py-1.5">
                <div className="font-semibold">{r.label}</div>
                <div className="text-[11.5px] text-fg-3">{r.hint}</div>
              </td>
              <td className="px-2 py-1.5">
                <Segment value={r.a.skip ? 'skip' : 'take'} onChange={v => onChange(r.key, { skip: v === 'skip' })}
                  options={[{ id: 'take', label: 'Take' }, { id: 'skip', label: 'Skip' }]} />
              </td>
              <td className={clsx('w-[84px] px-2 py-1.5', r.a.skip && 'opacity-35')}><Num step={0.05} min={0} value={r.a.mult} onChange={v => onChange(r.key, { mult: v })} /></td>
              <td className={clsx('w-36 px-3 py-1.5', r.a.skip && 'opacity-35')}>
                <select className="field !py-1 text-[12.5px]" value={r.a.maxRank ?? ''} onChange={e => onChange(r.key, { maxRank: e.target.value || null })}>
                  <option value="">Any rank</option>{ranks.map(k => <option key={k}>{k}</option>)}
                </select>
              </td>
            </tr>
          </Fragment>))}
        </tbody>
      </table>
      {!usesModifiers && <p className="border-t border-white/[.04] px-3 py-2 text-[12px] text-fg-3">Modifiers don't apply to coaching.</p>}
    </div>
  );
}

const CATEGORY: Record<ServiceKey, string> = { rank: 'Rank Boost', derank: 'Rank Boost', placements: 'Placements', netwins: 'Net Wins', coaching: 'Coaching' };

function QuoteTester({ game, pricing, meta }: { game: Game; pricing: P; meta: Meta }) {
  const init = () => ({ type: 'rank' as ServiceKey, current: meta.ranks[12], points: 0, desired: meta.ranks[15], region: meta.regions[1] ?? meta.regions[0], duo: false, amount: 5, description: '' });
  const [f, setF] = useState(init);
  const [q, setQ] = useState<any>(null);
  useEffect(() => { setF(init()); }, [game]); // eslint-disable-line react-hooks/exhaustive-deps
  const isRank = f.type === 'rank' || f.type === 'derank';
  useEffect(() => {
    const t = setTimeout(() => {
      api(`/pricing/${game}/quote`, { body: { pricing, category: CATEGORY[f.type], fields: {
        'Current Rank': f.current, [`Current ${meta.points}`]: String(f.points), ...(isRank ? { 'Desired Rank': f.desired } : { 'Number of games': String(f.amount) }),
        Server: f.region, 'Completion Method': f.duo ? 'Duo' : 'Solo', Description: f.description,
      } } }).then(setQ).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [f, pricing, game, meta.points, isRank]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[.06] px-5 py-3">
        <h3 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[.12em]"><span className="h-3 w-[3px] rounded-sm bg-neon" />Test a request</h3>
        <Badge tone="muted" className="ml-auto">uses unsaved changes</Badge>
      </div>
      <div className="space-y-3 p-5">
        <Field label="Order type">
          <select className="field" value={f.type} onChange={e => setF({ ...f, type: e.target.value as ServiceKey })}>
            {meta.services.filter(s => s.key !== 'derank').map(s => <option key={s.key} value={s.key}>{s.label}{s.key === 'rank' ? ' / Derank' : ''}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-[1fr_76px] gap-2">
          <Field label="Current rank"><select className="field" value={f.current} onChange={e => setF({ ...f, current: e.target.value })}>{meta.ranks.map(r => <option key={r}>{r}</option>)}</select></Field>
          <Field label={meta.points}><Num value={f.points} onChange={v => setF({ ...f, points: v })} /></Field>
        </div>
        {isRank
          ? <Field label="Desired rank"><select className="field" value={f.desired} onChange={e => setF({ ...f, desired: e.target.value })}>{meta.ranks.map(r => <option key={r}>{r}</option>)}</select></Field>
          : <Field label={f.type === 'coaching' ? 'Sessions' : f.type === 'netwins' ? 'Wins' : 'Games'}><Num min={1} value={f.amount} onChange={v => setF({ ...f, amount: v })} /></Field>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Server"><select className="field" value={f.region} onChange={e => setF({ ...f, region: e.target.value })}>{meta.regions.map(r => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Completion"><select className="field" value={f.duo ? 'Duo' : 'Solo'} onChange={e => setF({ ...f, duo: e.target.value === 'Duo' })}><option>Solo</option><option>Duo</option></select></Field>
        </div>
        <Field label="Buyer's description"><input className="field" placeholder="e.g. please stream, offline mode" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      </div>

      <div className={clsx('border-t px-5 py-4', q?.ok ? 'border-neon/20 bg-neon/[.04]' : 'border-bad/20 bg-bad/[.04]')}>
        {q?.ok ? (<>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="label-caps flex items-center gap-1.5"><Check size={12} className="text-ok" />Bot would offer</div>
              <div className="num mt-1 text-[38px] font-semibold leading-none text-fg">{usd(q.price)}</div>
            </div>
            <div className="text-right text-[12.5px] text-fg-3">
              <div><span className="num text-fg-2">{q.hours}h</span> of work</div>
              <div>delivery <span className="font-semibold text-fg-2">{q.delivery}</span></div>
            </div>
          </div>
          <ul className="mt-3 space-y-1 border-t border-white/[.06] pt-3 text-[12.5px] text-fg-2">
            {q.breakdown.map((b: string) => <li key={b} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 bg-neon" />{b}</li>)}
          </ul>
        </>) : (<>
          <div className="label-caps flex items-center gap-1.5"><Ban size={12} className="text-bad" />Bot would skip</div>
          <div className="mt-1.5 text-[14px] font-semibold text-bad">{q?.reason ?? '…'}</div>
        </>)}
      </div>
    </Card>
  );
}

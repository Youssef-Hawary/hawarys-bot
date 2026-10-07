import { getSetting, setSetting } from './db.ts';
import { type Game, TIERS, ladder, rankIndex, tierOf } from './ranks.ts';

// ---------------- model ----------------
//
// Every order type (rank boost, derank, placements, net wins, coaching) has its own switch, tier table,
// Solo/Duo setting and modifier settings, so the same modifier can cost extra in one and be refused in another.
// A region can carry its own copy of all of that ("region table"); otherwise the global one is used.
// Custom rules pin an exact from → to pair to a final price (or refuse it), globally or for one region.

export type ServiceKey = 'rank' | 'derank' | 'placements' | 'netwins' | 'coaching';
export const SERVICE_KEYS: ServiceKey[] = ['rank', 'derank', 'placements', 'netwins', 'coaching'];
export const SERVICE_INFO: Record<ServiceKey, { label: string; unit: string; formula: string; usesModifiers: boolean }> = {
  rank: { label: 'Rank Boost', unit: 'division', formula: 'Sum of every division crossed', usesModifiers: true },
  derank: { label: 'Derank', unit: 'division', formula: 'Own tier table, per division dropped', usesModifiers: true },
  placements: { label: 'Placements', unit: 'game', formula: 'Price per game × games', usesModifiers: true },
  netwins: { label: 'Net Wins', unit: 'win', formula: 'Price per win × wins', usesModifiers: true },
  coaching: { label: 'Coaching', unit: 'session', formula: 'Price per session × sessions (Solo/Duo applies, modifiers do not)', usesModifiers: false },
};

export type TierPrice = { name: string; price: number; hours: number; skip: boolean };
/** A multiplier that can also refuse the order. maxRank: refuse when the target is above this rank. */
export type Adjust = { mult: number; skip: boolean; maxRank: string | null };
export type ServiceCfg = {
  enabled: boolean;
  tiers: TierPrice[];
  completion: { solo: Adjust; duo: Adjust };
  modifiers: Record<string, Adjust>;
  defaultAmount: number; // games / wins / sessions when the request doesn't say
};
export type ServiceTable = Record<ServiceKey, ServiceCfg>;
export type ModifierDef = { key: string; label: string; hint: string; keywords: string[] };
export type CustomRule = { id: string; enabled: boolean; from: string; to: string; region: string; price: number; hours: number; refuse: boolean };
export type Band = { from: number; pct: number };

export type GamePricing = {
  version: 2;
  enabled: boolean;
  minPrice: number;
  regions: Record<string, boolean>;
  services: ServiceTable;
  regionTables: Record<string, ServiceTable>;
  modifierDefs: ModifierDef[];
  pointsDiscount: { enabled: boolean; bands: Band[] };
  customRules: CustomRule[];
  filters: { rejectConsole: boolean; rejectLinks: boolean; catchHiddenDuo: boolean };
};

export const REGIONS: Record<Game, string[]> = {
  valorant: ['NA', 'EU', 'LATAM', 'BR', 'KR', 'AP'],
  lol: ['EUW', 'EUNE', 'NA', 'TR', 'RU', 'BR', 'LAN', 'LAS', 'OCE', 'KR', 'JP'],
};
export const REGION_NAMES: Record<string, string> = {
  NA: 'North America', EU: 'Europe', LATAM: 'Latin America', BR: 'Brazil', KR: 'Korea', AP: 'Asia Pacific',
  EUW: 'Europe West', EUNE: 'Europe Nordic & East', TR: 'Turkey', RU: 'Russia', LAN: 'Latin America North',
  LAS: 'Latin America South', OCE: 'Oceania', JP: 'Japan',
};
export const POINTS_LABEL: Record<Game, string> = { valorant: 'RR', lol: 'LP' };

// Eldorado writes regions in long form and not always the same way.
const REGION_ALIASES: Record<Game, [RegExp, string][]> = {
  valorant: [
    [/^(na|north america|us)/, 'NA'], [/^(eu|europe)/, 'EU'], [/^(latam|latin|lan|las)/, 'LATAM'], [/^(br|brazil)/, 'BR'],
    [/^(kr|korea)/, 'KR'], [/^(ap|asia|oce|oceania|apac)/, 'AP'],
  ],
  lol: [
    [/^(euw|europe west)/, 'EUW'], [/^(eune|europe nordic|europe east)/, 'EUNE'], [/^(na|north america)/, 'NA'], [/^(tr|turkey)/, 'TR'],
    [/^(ru|russia)/, 'RU'], [/^(br|brazil)/, 'BR'], [/^(lan|latin america north)/, 'LAN'], [/^(las|latin america south)/, 'LAS'],
    [/^(oce|oceania)/, 'OCE'], [/^(kr|korea)/, 'KR'], [/^(jp|japan)/, 'JP'],
  ],
};
export function normalizeRegion(game: Game, text: string | null): string | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  return REGION_ALIASES[game].find(([re]) => re.test(t))?.[1] ?? text.trim().toUpperCase();
}

// Starting values from common market prices; everything is editable in the dashboard.
const DEFAULT_TIER_PRICES: Record<Game, [number, number][]> = {
  valorant: [[3, 4], [4, 4], [5, 4], [7, 8], [10, 12], [15, 24], [22, 30], [33, 36], [50, 48]],
  lol: [[3, 4], [4, 4], [5, 5], [7, 6], [9, 8], [12, 10], [18, 16], [30, 24], [45, 36], [70, 48]],
};
const DEFAULT_PER_GAME: Record<Game, [number, number][]> = {
  valorant: [[3, 2], [3, 2], [4, 2], [5, 3], [7, 3], [10, 4], [15, 5], [22, 6], [33, 8]],
  lol: [[2, 1], [2, 1], [3, 1], [3, 1], [4, 1], [5, 1], [7, 2], [10, 2], [14, 3], [20, 3]],
};

function tierTable(game: Game, values: [number, number][]): TierPrice[] {
  return TIERS[game].map((t, i) => ({ name: t.name, price: values[i][0], hours: values[i][1], skip: false }));
}

function defaultModifierDefs(game: Game): ModifierDef[] {
  return [
    { key: 'offline', label: 'Offline mode', hint: 'Account must look offline to friends', keywords: ['offline', 'appear offline'] },
    { key: 'solo_queue', label: 'Solo queue', hint: 'No stacking, queue alone every game', keywords: ['solo queue', 'solo only', 'no premade'] },
    game === 'valorant'
      ? { key: 'no_5_stack', label: 'No 5 stack', hint: 'Never queue in a five stack', keywords: ['no 5 stack', 'no 5-stack', 'no five stack', 'no stack'] }
      : { key: 'champions', label: 'Specific champions', hint: 'Buyer picks champions or roles', keywords: ['champion', 'champ ', 'role', 'main '] },
    { key: 'stream', label: 'Stream', hint: 'Buyer wants the games streamed', keywords: ['stream', 'watch live'] },
  ];
}

const adj = (mult = 1, skip = false): Adjust => ({ mult, skip, maxRank: null });

function defaultServices(game: Game): ServiceTable {
  const mods = () => Object.fromEntries(defaultModifierDefs(game).map(m => [m.key, adj()]));
  const svc = (enabled: boolean, values: [number, number][], defaultAmount: number, duo = 1.5): ServiceCfg => ({
    enabled, tiers: tierTable(game, values), completion: { solo: adj(), duo: adj(duo) }, modifiers: mods(), defaultAmount,
  });
  return {
    rank: svc(true, DEFAULT_TIER_PRICES[game], 1),
    derank: svc(false, DEFAULT_TIER_PRICES[game].map(([p, h]) => [Math.max(1, Math.round(p * 0.6)), h]), 1),
    placements: svc(true, DEFAULT_PER_GAME[game], 5),
    netwins: svc(true, DEFAULT_PER_GAME[game].map(([p, h]) => [p + 1, h]), 1),
    coaching: svc(false, DEFAULT_PER_GAME[game].map(([p]) => [p * 3, 2]), 1, 1),
  };
}

export function defaultPricing(game: Game): GamePricing {
  return {
    version: 2,
    enabled: true,
    minPrice: 5,
    regions: Object.fromEntries(REGIONS[game].map(r => [r, ['NA', 'EU', 'EUW', 'EUNE'].includes(r)])),
    services: defaultServices(game),
    regionTables: {},
    modifierDefs: defaultModifierDefs(game),
    pointsDiscount: { enabled: true, bands: [{ from: 0, pct: 0 }, { from: 30, pct: 15 }, { from: 60, pct: 30 }, { from: 80, pct: 45 }] },
    customRules: [],
    filters: { rejectConsole: true, rejectLinks: true, catchHiddenDuo: true },
  };
}

/** Upgrades pricing saved by the first version (one global modifier list + region multipliers). */
export function migratePricing(game: Game, old: any): GamePricing {
  if (old?.version === 2) return old as GamePricing;
  const p = defaultPricing(game);
  if (!old || typeof old !== 'object') return p;
  p.enabled = old.enabled ?? p.enabled;
  p.minPrice = old.minPrice ?? p.minPrice;
  if (old.regions) p.regions = { ...p.regions, ...old.regions };
  if (old.rankBoost?.pointsDiscount) p.pointsDiscount = old.rankBoost.pointsDiscount;
  if (old.filters) p.filters = { ...p.filters, ...old.filters };
  const oldMods: any[] = old.modifiers ?? [];
  for (const def of p.modifierDefs) {
    const m = oldMods.find(x => x.key === def.key);
    if (m?.keywords?.length) def.keywords = m.keywords;
  }
  const duo = oldMods.find(m => m.key === 'duo');
  for (const key of SERVICE_KEYS) {
    const s = p.services[key];
    if (duo) s.completion.duo = { mult: duo.multiplier ?? 1, skip: !!duo.skip, maxRank: null };
    for (const m of oldMods) if (s.modifiers[m.key]) s.modifiers[m.key] = { mult: m.multiplier ?? 1, skip: !!m.skip, maxRank: null };
  }
  if (old.rankBoost) { p.services.rank.enabled = old.rankBoost.enabled; p.services.rank.tiers = old.rankBoost.tiers ?? p.services.rank.tiers; }
  if (old.placements) Object.assign(p.services.placements, { enabled: old.placements.enabled, tiers: old.placements.tiers, defaultAmount: old.placements.defaultGames ?? 5 });
  if (old.netWins) Object.assign(p.services.netwins, { enabled: old.netWins.enabled, tiers: old.netWins.tiers });
  if (old.coaching) p.services.coaching.enabled = old.coaching.enabled;
  p.customRules = (old.customRules ?? []).map((r: any) => ({ hours: 0, refuse: false, ...r }));
  return p;
}

export const getPricing = (game: Game) => migratePricing(game, getSetting<any>(`pricing:${game}`, null));
export const savePricing = (game: Game, p: GamePricing) => setSetting(`pricing:${game}`, p);

// ---------------- request normalization ----------------

export type Service = ServiceKey | 'other';
export type NormalizedRequest = {
  game: Game;
  service: Service;
  currentRank: string | null;
  points: number | null;
  desiredRank: string | null;
  region: string | null;
  completion: string | null;
  amount: number | null;      // games / wins / sessions
  platform: string | null;
  description: string;
};

export function detectGame(text: string): Game | null {
  const t = text.toLowerCase();
  if (t.includes('valorant')) return 'valorant';
  if (t.includes('league') || t.includes('lol')) return 'lol';
  return null;
}

export function detectService(text: string): Service {
  const t = text.toLowerCase();
  if (t.includes('derank')) return 'derank';
  if (t.includes('placement')) return 'placements';
  if (t.includes('win')) return 'netwins';
  if (t.includes('coach')) return 'coaching';
  if (t.includes('rank') || t.includes('division') || t.includes('elo')) return 'rank';
  return 'other';
}

/** fields = label → value pairs from the request page ("Current Rank": "Platinum I", ...). */
export function normalizeRequest(game: Game, categoryTitle: string, fields: Record<string, string>): NormalizedRequest {
  const f: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) f[k.toLowerCase().trim()] = String(v ?? '').trim();
  const pick = (...keys: string[]) => {
    for (const k of keys) for (const [fk, v] of Object.entries(f)) if (fk.includes(k) && v) return v;
    return null;
  };
  const num = (s: string | null) => { const m = s?.match(/\d+/); return m ? Number(m[0]) : null; };
  return {
    game,
    service: detectService(categoryTitle),
    currentRank: pick('current rank', 'current division', 'current tier', 'previous rank', 'last season'),
    points: num(pick('current rr', 'current lp', 'rr', 'lp')),
    desiredRank: pick('desired rank', 'target rank', 'desired division', 'desired'),
    region: normalizeRegion(game, pick('server', 'region')),
    completion: pick('completion', 'method', 'queue type'),
    amount: num(pick('number of games', 'games', 'wins', 'sessions', 'hours', 'amount')),
    platform: pick('platform'),
    description: pick('description', 'notes', 'additional', 'comment') ?? '',
  };
}

// ---------------- quoting ----------------

export type Quote =
  | { ok: true; price: number; hours: number; delivery: string; breakdown: string[]; modifiers: string[]; service: ServiceKey; table: string }
  | { ok: false; reason: string };

const DELIVERY: [string, number][] = [
  ['Hour1', 1], ['Hour2', 2], ['Hour3', 3], ['Hour5', 5], ['Hour8', 8], ['Hour12', 12], ['Day1', 24], ['Day2', 48],
  ['Day3', 72], ['Day5', 120], ['Day7', 168], ['Day10', 240], ['Day14', 336], ['Day28', 672], ['Day45', 1080],
  ['Day60', 1440], ['Day80', 1920], ['Day100', 2400],
];
/** Rounds hours UP to Eldorado's next allowed delivery time. */
export function deliveryEnum(hours: number) {
  return (DELIVERY.find(([, h]) => h >= hours) ?? DELIVERY[DELIVERY.length - 1])[0];
}

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\s*(\.|\[\.\]|\(\.\)|\s+dot\s+)\s*(com|gg|net|org|io|me|xyz|ru|co)\b|discord|telegram|t\.me|whatsapp|@[a-z0-9-]+\.[a-z]{2,}|[a-z0-9._-]+@[a-z0-9-]+)/i;
const CONSOLE_RE = /\b(ps4|ps5|playstation|xbox|console)\b/i;
const HIDDEN_DUO_RE = /\bduo\b/i;
const NOT_DUO_RE = /\b(no|not|without|don'?t want)\s+duo\b/i;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The table used for a region: its own copy when it has one, otherwise the global one. */
export function tableFor(p: GamePricing, region: string | null): { table: ServiceTable; name: string } {
  const own = region ? p.regionTables[region] : undefined;
  return own ? { table: own, name: region! } : { table: p.services, name: 'Global' };
}

/** Completion method (Solo / Duo), with hidden duo caught in the free text. */
export function completionOf(req: NormalizedRequest, p: GamePricing = getPricing(req.game)) {
  const desc = req.description ?? '';
  const explicitDuo = /duo/i.test(req.completion ?? '');
  const hiddenDuo = !explicitDuo && p.filters.catchHiddenDuo && HIDDEN_DUO_RE.test(desc) && !NOT_DUO_RE.test(desc);
  return { completion: (explicitDuo || hiddenDuo ? 'duo' : 'solo') as 'duo' | 'solo', hiddenDuo };
}

export function quote(req: NormalizedRequest, p: GamePricing = getPricing(req.game)): Quote {
  if (!p.enabled) return { ok: false, reason: 'game turned off' };
  if (req.service === 'other') return { ok: false, reason: 'unknown order type' };
  const desc = req.description ?? '';
  if (p.filters.rejectLinks && LINK_RE.test(desc)) return { ok: false, reason: 'description has a link/contact (scam filter)' };
  if (p.filters.rejectConsole && (CONSOLE_RE.test(`${desc} ${req.completion ?? ''}`) || CONSOLE_RE.test(req.platform ?? ''))) return { ok: false, reason: 'console player' };
  if (req.region && p.regions[req.region] === false) return { ok: false, reason: `region ${req.region} is off` };

  const from = rankIndex(req.game, req.currentRank), to = rankIndex(req.game, req.desiredRank);
  // A "rank boost" whose target is below the current rank is a derank.
  const key: ServiceKey = req.service === 'rank' && from != null && to != null && to < from ? 'derank' : req.service;
  const { table, name: tableName } = tableFor(p, req.region);
  const s = table[key];
  const info = SERVICE_INFO[key];
  if (!s?.enabled) return { ok: false, reason: `${info.label} turned off${tableName !== 'Global' ? ` (${tableName} table)` : ''}` };

  const lad = ladder(req.game);
  const breakdown: string[] = [];
  const labels: string[] = [];
  let price = 0, hours = 0;
  // The highest rank the work touches, for "only up to" limits.
  const target = key === 'rank' ? to : from;

  const { completion, hiddenDuo } = completionOf(req, p);
  const comp = s.completion[completion];
  const compLabel = completion === 'duo' ? (hiddenDuo ? 'Duo (found in description)' : 'Duo') : 'Solo';
  if (comp.skip) return { ok: false, reason: `${compLabel} is set to skip for ${info.label}` };
  if (comp.maxRank && target != null && target > (rankIndex(req.game, comp.maxRank) ?? Infinity)) return { ok: false, reason: `${compLabel} only up to ${comp.maxRank}` };

  // Modifiers found in the description / completion text.
  const text = `${desc} ${req.completion ?? ''}`.toLowerCase();
  const active = info.usesModifiers ? p.modifierDefs.filter(d => d.keywords.some(k => k && text.includes(k.toLowerCase()))) : [];
  let modMult = 1;
  for (const d of active) {
    const a = s.modifiers[d.key] ?? adj();
    if (a.skip) return { ok: false, reason: `${d.label} is set to skip for ${info.label}` };
    if (a.maxRank && target != null && target > (rankIndex(req.game, a.maxRank) ?? Infinity)) return { ok: false, reason: `${d.label} only up to ${a.maxRank}` };
    modMult *= a.mult || 1;
    labels.push(d.label);
  }

  let custom = false;
  if (key === 'rank' || key === 'derank') {
    if (from == null || to == null) return { ok: false, reason: `can't read ranks (${req.currentRank} → ${req.desiredRank})` };
    if (to === from) return { ok: false, reason: 'current and desired rank are the same' };
    const rule = matchRule(p, req.game, from, to, req.region);
    if (rule?.refuse) return { ok: false, reason: `custom rule refuses ${rule.from} → ${rule.to}` };
    const lo = Math.min(from, to), hi = Math.max(from, to);
    for (let k = lo; k < hi; k++) {
      // Each step is charged at the tier being left: climbing out of k, or dropping out of k + 1.
      const tierName = tierOf(req.game, key === 'rank' ? k : k + 1);
      const tier = s.tiers.find(t => t.name === tierName);
      if (!tier) return { ok: false, reason: `no price for ${lad[k].label}` };
      if (tier.skip) return { ok: false, reason: `${tier.name} is set to skip for ${info.label}` };
      let step = tier.price;
      if (key === 'rank' && k === from && p.pointsDiscount.enabled && req.points) {
        const band = [...p.pointsDiscount.bands].sort((a, b) => b.from - a.from).find(b => req.points! >= b.from);
        if (band?.pct) { step *= 1 - band.pct / 100; breakdown.push(`${band.pct}% off first division (${req.points} ${POINTS_LABEL[req.game]})`); }
      }
      price += step;
      hours += tier.hours;
    }
    breakdown.unshift(`${info.label}: ${lad[from].label} → ${lad[to].label}, ${hi - lo} division${hi - lo === 1 ? '' : 's'}`);
    if (rule) {
      price = rule.price; custom = true;
      if (rule.hours > 0) hours = rule.hours;
      breakdown.push(`custom rule${rule.region !== 'ALL' ? ` (${rule.region})` : ''}: $${rule.price} final`);
    }
  } else {
    const idx = from ?? 0;
    const tier = s.tiers.find(t => t.name === tierOf(req.game, idx));
    if (!tier) return { ok: false, reason: `no price for ${tierOf(req.game, idx)}` };
    if (tier.skip) return { ok: false, reason: `${tier.name} is set to skip for ${info.label}` };
    const count = req.amount ?? s.defaultAmount;
    price = tier.price * count;
    hours = tier.hours * count;
    breakdown.push(`${info.label}: ${count} ${info.unit}${count === 1 ? '' : 's'} × $${tier.price} (${tier.name})`);
  }

  if (!custom) {
    if (comp.mult !== 1) breakdown.push(`${compLabel} ×${comp.mult}`);
    if (modMult !== 1) breakdown.push(`modifiers ×${round2(modMult)} (${labels.join(', ')})`);
    price *= (comp.mult || 1) * modMult;
  }
  if (tableName !== 'Global') breakdown.push(`${tableName} price table`);
  if (price < p.minPrice) { breakdown.push(`raised to minimum $${p.minPrice}`); price = p.minPrice; }
  price = round2(price);
  return { ok: true, price, hours, delivery: deliveryEnum(hours), breakdown, modifiers: completion === 'duo' ? ['Duo', ...labels] : labels, service: key, table: tableName };
}

function matchRule(p: GamePricing, game: Game, from: number, to: number, region: string | null) {
  const matches = p.customRules.filter(r => r.enabled && rankIndex(game, r.from) === from && rankIndex(game, r.to) === to
    && (r.region === 'ALL' || r.region === region));
  return matches.find(r => r.region !== 'ALL') ?? matches[0] ?? null;
}

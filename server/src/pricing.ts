import { getSetting, setSetting } from './db.ts';
import { type Game, TIERS, ladder, rankIndex, tierOf } from './ranks.ts';

export type TierPrice = { name: string; price: number; hours: number; skip: boolean };
export type Modifier = { key: string; label: string; multiplier: number; skip: boolean; maxRank: string | null; keywords: string[] };
export type CustomRule = { id: string; enabled: boolean; from: string; to: string; region: string; price: number };
export type Band = { from: number; pct: number };

export type GamePricing = {
  enabled: boolean;
  regions: Record<string, boolean>;
  regionMultipliers: Record<string, number>;
  minPrice: number;
  rankBoost: { enabled: boolean; tiers: TierPrice[]; pointsDiscount: { enabled: boolean; bands: Band[] } };
  modifiers: Modifier[];
  customRules: CustomRule[];
  placements: { enabled: boolean; defaultGames: number; tiers: TierPrice[] };
  netWins: { enabled: boolean; tiers: TierPrice[] };
  coaching: { enabled: boolean; pricePerHour: number; defaultHours: number };
  filters: { rejectConsole: boolean; rejectLinks: boolean };
};

export const REGIONS: Record<Game, string[]> = {
  valorant: ['NA', 'EU', 'LATAM', 'BR', 'KR', 'AP'],
  lol: ['EUW', 'EUNE', 'NA', 'TR', 'RU', 'BR', 'LAN', 'LAS', 'OCE', 'KR', 'JP'],
};
export const POINTS_LABEL: Record<Game, string> = { valorant: 'RR', lol: 'LP' };

// Starting values copied from common market prices; everything is editable in the dashboard.
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

export function defaultPricing(game: Game): GamePricing {
  const top = game === 'valorant' ? 'Radiant' : 'Challenger';
  const mod = (key: string, label: string, keywords: string[]): Modifier => ({ key, label, multiplier: 1, skip: false, maxRank: top, keywords });
  return {
    enabled: true,
    regions: Object.fromEntries(REGIONS[game].map(r => [r, ['NA', 'EU', 'EUW', 'EUNE'].includes(r)])),
    regionMultipliers: Object.fromEntries(REGIONS[game].map(r => [r, 1])),
    minPrice: 5,
    rankBoost: {
      enabled: true,
      tiers: tierTable(game, DEFAULT_TIER_PRICES[game]),
      pointsDiscount: { enabled: true, bands: [{ from: 0, pct: 0 }, { from: 30, pct: 15 }, { from: 60, pct: 30 }, { from: 80, pct: 45 }] },
    },
    modifiers: [
      mod('duo', 'Duo', ['duo']),
      mod('offline', 'Offline mode', ['offline', 'appear offline']),
      mod('solo_queue', 'Solo queue', ['solo queue', 'solo only', 'solo/duo only', 'no premade']),
      mod(game === 'valorant' ? 'no_5_stack' : 'champions', game === 'valorant' ? 'No 5 stack' : 'Specific champions/roles',
        game === 'valorant' ? ['no 5 stack', 'no 5-stack', 'no five stack', 'no stack'] : ['champion', 'champ ', 'role', 'main ']),
      mod('stream', 'Stream', ['stream', 'live', 'watch']),
    ],
    customRules: [],
    placements: { enabled: true, defaultGames: 5, tiers: tierTable(game, DEFAULT_PER_GAME[game]) },
    netWins: { enabled: true, tiers: tierTable(game, DEFAULT_PER_GAME[game].map(([p, h]) => [p + 1, h])) },
    coaching: { enabled: false, pricePerHour: 15, defaultHours: 1 },
    filters: { rejectConsole: true, rejectLinks: true },
  };
}

export const getPricing = (game: Game) => getSetting<GamePricing>(`pricing:${game}`, defaultPricing(game));
export const savePricing = (game: Game, p: GamePricing) => setSetting(`pricing:${game}`, p);

// ---------------- request normalization ----------------

export type Service = 'rank' | 'placements' | 'netwins' | 'coaching' | 'other';
export type NormalizedRequest = {
  game: Game;
  service: Service;
  currentRank: string | null;
  points: number | null;
  desiredRank: string | null;
  region: string | null;
  completion: string | null;
  amount: number | null;      // games / wins / hours
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
    region: pick('server', 'region')?.toUpperCase() ?? null,
    completion: pick('completion', 'method', 'queue type'),
    amount: num(pick('number of games', 'games', 'wins', 'hours', 'amount')),
    platform: pick('platform'),
    description: pick('description', 'notes', 'additional', 'comment') ?? '',
  };
}

// ---------------- quoting ----------------

export type Quote =
  | { ok: true; price: number; hours: number; delivery: string; breakdown: string[]; modifiers: string[] }
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

const round2 = (n: number) => Math.round(n * 100) / 100;

export function quote(req: NormalizedRequest, p: GamePricing = getPricing(req.game)): Quote {
  if (!p.enabled) return { ok: false, reason: 'game turned off' };
  const text = `${req.description} ${req.completion ?? ''}`;
  if (p.filters.rejectLinks && LINK_RE.test(req.description)) return { ok: false, reason: 'description has a link/contact (scam filter)' };
  if (p.filters.rejectConsole && (CONSOLE_RE.test(text) || CONSOLE_RE.test(req.platform ?? ''))) return { ok: false, reason: 'console player' };
  if (req.region && p.regions[req.region] === false) return { ok: false, reason: `region ${req.region} is off` };

  const lower = text.toLowerCase();
  const active = p.modifiers.filter(m => m.keywords.some(k => lower.includes(k.toLowerCase())));
  const skipped = active.find(m => m.skip);
  if (skipped) return { ok: false, reason: `${skipped.label} is set to skip` };

  const regionMult = (req.region && p.regionMultipliers[req.region]) || 1;
  const modMult = active.reduce((a, m) => a * (m.multiplier || 1), 1);
  const modLabels = active.map(m => m.label);
  const breakdown: string[] = [];

  let price = 0, hours = 0, custom = false;

  if (req.service === 'rank') {
    if (!p.rankBoost.enabled) return { ok: false, reason: 'rank boost turned off' };
    const from = rankIndex(req.game, req.currentRank), to = rankIndex(req.game, req.desiredRank);
    if (from == null || to == null) return { ok: false, reason: `can't read ranks (${req.currentRank} → ${req.desiredRank})` };
    if (to <= from) return { ok: false, reason: 'desired rank is not above current rank' };
    for (const m of active) {
      const max = rankIndex(req.game, m.maxRank);
      if (max != null && to > max) return { ok: false, reason: `${m.label} only allowed up to ${m.maxRank}` };
    }
    const lad = ladder(req.game);
    const rule = matchRule(p, req.game, from, to, req.region);
    for (let k = from; k < to; k++) {
      const tier = p.rankBoost.tiers.find(t => t.name === tierOf(req.game, k));
      if (!tier) return { ok: false, reason: `no price for ${lad[k].label}` };
      if (tier.skip) return { ok: false, reason: `${tier.name} is set to skip` };
      let step = tier.price;
      if (k === from && p.rankBoost.pointsDiscount.enabled && req.points) {
        const band = [...p.rankBoost.pointsDiscount.bands].sort((a, b) => b.from - a.from).find(b => req.points! >= b.from);
        if (band?.pct) { step *= 1 - band.pct / 100; breakdown.push(`${band.pct}% off first division (${req.points} ${req.game === 'lol' ? 'LP' : 'RR'})`); }
      }
      price += step;
      hours += tier.hours;
    }
    breakdown.unshift(`${lad[from].label} → ${lad[to].label}: ${to - from} division(s)`);
    if (rule) { price = rule.price; custom = true; breakdown.push(`custom rule: $${rule.price}`); }
  } else if (req.service === 'placements' || req.service === 'netwins') {
    const cfg = req.service === 'placements' ? p.placements : p.netWins;
    const name = req.service === 'placements' ? 'placements' : 'net wins';
    if (!cfg.enabled) return { ok: false, reason: `${name} turned off` };
    const idx = rankIndex(req.game, req.currentRank) ?? 0;
    const tier = cfg.tiers.find(t => t.name === tierOf(req.game, idx));
    if (!tier || tier.skip) return { ok: false, reason: `${name} for ${tierOf(req.game, idx)} is skipped` };
    const count = req.amount ?? (req.service === 'placements' ? p.placements.defaultGames : 1);
    price = tier.price * count;
    hours = tier.hours * count;
    breakdown.push(`${count} × ${tier.name} ${name} at $${tier.price}`);
  } else if (req.service === 'coaching') {
    if (!p.coaching.enabled) return { ok: false, reason: 'coaching turned off' };
    const h = req.amount ?? p.coaching.defaultHours;
    price = p.coaching.pricePerHour * h;
    hours = h + 12;
    breakdown.push(`${h}h coaching`);
  } else {
    return { ok: false, reason: 'unknown service type' };
  }

  if (!custom) {
    if (modMult !== 1) breakdown.push(`modifiers ×${round2(modMult)} (${modLabels.join(', ')})`);
    if (regionMult !== 1) breakdown.push(`region ${req.region} ×${regionMult}`);
    price *= modMult * regionMult;
  }
  if (price < p.minPrice) { breakdown.push(`raised to minimum $${p.minPrice}`); price = p.minPrice; }
  price = round2(price);
  return { ok: true, price, hours, delivery: deliveryEnum(hours), breakdown, modifiers: modLabels };
}

function matchRule(p: GamePricing, game: Game, from: number, to: number, region: string | null) {
  const matches = p.customRules.filter(r => r.enabled && rankIndex(game, r.from) === from && rankIndex(game, r.to) === to
    && (r.region === 'ALL' || r.region === region) && (r.region === 'ALL' || p.regions[r.region] !== false));
  return matches.find(r => r.region !== 'ALL') ?? matches[0] ?? null;
}

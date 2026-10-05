// Rank ladders. Index 0 is the lowest rank; one step = one division.

export type Game = 'valorant' | 'lol';
export const GAMES: Game[] = ['valorant', 'lol'];
export const GAME_NAMES: Record<Game, string> = { valorant: 'Valorant', lol: 'League of Legends' };

export const TIERS: Record<Game, { name: string; divisions: number }[]> = {
  valorant: [
    { name: 'Iron', divisions: 3 }, { name: 'Bronze', divisions: 3 }, { name: 'Silver', divisions: 3 },
    { name: 'Gold', divisions: 3 }, { name: 'Platinum', divisions: 3 }, { name: 'Diamond', divisions: 3 },
    { name: 'Ascendant', divisions: 3 }, { name: 'Immortal', divisions: 3 }, { name: 'Radiant', divisions: 1 },
  ],
  lol: [
    { name: 'Iron', divisions: 4 }, { name: 'Bronze', divisions: 4 }, { name: 'Silver', divisions: 4 },
    { name: 'Gold', divisions: 4 }, { name: 'Platinum', divisions: 4 }, { name: 'Emerald', divisions: 4 },
    { name: 'Diamond', divisions: 4 }, { name: 'Master', divisions: 1 }, { name: 'Grandmaster', divisions: 1 },
    { name: 'Challenger', divisions: 1 },
  ],
};

const ROMAN = ['I', 'II', 'III', 'IV'];
const ALIASES: Record<string, string> = {
  plat: 'platinum', dia: 'diamond', diam: 'diamond', asc: 'ascendant', imm: 'immortal', immo: 'immortal',
  rad: 'radiant', em: 'emerald', emer: 'emerald', gm: 'grandmaster', chall: 'challenger', chal: 'challenger',
  bron: 'bronze', silv: 'silver', mast: 'master',
};

export type Rank = { tier: string; division: number | null; label: string };

/** Full ladder, lowest first. Valorant divisions go 1→3, LoL goes IV→I. */
export function ladder(game: Game): Rank[] {
  const out: Rank[] = [];
  for (const t of TIERS[game]) {
    if (t.divisions === 1) { out.push({ tier: t.name, division: null, label: t.name }); continue; }
    for (let i = 0; i < t.divisions; i++) {
      const division = game === 'lol' ? t.divisions - i : i + 1;
      out.push({ tier: t.name, division, label: `${t.name} ${game === 'lol' ? ROMAN[division - 1] : division}` });
    }
  }
  return out;
}

/** "Platinum I", "plat 1", "Diamond IV", "Radiant" → ladder index, or null if unreadable. */
export function rankIndex(game: Game, text: string | null | undefined): number | null {
  if (!text) return null;
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const tierWord = ALIASES[words[0]] ?? words[0];
  const tiers = TIERS[game];
  const tierPos = tiers.findIndex(t => t.name.toLowerCase() === tierWord);
  if (tierPos < 0) return null;
  const tier = tiers[tierPos];
  let base = 0;
  for (let i = 0; i < tierPos; i++) base += tiers[i].divisions;
  if (tier.divisions === 1) return base;

  let div: number | null = null;
  const d = words[1];
  if (d) {
    if (/^\d+$/.test(d)) div = Number(d);
    else { const r = ROMAN.indexOf(d.toUpperCase()); if (r >= 0) div = r + 1; }
  }
  if (div == null || div < 1 || div > tier.divisions) div = game === 'lol' ? tier.divisions : 1; // lowest division
  return base + (game === 'lol' ? tier.divisions - div : div - 1);
}

export function tierOf(game: Game, index: number) {
  return ladder(game)[index]?.tier ?? null;
}

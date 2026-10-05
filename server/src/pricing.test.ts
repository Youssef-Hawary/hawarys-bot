process.env.DB_PATH = ':memory:';
const { test } = await import('node:test');
const assert = await import('node:assert/strict');
const { rankIndex, ladder } = await import('./ranks.ts');
const { defaultPricing, migratePricing, quote, normalizeRequest, deliveryEnum } = await import('./pricing.ts');

test('rank parsing', () => {
  assert.equal(rankIndex('valorant', 'Iron 1'), 0);
  assert.equal(rankIndex('valorant', 'Platinum I'), 12);
  assert.equal(rankIndex('valorant', 'plat 3'), 14);
  assert.equal(rankIndex('valorant', 'Radiant'), 24);
  assert.equal(ladder('valorant').length, 25);
  assert.equal(rankIndex('lol', 'Iron IV'), 0);
  assert.equal(rankIndex('lol', 'Iron I'), 3);
  assert.equal(rankIndex('lol', 'Master'), 28);
  assert.equal(rankIndex('lol', 'nonsense'), null);
});

test('screenshot request: Valorant Platinum I → Diamond I, 0 RR, EU, Solo', () => {
  const req = normalizeRequest('valorant', 'Rank Boost', {
    'Current Rank': 'Platinum I', 'Current RR': '0', 'Desired Rank': 'Diamond I', Server: 'EU', 'Completion Method': 'Solo',
  });
  const q = quote(req, defaultPricing('valorant'));
  assert.ok(q.ok);
  // 3 Platinum divisions at $10 = $30, 3 × 12h = 36h → Day2
  assert.equal(q.price, 30);
  assert.equal(q.hours, 36);
  assert.equal(q.delivery, 'Day2');
});

test('RR discount, duo multiplier, region off, link filter, custom rule', () => {
  const p = defaultPricing('valorant');
  p.services.rank.completion.duo.mult = 1.5;
  const base = { game: 'valorant' as const, service: 'rank' as const, currentRank: 'Gold 1', desiredRank: 'Gold 3', region: 'EU', amount: null, platform: null, description: '' };
  const withRR = quote({ ...base, points: 65, completion: 'Solo' }, p);
  assert.ok(withRR.ok && withRR.price === 11.9);
  const duo = quote({ ...base, points: 0, completion: 'Duo' }, p);
  assert.ok(duo.ok && duo.price === 21);
  assert.equal(quote({ ...base, points: 0, completion: 'Solo', region: 'KR' }, p).ok, false);
  assert.equal(quote({ ...base, points: 0, completion: 'Solo', description: 'add me on discord dot gg' }, p).ok, false);
  assert.ok(quote({ ...base, points: 0, completion: 'Solo', description: 'takes 3.5 hours' }, p).ok);
  p.customRules.push({ id: 'r1', enabled: true, from: 'Gold 1', to: 'Gold 3', region: 'ALL', price: 9.99, hours: 0, refuse: false });
  const custom = quote({ ...base, points: 0, completion: 'Duo' }, p);
  assert.ok(custom.ok && custom.price === 9.99);
  p.customRules.push({ id: 'r2', enabled: true, from: 'Gold 1', to: 'Gold 3', region: 'EU', price: 0, hours: 0, refuse: true });
  assert.equal(quote({ ...base, points: 0, completion: 'Solo' }, p).ok, false, 'region rule beats global and can refuse');
});

test('per-order-type modifiers, hidden duo, derank, region tables, region names', () => {
  const p = defaultPricing('valorant');
  const base = { game: 'valorant' as const, currentRank: 'Gold 1', desiredRank: 'Gold 3', region: 'EU', points: 0, amount: null, platform: null };
  p.services.rank.modifiers.stream = { mult: 1, skip: true, maxRank: null };
  p.services.netwins.modifiers.stream = { mult: 1.2, skip: false, maxRank: null };
  assert.equal(quote({ ...base, service: 'rank', completion: 'Solo', description: 'please stream' }, p).ok, false);
  const nw = quote({ ...base, service: 'netwins', completion: 'Solo', description: 'please stream', amount: 2 }, p);
  assert.ok(nw.ok && nw.price === 14.4); // Gold net win $6 × 2 × 1.2

  p.services.rank.completion.duo.skip = true;
  assert.equal(quote({ ...base, service: 'rank', completion: 'Solo', description: 'we play duo pls' }, p).ok, false, 'hidden duo');
  assert.ok(quote({ ...base, service: 'rank', completion: 'Solo', description: 'no duo' }, p).ok);

  // Gold 1 → Silver 2 is a derank (off by default): a Gold step ($4) + a Silver step ($3) on the derank table.
  const dr = { ...base, service: 'rank' as const, currentRank: 'Gold 1', desiredRank: 'Silver 2', completion: 'Solo', description: '' };
  assert.equal(quote(dr, p).ok, false);
  p.services.derank.enabled = true;
  const d = quote(dr, p);
  assert.ok(d.ok && d.service === 'derank' && d.price === 7);

  p.regionTables.NA = structuredClone(p.services);
  p.regionTables.NA.rank.tiers.find(t => t.name === 'Gold')!.price = 20;
  const na = quote({ ...base, service: 'rank', region: normalizeRequest('valorant', 'Rank Boost', { Server: 'North America' }).region, completion: 'Solo', description: '' }, p);
  assert.ok(na.ok && na.price === 40 && na.table === 'NA');
  assert.equal(normalizeRequest('valorant', 'x', { Server: 'Oceania' }).region, 'AP');
  assert.equal(normalizeRequest('valorant', 'x', { Server: 'LAS' }).region, 'LATAM');
});

test('first-version pricing is migrated', () => {
  const old = { enabled: true, minPrice: 7, regions: { KR: true }, modifiers: [{ key: 'duo', multiplier: 1.4, skip: false }, { key: 'stream', multiplier: 1, skip: true, keywords: ['stream'] }],
    rankBoost: { enabled: true, tiers: defaultPricing('valorant').services.rank.tiers, pointsDiscount: { enabled: false, bands: [] } }, customRules: [] };
  const p = migratePricing('valorant', old);
  assert.equal(p.version, 2);
  assert.equal(p.minPrice, 7);
  assert.equal(p.regions.KR, true);
  assert.equal(p.services.placements.completion.duo.mult, 1.4);
  assert.equal(p.services.rank.modifiers.stream.skip, true);
});

test('delivery rounding', () => {
  assert.equal(deliveryEnum(4), 'Hour5');
  assert.equal(deliveryEnum(25), 'Day2');
  assert.equal(deliveryEnum(99999), 'Day100');
});

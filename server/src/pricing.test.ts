process.env.DB_PATH = ':memory:';
const { test } = await import('node:test');
const assert = await import('node:assert/strict');
const { rankIndex, ladder } = await import('./ranks.ts');
const { defaultPricing, quote, normalizeRequest, deliveryEnum } = await import('./pricing.ts');

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
  p.modifiers.find(m => m.key === 'duo')!.multiplier = 1.5;
  const base = { game: 'valorant' as const, service: 'rank' as const, currentRank: 'Gold 1', desiredRank: 'Gold 3', region: 'EU', amount: null, platform: null, description: '' };
  const withRR = quote({ ...base, points: 65, completion: 'Solo' }, p);
  assert.ok(withRR.ok && withRR.price === 11.9);
  const duo = quote({ ...base, points: 0, completion: 'Duo' }, p);
  assert.ok(duo.ok && duo.price === 21);
  assert.equal(quote({ ...base, points: 0, completion: 'Solo', region: 'KR' }, p).ok, false);
  assert.equal(quote({ ...base, points: 0, completion: 'Solo', description: 'add me on discord dot gg' }, p).ok, false);
  assert.ok(quote({ ...base, points: 0, completion: 'Solo', description: 'takes 3.5 hours' }, p).ok);
  p.customRules.push({ id: 'r1', enabled: true, from: 'Gold 1', to: 'Gold 3', region: 'ALL', price: 9.99 });
  const custom = quote({ ...base, points: 0, completion: 'Duo' }, p);
  assert.ok(custom.ok && custom.price === 9.99);
});

test('delivery rounding', () => {
  assert.equal(deliveryEnum(4), 'Hour5');
  assert.equal(deliveryEnum(25), 'Day2');
  assert.equal(deliveryEnum(99999), 'Day100');
});

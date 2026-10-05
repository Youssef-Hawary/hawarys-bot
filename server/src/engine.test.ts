process.env.DB_PATH = ':memory:';
const { test } = await import('node:test');
const assert = await import('node:assert/strict');
const { setSetting, db } = await import('./db.ts');
const { eldorado } = await import('./eldorado.ts');
const { ingestRequest, receiveDetails } = await import('./engine.ts');

test('the same request delivered twice at once is offered only once', async () => {
  setSetting('bot', { running: true, dryRun: false, pollSeconds: 10, maxOffersPerHour: 30, syncOnlineStatus: false, deadlineAlertHours: 2 });
  setSetting('eldorado', { clientId: 'x', clientSecret: 'y' });
  let offers = 0;
  (eldorado as any).createOffer = async () => { offers++; await new Promise(r => setTimeout(r, 50)); return { id: 'o1' }; };
  ingestRequest({ id: '11111111-1111-1111-1111-111111111111', gameId: 'g', boostingCategoryId: 'c', boostingCategoryTitle: 'Valorant Rank Boost',
    createdDate: new Date().toISOString(), buyerId: 'b', buyerUsername: 'buyer1', isBuyerMuted: false } as any);
  const details = { requestId: '11111111-1111-1111-1111-111111111111', fields: { 'Current Rank': 'Gold 1', 'Desired Rank': 'Gold 3', Server: 'EU', 'Completion Method': 'Solo' } };
  await Promise.all([receiveDetails({ ...details, fast: true }), receiveDetails(details)]);
  assert.equal(offers, 1);
  const row = db.prepare('SELECT status, price FROM requests WHERE id = ?').get(details.requestId) as any;
  assert.equal(row.status, 'offered');
  assert.ok(row.price > 0);
});

test('a League of Legends request (game id 17, category "Rank Boost") is recognised and priced', async () => {
  setSetting('bot', { running: true, dryRun: true, pollSeconds: 10, maxOffersPerHour: 30, syncOnlineStatus: false, deadlineAlertHours: 2 });
  const id = '22222222-2222-2222-2222-222222222222';
  ingestRequest({ id, gameId: '17', boostingCategoryId: 'c', boostingCategoryTitle: 'Rank Boost', createdDate: new Date().toISOString(),
    buyerId: 'b2', buyerUsername: 'buyer2', isBuyerMuted: false } as any);
  await receiveDetails({ requestId: id, fields: { 'Current Rank': 'Gold IV', 'Current LP': '0', 'Desired Rank': 'Platinum IV', Server: 'EUW', 'Completion Method': 'Solo' } });
  const row = db.prepare('SELECT game, status, price, reason FROM requests WHERE id = ?').get(id) as any;
  assert.equal(row.game, 'lol');
  assert.equal(row.status, 'would_offer', row.reason);
  assert.ok(row.price > 0);
});

test('a request found by the extension is offered at once and the opener is queued for the chat', async () => {
  setSetting('bot', { running: true, dryRun: false, pollSeconds: 10, maxOffersPerHour: 200, syncOnlineStatus: false, deadlineAlertHours: 2 });
  setSetting('messages', { ...(await import('./engine.ts')).getMessages(), openers: [{ id: 'A', enabled: true, text: 'Hi {name}, I can do it for ${price}' }] });
  (eldorado as any).createOffer = async () => ({ id: 'o3' });
  const id = '33333333-3333-3333-3333-333333333333';
  const item = { id, gameId: '32', boostingCategoryId: 'c', boostingCategoryTitle: 'Rank Boost', createdDate: new Date().toISOString(), buyerId: 'b3', buyerUsername: 'buyer3', isBuyerMuted: false };
  await receiveDetails({ requestId: id, fields: { 'Current Rank': 'Gold 1', 'Desired Rank': 'Gold 3', Server: 'EU', 'Completion Method': 'Solo' }, fast: true, item: item as any });
  const row = db.prepare('SELECT status, game FROM requests WHERE id = ?').get(id) as any;
  assert.equal(row.status, 'offered');
  assert.equal(row.game, 'valorant');
  const opener = db.prepare(`SELECT kind, text FROM outbox WHERE request_id = ? AND kind = 'opener'`).get(id) as any;
  assert.ok(opener, 'opener queued');
  assert.match(opener.text, /Hi buyer3/);
});

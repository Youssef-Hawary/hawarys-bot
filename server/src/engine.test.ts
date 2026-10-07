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

test('chat messages are never stuck silently: refused chats go to the extension with the reason', async () => {
  const { heartbeat, outboxFor, outboxResult } = await import('./engine.ts');
  heartbeat('ext-1', { userId: 1, name: 'Owner', onEldorado: true, version: 'test' });
  db.prepare(`DELETE FROM outbox`).run();
  db.prepare(`INSERT INTO outbox (kind, request_id, text, not_before, created_at) VALUES ('opener', 'r-refused', 'hi', ?, ?)`).run(Date.now(), Date.now());
  db.prepare(`INSERT INTO outbox (kind, request_id, text, not_before, created_at) VALUES ('opener', 'r-ok', 'hello', ?, ?)`).run(Date.now(), Date.now());
  (eldorado as any).createConversation = async (id: string) => { if (id === 'r-refused') throw new Error('Eldorado 400'); return { talkJsConversationId: 'conv-1' }; };
  const items = await outboxFor('ext-1');
  assert.equal(items.length, 2);
  const ok = items.find((i: any) => i.request_id === 'r-ok');
  const refused = items.find((i: any) => i.request_id === 'r-refused');
  assert.equal(ok.conversation_id, 'conv-1');
  assert.match(refused.error, /couldn't open the chat/);
  outboxResult(refused.id, false, 'buyer has to write first');
  const row = db.prepare(`SELECT status, error FROM outbox WHERE id = ?`).get(refused.id) as any;
  assert.equal(row.status, 'failed');
  assert.match(row.error, /buyer has to write first/);
});

test('the newest extension version handles the work, not an old copy that connected first', async () => {
  const { heartbeat, isLeader } = await import('./engine.ts');
  heartbeat('old-copy', { userId: 1, name: 'Owner', onEldorado: true, version: '1.4.1' });
  heartbeat('new-copy', { userId: 1, name: 'Owner', onEldorado: true, version: '1.6.0' });
  assert.equal(isLeader('new-copy'), true);
  assert.equal(isLeader('old-copy'), false);
});

test('the opener carries the image of the request\'s game', async () => {
  setSetting('bot', { running: true, dryRun: false, pollSeconds: 10, maxOffersPerHour: 200, syncOnlineStatus: false, deadlineAlertHours: 2 });
  db.prepare(`INSERT OR REPLACE INTO files (key, name, mime, data, updated_at) VALUES ('opener:lol', 'lol.png', 'image/png', ?, ?)`).run(new Uint8Array([1, 2, 3]), Date.now());
  (eldorado as any).createOffer = async () => ({ id: 'o4' });
  const id = '44444444-4444-4444-4444-444444444444';
  const item = { id, gameId: '17', boostingCategoryId: 'c', boostingCategoryTitle: 'Rank Boost', createdDate: new Date().toISOString(), buyerId: 'b4', buyerUsername: 'buyer4', isBuyerMuted: false };
  await receiveDetails({ requestId: id, fields: { 'Current Rank': 'Gold IV', 'Desired Rank': 'Gold I', Server: 'EUW', 'Completion Method': 'Solo' }, fast: true, item: item as any });
  const opener = db.prepare(`SELECT image FROM outbox WHERE request_id = ? AND kind = 'opener'`).get(id) as any;
  assert.equal(opener?.image, 'opener:lol');
});

test('a buyer answering cancels the follow-up and alerts only on the first message', async () => {
  const { chatMessage, heartbeat, outboxFor, getMessages } = await import('./engine.ts');
  setSetting('bot', { running: true, dryRun: false, pollSeconds: 10, maxOffersPerHour: 200, syncOnlineStatus: false, deadlineAlertHours: 2 });
  setSetting('messages', { ...getMessages(), followUp: { enabled: true, delayMinutes: 0, text: 'still there {name}?' } });
  (eldorado as any).createOffer = async () => ({ id: 'o5' });
  const id = '55555555-5555-5555-5555-555555555555';
  const item = { id, gameId: '32', boostingCategoryId: 'c', boostingCategoryTitle: 'Rank Boost', createdDate: new Date().toISOString(), buyerId: 'b5', buyerUsername: 'buyer5', isBuyerMuted: false };
  await receiveDetails({ requestId: id, fields: { 'Current Rank': 'Gold 1', 'Desired Rank': 'Gold 3', Server: 'EU', 'Completion Method': 'Solo' }, fast: true, item: item as any });
  db.prepare(`UPDATE requests SET conversation_id = 'conv-5' WHERE id = ?`).run(id);

  assert.deepEqual(chatMessage({ conversationId: 'conv-5', text: 'my own message', sender: 'me', byMe: true }), { matched: false });
  assert.deepEqual(chatMessage({ conversationId: 'conv-5', text: 'how long?', sender: 'buyer5', byMe: false }), { matched: true, first: true });
  assert.deepEqual(chatMessage({ conversationId: 'conv-5', text: 'hello??', sender: 'buyer5', byMe: false }), { matched: true, first: false });
  const fu = db.prepare(`SELECT status FROM outbox WHERE request_id = ? AND kind = 'follow_up'`).get(id) as any;
  assert.equal(fu.status, 'dropped');
  heartbeat('ext-5', { userId: 1, name: 'Owner', onEldorado: true, version: '9.9.9' });
  assert.ok(!(await outboxFor('ext-5')).some((i: any) => i.request_id === id && i.kind === 'follow_up'));
});

test('an answer from a chat the bot has no id for yet is matched by the buyer name', async () => {
  const { chatMessage } = await import('./engine.ts');
  const id = '66666666-6666-6666-6666-666666666666';
  db.prepare(`INSERT INTO requests (id, game, buyer, seen_at, status, offered_at) VALUES (?, 'valorant', 'buyer6', ?, 'offered', ?)`).run(id, Date.now(), Date.now());
  assert.deepEqual(chatMessage({ conversationId: 'conv-6', text: 'hi', sender: 'buyer6', byMe: false }), { matched: true, first: true });
  assert.equal((db.prepare('SELECT conversation_id FROM requests WHERE id = ?').get(id) as any).conversation_id, 'conv-6');
});

test('a new duo order asks for the in-game username, a solo order for the login', async () => {
  const { upsertOrder } = await import('./engine.ts');
  const order = (oid: string, requestId: string) => ({ id: oid, buyerUsername: 'b', buyerId: 'b', createdDate: new Date().toISOString(), totalPrice: { amount: 10 },
    state: { state: 'Paid' }, talkJsConversationId: `c-${oid}`, orderOfferDetails: { offerTitle: 'Rank Boost', gameId: '32', boostingRequestId: requestId } });
  db.prepare(`INSERT INTO requests (id, game, category, seen_at, details) VALUES ('rq-duo', 'valorant', 'Rank Boost', ?, ?)`)
    .run(Date.now(), JSON.stringify({ fields: { 'Current Rank': 'Gold 1', 'Desired Rank': 'Gold 3', 'Completion Method': 'Duo' } }));
  db.prepare(`INSERT INTO requests (id, game, category, seen_at, details) VALUES ('rq-solo', 'valorant', 'Rank Boost', ?, ?)`)
    .run(Date.now(), JSON.stringify({ fields: { 'Current Rank': 'Gold 1', 'Desired Rank': 'Gold 3', 'Completion Method': 'Solo' } }));
  upsertOrder(order('ord-duo', 'rq-duo'), true);
  upsertOrder(order('ord-solo', 'rq-solo'), true);
  assert.equal((db.prepare(`SELECT kind FROM outbox WHERE order_id = 'ord-duo'`).get() as any).kind, 'accepted_duo');
  assert.equal((db.prepare(`SELECT kind FROM outbox WHERE order_id = 'ord-solo'`).get() as any).kind, 'accepted');
});

// Background worker: heartbeat to the dashboard, reads new requests, ships recorder captures, sends queued chat messages.
const VERSION = chrome.runtime.getManifest().version;
const ELDORADO = ['https://www.eldorado.gg/*', 'https://eldorado.gg/*'];
let captures = [];
let reader = null;          // { windowId, tabId } hidden window used to open request pages
const waiting = new Map();  // requestId → resolve()
let ticking = false;
let again = false;      // something happened while a tick was running: run once more right after

const store = keys => chrome.storage.local.get(keys);
const save = obj => chrome.storage.local.set(obj);

async function clientId() {
  let { clientId } = await store('clientId');
  if (!clientId) { clientId = crypto.randomUUID(); await save({ clientId }); }
  return clientId;
}

async function call(path, body, method) {
  const { server, token } = await store(['server', 'token']);
  if (!server || !token) throw new Error('not connected');
  const res = await fetch(`${server}/api${path}`, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { await save({ token: null, status: { error: 'Logged out. Log in again.' } }); throw new Error('logged out'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function eldoradoTabs() {
  const tabs = await chrome.tabs.query({ url: ELDORADO });
  return tabs.filter(t => t.id !== reader?.tabId && !t.discarded);
}

async function chatCapableTab() {
  for (const t of await eldoradoTabs()) {
    try { const r = await chrome.tabs.sendMessage(t.id, { type: 'probe-chat' }); if (r?.ok) return t; } catch { /* tab not ready */ }
  }
  return null;
}

/** Reads request details through Eldorado's API from a normal Eldorado tab. Returns the ids it couldn't read. */
async function fetchAllDetails(ids, tabs) {
  if (!ids.length) return [];
  if (!tabs.length) { await call('/ext/report', { message: `${ids.length} request(s) waiting, but no Eldorado tab is open in Chrome` }).catch(() => {}); return ids; }
  const left = [];
  for (const requestId of ids) {
    let r;
    try { r = await chrome.tabs.sendMessage(tabs[0].id, { type: 'fetch-details', requestId }); }
    catch { r = { ok: false, error: 'Eldorado tab not ready. Reload it (F5).' }; }
    if (r?.ok) {
      const res = await call('/ext/request-details', { requestId, fields: r.fields, buyer: r.buyer }).catch(() => null);
      await save({ lastDetails: { at: Date.now(), fields: r.fields, result: res } });
    } else {
      left.push(requestId);
      // After a few failed tries the server gives up on it (e.g. the request was closed), so it can't clog the loop.
      await call('/ext/details-failed', { requestId, error: r?.error ?? 'unknown' }).catch(() => {});
    }
  }
  return left;
}

async function flushCaptures() {
  if (!captures.length) return;
  const batch = captures.splice(0, 50);
  try { await call('/ext/captures', batch); } catch { /* recorder is best-effort */ }
}

async function tick() {
  if (ticking) { again = true; return; }
  ticking = true;
  again = false;
  try {
    const { token } = await store('token');
    if (!token) return;
    const id = await clientId();
    const tabs = await eldoradoTabs();
    const hb = await call('/ext/heartbeat', { clientId: id, onEldorado: tabs.length > 0, version: VERSION });
    const status = { ok: true, at: Date.now(), leader: hb.leader, running: hb.running, recording: hb.recording, user: hb.user, onEldorado: tabs.length > 0, template: hb.template };
    await flushCaptures();

    if (hb.leader) {
      const pending = await call(`/ext/pending-details?clientId=${id}`);
      status.pendingDetails = pending.ids.length;
      await fetchAllDetails(pending.ids, tabs);
      status.chatReady = tabs.length > 0;
    }
    await save({ status });
  } catch (e) {
    await save({ status: { ok: false, at: Date.now(), error: String(e.message || e) } });
  } finally {
    ticking = false;
    if (again) tick();
  }
}

/** Eldorado's live feed announced a new request: make the server check now, then read details at once. */
let lastWake = 0;
async function onBoostingEvent(ids = []) {
  call('/ext/report', { level: 'info', message: '⚡ Live feed works: Eldorado announced a new request' }).catch(() => {});
  const poke = call('/ext/poke', {}).catch(() => null);
  const tabs = await eldoradoTabs();
  // Read the details while the server is still fetching the request list: both trips happen at once.
  await Promise.all(tabs.length ? ids.map(async requestId => {
    let r;
    try { r = await chrome.tabs.sendMessage(tabs[0].id, { type: 'fetch-details', requestId }); } catch { return; }
    if (!r?.ok) return; // not a request id (e.g. the notification's own id); the normal path still covers it
    const res = await call('/ext/request-details', { requestId, fields: r.fields, buyer: r.buyer, fast: true }).catch(() => null);
    if (res?.status) await save({ lastDetails: { at: Date.now(), fields: r.fields, result: res } });
  }) : []);
  await poke;
  tick();
  flushOutbox();
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'capture') {
    store('status').then(({ status }) => {
      if (!status?.recording) return;
      captures.push(msg.data);
      if (captures.length >= 20) flushCaptures();
    });
  }
  if (msg.type === 'details') {
    const d = msg.data;
    call('/ext/request-details', { requestId: d.requestId, title: d.title, fields: d.fields, buyer: d.buyer })
      .then(r => save({ lastDetails: { at: Date.now(), title: d.title, fields: d.fields, result: r } }))
      .catch(() => {})
      .finally(() => { waiting.get(d.requestId)?.(); waiting.delete(d.requestId); });
    // Only learn the address from pages a person opened, not from our hidden reader window.
    if (sender.tab?.id !== reader?.tabId) call('/ext/request-url-template', { template: d.template }).catch(() => {});
  }
  if (msg.type === 'connect-eldorado') {
    (async () => {
      const current = await call('/ext/eldorado-status', {});
      if (current.ok) return { tested: true, already: true };
      const [tab] = await eldoradoTabs();
      if (!tab) throw new Error('Open eldorado.gg in a tab and log in first');
      let keys;
      try { keys = await chrome.tabs.sendMessage(tab.id, { type: 'create-keys' }); }
      catch { throw new Error('Reload the Eldorado tab (F5) and try again'); }
      if (!keys?.ok) throw new Error(keys?.error || 'Could not create keys');
      return call('/ext/eldorado-keys', { clientId: keys.clientId, clientSecret: keys.clientSecret });
    })().then(r => reply({ ok: true, ...r }), e => reply({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === 'boosting-event') onBoostingEvent(msg.ids);
  if (msg.type === 'chat-message' && msg.data?.conversationId && !msg.data.byMe) {
    // Only the main browser reports, so the bot hears each message once.
    store('status').then(({ status }) => { if (status?.leader) call('/ext/chat-message', msg.data).catch(() => {}); });
  }
  if (msg.type === 'wake' && Date.now() - lastWake > 3500) { lastWake = Date.now(); tick(); }
  if (msg.type === 'tick') { tick().then(() => reply({ ok: true })); return true; }
});

/** Downloads an uploaded image (e.g. "opener:valorant") from the dashboard, as base64 for the Eldorado tab. */
async function fetchImage(key) {
  const { server, token } = await store(['server', 'token']);
  const game = String(key).split(':')[1];
  const res = await fetch(`${server}/api/messages/images/${encodeURIComponent(game)}/file`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`image missing on the dashboard (HTTP ${res.status})`);
  const mime = res.headers.get('content-type') || 'image/png';
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), mime, name: `${game}.${mime.split('/')[1] || 'png'}` };
}

// ---- chat messages: their own loop, so reading requests can never hold them up ----
let sending = false;
async function flushOutbox() {
  if (sending) return;
  sending = true;
  try {
    const { token, status } = await store(['token', 'status']);
    if (!token || !status?.leader) return;
    const [chatTab] = await eldoradoTabs();
    if (!chatTab) return;
    const items = await call(`/ext/outbox?clientId=${await clientId()}`);
    for (const item of items) {
      let r, conversationId = item.conversation_id;
      if (!conversationId && item.request_id) {
        try { const c = await chrome.tabs.sendMessage(chatTab.id, { type: 'open-chat', requestId: item.request_id }); conversationId = c?.conversationId; if (!c?.ok) r = c; }
        catch (e) { r = { ok: false, error: `Eldorado tab not ready (${String(e.message || e)}). Press F5 on it.` }; }
      }
      let image = null;
      if (conversationId && !r && item.image) {
        try { image = await fetchImage(item.image); } catch (e) { r = { ok: false, error: String(e.message || e) }; }
      }
      if (conversationId && !r) {
        try { r = await chrome.tabs.sendMessage(chatTab.id, { type: 'send-chat', conversationId, text: item.text, image }); }
        catch (e) { r = { ok: false, error: `Eldorado tab not ready (${String(e.message || e)}). Press F5 on it.` }; }
      }
      r ??= { ok: false, error: 'no chat to send it to' };
      await call(`/ext/outbox/${item.id}`, { ok: !!r?.ok, error: r?.error, conversationId });
    }
  } catch { /* next round */ }
  finally { sending = false; }
}
setInterval(flushOutbox, 3000);

// ---- listening to chat: the main browser keeps a chat session open in its Eldorado tab so buyers' answers reach the bot ----
let watching = false;
async function watchChat() {
  if (watching) return;
  watching = true;
  try {
    const { token, status } = await store(['token', 'status']);
    if (!token || !status?.leader) return;
    const [tab] = await eldoradoTabs();
    if (!tab) return;
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'watch-chat' }).catch(e => ({ ok: false, error: String(e.message || e) }));
    if (!r?.ok) call('/ext/report', { message: `Can't listen to Eldorado chat: ${r?.error ?? 'unknown'}. Press F5 on the Eldorado tab.` }).catch(() => {});
  } finally { watching = false; }
}
setInterval(watchChat, 60_000);
setTimeout(watchChat, 5000);

// ---- fast check: Eldorado's request list every 2 seconds, from the Eldorado tab ----
// Works even when Eldorado's live feed doesn't announce a request. Only the main browser does it, only while the bot runs.
const seenRequests = new Set();
let listSeeded = false, scanning = false, pauseUntil = 0;

async function handleNewRequest(tabId, item) {
  let r;
  try { r = await chrome.tabs.sendMessage(tabId, { type: 'fetch-details', requestId: item.id }); } catch { return; }
  if (!r?.ok) return; // the normal path retries it
  const res = await call('/ext/request-details', { requestId: item.id, fields: r.fields, buyer: r.buyer ?? item.buyerUsername, fast: true, item }).catch(() => null);
  if (res?.status) await save({ lastDetails: { at: Date.now(), fields: r.fields, result: res } });
}

async function scanList() {
  if (scanning || Date.now() < pauseUntil) return;
  scanning = true;
  try {
    const { token, status } = await store(['token', 'status']);
    if (!token || !status?.running || !status?.leader) { listSeeded = false; return; }
    const [tab] = await eldoradoTabs();
    if (!tab) return;
    let r;
    try { r = await chrome.tabs.sendMessage(tab.id, { type: 'poll-list' }); } catch { return; }
    if (r?.rate) {
      pauseUntil = Date.now() + 60_000;
      call('/ext/report', { message: 'Eldorado asked to slow down; fast check paused for 1 minute' }).catch(() => {});
      return;
    }
    if (!r?.ok) return;
    const fresh = r.items.filter(i => i?.id && !seenRequests.has(i.id));
    if (seenRequests.size > 5000) seenRequests.clear(), listSeeded = false;
    for (const i of r.items) if (i?.id) seenRequests.add(i.id);
    if (!listSeeded) { listSeeded = true; return; } // first look: these were already there
    if (fresh.length) {
      await Promise.all(fresh.map(i => handleNewRequest(tab.id, i)));
      flushOutbox(); // sends the opener message straight away
    }
  } finally { scanning = false; }
}
setInterval(scanList, 2000);

chrome.alarms.create('tick', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tick') tick(); });
chrome.runtime.onStartup.addListener(tick);
chrome.runtime.onInstalled.addListener(tick);
chrome.windows.onRemoved.addListener(id => { if (reader?.windowId === id) reader = null; });

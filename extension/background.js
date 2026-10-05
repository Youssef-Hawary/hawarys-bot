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

async function readRequests(template, ids) {
  for (const id of ids) {
    const url = template.replace('{id}', id);
    try {
      if (!reader) {
        const w = await chrome.windows.create({ url, state: 'minimized', focused: false });
        reader = { windowId: w.id, tabId: w.tabs[0].id };
      } else {
        await chrome.tabs.update(reader.tabId, { url });
      }
      await new Promise(resolve => { waiting.set(id, resolve); setTimeout(() => { waiting.delete(id); resolve(); }, 25000); });
    } catch {
      reader = null; // window was closed by the user
    }
  }
  if (reader) { chrome.windows.remove(reader.windowId).catch(() => {}); reader = null; }
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
      await call('/ext/report', { message: `Couldn't read request ${requestId.slice(0, 8)}: ${r?.error}` }).catch(() => {});
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
      const left = await fetchAllDetails(pending.ids, tabs);
      if (pending.template && left.length) await readRequests(pending.template, left);

      const chatTab = await chatCapableTab();
      status.chatReady = !!chatTab;
      if (chatTab) {
        for (const item of await call(`/ext/outbox?clientId=${id}`)) {
          let r;
          try { r = await chrome.tabs.sendMessage(chatTab.id, { type: 'send-chat', conversationId: item.conversation_id, text: item.text }); }
          catch (e) { r = { ok: false, error: String(e.message || e) }; }
          await call(`/ext/outbox/${item.id}`, { ok: !!r?.ok, error: r?.error });
        }
      }
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
async function onBoostingEvent() {
  try { await call('/ext/poke', {}); } catch { /* not connected */ }
  tick();
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
  if (msg.type === 'boosting-event') onBoostingEvent();
  if (msg.type === 'wake' && Date.now() - lastWake > 3500) { lastWake = Date.now(); tick(); }
  if (msg.type === 'tick') { tick().then(() => reply({ ok: true })); return true; }
});

chrome.alarms.create('tick', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tick') tick(); });
chrome.runtime.onStartup.addListener(tick);
chrome.runtime.onInstalled.addListener(tick);
chrome.windows.onRemoved.addListener(id => { if (reader?.windowId === id) reader = null; });

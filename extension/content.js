// Runs on eldorado.gg (isolated world). Reads boosting request pages and relays recorder/chat messages.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LABEL = /^(current|desired|target|previous|server|region|completion|number of|games|wins|platform|queue|hours|description|notes|additional|champion|role|agent)/i;

const leaves = root => [...root.querySelectorAll('*')].filter(el => el.childElementCount === 0 && el.textContent.trim());
const text = el => el.textContent.replace(/\s+/g, ' ').trim();

/** Reads the "Request Details" card: label/value rows like "Current Rank: Platinum I". */
function readRequest() {
  const id = location.href.match(UUID)?.[0];
  if (!id) return null;
  const heading = leaves(document.body).find(el => /^request details$/i.test(text(el)));
  if (!heading) return null;
  let box = heading;
  for (let i = 0; i < 8 && box.parentElement; i++) {
    box = box.parentElement;
    if (/desired|server|completion/i.test(box.textContent) && box.querySelectorAll('*').length > 12) break;
  }
  const items = leaves(box);
  const fields = {};
  for (let i = 0; i < items.length - 1; i++) {
    const label = text(items[i]);
    if (LABEL.test(label) && label.length < 40 && !(label in fields)) {
      const value = text(items[i + 1]);
      if (value && !LABEL.test(value)) fields[label] = value;
    }
  }
  if (Object.keys(fields).length < 2) return null; // page still loading

  const page = leaves(document.body);
  const title = page.map(text).find(t => /(valorant|league|lol).{0,6}-/i.test(t) && t.length < 80) ?? null;
  const mute = page.find(el => /^(mute|unmute)$/i.test(text(el)));
  let buyer = null;
  if (mute) {
    let row = mute;
    for (let i = 0; i < 5 && row.parentElement && !buyer; i++) {
      row = row.parentElement;
      buyer = leaves(row).map(text).find(t => !/^(mute|unmute)$/i.test(t) && t.length < 40) ?? null;
    }
  }
  return { requestId: id, title, fields, buyer, template: location.origin + location.pathname.replace(id, '{id}') };
}

let lastSent = '';
function check() {
  const req = readRequest();
  if (!req) return;
  const key = req.requestId + JSON.stringify(req.fields);
  if (key === lastSent) return;
  lastSent = key;
  chrome.runtime.sendMessage({ type: 'details', data: req }).catch(() => {});
}

let timer;
new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check, 600); }).observe(document.documentElement, { childList: true, subtree: true });
setTimeout(check, 1500);

// Live feed (page → background): a new boosting request was just created.
let lastEvent = 0;
window.addEventListener('message', e => {
  if (e.source !== window || e.data?.__hb !== 'boosting-event' || Date.now() - lastEvent < 300) return;
  lastEvent = Date.now();
  chrome.runtime.sendMessage({ type: 'boosting-event' }).catch(() => {});
});
// Keeps the background worker awake and checking every few seconds while an Eldorado tab is open
// (Chrome's own timers can't run more often than every 30 seconds).
setInterval(() => chrome.runtime.sendMessage({ type: 'wake' }).catch(() => {}), 4000);

// Recorder relay (page → background)
window.addEventListener('message', e => {
  if (e.source === window && e.data?.__hb === 'capture') chrome.runtime.sendMessage({ type: 'capture', data: e.data.data }).catch(() => {});
});

// Chat + probe requests (background → page → background)
function askPage(kind, payload, timeoutMs = 15000) {
  return new Promise(resolve => {
    const id = Math.random().toString(36).slice(2);
    const onMsg = e => {
      if (e.source !== window || e.data?.id !== id || !String(e.data.__hb).endsWith('-result')) return;
      window.removeEventListener('message', onMsg);
      resolve(e.data);
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ __hb: kind, id, ...payload }, location.origin);
    setTimeout(() => { window.removeEventListener('message', onMsg); resolve({ ok: false, error: 'timeout' }); }, timeoutMs);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'probe-chat') { askPage('probe-chat', {}, 3000).then(reply); return true; }
  if (msg.type === 'fetch-details') { fetchDetails(msg.requestId).then(reply, e => reply({ ok: false, error: String(e.message || e) })); return true; }
  if (msg.type === 'create-keys') { createKeys().then(reply, e => reply({ ok: false, error: String(e.message || e) })); return true; }
  if (msg.type === 'send-chat') { askPage('send-chat', { conversationId: msg.conversationId, text: msg.text }).then(reply); return true; }
  if (msg.type === 'read-now') { lastSent = ''; check(); reply({ ok: true }); }
});

// Creates Eldorado seller API keys with the logged-in session, sending the same extra headers
// (XSRF token etc.) that Eldorado's own app sends, so the request isn't refused.
async function createKeys() {
  const { headers = {} } = await askPage('site-headers', {}, 3000);
  if (!Object.keys(headers).length) throw new Error('Eldorado hasn\'t loaded yet. Click around on Eldorado for a few seconds (e.g. open your notifications), then try again.');
  const res = await fetch('/api/client-credentials', {
    method: 'POST', credentials: 'include',
    headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
    body: JSON.stringify({ name: `hawarys-bot-${new Date().toISOString().slice(0, 10)}`, expiration: '365.00:00:00' }),
  });
  const text = await res.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* not JSON */ }
  const clientId = d.clientId ?? d.data?.clientId, clientSecret = d.clientSecret ?? d.data?.clientSecret;
  if (res.ok && clientId && clientSecret) return { ok: true, clientId, clientSecret };
  const detail = (d.messages && d.messages.join(' ')) || d.message || d.title || text.slice(0, 160);
  const sent = Object.keys(headers).join(', ');
  throw new Error(`Eldorado said HTTP ${res.status}: ${detail || 'no details'} [headers sent: ${sent}]`);
}

// Reads a boosting request through Eldorado's own API (the same call its request page makes).
// Returns label → value fields like { "Current Rank": "Platinum I", "Server": "EU" }.
async function fetchDetails(requestId) {
  const { headers = {} } = await askPage('site-headers', {}, 3000);
  let last = '';
  for (const path of [`/api/boostingOffers/boostingRequests/${requestId}/details`, `/api/boostingOffers/boostingRequests/${requestId}`]) {
    const res = await fetch(path, { credentials: 'include', headers: { ...headers, Accept: 'application/json, text/plain, */*' } });
    const text = await res.text();
    if (!res.ok) { last = `HTTP ${res.status} ${text.slice(0, 120)}`; continue; }
    let d; try { d = JSON.parse(text); } catch { last = 'not JSON'; continue; }
    const root = d.boostingRequest ?? d.data ?? d;
    const details = root.boostingRequestDetails ?? root.details ?? root;
    const values = details.descriptionValues ?? root.descriptionValues;
    if (!Array.isArray(values)) { last = `no descriptionValues (keys: ${Object.keys(root).join(',')})`; continue; }
    const fields = {}, options = [];
    for (const v of values) {
      const label = String(v.label ?? v.name ?? v.title ?? '').trim();
      const value = Array.isArray(v.value) ? v.value.map(x => x?.label ?? x?.value ?? x).join(', ') : String(v.value ?? '').trim();
      if (!label) continue;
      if (value === 'Yes') options.push(label); else if (value && value !== 'No') fields[label] = value;
    }
    // "Yes" options (Stream, Offline Mode, ...) go into the description so modifiers can match them.
    if (options.length) fields.Description = [fields.Description, `Options: ${options.join(', ')}`].filter(Boolean).join(' | ');
    const buyer = root.buyerInfo?.username ?? root.buyerInfo?.userName ?? root.buyerUsername ?? null;
    return { ok: true, fields, buyer };
  }
  return { ok: false, error: last };
}

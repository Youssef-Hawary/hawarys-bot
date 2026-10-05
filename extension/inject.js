// Runs inside the Eldorado page (MAIN world).
// 1) Recorder: copies Eldorado's own /api/ calls (URL, status, bodies) so we can learn endpoints. Secrets are redacted.
// 2) Remembers the extra headers Eldorado's own app puts on its API calls (e.g. its XSRF token), in memory only,
//    so the extension's own Eldorado calls (creating API keys) look the same and aren't refused.
// 3) Chat bridge: sends a chat message through the page's own TalkJS session, if one exists.
(() => {
  if (window.__hawarysBot) return;
  window.__hawarysBot = true;

  const SENSITIVE = /token|secret|password|passwd|cookie|authorization|session|signature|card|iban|email/i;
  const redact = text => {
    if (typeof text !== 'string') return null;
    try {
      const json = JSON.parse(text);
      const walk = o => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (SENSITIVE.test(k)) o[k] = '[redacted]'; else walk(o[k]); } };
      walk(json);
      return JSON.stringify(json);
    } catch { return text.slice(0, 4000); }
  };
  const interesting = url => /\/api\//.test(url) && !/authentication|login|logout|token|payment|checkout|wallet|withdraw/i.test(url);
  const emit = data => window.postMessage({ __hb: 'capture', data }, location.origin);

  const siteHeaders = {};
  const SKIP_HEADER = /^(content-type|content-length|accept)$/i;
  const isOwnApi = url => { try { const u = new URL(url, location.href); return u.origin === location.origin && u.pathname.startsWith('/api/'); } catch { return false; } };
  const remember = (name, value) => { if (name && value != null && !SKIP_HEADER.test(name)) siteHeaders[String(name).toLowerCase()] = String(value); };

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    try {
      const u = typeof input === 'string' ? input : input?.url;
      if (u && isOwnApi(u) && init?.headers) new Headers(init.headers).forEach((v, k) => remember(k, v));
    } catch { /* ignore */ }
    const res = await origFetch.apply(this, arguments);
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href).href;
      if (interesting(url)) {
        const method = String(init?.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
        const reqBody = typeof init?.body === 'string' ? redact(init.body) : null;
        res.clone().text().then(t => emit({ method, url, status: res.status, reqBody, respBody: redact(t) })).catch(() => {});
      }
    } catch { /* never break the page */ }
    return res;
  };

  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__hb = { method: String(method).toUpperCase(), url: String(url) };
    return open.apply(this, arguments);
  };
  const setHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try { if (this.__hb && isOwnApi(this.__hb.url)) remember(name, value); } catch { /* ignore */ }
    return setHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const meta = this.__hb;
    try {
      const url = meta && new URL(meta.url, location.href).href;
      if (url && interesting(url)) this.addEventListener('loadend', () => {
        const text = this.responseType === '' || this.responseType === 'text' ? this.responseText : null;
        emit({ method: meta.method, url, status: this.status, reqBody: typeof body === 'string' ? redact(body) : null, respBody: redact(text) });
      });
    } catch { /* ignore */ }
    return send.apply(this, arguments);
  };

  // ---- live feed ----
  // Eldorado pushes notifications over a SignalR WebSocket. "BoostingRequestCreated" = a new request for us.
  const NativeWS = window.WebSocket;
  window.WebSocket = class extends NativeWS {
    constructor(...args) {
      super(...args);
      try {
        this.addEventListener('message', e => {
          if (typeof e.data === 'string' && e.data.includes('BoostingRequestCreated')) {
            const ids = [...new Set(e.data.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [])];
            window.postMessage({ __hb: 'boosting-event', ids }, location.origin);
          }
        });
      } catch { /* never break the page */ }
    }
  };

  // ---- chat bridge ----
  function findTalkSession() {
    const seen = new Set();
    const check = v => v && typeof v === 'object' && typeof v.getOrCreateConversation === 'function' ? v : null;
    for (const key of Object.keys(window)) {
      let v; try { v = window[key]; } catch { continue; }
      if (!v || typeof v !== 'object' || seen.has(v)) continue;
      seen.add(v);
      const hit = check(v); if (hit) return hit;
      try { for (const k2 of Object.keys(v).slice(0, 60)) { const h = check(v[k2]); if (h) return h; } } catch { /* ignore */ }
    }
    return null;
  }

  window.addEventListener('message', async e => {
    if (e.source !== window || !e.data || typeof e.data.__hb !== 'string') return;
    const { __hb: kind, id } = e.data;
    if (kind === 'site-headers') window.postMessage({ __hb: 'site-headers-result', id, headers: { ...siteHeaders } }, location.origin);
    if (kind === 'probe-chat') window.postMessage({ __hb: 'probe-chat-result', id, ok: !!findTalkSession() }, location.origin);
    if (kind === 'send-chat') {
      try {
        const session = findTalkSession();
        if (!session) throw new Error('No chat session on this page yet. Open Eldorado messages once.');
        const conv = session.getOrCreateConversation(e.data.conversationId);
        if (typeof conv.sendMessage !== 'function') throw new Error('This chat version cannot send from the extension yet');
        await conv.sendMessage(e.data.text);
        window.postMessage({ __hb: 'send-chat-result', id, ok: true }, location.origin);
      } catch (err) {
        window.postMessage({ __hb: 'send-chat-result', id, ok: false, error: String(err?.message || err) }, location.origin);
      }
    }
  });
})();

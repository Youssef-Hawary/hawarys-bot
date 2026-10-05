// Runs inside the Eldorado page (MAIN world).
// 1) Recorder: copies Eldorado's own /api/ calls (URL, status, bodies) so we can learn endpoints. Secrets are redacted.
// 2) Remembers the extra headers Eldorado's own app puts on its API calls (e.g. its XSRF token), in memory only,
//    so the extension's own Eldorado calls (creating API keys) look the same and aren't refused.
// 3) Chat bridge: sends chat messages through TalkJS with the logged-in account's chat token.
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
          if (typeof e.data === 'string' && /oosting|otification/.test(e.data)) emit({ method: 'WS', url: String(this.url).split('?')[0], status: 101, reqBody: null, respBody: redact(e.data.replace(/\x1e/g, '').slice(0, 4000)) });
          if (typeof e.data === 'string' && e.data.includes('BoostingRequestCreated')) {
            const ids = [...new Set(e.data.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [])];
            window.postMessage({ __hb: 'boosting-event', ids }, location.origin);
          }
        });
      } catch { /* never break the page */ }
    }
  };

  // ---- chat bridge ----
  // Eldorado's chat is TalkJS. Like Eldorado's own app, we open a TalkJS session with the chat token from
  // /api/conversations/me/authorize (your logged-in account) and send through it.
  const TALK_APP_ID = '49mLECOW'; // Eldorado's public TalkJS app id (from its site config)
  let chat = null; // { session, userId, at }

  function loadTalk() {
    if (window.Talk) return window.Talk;
    // TalkJS's official loader snippet (Eldorado uses the same one).
    (function (n, t, m, e, s, i) { i = t.createElement('script'); i.async = 1; i.src = 'https://cdn.talkjs.com/talk.js'; t.head.appendChild(i); e = n.Promise;
      n.Talk = { v: 3, ready: { then(r) { if (e) return new e((h, c) => { m.push([r, h, c]); }); m.push([r]); }, catch() { return e && new e(); }, c: m } }; })(window, document, []);
    return window.Talk;
  }

  async function chatToken() {
    const res = await origFetch('/api/conversations/me/authorize', { credentials: 'include', headers: { ...siteHeaders, Accept: 'application/json, text/plain, */*' } });
    if (res.status === 401 || res.status === 403) throw new Error('Not logged in to Eldorado in this Chrome');
    if (!res.ok) throw new Error(`Chat login failed (HTTP ${res.status})`);
    const { token } = await res.json();
    if (!token) throw new Error('Chat login returned no token');
    return token;
  }

  async function chatSession() {
    if (chat && Date.now() - chat.at < 20 * 60_000) return chat.session;
    const Talk = loadTalk();
    await Promise.race([Talk.ready, new Promise((_, no) => setTimeout(() => no(new Error('Chat library did not load')), 15000))]);
    const token = await chatToken();
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const userId = claims.userId ?? claims.sub;
    if (!userId) throw new Error('Chat token has no user id');
    try { chat?.session?.destroy?.(); } catch { /* ignore */ }
    const session = new window.Talk.Session({ appId: TALK_APP_ID, me: new window.Talk.User(userId), tokenFetcher: chatToken });
    chat = { session, userId, at: Date.now() };
    return session;
  }

  async function sendChat(conversationId, text) {
    const session = await chatSession();
    // Newer TalkJS SDK: session.conversation(id).send(text). Older: getOrCreateConversation(id).sendMessage(text).
    if (typeof session.conversation === 'function') {
      const ref = session.conversation(conversationId);
      if (typeof ref?.send === 'function') { await ref.send(text); return; }
    }
    const conv = session.getOrCreateConversation(conversationId);
    if (typeof conv?.sendMessage !== 'function') throw new Error('This TalkJS version cannot send messages from the extension');
    await conv.sendMessage(text);
  }

  window.addEventListener('message', async e => {
    if (e.source !== window || !e.data || typeof e.data.__hb !== 'string') return;
    const { __hb: kind, id } = e.data;
    if (kind === 'site-headers') window.postMessage({ __hb: 'site-headers-result', id, headers: { ...siteHeaders } }, location.origin);
    if (kind === 'probe-chat') window.postMessage({ __hb: 'probe-chat-result', id, ok: true }, location.origin);
    if (kind === 'send-chat') {
      try {
        await sendChat(e.data.conversationId, e.data.text);
        window.postMessage({ __hb: 'send-chat-result', id, ok: true }, location.origin);
      } catch (err) {
        chat = null; // start a fresh session next time
        window.postMessage({ __hb: 'send-chat-result', id, ok: false, error: String(err?.message || err) }, location.origin);
      }
    }
  });
})();

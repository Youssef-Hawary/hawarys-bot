const $ = id => document.getElementById(id);
const C = { ok: '#34D399', warn: '#FBBF24', bad: '#F87171', off: '#77808F', neon: '#38C6F4' };

function dot(id, color, textId, text) { $(id).style.background = color; $(id).style.boxShadow = `0 0 8px ${color}`; $(textId).textContent = text; }

async function render() {
  const { token, server, status, lastDetails } = await chrome.storage.local.get(['token', 'server', 'status', 'lastDetails']);
  $('login').classList.toggle('hidden', !!token);
  $('panel').classList.toggle('hidden', !token);
  if (!token) { $('server').value = server || ''; $('who').textContent = 'Not connected'; if (status?.error) $('loginErr').textContent = status.error; return; }

  $('who').textContent = status?.user ? `${status.user.name} · ${new URL(server).host}` : new URL(server).host;
  const fresh = status && Date.now() - status.at < 90_000;
  dot('dConn', status?.ok && fresh ? C.ok : C.bad, 'tConn', status?.ok && fresh ? 'Connected' : status?.error || 'Waiting…');
  dot('dBot', status?.running ? C.ok : C.off, 'tBot', status?.running ? 'Running' : 'Stopped');
  dot('dTab', status?.onEldorado ? C.ok : C.warn, 'tTab', status?.onEldorado ? 'Open' : 'Open one!');
  dot('dRole', status?.leader ? C.neon : C.off, 'tRole', status?.leader ? (status.chatReady ? 'Main · chat ready' : 'Main') : 'Standby');
  dot('dRec', status?.recording ? C.bad : C.off, 'tRec', status?.recording ? 'Recording' : 'Off');
  $('toggle').textContent = status?.running ? 'Stop bot' : 'Start bot';
  $('toggle').className = status?.running ? 'danger' : 'primary';

  const lines = [];
  if (!status?.template) lines.push('👉 Open any boosting request on Eldorado once so the bot learns where request pages live.');
  else if (status?.pendingDetails) lines.push(`Reading ${status.pendingDetails} new request(s)…`);
  if (lastDetails) {
    const f = lastDetails.fields || {};
    const res = lastDetails.result;
    lines.push(`Last read: ${f['Current Rank'] ?? '?'} → ${f['Desired Rank'] ?? '?'} ${f['Server'] ?? ''}` + (res ? ` · ${res.status === 'skipped' ? 'skipped: ' + res.reason : res.price ? '$' + res.price : res.status}` : ''));
  }
  if (!status?.leader && status?.ok) lines.push('Another teammate’s browser is the main one right now; this one is on standby.');
  $('info').textContent = lines.join('\n') || 'All good. Keep an Eldorado tab open.';
  $('info').style.whiteSpace = 'pre-line';
}

$('login').addEventListener('submit', async e => {
  e.preventDefault();
  $('loginErr').textContent = '';
  let server = $('server').value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(server)) server = 'https://' + server;
  try {
    const origin = new URL(server).origin;
    const granted = await chrome.permissions.request({ origins: [origin + '/*'] });
    if (!granted) throw new Error('Permission to reach the dashboard was denied');
    const res = await fetch(`${origin}/api/ext/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('user').value, password: $('pass').value }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await chrome.storage.local.set({ server: origin, token: data.token, status: { ok: true, at: Date.now(), user: data.user } });
    $('pass').value = '';
    await chrome.runtime.sendMessage({ type: 'tick' });
    render();
  } catch (err) { $('loginErr').textContent = err.message; }
});

$('open').onclick = async () => { const { server } = await chrome.storage.local.get('server'); chrome.tabs.create({ url: server }); };
$('eld').onclick = () => chrome.tabs.create({ url: 'https://www.eldorado.gg/' });
$('logout').onclick = async () => { await chrome.storage.local.set({ token: null, status: null }); render(); };
$('toggle').onclick = async () => {
  const { server, token, status } = await chrome.storage.local.get(['server', 'token', 'status']);
  await fetch(`${server}/api/bot/${status?.running ? 'stop' : 'start'}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  await chrome.runtime.sendMessage({ type: 'tick' });
  render();
};

chrome.storage.onChanged.addListener(render);
render();
chrome.runtime.sendMessage({ type: 'tick' }).then(render).catch(() => {});

import { useEffect, useState } from 'react';
import { KeyRound, Bot, Bell, Percent, Puzzle, PlugZap, Trash2, CircleDot, Download, Upload, Archive } from 'lucide-react';
import { api, ago, useData } from '../api.ts';
import { Badge, Button, Field, Num, PageHeader, Section, Toggle, clsx, useAction } from '../components/ui.tsx';

export function SettingsPage() {
  const { data, reload } = useData<any>('/settings', ['bot']);
  const { data: ov } = useData<any>('/overview', ['bot']);
  const [s, setS] = useState<any>(null);
  const [secret, setSecret] = useState('');
  const { busy, run } = useAction();
  useEffect(() => { if (data && !s) setS(structuredClone(data)); }, [data, s]);
  if (!s) return <><PageHeader title="Settings" /><div className="skeleton h-96" /></>;

  const set = (fn: (x: any) => void) => setS((p: any) => { const n = structuredClone(p); fn(n); return n; });
  const save = (section: string, body: unknown, msg = 'Saved') => run(section, async () => { await api('/settings', { method: 'PUT', body }); setSecret(''); await reload(); setS(null); }, msg);

  return (
    <>
      <PageHeader title="Settings" subtitle="Owner only. Keys and webhooks are stored on your server, never in the browser." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title={<span className="flex items-center gap-2"><KeyRound size={16} /> Eldorado API keys</span>}
          subtitle="Easiest: in the Chrome extension click Connect Eldorado API (with an Eldorado tab open). Or paste keys here. The secret is never shown again.">
          <div className="space-y-3">
            <Field label="Client ID"><input className="field font-mono text-[13px]" value={s.eldorado.clientId} onChange={e => set(x => { x.eldorado.clientId = e.target.value; })} /></Field>
            <Field label="Client secret" hint={s.eldorado.hasSecret ? `Saved (ends in …${s.eldorado.secretLast4}). Leave empty to keep it.` : 'Not set'}>
              <input className="field font-mono text-[13px]" type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button variant="primary" loading={busy === 'keys'} onClick={() => save('keys', { eldorado: { clientId: s.eldorado.clientId, clientSecret: secret || undefined } }, 'Keys saved')}>Save keys</Button>
              <Button icon={<PlugZap size={15} />} loading={busy === 'test'} onClick={() => run('test', async () => {
                const r = await api('/settings/eldorado/test', { method: 'POST' }); if (!r.ok) throw new Error(r.error);
              }, 'Connected to Eldorado ✓')}>Test connection</Button>
            </div>
          </div>
        </Section>

        <Section title={<span className="flex items-center gap-2"><Bot size={16} /> Bot behavior</span>}>
          <div className="space-y-3">
            <div className={clsx('rounded-[8px] border p-3', s.bot.dryRun ? 'border-violet/30 bg-violet/[.07]' : 'border-ok/30 bg-ok/[.07]')}>
              <Toggle checked={s.bot.dryRun} onChange={v => set(x => { x.bot.dryRun = v; })} label="Dry run"
                hint={s.bot.dryRun ? 'Safe mode: the bot only shows what it WOULD offer.' : 'LIVE: real offers are being sent on Eldorado.'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Backup check every (seconds)" hint="New requests are caught instantly from Eldorado's live feed while an Eldorado tab is open. This is only the backup."><Num min={5} value={s.bot.pollSeconds} onChange={v => set(x => { x.bot.pollSeconds = Math.max(5, v); })} /></Field>
              <Field label="Max offers per hour" hint="Safety cap"><Num value={s.bot.maxOffersPerHour} onChange={v => set(x => { x.bot.maxOffersPerHour = v; })} /></Field>
              <Field label="Deadline alert (hours before)"><Num value={s.bot.deadlineAlertHours} onChange={v => set(x => { x.bot.deadlineAlertHours = v; })} /></Field>
            </div>
            <Toggle checked={s.bot.syncOnlineStatus} onChange={v => set(x => { x.bot.syncOnlineStatus = v; })} label="Sync Eldorado online status" hint="Start/Stop also switches you online/offline on Eldorado" />
            <Button variant="primary" loading={busy === 'bot'} onClick={() => save('bot', { bot: s.bot })}>Save</Button>
          </div>
        </Section>

        <Section title={<span className="flex items-center gap-2"><Bell size={16} /> Discord alerts</span>}
          subtitle="Discord channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy URL">
          <div className="space-y-3">
            <Field label="Webhook URL"><input className="field font-mono text-[13px]" placeholder="https://discord.com/api/webhooks/…" value={s.discord.webhook} onChange={e => set(x => { x.discord.webhook = e.target.value; })} /></Field>
            <Field label="Dashboard link (for buttons in alerts)" hint="e.g. https://bot.hawarystore.com"><input className="field" value={s.discord.dashboardUrl} onChange={e => set(x => { x.discord.dashboardUrl = e.target.value; })} /></Field>
            <div className="grid gap-1 sm:grid-cols-2">
              <Toggle checked={s.discord.newOrder} onChange={v => set(x => { x.discord.newOrder = v; })} label="New orders" />
              <Toggle checked={s.discord.deadlines} onChange={v => set(x => { x.discord.deadlines = v; })} label="Deadline warnings" />
              <Toggle checked={s.discord.newOffer} onChange={v => set(x => { x.discord.newOffer = v; })} label="Every offer sent" hint="Can be noisy" />
              <Toggle checked={s.discord.dailyReport} onChange={v => set(x => { x.discord.dailyReport = v; })} label="Daily report" />
            </div>
            <Field label="Daily report hour (0–23, server time)" className="max-w-[220px]"><Num min={0} value={s.discord.dailyReportHour} onChange={v => set(x => { x.discord.dailyReportHour = Math.min(23, Math.max(0, v)); })} /></Field>
            <div className="flex gap-2">
              <Button variant="primary" loading={busy === 'discord'} onClick={() => save('discord', { discord: s.discord })}>Save</Button>
              <Button loading={busy === 'dtest'} onClick={() => run('dtest', async () => { const r = await api('/settings/discord/test', { method: 'POST' }); if (!r.ok) throw new Error(r.error); }, 'Test message sent. Check Discord!')}>Send test</Button>
            </div>
          </div>
        </Section>

        <Section title={<span className="flex items-center gap-2"><Percent size={16} /> Fees</span>} subtitle="Eldorado doesn't include its fee in the order data, so set it here for profit and pay math.">
          <div className="flex items-end gap-3">
            <Field label="Eldorado seller fee (%)" className="max-w-[200px]"><Num step={0.5} value={s.fees.eldoradoFeePct} onChange={v => set(x => { x.fees.eldoradoFeePct = v; })} /></Field>
            <Button variant="primary" loading={busy === 'fees'} onClick={() => save('fees', { fees: s.fees })}>Save</Button>
          </div>
        </Section>

        <ExtensionPanel s={s} ov={ov} onRecord={v => save('rec', { recording: v }, v ? 'Recording on: browse Eldorado now' : 'Recording off')} busy={busy} />
        <BackupPanel onImported={() => { reload(); setS(null); }} />
      </div>
    </>
  );
}

function ExtensionPanel({ s, ov, onRecord, busy }: { s: any; ov: any; onRecord: (v: boolean) => void; busy: string | null }) {
  const { data: caps, reload } = useData<any[]>('/captures');
  useEffect(() => { if (!s.recording) return; const i = setInterval(reload, 4000); return () => clearInterval(i); }, [s.recording, reload]);
  const exts = ov?.bot?.extensions ?? [];
  return (
    <Section className="xl:col-span-2" title={<span className="flex items-center gap-2"><Puzzle size={16} /> Chrome extension</span>}
      subtitle="Reads request details (ranks, RR, server, duo) and sends chat messages from your logged-in Eldorado tab.">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-fg-2">
            <li>Download the extension folder (<code className="text-neon">extension/</code> in the project, or the zip below).</li>
            <li>Chrome → <code className="text-neon">chrome://extensions</code> → turn on <b>Developer mode</b>.</li>
            <li><b>Load unpacked</b> → pick the folder. Pin the cyan H icon.</li>
            <li>Click it, enter this dashboard's address and your login, and keep one Eldorado tab open.</li>
          </ol>
          <a href="/hawarys-bot-extension.zip" download><Button icon={<Download size={15} />}>Download extension (.zip)</Button></a>
          <div>
            <div className="mb-2 text-[13px] font-semibold text-fg-2">Connected right now</div>
            {!exts.length ? <p className="text-sm text-fg-3">No extension online.</p> : exts.map((e: any, i: number) => (
              <div key={i} className="flex items-center gap-2 py-1 text-sm">
                <CircleDot size={14} className={e.onEldorado ? 'text-ok' : 'text-warn'} /> {e.name}
                {e.leader && <Badge tone="neon">sends messages</Badge>}
                {!e.onEldorado && <Badge tone="warn">no Eldorado tab</Badge>}
                <span className="text-fg-3">v{e.version}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="well p-4">
          <Toggle checked={!!s.recording} disabled={busy === 'rec'} onChange={onRecord} label={<span className="flex items-center gap-2">Recorder {s.recording && <span className="dot bg-bad" />}</span>}
            hint="Captures Eldorado's own network calls while you browse (no passwords or tokens) so we can wire up chat and new features. Turn off when done." />
          <div className="mt-3 flex items-center justify-between text-[13px] text-fg-3">
            <span>{caps?.length ?? 0} captured calls</span>
            {!!caps?.length && <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={async () => { await api('/captures', { method: 'DELETE' }); reload(); }}>Clear</Button>}
          </div>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-[11.5px]">
            {caps?.slice(0, 80).map(c => (
              <div key={c.id} className="flex gap-2 truncate rounded bg-ink-950/50 px-2 py-1">
                <span className={c.status >= 400 ? 'text-bad' : 'text-ok'}>{c.status}</span><span className="text-neon">{c.method}</span>
                <span className="truncate text-fg-2">{c.url.replace(/^https:\/\/(www\.)?eldorado\.gg/, '')}</span><span className="ml-auto shrink-0 text-fg-3">{ago(c.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function BackupPanel({ onImported }: { onImported: () => void }) {
  const { busy, run } = useAction();
  const importFile = (file: File) => run('import', async () => {
    let body: unknown;
    try { body = JSON.parse(await file.text()); } catch { throw new Error("That file isn't a settings file"); }
    const r = await api<{ imported: string[] }>('/settings/import', { body });
    onImported();
    return r;
  }, 'Settings loaded');
  return (
    <Section className="xl:col-span-2" title={<span className="flex items-center gap-2"><Archive size={16} /> Backup &amp; restore</span>}
      subtitle="Your settings are saved on this PC (server\data) and kept when you update. Keep an extra copy here, or move them to another PC or a server.">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="well p-4">
          <div className="text-[14px] font-semibold">Save settings to a file</div>
          <p className="mt-1 text-[12.5px] text-fg-3">Bot behavior, prices, auto-chat messages, fees and Discord. Not the Eldorado API keys (reconnect them from the extension).</p>
          <a href="/api/settings/export" download><Button className="mt-3" icon={<Download size={15} />}>Download settings</Button></a>
        </div>
        <div className="well p-4">
          <div className="text-[14px] font-semibold">Load settings from a file</div>
          <p className="mt-1 text-[12.5px] text-fg-3">Replaces the current settings with the ones in the file. Orders, workers and money are not touched.</p>
          <label className="mt-3 inline-block">
            <input type="file" accept=".json,application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f && confirm('Replace your current settings with this file?')) importFile(f); }} />
            <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[7px] border border-white/[.08] bg-white/[.04] px-4 text-[14px] font-semibold hover:bg-white/[.07]">
              {busy === 'import' ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Upload size={15} />}Choose file
            </span>
          </label>
        </div>
        <div className="well p-4">
          <div className="text-[14px] font-semibold">Full backup</div>
          <p className="mt-1 text-[12.5px] text-fg-3">Everything (orders, workers, money, settings) is copied to server\data\backups once a day automatically. Make one now:</p>
          <Button className="mt-3" icon={<Archive size={15} />} loading={busy === 'backup'} onClick={() => run('backup', () => api('/settings/backup', { method: 'POST' }), 'Backup saved in server\\data\\backups')}>Back up now</Button>
        </div>
      </div>
    </Section>
  );
}

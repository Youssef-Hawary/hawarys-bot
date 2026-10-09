import { useState } from 'react';
import { Download, KeyRound, PlugZap, Trash2 } from 'lucide-react';
import { api, useData } from '../api.ts';
import { Badge, Button, Field, Section, useAction } from './ui.tsx';

type Info = { version: string; desktop: boolean; hasKey: boolean; keyLast4: string | null; keyUrl: string };
type Check = { ok: true; latest: string; current: string; newer: boolean } | { ok: false; error: string; kind: string };

/** Settings → Updates: the GitHub key the bot uses to download its own updates from the private repo. */
export function UpdatesPanel({ className }: { className?: string }) {
  const { data, reload } = useData<Info>('/updates');
  const [key, setKey] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [restarting, setRestarting] = useState(false);
  const { busy, run } = useAction();
  if (!data) return null;

  const saveKey = (value: string) => run('key', async () => {
    const r = await api<{ check: Check | null }>('/updates/key', { method: 'PUT', body: { key: value } });
    setKey('');
    setCheck(r.check);
    await reload();
    if (r.check && !r.check.ok) throw new Error(r.check.error);
  }, value ? 'Key saved. It works ✓' : 'Key removed');

  const checkNow = () => run('check', async () => {
    const r = await api<Check>('/updates/check', { method: 'POST' });
    setCheck(r);
    if (!r.ok) throw new Error(r.error);
  });

  const restart = () => run('restart', async () => {
    await api('/updates/restart', { method: 'POST' });
    setRestarting(true);
  }, 'Restarting… the dashboard comes back in about a minute');

  return (
    <Section className={className} title={<span className="flex items-center gap-2"><Download size={16} /> Updates</span>}
      subtitle="The bot updates itself from your private GitHub repo when it starts. For that it needs a read-only GitHub key, once.">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 text-sm text-fg-2">
          <div className="flex flex-wrap items-center gap-2">
            This bot: <b className="text-fg">v{data.version}</b>
            {data.hasKey ? <Badge tone="ok">Key saved (…{data.keyLast4})</Badge> : <Badge tone="warn">No key: updates are off</Badge>}
          </div>
          {!data.hasKey && (
            <ol className="list-inside list-decimal space-y-1.5">
              <li><a className="font-semibold text-neon underline" href={data.keyUrl} target="_blank" rel="noreferrer">Open GitHub's key page</a> (log in if it asks).</li>
              <li>Under <b>Repository access</b> pick <b>Only select repositories</b> → <b>hawarys-bot</b>.</li>
              <li>Scroll down, click <b>Generate token</b>, then <b>copy</b> it (starts with <code className="text-neon">github_pat_</code>).</li>
              <li>Paste it here and click <b>Save</b>.</li>
            </ol>
          )}
          <Field label={data.hasKey ? 'Replace the key' : 'GitHub key'}>
            <div className="flex gap-2">
              <input className="field font-mono text-[13px]" type="password" autoComplete="off" placeholder="github_pat_…" value={key} onChange={e => setKey(e.target.value)} />
              <Button variant="primary" icon={<KeyRound size={15} />} loading={busy === 'key'} disabled={!key.trim()} onClick={() => saveKey(key.trim())}>Save</Button>
            </div>
          </Field>
        </div>

        <div className="well space-y-3 p-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Button icon={<PlugZap size={15} />} loading={busy === 'check'} onClick={checkNow}>Check for updates</Button>
            {data.hasKey && (
              <Button variant="ghost" icon={<Trash2 size={14} />} loading={busy === 'key' && !key}
                onClick={() => { if (confirm('Remove the GitHub key? Updates stop until you add one again.')) saveKey(''); }}>Remove key</Button>
            )}
          </div>
          {check?.ok && !check.newer && <p className="text-ok">✓ Up to date (v{check.latest} is the newest).</p>}
          {check?.ok && check.newer && (
            <div className="space-y-2">
              <p><b className="text-neon">v{check.latest}</b> is ready. It installs the next time the bot starts.</p>
              {data.desktop && (
                <Button variant="primary" icon={<Download size={15} />} loading={busy === 'restart'} disabled={restarting} onClick={restart}>
                  {restarting ? 'Restarting…' : 'Restart and update now'}
                </Button>
              )}
            </div>
          )}
          {check && !check.ok && <p className="text-bad">{check.error}</p>}
          {!check && <p className="text-fg-3">Check to see whether a newer version is waiting.</p>}
        </div>
      </div>
    </Section>
  );
}

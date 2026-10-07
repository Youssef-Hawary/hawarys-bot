import { useEffect, useRef, useState } from 'react';
import { Save, Plus, Trash2, FlaskConical, Inbox, ImagePlus } from 'lucide-react';
import { api, ago, useData } from '../api.ts';
import { Badge, Button, Card, Field, Num, PageHeader, Section, Toggle, clsx, useAction } from '../components/ui.tsx';

const VARS = [{ v: '{name}', label: 'Buyer name' }, { v: '{price}', label: 'Your offer price' }, { v: '{time}', label: 'Delivery time' }];

function MessageBox({ value, onChange, vars = VARS }: { value: string; onChange: (v: string) => void; vars?: typeof VARS }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (v: string) => {
    const el = ref.current!;
    const [s, e] = [el.selectionStart, el.selectionEnd];
    onChange(value.slice(0, s) + v + value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + v.length, s + v.length); });
  };
  return (
    <div>
      <textarea ref={ref} rows={4} className="field resize-y font-mono text-[13.5px] leading-relaxed" value={value} onChange={e => onChange(e.target.value)} />
      <div className="mt-2 flex flex-wrap gap-2">
        {vars.map(x => (
          <button key={x.v} type="button" onClick={() => insert(x.v)} className="rounded-[5px] border border-white/10 bg-white/[.04] px-2 py-0.5 font-mono text-[12px] hover:border-neon/40 hover:text-neon">
            <span className="font-mono font-bold text-neon">{x.v}</span> <span className="text-fg-3">{x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AutoChat() {
  const { data, reload } = useData<any>('/messages');
  const { data: an } = useData<any>('/analytics?days=30');
  const { data: outbox } = useData<any[]>('/outbox', ['outbox']);
  const [m, setM] = useState<any>(null);
  const { busy, run } = useAction();
  useEffect(() => { if (data && !m) setM(structuredClone(data)); }, [data, m]);
  if (!m) return <><PageHeader title="Auto-chat" /><div className="skeleton h-96" /></>;

  const dirty = JSON.stringify(m) !== JSON.stringify(data);
  const set = (fn: (x: any) => void) => setM((p: any) => { const n = structuredClone(p); fn(n); return n; });
  const stats = (id: string) => an?.variants?.find((v: any) => v.variant === id);
  const nameOnly = VARS.slice(0, 1);

  return (
    <>
      <PageHeader title="Auto-chat" subtitle="Messages the bot sends for you. The opening message goes out with each offer; the rest are sent in Eldorado chat by the extension."
        actions={<Button variant="primary" icon={<Save size={15} />} disabled={!dirty} loading={busy === 'save'}
          onClick={() => run('save', async () => { await api('/messages', { method: 'PUT', body: m }); await reload(); }, 'Messages saved')}>Save</Button>} />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Section title="Opening message · A/B test" subtitle="Sent in the buyer's chat right after every offer. With 2+ enabled, the bot picks one at random and tracks which wins more buyers."
            actions={<Button size="sm" icon={<Plus size={14} />} onClick={() => set(x => { x.openers.push({ id: String.fromCharCode(65 + x.openers.length), enabled: true, text: '' }); })}>Add variant</Button>}>
            <div className="space-y-4">
              {m.openers.map((o: any, i: number) => {
                const s = stats(o.id);
                const rate = s?.sent ? Math.round((s.won / s.sent) * 100) : null;
                return (
                  <div key={o.id} className={clsx('well p-4', !o.enabled && 'opacity-50')}>
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-neon/15 font-black text-neon">{o.id}</span>
                      <Toggle checked={o.enabled} onChange={v => set(x => { x.openers[i].enabled = v; })} />
                      {s && <Badge tone="neon"><FlaskConical size={11} /> {s.sent} sent · {s.won} won · {rate}%</Badge>}
                      {m.openers.length > 1 && <Button variant="ghost" size="sm" className="ml-auto" aria-label="Delete variant" onClick={() => set(x => { x.openers.splice(i, 1); })}><Trash2 size={14} /></Button>}
                    </div>
                    <MessageBox value={o.text} onChange={v => set(x => { x.openers[i].text = v; })} />
                  </div>
                );
              })}
            </div>
          </Section>

          <OpenerImages />

          <Section title="Follow-up" subtitle="One nudge if the buyer hasn't picked anyone yet. Not sent if the buyer answers in chat, the request is won/lost, or it's more than 12h late."
            actions={<Toggle checked={m.followUp.enabled} onChange={v => set(x => { x.followUp.enabled = v; })} />}>
            <div className={clsx('space-y-3', !m.followUp.enabled && 'opacity-50')}>
              <Field label="Wait before sending (minutes)" className="max-w-[220px]"><Num value={m.followUp.delayMinutes} onChange={v => set(x => { x.followUp.delayMinutes = v; })} /></Field>
              <MessageBox value={m.followUp.text} onChange={v => set(x => { x.followUp.text = v; })} />
            </div>
          </Section>

          {([['accepted', 'Order accepted (Solo)', 'The moment a solo order is created: ask for the account login.'],
             ['acceptedDuo', 'Order accepted (Duo)', 'The moment a duo order is created: ask for the buyer\'s in-game username instead.'],
             ['delivered', 'Order delivered', 'When someone marks the order delivered (here or on Eldorado).'],
             ['received', 'Order received', 'When the buyer confirms. The best time to ask for a review.']] as const).map(([key, title, sub]) => (
            <Section key={key} title={title} subtitle={sub} actions={<Toggle checked={m[key].enabled} onChange={v => set(x => { x[key].enabled = v; })} />}>
              <div className={clsx(!m[key].enabled && 'opacity-50')}>
                <MessageBox value={m[key].text} onChange={v => set(x => { x[key].text = v; })} vars={key === 'accepted' || key === 'acceptedDuo' ? VARS.slice(0, 2) : nameOnly} />
              </div>
            </Section>
          ))}
        </div>

        <Card className="self-start overflow-hidden xl:sticky xl:top-20">
          <div className="border-b border-white/[.06] px-5 py-3.5"><h3 className="font-bold text-neon">Message queue</h3><p className="text-[13px] text-fg-3">Sent by the extension in Eldorado chat</p></div>
          <div className="max-h-[560px] space-y-2 overflow-y-auto p-4">
            {!outbox?.length && <div className="grid place-items-center gap-2 py-10 text-center text-[13px] text-fg-3"><Inbox />Nothing queued yet</div>}
            {outbox?.map(it => (
              <div key={it.id} className="well p-3">
                <div className="flex items-center gap-2 text-[12px]">
                  <Badge tone={it.status === 'sent' ? 'ok' : it.status === 'pending' ? 'warn' : it.status === 'failed' ? 'bad' : 'muted'}>{it.status}</Badge>
                  <span className="font-semibold capitalize">{it.kind.replace('_', ' ')}</span>
                  {it.image && <Badge tone="muted">+ image</Badge>}
                  <span className="ml-auto text-fg-3">{ago(it.created_at)}</span>
                </div>
                <p className="mt-1.5 line-clamp-3 text-[13px] text-fg-2">{it.text}</p>
                {it.error && <p className="mt-1 text-[12px] text-bad">{it.error}</p>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

const IMAGE_GAMES = [{ id: 'valorant', name: 'Valorant', color: 'text-valo' }, { id: 'lol', name: 'League of Legends', color: 'text-lol' }] as const;

/** One picture per game, sent in the chat right after the opening message (e.g. proof of rank, reviews). */
function OpenerImages() {
  const { data, reload } = useData<Record<string, { name: string; size: number; updated_at: number } | null>>('/messages/images', ['messages']);
  const { busy, run } = useAction();
  const upload = (game: string, file: File) => run(`up-${game}`, async () => {
    if (file.size > 5 * 1024 * 1024) throw new Error('Image is too big (max 5 MB)');
    const res = await fetch(`/api/messages/images/${game}`, {
      method: 'PUT', credentials: 'same-origin', body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': file.name.replace(/[^\w.\- ]/g, '') },
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? `Upload failed (${res.status})`);
    await reload();
  }, 'Image saved. It goes out with the next opener.');
  const remove = (game: string) => run(`rm-${game}`, async () => { await api(`/messages/images/${game}`, { method: 'DELETE' }); await reload(); }, 'Image removed');

  return (
    <Section title="Opening image" subtitle="One picture per game, sent in the chat right after the opening message. PNG, JPG, WEBP or GIF, up to 5 MB. Saved right away (no Save button needed).">
      <div className="grid gap-4 md:grid-cols-2">
        {IMAGE_GAMES.map(g => {
          const img = data?.[g.id];
          return (
            <div key={g.id} className="well overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[.05] px-3 py-2">
                <span className={clsx('text-[12px] font-black uppercase tracking-[.12em]', g.color)}>{g.name}</span>
                {img && <span className="text-[11.5px] text-fg-3">{Math.round(img.size / 1024)} KB · {ago(img.updated_at)}</span>}
              </div>
              <div className="grid h-44 place-items-center bg-black/30">
                {img
                  ? <img src={`/api/messages/images/${g.id}/file?v=${img.updated_at}`} alt={`${g.name} opener image`} className="max-h-44 max-w-full object-contain" />
                  : <span className="flex flex-col items-center gap-1 text-[12.5px] text-fg-3"><ImagePlus size={22} />No image: only the text is sent</span>}
              </div>
              <div className="flex gap-2 p-3">
                <label className="flex-1">
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(g.id, f); }} />
                  <span className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-[7px] border border-white/[.08] bg-white/[.04] text-[13px] font-semibold hover:bg-white/[.07]">
                    {busy === `up-${g.id}` ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ImagePlus size={14} />}
                    {img ? 'Replace image' : 'Upload image'}
                  </span>
                </label>
                {img && <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} loading={busy === `rm-${g.id}`} onClick={() => remove(g.id)}>Remove</Button>}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

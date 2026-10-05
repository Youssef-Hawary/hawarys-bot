import { useEffect, useRef, useState } from 'react';
import { Save, Plus, Trash2, FlaskConical, Inbox } from 'lucide-react';
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
          <button key={x.v} type="button" onClick={() => insert(x.v)} className="rounded-full bg-white/[.05] px-2.5 py-1 text-[12px] ring-1 ring-white/10 hover:bg-neon/10 hover:ring-neon/40">
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
          <Section title="Opening message · A/B test" subtitle="Sent with every offer. With 2+ enabled, the bot picks one at random and tracks which wins more buyers."
            actions={<Button size="sm" icon={<Plus size={14} />} onClick={() => set(x => { x.openers.push({ id: String.fromCharCode(65 + x.openers.length), enabled: true, text: '' }); })}>Add variant</Button>}>
            <div className="space-y-4">
              {m.openers.map((o: any, i: number) => {
                const s = stats(o.id);
                const rate = s?.sent ? Math.round((s.won / s.sent) * 100) : null;
                return (
                  <div key={o.id} className={clsx('rounded-2xl p-4 ring-1', o.enabled ? 'bg-white/[.02] ring-white/[.07]' : 'opacity-50 ring-white/[.04]')}>
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

          <Section title="Follow-up" subtitle="One nudge if the buyer hasn't picked anyone yet. Dropped automatically if the request is won/lost or it's more than 12h late."
            actions={<Toggle checked={m.followUp.enabled} onChange={v => set(x => { x.followUp.enabled = v; })} />}>
            <div className={clsx('space-y-3', !m.followUp.enabled && 'opacity-50')}>
              <Field label="Wait before sending (minutes)" className="max-w-[220px]"><Num value={m.followUp.delayMinutes} onChange={v => set(x => { x.followUp.delayMinutes = v; })} /></Field>
              <MessageBox value={m.followUp.text} onChange={v => set(x => { x.followUp.text = v; })} />
            </div>
          </Section>

          {([['accepted', 'Order accepted', 'The moment the buyer accepts and the order is created.'],
             ['delivered', 'Order delivered', 'When someone marks the order delivered (here or on Eldorado).'],
             ['received', 'Order received', 'When the buyer confirms. The best time to ask for a review.']] as const).map(([key, title, sub]) => (
            <Section key={key} title={title} subtitle={sub} actions={<Toggle checked={m[key].enabled} onChange={v => set(x => { x[key].enabled = v; })} />}>
              <div className={clsx(!m[key].enabled && 'opacity-50')}>
                <MessageBox value={m[key].text} onChange={v => set(x => { x[key].text = v; })} vars={key === 'accepted' ? VARS.slice(0, 2) : nameOnly} />
              </div>
            </Section>
          ))}
        </div>

        <Card className="self-start overflow-hidden xl:sticky xl:top-20">
          <div className="border-b border-white/[.06] px-5 py-3.5"><h3 className="font-bold text-neon">Message queue</h3><p className="text-[13px] text-fg-3">Sent by the extension in Eldorado chat</p></div>
          <div className="max-h-[560px] space-y-2 overflow-y-auto p-4">
            {!outbox?.length && <div className="grid place-items-center gap-2 py-10 text-center text-[13px] text-fg-3"><Inbox />Nothing queued yet</div>}
            {outbox?.map(it => (
              <div key={it.id} className="rounded-xl bg-white/[.03] p-3 ring-1 ring-white/[.05]">
                <div className="flex items-center gap-2 text-[12px]">
                  <Badge tone={it.status === 'sent' ? 'ok' : it.status === 'pending' ? 'warn' : it.status === 'failed' ? 'bad' : 'muted'}>{it.status}</Badge>
                  <span className="font-semibold capitalize">{it.kind.replace('_', ' ')}</span>
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

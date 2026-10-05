import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ago, useData } from '../api.ts';
import { Card, PageHeader, Section, Toggle } from '../components/ui.tsx';
import { Console } from '../components/Console.tsx';
import { useMe } from '../components/Shell.tsx';

const ACTION_TEXT: Record<string, string> = {
  'auth.login': 'logged in', 'extension.login': 'connected the extension', 'bot.start': 'started the bot', 'bot.stop': 'stopped the bot',
  'order.take': 'took an order', 'order.release': 'gave back an order', 'order.assign': 'assigned an order', 'order.deliver': 'delivered an order',
  'order.cancel': 'canceled an order', 'order.extend': 'extended a deadline', 'order.pay_override': 'changed order pay', 'pricing.save': 'changed pricing',
  'pricing.reset': 'reset pricing', 'messages.save': 'changed auto-chat messages', 'team.add': 'added a worker', 'team.update': 'edited a teammate',
  'team.payout': 'recorded a payout', 'buyer.update': 'updated a buyer', 'settings.save': 'changed settings', 'setup.owner_created': 'set up the dashboard',
};

export function Activity() {
  const me = useMe();
  const [hide, setHide] = useState(false);
  const { data: audit } = useData<any[]>(me.role === 'owner' ? '/audit' : null, ['orders', 'pricing', 'bot']);

  return (
    <>
      <PageHeader title="Activity" subtitle="The bot's console and a record of who did what." />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Section title="Console" actions={<Toggle checked={hide} onChange={setHide} label={<span className="text-[13px]">Hide skipped</span>} />}>
          <Console height={560} limit={600} hideSkipped={hide} />
        </Section>
        {me.role === 'owner' ? (
          <Section title="Audit log" subtitle="Owner only">
            <div className="max-h-[560px] divide-y divide-white/[.05] overflow-y-auto pr-1">
              {(audit ?? []).map(a => {
                let d: any = null; try { d = a.details ? JSON.parse(a.details) : null; } catch { /* ignore */ }
                return (
                  <div key={a.id} className="flex gap-3 py-2.5 text-sm">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0 text-neon" />
                    <div className="min-w-0">
                      <span className="font-semibold">{a.user ?? 'System'}</span> <span className="text-fg-2">{ACTION_TEXT[a.action] ?? a.action}</span>
                      {d?.title && <div className="truncate text-[12px] text-fg-3">{d.title}{d.to ? ` → ${d.to}` : ''}</div>}
                      {d?.game && <div className="text-[12px] text-fg-3">{d.game}</div>}
                      {d?.amount != null && <div className="text-[12px] text-fg-3">${d.amount}</div>}
                    </div>
                    <span className="ml-auto shrink-0 text-[12px] text-fg-3">{ago(a.ts)}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        ) : <Card className="p-6 text-sm text-fg-3">The full audit log is visible to the owner.</Card>}
      </div>
    </>
  );
}

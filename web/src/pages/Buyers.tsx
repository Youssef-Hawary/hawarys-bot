import { useMemo, useState } from 'react';
import { Search, Ban, StickyNote, Contact } from 'lucide-react';
import { api, ago, useData, usd } from '../api.ts';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Toggle, clsx, useAction } from '../components/ui.tsx';
import { useMe } from '../components/Shell.tsx';

export function Buyers() {
  const me = useMe();
  const { data, reload } = useData<any[]>('/buyers', ['orders']);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  const rows = useMemo(() => (data ?? []).filter(b => b.username?.toLowerCase().includes(q.toLowerCase())), [data, q]);

  return (
    <>
      <PageHeader title="Buyers" subtitle="Repeat customers, notes, and a blacklist. Blacklisting also mutes them on Eldorado so their requests stop."
        actions={<div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" /><input className="field !w-64 !pl-9" placeholder="Search buyer…" value={q} onChange={e => setQ(e.target.value)} /></div>} />
      <Card className="overflow-hidden">
        {!rows.length ? <Empty icon={<Contact />} title="No buyers yet" text="Buyers show up here once they post requests or order." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="text-left text-[12px] uppercase tracking-wider text-fg-3">
                <tr>{['Buyer', 'Orders', 'Requests', me.role === 'owner' ? 'Spent' : null, 'Last order', 'Note', ''].filter(Boolean).map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(b => (
                  <tr key={b.username} className={clsx('border-t border-white/[.04] hover:bg-white/[.02]', b.blacklisted && 'bg-bad/[.04]')}>
                    <td className="px-4 py-3 font-semibold">{b.username} {b.blacklisted ? <Badge tone="bad" className="ml-1"><Ban size={11} /> Blacklisted</Badge> : b.orders > 1 ? <Badge tone="ok" className="ml-1">Repeat</Badge> : null}</td>
                    <td className="px-4 py-3">{b.orders}</td>
                    <td className="px-4 py-3 text-fg-3">{b.requests}</td>
                    {me.role === 'owner' && <td className="px-4 py-3 font-bold">{usd(b.spent)}</td>}
                    <td className="px-4 py-3 text-fg-3">{b.last_order ? ago(b.last_order) : '–'}</td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-fg-2">{b.note ?? ''}</td>
                    <td className="px-4 py-3"><Button size="sm" variant="ghost" icon={<StickyNote size={13} />} onClick={() => setEdit({ ...b, note: b.note ?? '' })}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.username ?? ''}>
        {edit && (
          <div className="space-y-4">
            <Field label="Note (visible to the team)"><textarea rows={3} className="field" value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} /></Field>
            <Toggle checked={!!edit.blacklisted} onChange={v => setEdit({ ...edit, blacklisted: v ? 1 : 0 })} label="Blacklist" hint="The bot skips their requests and mutes them on Eldorado" />
            <Button variant="primary" className="w-full" loading={busy === 'b'} onClick={async () => {
              if (await run('b', () => api(`/buyers/${encodeURIComponent(edit.username)}`, { method: 'PUT', body: { note: edit.note, blacklisted: !!edit.blacklisted } }), 'Saved')) { setEdit(null); reload(); }
            }}>Save</Button>
          </div>
        )}
      </Modal>
    </>
  );
}

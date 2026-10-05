import { useEffect, useMemo, useState } from 'react';
import { Hand, PackageCheck, Timer, UserRound, Undo2, XCircle, Inbox, CheckCheck, Truck, Flame, MoreHorizontal } from 'lucide-react';
import { api, timeLeft, useData, usd, ago } from '../api.ts';
import { Avatar, Badge, Button, Card, Field, GameBadge, Modal, PageHeader, Tabs, Toggle, clsx, useAction } from '../components/ui.tsx';
import { useMe } from '../components/Shell.tsx';

type Order = {
  id: string; game: string | null; title: string; buyer: string; price: number; state: string; created_at: number; deadline: number | null;
  assignee: { id: number; name: string; color: string } | null; workerPay: number | null; divisions: number | null; delivered_at: number | null;
};

const COLUMNS = [
  { id: 'open', title: 'Up for grabs', icon: Flame, tone: '#F87171', test: (o: Order) => o.state === 'Paid' && !o.assignee },
  { id: 'progress', title: 'In progress', icon: Timer, tone: '#38C6F4', test: (o: Order) => o.state === 'Paid' && !!o.assignee },
  { id: 'delivered', title: 'Delivered', icon: Truck, tone: '#A78BFA', test: (o: Order) => o.state === 'Delivered' },
  { id: 'done', title: 'Completed', icon: CheckCheck, tone: '#34D399', test: (o: Order) => ['Received', 'Completed'].includes(o.state) },
];

const CANCEL_REASONS = ['Buyer_Did_Not_Respond', 'Buyer_Provided_Incorrect_Account_Information', 'Boost_Couldnt_Be_Completed_Due_To_Account_Issues',
  'Failed_To_Meet_Timeline', 'Buyer_Does_Not_Need_It_Anymore', 'Mutual_Agreement', 'No_Sellers_Available', 'Seller_Going_Offline', 'Other'];
const EXTEND_TIMES = ['Minute30', 'Hour1', 'Hour3', 'Hour6'];
const EXTEND_REASONS = ['WaitingForBuyer', 'InGameCoordination', 'PreparationDelay', 'TechnicalIssue'];
const human = (s: string) => s.replace(/_/g, ' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2');

export function Board() {
  const me = useMe();
  const owner = me.role === 'owner';
  const { data, reload } = useData<Order[]>('/orders', ['orders']);
  const { data: team } = useData<any[]>('/team');
  const [, tick] = useState(0);
  const [mine, setMine] = useState(false);
  const [game, setGame] = useState<'all' | 'valorant' | 'lol'>('all');
  const [open, setOpen] = useState<Order | null>(null);
  const { busy, run } = useAction();

  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 30_000); return () => clearInterval(i); }, []);

  const orders = useMemo(() => (data ?? []).filter(o => (!mine || o.assignee?.id === me.id) && (game === 'all' || o.game === game)), [data, mine, game, me.id]);
  const act = (key: string, path: string, body: unknown, msg: string) => run(key, async () => { await api(path, { body }); await reload(); }, msg);

  return (
    <>
      <PageHeader title="Order board" subtitle="Take an order to make it yours. Everyone sees who is working on what."
        actions={<>
          <Tabs value={game} onChange={setGame} tabs={[{ id: 'all', label: 'All' }, { id: 'valorant', label: 'Valorant' }, { id: 'lol', label: 'LoL' }]} />
          <div className="rounded-[8px] border border-white/[.07] bg-black/30 px-3 py-0.5"><Toggle checked={mine} onChange={setMine} label={<span className="text-[13px]">Only mine</span>} /></div>
        </>} />

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {COLUMNS.map(col => {
          const items = orders.filter(col.test).sort((a, b) => col.id === 'done' || col.id === 'delivered' ? b.created_at - a.created_at : (a.deadline ?? 9e15) - (b.deadline ?? 9e15));
          const shown = col.id === 'done' ? items.slice(0, 20) : items;
          return (
            <div key={col.id} className="flex min-h-[200px] flex-col rounded-[10px] border border-white/[.06] bg-ink-900/80 p-2.5">
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className="h-3 w-[3px] rounded-sm" style={{ background: col.tone }} />
                <span className="text-[12px] font-bold uppercase tracking-[.12em]">{col.title}</span>
                <span className="num ml-auto rounded-[5px] border border-white/[.08] bg-black/30 px-1.5 text-[12px] text-fg-2">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {shown.map(o => {
                    const left = timeLeft(o.deadline);
                    const isMine = o.assignee?.id === me.id;
                    return (
                      <div key={o.id}>
                        <Card hover className={clsx('cursor-pointer p-3.5', isMine && '!border-neon/45')} onClick={() => setOpen(o)}>
                          <div className="flex items-center justify-between gap-2">
                            <GameBadge game={o.game} />
                            <span className="num text-[15px] font-semibold">{usd(o.price)}</span>
                          </div>
                          <div className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug">{o.title.replace(/^.*? - /, '')}</div>
                          <div className="mt-1 text-[12px] text-fg-3">by {o.buyer} · {ago(o.created_at)}</div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            {o.assignee
                              ? <span className="flex items-center gap-1.5 text-[13px] font-semibold"><Avatar name={o.assignee.name} color={o.assignee.color} size={22} />{isMine ? 'You' : o.assignee.name}</span>
                              : <span className="text-[13px] text-fg-3">Nobody yet</span>}
                            {o.state === 'Paid' && <Badge tone={left.tone === 'muted' ? 'muted' : left.tone}><Timer size={11} /> {left.text}</Badge>}
                            {o.workerPay != null && o.state !== 'Paid' && <Badge tone="ok">+{usd(o.workerPay)}</Badge>}
                          </div>
                          {o.state === 'Paid' && !o.assignee && (
                            <Button variant="primary" size="sm" className="mt-3 w-full" icon={<Hand size={14} />} loading={busy === `take-${o.id}`}
                              onClick={e => { e.stopPropagation(); act(`take-${o.id}`, `/orders/${o.id}/take`, {}, 'Order assigned to you'); }}>
                              Take it
                            </Button>
                          )}
                        </Card>
                      </div>
                    );
                  })}
                {items.length === 0 && <div className="grid place-items-center gap-1 py-8 text-[13px] text-fg-3"><Inbox size={20} />Nothing here</div>}
              </div>
            </div>
          );
        })}
      </div>

      <OrderModal order={open} onClose={() => setOpen(null)} owner={owner} meId={me.id} team={team ?? []} busy={busy}
        act={async (key, path, body, msg) => { const ok = await act(key, path, body, msg); if (ok) setOpen(null); }} />
    </>
  );
}

function OrderModal({ order: o, onClose, owner, meId, team, busy, act }: {
  order: Order | null; onClose: () => void; owner: boolean; meId: number; team: any[]; busy: string | null;
  act: (key: string, path: string, body: unknown, msg: string) => Promise<void>;
}) {
  const [panel, setPanel] = useState<'none' | 'cancel' | 'extend'>('none');
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [message, setMessage] = useState('');
  const [ext, setExt] = useState({ time: 'Hour1', reason: 'WaitingForBuyer' });
  const [assignTo, setAssignTo] = useState('');
  useEffect(() => { setPanel('none'); setMessage(''); setAssignTo(''); }, [o?.id]);
  if (!o) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const mine = o.assignee?.id === meId;
  const canAct = owner || mine || !o.assignee;
  const left = timeLeft(o.deadline);

  return (
    <Modal open={!!o} onClose={onClose} title={<span className="flex items-center gap-2"><GameBadge game={o.game} /> Order</span>} width={540}>
      <div className="text-lg font-bold leading-snug">{o.title}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <Info label="Buyer" value={o.buyer} />
        <Info label="Price" value={usd(o.price)} />
        <Info label="Status" value={o.state} />
        <Info label="Deadline" value={o.deadline ? <span className={clsx(left.tone === 'bad' && 'text-bad', left.tone === 'warn' && 'text-warn')}>{left.text}</span> : '–'} />
        <Info label="Worker" value={o.assignee ? o.assignee.name : 'Unassigned'} />
        {o.workerPay != null && <Info label={mine ? 'You earn' : 'Worker pay'} value={<span className="text-ok">{usd(o.workerPay)}</span>} />}
      </div>

      {o.state === 'Paid' && canAct && (
        <div className="mt-5 flex flex-wrap gap-2">
          {!o.assignee && <Button variant="primary" icon={<Hand size={15} />} loading={busy === 'take'} onClick={() => act('take', `/orders/${o.id}/take`, {}, 'Order is yours')}>Take it</Button>}
          {(mine || owner) && o.assignee && <Button variant="primary" icon={<PackageCheck size={15} />} loading={busy === 'deliver'} onClick={() => act('deliver', `/orders/${o.id}/deliver`, {}, 'Marked as delivered on Eldorado')}>Mark delivered</Button>}
          {(mine || owner) && o.assignee && <Button icon={<Undo2 size={15} />} loading={busy === 'release'} onClick={() => act('release', `/orders/${o.id}/release`, {}, 'Order released')}>Give back</Button>}
          <Button icon={<Timer size={15} />} onClick={() => setPanel(panel === 'extend' ? 'none' : 'extend')}>Extend time</Button>
          <Button variant="danger" icon={<XCircle size={15} />} onClick={() => setPanel(panel === 'cancel' ? 'none' : 'cancel')}>Cancel</Button>
        </div>
      )}

      {owner && o.state === 'Paid' && (
        <div className="mt-4 flex items-end gap-2">
          <Field label={<span className="flex items-center gap-1"><UserRound size={13} /> {o.assignee ? 'Reassign to' : 'Assign to'}</span>} className="flex-1">
            <select className="field" value={assignTo} onChange={e => setAssignTo(e.target.value)}>
              <option value="">Choose a teammate…</option>
              {team.filter(u => u.active !== 0 && u.id !== o.assignee?.id).map(u => <option key={u.id} value={u.id}>{u.display_name ?? u.name}</option>)}
            </select>
          </Field>
          <Button disabled={!assignTo} loading={busy === 'assign'} onClick={() => act('assign', `/orders/${o.id}/assign`, { userId: Number(assignTo) }, 'Order reassigned')}>Assign</Button>
        </div>
      )}

      {panel === 'cancel' && (
          <div>
            <div className="mt-4 space-y-3 rounded-[8px] border border-bad/25 bg-bad/[.05] p-4">
              <Field label="Reason (sent to Eldorado)">
                <select className="field" value={reason} onChange={e => setReason(e.target.value)}>{CANCEL_REASONS.map(r => <option key={r} value={r}>{human(r)}</option>)}</select>
              </Field>
              <Field label="Message to buyer (optional)"><input className="field" value={message} onChange={e => setMessage(e.target.value)} /></Field>
              <Button variant="danger" className="w-full" loading={busy === 'cancel'} onClick={() => act('cancel', `/orders/${o.id}/cancel`, { reason, message }, 'Order canceled')}>Yes, cancel this order on Eldorado</Button>
            </div>
          </div>
        )}
        {panel === 'extend' && (
          <div>
            <div className="well mt-4 grid grid-cols-2 gap-3 p-4">
              <Field label="Add time"><select className="field" value={ext.time} onChange={e => setExt({ ...ext, time: e.target.value })}>{EXTEND_TIMES.map(t => <option key={t} value={t}>{human(t)}</option>)}</select></Field>
              <Field label="Reason"><select className="field" value={ext.reason} onChange={e => setExt({ ...ext, reason: e.target.value })}>{EXTEND_REASONS.map(t => <option key={t} value={t}>{human(t)}</option>)}</select></Field>
              <Button className="col-span-2" loading={busy === 'extend'} onClick={() => act('extend', `/orders/${o.id}/extend`, ext, 'Delivery time extended')}>Extend on Eldorado</Button>
            </div>
          </div>
        )}
      {o.state !== 'Paid' && <p className="mt-5 flex items-center gap-2 text-[13px] text-fg-3"><MoreHorizontal size={14} /> This order is {o.state.toLowerCase()}; nothing left to do.</p>}
    </Modal>
  );
}

const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="well px-3 py-2">
    <div className="text-[12px] text-fg-3">{label}</div>
    <div className="font-semibold">{value}</div>
  </div>
);

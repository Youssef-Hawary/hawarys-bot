import { useState } from 'react';
import { motion } from 'motion/react';
import { UserPlus, Pencil, HandCoins, History } from 'lucide-react';
import { api, useData, usd } from '../api.ts';
import { Avatar, Badge, Button, Card, Field, Modal, Num, PageHeader, Toggle, clsx, useAction } from '../components/ui.tsx';

const PAY_TYPES = [
  { id: 'percent', label: '% of each order', unit: '%', hint: 'Percent of the order price after Eldorado’s fee' },
  { id: 'per_division', label: 'Per division', unit: '$', hint: 'Fixed amount for each division boosted' },
  { id: 'fixed', label: 'Fixed per order', unit: '$', hint: 'Same amount for every order' },
  { id: 'manual', label: 'Manual', unit: '', hint: 'You type the amount on each order' },
];
const payText = (t: string, v: number) => t === 'percent' ? `${v}% per order` : t === 'per_division' ? `${usd(v)} / division` : t === 'fixed' ? `${usd(v)} / order` : 'Manual';

export function Team() {
  const { data, reload } = useData<any[]>('/team', ['orders']);
  const [edit, setEdit] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const [payout, setPayout] = useState<any | null>(null);
  const [history, setHistory] = useState<{ user: any; rows: any[] } | null>(null);
  const totals = (data ?? []).reduce((a, u) => ({ owed: a.owed + Math.max(u.summary.owed, 0), paid: a.paid + u.summary.paid }), { owed: 0, paid: 0 });

  return (
    <>
      <PageHeader title="Team & pay" subtitle={`You owe the team ${usd(totals.owed)} right now · ${usd(totals.paid)} paid out so far.`}
        actions={<Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setAdding(true)}>Add worker</Button>} />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {(data ?? []).map((u, i) => (
          <motion.div key={u.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .06 }}>
            <Card hover className={clsx('p-5', !u.active && 'opacity-50')}>
              <div className="flex items-center gap-3">
                <Avatar name={u.display_name} color={u.color} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-lg font-bold">{u.display_name}{u.role === 'owner' && <Badge tone="neon">Owner</Badge>}{!u.active && <Badge tone="bad">Disabled</Badge>}</div>
                  <div className="text-[13px] text-fg-3">@{u.username} · {u.role === 'owner' ? 'Keeps the profit' : payText(u.pay_type, u.pay_value)}</div>
                </div>
                <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => setEdit({ ...u, password: '' })}><Pencil size={15} /></Button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Mini label="Orders done" value={u.summary.ordersDone} />
                <Mini label="Active now" value={u.summary.active} />
                <Mini label="Revenue" value={usd(u.summary.revenue, 0)} />
              </div>
              {u.role !== 'owner' && (<>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Mini label="Earned" value={usd(u.summary.earned)} tone="text-ok" />
                  <Mini label="Paid" value={usd(u.summary.paid)} />
                  <Mini label="Owed" value={usd(u.summary.owed)} tone={u.summary.owed > 0 ? 'text-warn' : ''} />
                </div>
                <div className="mt-4 flex gap-2">
                  <Button className="flex-1" variant="primary" size="sm" icon={<HandCoins size={14} />} onClick={() => setPayout({ user: u, amount: Math.max(u.summary.owed, 0), note: '' })}>Record payout</Button>
                  <Button size="sm" variant="soft" icon={<History size={14} />} onClick={async () => setHistory({ user: u, rows: await api(`/team/${u.id}/payouts`) })}>History</Button>
                </div>
              </>)}
            </Card>
          </motion.div>
        ))}
      </div>

      <AddWorker open={adding} onClose={() => setAdding(false)} onDone={reload} />
      <EditWorker user={edit} onClose={() => setEdit(null)} onDone={reload} />
      <PayoutModal state={payout} setState={setPayout} onDone={reload} />
      <Modal open={!!history} onClose={() => setHistory(null)} title={`Payouts · ${history?.user.display_name ?? ''}`}>
        {!history?.rows.length ? <p className="text-sm text-fg-3">No payouts yet.</p> : (
          <div className="max-h-80 divide-y divide-white/[.05] overflow-y-auto">
            {history.rows.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-fg-3">{new Date(p.created_at).toLocaleDateString()} {p.note && `· ${p.note}`}</span><b>{usd(p.amount)}</b>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

const Mini = ({ label, value, tone = '' }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div className="rounded-xl bg-white/[.03] px-2 py-2 ring-1 ring-white/[.05]"><div className={clsx('font-extrabold', tone)}>{value}</div><div className="text-[11px] text-fg-3">{label}</div></div>
);

function PayFields({ v, set }: { v: { payType: string; payValue: number }; set: (p: Partial<{ payType: string; payValue: number }>) => void }) {
  const t = PAY_TYPES.find(p => p.id === v.payType)!;
  return (
    <div className="space-y-3">
      <Field label="How do you pay them?" hint={t.hint}>
        <div className="grid grid-cols-2 gap-2">
          {PAY_TYPES.map(p => (
            <button key={p.id} type="button" onClick={() => set({ payType: p.id })}
              className={clsx('rounded-xl px-3 py-2 text-left text-sm font-semibold ring-1 transition', v.payType === p.id ? 'bg-neon/15 text-neon ring-neon/50' : 'bg-white/[.03] text-fg-2 ring-white/10 hover:ring-white/20')}>{p.label}</button>
          ))}
        </div>
      </Field>
      {v.payType !== 'manual' && <Field label={`Amount (${t.unit})`}><Num value={v.payValue} step={0.5} onChange={n => set({ payValue: n })} /></Field>}
    </div>
  );
}

function AddWorker({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ username: '', displayName: '', password: '', payType: 'percent', payValue: 50 });
  const { busy, run } = useAction();
  return (
    <Modal open={open} onClose={onClose} title="Add a worker">
      <form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (await run('add', () => api('/team', { body: f }), `${f.displayName || f.username} can log in now`)) { onDone(); onClose(); setF({ ...f, username: '', displayName: '', password: '' }); } }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username"><input className="field" required value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></Field>
          <Field label="Display name"><input className="field" value={f.displayName} onChange={e => setF({ ...f, displayName: e.target.value })} /></Field>
        </div>
        <Field label="Password" hint="8+ characters. Send it to them privately."><input className="field" type="text" required minLength={8} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
        <PayFields v={f} set={p => setF({ ...f, ...p })} />
        <Button variant="primary" className="w-full" type="submit" loading={busy === 'add'}>Create account</Button>
      </form>
    </Modal>
  );
}

function EditWorker({ user, onClose, onDone }: { user: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>(null);
  const { busy, run } = useAction();
  if (user && (!f || f.id !== user.id)) setF({ ...user, payType: user.pay_type, payValue: user.pay_value });
  if (!user || !f) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  return (
    <Modal open={!!user} onClose={() => { setF(null); onClose(); }} title={`Edit ${user.display_name}`}>
      <div className="space-y-3">
        <Field label="Display name"><input className="field" value={f.display_name} onChange={e => setF({ ...f, display_name: e.target.value })} /></Field>
        {user.role !== 'owner' && <PayFields v={f} set={p => setF({ ...f, ...p })} />}
        <Field label="Color"><input type="color" className="h-10 w-20 cursor-pointer rounded-lg bg-transparent" value={f.color} onChange={e => setF({ ...f, color: e.target.value })} /></Field>
        <Field label="New password" hint="Leave empty to keep the current one. Changing it logs them out everywhere."><input className="field" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
        {user.role !== 'owner' && <Toggle checked={!!f.active} onChange={v => setF({ ...f, active: v ? 1 : 0 })} label="Account active" hint="Disabled workers can't log in" />}
        <Button variant="primary" className="w-full" loading={busy === 'save'} onClick={async () => {
          const ok = await run('save', () => api(`/team/${user.id}`, { method: 'PUT', body: { display_name: f.display_name, pay_type: f.payType, pay_value: f.payValue, color: f.color, active: f.active, password: f.password || undefined } }), 'Saved');
          if (ok) { onDone(); setF(null); onClose(); }
        }}>Save</Button>
      </div>
    </Modal>
  );
}

function PayoutModal({ state, setState, onDone }: { state: any; setState: (s: any) => void; onDone: () => void }) {
  const { busy, run } = useAction();
  return (
    <Modal open={!!state} onClose={() => setState(null)} title={`Pay ${state?.user.display_name ?? ''}`}>
      {state && (
        <div className="space-y-3">
          <p className="text-sm text-fg-3">Record money you sent them. This only updates the dashboard; it doesn't send money.</p>
          <Field label="Amount (USD)"><Num prefix="$" value={state.amount} step={1} onChange={v => setState({ ...state, amount: v })} /></Field>
          <Field label="Note"><input className="field" placeholder="Vodafone Cash, InstaPay…" value={state.note} onChange={e => setState({ ...state, note: e.target.value })} /></Field>
          <Button variant="primary" className="w-full" loading={busy === 'pay'} onClick={async () => {
            if (await run('pay', () => api(`/team/${state.user.id}/payout`, { body: { amount: state.amount, note: state.note } }), 'Payout recorded')) { setState(null); onDone(); }
          }}>Record {usd(state.amount)}</Button>
        </div>
      )}
    </Modal>
  );
}

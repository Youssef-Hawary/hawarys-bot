import { useEffect, useState } from 'react';
import { ArrowRight, Lock, User } from 'lucide-react';
import { api } from '../api.ts';
import { Logo } from '../components/Shell.tsx';
import { Button } from '../components/ui.tsx';

export function Login({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState(false);
  const [form, setForm] = useState({ username: '', displayName: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<{ needsSetup: boolean }>('/auth/status').then(s => setSetup(s.needsSetup)).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api(setup ? '/auth/setup' : '/auth/login', { body: form });
      onDone();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={60} />
          <h1 className="mt-4 text-[30px] font-extrabold tracking-tight">Hawary's <span className="text-neon">Bot</span></h1>
          <p className="mt-1 text-[11.5px] font-bold uppercase tracking-[.2em] text-fg-3">{setup ? 'First time here. Create the owner account.' : 'Eldorado control'}</p>
        </div>

        <form onSubmit={submit} className="panel space-y-4 p-6">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-fg-2">Username</span>
            <div className="relative"><User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
              <input className="field !pl-9" autoComplete="username" required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></div>
          </label>
          {setup && (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-fg-2">Display name</span>
              <input className="field" placeholder="Hawary" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-fg-2">Password</span>
            <div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
              <input className="field !pl-9" type="password" autoComplete={setup ? 'new-password' : 'current-password'} required minLength={setup ? 8 : undefined}
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
            {setup && <span className="mt-1 block text-[12px] text-fg-3">At least 8 characters.</span>}
          </label>
          {error && <div role="alert" className="rounded-[7px] border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
          <Button variant="primary" className="w-full !h-10" loading={busy} type="submit">
            {setup ? 'Create owner account' : 'Log in'} <ArrowRight size={16} />
          </Button>
        </form>
        <p className="mt-6 text-center text-[12px] text-fg-3">Workers get their login from the owner.</p>
      </div>
    </div>
  );
}

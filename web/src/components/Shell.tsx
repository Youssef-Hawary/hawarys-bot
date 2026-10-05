import { createContext, useContext, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, KanbanSquare, Radar, BadgeDollarSign, MessageSquareText, Users, LineChart, Contact, ScrollText,
  Settings, Wallet, LogOut, Menu, X,
} from 'lucide-react';
import { api, useData } from '../api.ts';
import { Avatar, clsx } from './ui.tsx';

export type Me = { id: number; username: string; name: string; role: 'owner' | 'worker'; color: string };
export const MeCtx = createContext<Me>(null as unknown as Me);
export const useMe = () => useContext(MeCtx);

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8FDDF8" /><stop offset="1" stopColor="#0E9AC9" /></linearGradient></defs>
      <path d="M32 4 56 18v28L32 60 8 46V18Z" fill="#10141B" stroke="#2B3443" strokeWidth="2" strokeLinejoin="round" />
      <path d="M32 4 56 18v28L32 60 8 46V18Z" fill="none" stroke="url(#lg)" strokeWidth="2" strokeLinejoin="round" strokeDasharray="0 0" opacity=".55" />
      <path d="M23 21v22M41 21v22M23 32h18" stroke="url(#lg)" strokeWidth="5" strokeLinecap="square" />
    </svg>
  );
}

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/board', label: 'Order board', icon: KanbanSquare },
  { to: '/offers', label: 'Live offers', icon: Radar },
  { to: '/pricing', label: 'Pricing', icon: BadgeDollarSign },
  { to: '/chat', label: 'Auto-chat', icon: MessageSquareText },
  { to: '/earnings', label: 'My earnings', icon: Wallet },
  { to: '/analytics', label: 'Analytics', icon: LineChart },
  { to: '/team', label: 'Team & pay', icon: Users, owner: true },
  { to: '/buyers', label: 'Buyers', icon: Contact },
  { to: '/activity', label: 'Activity', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings, owner: true },
];

function BotPill() {
  const { data } = useData<any>('/overview', ['bot']);
  const running = data?.bot?.running;
  const dry = data?.bot?.dryRun;
  return (
    <div className={clsx('flex items-center gap-2 rounded-[7px] border px-3 py-1.5 text-[12px] font-bold uppercase tracking-[.12em]',
      running ? 'border-ok/30 bg-ok/[.07] text-ok' : 'border-white/10 bg-black/30 text-fg-3')}>
      <span className={clsx('dot', running ? 'bg-ok' : 'bg-fg-3')} />
      {running ? (dry ? 'Online · dry run' : 'Online') : 'Offline'}
    </div>
  );
}

export function Shell({ me, children }: { me: Me; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const items = NAV.filter(n => !n.owner || me.role === 'owner');
  const current = items.find(n => n.to === loc.pathname) ?? items[0];

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
          className={({ isActive }) => clsx('relative flex items-center gap-3 rounded-[7px] px-3 py-2 text-[14px] font-semibold transition-colors',
            isActive ? 'bg-white/[.06] text-fg shadow-[inset_0_1px_0_rgb(255_255_255/.05)]' : 'text-fg-3 hover:bg-white/[.03] hover:text-fg-2')}>
          {({ isActive }) => (<>
            {isActive && <span className="absolute -left-4 top-1.5 bottom-1.5 w-[2px] bg-neon" />}
            <Icon size={17} className={clsx(isActive && 'text-neon')} />
            <span>{label}</span>
          </>)}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-3 px-2">
      <Logo />
      <div>
        <div className="text-[16px] font-extrabold leading-none tracking-tight">Hawary's <span className="text-neon">Bot</span></div>
        <div className="mt-1 text-[10.5px] font-bold uppercase tracking-[.22em] text-fg-3">Eldorado control</div>
      </div>
    </div>
  );

  const userBox = (
    <div className="flex items-center gap-3 rounded-[8px] border border-white/[.06] bg-black/25 p-2.5">
      <Avatar name={me.name} color={me.color} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{me.name}</div>
        <div className="text-[12px] capitalize text-fg-3">{me.role}</div>
      </div>
      <button title="Log out" aria-label="Log out" onClick={async () => { await api('/auth/logout', { method: 'POST' }); location.href = '/'; }}
        className="rounded-md p-2 text-fg-3 hover:bg-white/10 hover:text-bad"><LogOut size={16} /></button>
    </div>
  );

  return (
    <MeCtx.Provider value={me}>
      <div className="min-h-screen lg:pl-[248px]">
        {/* desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col gap-6 border-r border-white/[.06] bg-ink-900/90 p-4 shadow-[1px_0_0_rgb(0_0_0/.6)] lg:flex">
          {brand}
          <div className="-mx-1 flex-1 overflow-y-auto px-1">{nav}</div>
          {userBox}
        </aside>

        {/* mobile drawer */}
        {open && (<>
          <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col gap-6 border-r border-white/10 bg-ink-900 p-4 lg:hidden">
            <div className="flex items-center justify-between">{brand}<button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 text-fg-3"><X /></button></div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {userBox}
          </aside>
        </>)}

        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[.05] bg-ink-950/85 px-4 py-2.5 backdrop-blur sm:px-8">
          <button className="rounded-md border border-white/10 p-2 text-fg-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="text-[12px] font-bold uppercase tracking-[.14em] text-fg-3">{current.label}</div>
          <div className="ml-auto"><BotPill /></div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 sm:px-8">{children}</main>
      </div>
    </MeCtx.Provider>
  );
}

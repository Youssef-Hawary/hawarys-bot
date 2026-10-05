import { createContext, useContext, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
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
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="drop-shadow-[0_0_12px_rgb(56_198_244/.55)]">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7FE3FF" /><stop offset="1" stopColor="#0E9AC9" /></linearGradient></defs>
      <path d="M32 5 55.4 18.5v27L32 59 8.6 45.5v-27Z" fill="#11151C" stroke="url(#lg)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M23 21v22M41 21v22M23 32h18" stroke="url(#lg)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="5" r="2.2" fill="#7FE3FF" /><circle cx="32" cy="59" r="2.2" fill="#7FE3FF" />
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
    <div className={clsx('flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1',
      running ? 'bg-ok/10 text-ok ring-ok/30' : 'bg-white/5 text-fg-3 ring-white/10')}>
      <span className={clsx('live-dot', running ? 'bg-ok' : 'bg-fg-3')} style={running ? undefined : { animation: 'none' }} />
      {running ? (dry ? 'Running · dry run' : 'Running') : 'Stopped'}
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
          className={({ isActive }) => clsx('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition',
            isActive ? 'text-fg' : 'text-fg-3 hover:bg-white/[.04] hover:text-fg-2')}>
          {({ isActive }) => (<>
            {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-gradient-to-r from-neon/20 to-neon/[.02] ring-1 ring-neon/30" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            {isActive && <motion.span layoutId="nav-bar" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-neon shadow-[0_0_12px_#38C6F4]" />}
            <Icon size={18} className={clsx('relative', isActive && 'text-neon')} />
            <span className="relative">{label}</span>
          </>)}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-3 px-2">
      <Logo />
      <div>
        <div className="text-[17px] font-black leading-none tracking-tight">Hawary's <span className="text-neon text-glow">Bot</span></div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[.2em] text-fg-3">Eldorado control</div>
      </div>
    </div>
  );

  const userBox = (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[.03] p-2.5 ring-1 ring-white/[.06]">
      <Avatar name={me.name} color={me.color} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{me.name}</div>
        <div className="text-[12px] capitalize text-fg-3">{me.role}</div>
      </div>
      <button title="Log out" aria-label="Log out" onClick={async () => { await api('/auth/logout', { method: 'POST' }); location.href = '/'; }}
        className="rounded-lg p-2 text-fg-3 hover:bg-white/10 hover:text-bad"><LogOut size={16} /></button>
    </div>
  );

  return (
    <MeCtx.Provider value={me}>
      <div className="min-h-screen lg:pl-[272px]">
        {/* desktop sidebar */}
        <aside className="fixed inset-y-3 left-3 z-30 hidden w-[256px] flex-col gap-6 rounded-[22px] border border-white/[.06] bg-ink-900/55 p-4 backdrop-blur-xl lg:flex">
          {brand}
          <div className="-mx-1 flex-1 overflow-y-auto px-1">{nav}</div>
          {userBox}
        </aside>

        {/* mobile drawer */}
        <AnimatePresence>
          {open && (<>
            <motion.div className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col gap-6 border-r border-white/10 bg-ink-900/95 p-4 lg:hidden">
              <div className="flex items-center justify-between">{brand}<button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 text-fg-3"><X /></button></div>
              <div className="flex-1 overflow-y-auto">{nav}</div>
              {userBox}
            </motion.aside>
          </>)}
        </AnimatePresence>

        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 backdrop-blur-md sm:px-6 lg:bg-transparent lg:backdrop-blur-none">
          <button className="rounded-xl p-2 text-fg-2 ring-1 ring-white/10 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="text-sm font-semibold text-fg-3 lg:hidden">{current.label}</div>
          <div className="ml-auto"><BotPill /></div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: .3, ease: [0.16, 1, 0.3, 1] }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </MeCtx.Provider>
  );
}

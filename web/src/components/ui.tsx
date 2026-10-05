import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, animate } from 'motion/react';
import clsx from 'clsx';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export { clsx };

export function Card({ children, className, hover, ...rest }: { children: ReactNode; className?: string; hover?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('glass', hover && 'glass-hover', className)} {...rest}>{children}</div>;
}

export function Section({ title, subtitle, actions, children, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={clsx('overflow-hidden', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.06] px-5 py-3.5">
        <div>
          <h3 className="text-[15px] font-bold tracking-wide text-neon">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-fg-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft'; size?: 'sm' | 'md'; icon?: ReactNode; loading?: boolean };
export function Button({ variant = 'soft', size = 'md', icon, loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-gradient-to-b from-neon-soft to-neon text-on-neon shadow-[0_8px_24px_-8px_rgb(56_198_244/.7)] hover:brightness-110',
        variant === 'soft' && 'bg-white/[.06] text-fg hover:bg-white/[.1]',
        variant === 'ghost' && 'text-fg-2 hover:bg-white/[.06] hover:text-fg',
        variant === 'danger' && 'bg-bad/15 text-bad hover:bg-bad/25',
        className,
      )}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const sw = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-neon shadow-[0_0_14px_rgb(56_198_244/.6)]' : 'bg-ink-700')}
    >
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 32 }}
        className={clsx('absolute top-0.5 h-5 w-5 rounded-full shadow', checked ? 'right-0.5 bg-white' : 'left-0.5 bg-fg-2')} />
    </button>
  );
  if (!label) return sw;
  return (
    <label className="flex items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-[13px] italic text-fg-3">{hint}</span>}
      </span>
      {sw}
    </label>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-fg-3">{hint}</span>}
    </label>
  );
}

export function Num({ value, onChange, step = 1, min, className, prefix }: { value: number; onChange: (v: number) => void; step?: number; min?: number; className?: string; prefix?: string }) {
  return (
    <div className={clsx('relative', className)}>
      {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-fg-3">{prefix}</span>}
      <input type="number" className={clsx('field !py-1.5 text-center', prefix && '!pl-6')} value={Number.isFinite(value) ? value : ''} step={step} min={min}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    </div>
  );
}

export function Badge({ tone = 'muted', children, className }: { tone?: 'ok' | 'warn' | 'bad' | 'neon' | 'muted' | 'violet'; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold', {
      'bg-ok/15 text-ok': tone === 'ok', 'bg-warn/15 text-warn': tone === 'warn', 'bg-bad/15 text-bad': tone === 'bad',
      'bg-neon/15 text-neon': tone === 'neon', 'bg-white/[.07] text-fg-2': tone === 'muted', 'bg-violet/15 text-violet': tone === 'violet',
    }, className)}>{children}</span>
  );
}

export function GameBadge({ game }: { game: string | null }) {
  if (game === 'valorant') return <span className="inline-flex items-center gap-1.5 rounded-md bg-valo/15 px-2 py-0.5 text-[12px] font-bold text-valo">◆ VALORANT</span>;
  if (game === 'lol') return <span className="inline-flex items-center gap-1.5 rounded-md bg-lol/15 px-2 py-0.5 text-[12px] font-bold text-lol">◈ LEAGUE</span>;
  return <span className="rounded-md bg-white/10 px-2 py-0.5 text-[12px] font-bold text-fg-2">OTHER</span>;
}

export function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full font-bold text-ink-950"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, ${color}, ${color}99)`, boxShadow: `0 0 12px ${color}55` }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString() }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const ctl = animate(prev.current, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: v => { if (ref.current) ref.current.textContent = format(v); } });
    prev.current = value;
    return () => ctl.stop();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}>{format(0)}</span>;
}

export function Stat({ icon, label, value, sub, tone = 'neon', delay = 0 }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: 'neon' | 'ok' | 'violet' | 'warn'; delay?: number }) {
  const colors = { neon: '#38C6F4', ok: '#34D399', violet: '#A78BFA', warn: '#FBBF24' };
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: .5, ease: [0.16, 1, 0.3, 1] }}>
      <Card hover className="flex items-center gap-4 p-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
          style={{ background: `radial-gradient(circle at 30% 30%, ${colors[tone]}40, ${colors[tone]}10)`, color: colors[tone], boxShadow: `inset 0 0 0 1px ${colors[tone]}30` }}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-2xl font-extrabold leading-tight">{value}</div>
          <div className="text-[13px] text-fg-3">{label}</div>
          {sub && <div className="mt-0.5 text-[12px] text-fg-2">{sub}</div>}
        </div>
      </Card>
    </motion.div>
  );
}

export function Modal({ open, onClose, title, children, width = 480 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div initial={{ scale: .94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .96, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="glass w-full p-6" style={{ maxWidth: width }} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1 text-fg-3 hover:bg-white/10 hover:text-fg" aria-label="Close"><X size={18} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Empty({ icon, title, text }: { icon: ReactNode; title: string; text?: string }) {
  return (
    <div className="grid place-items-center gap-2 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[.04] text-fg-3">{icon}</div>
      <div className="font-bold text-fg-2">{title}</div>
      {text && <div className="max-w-sm text-[13px] text-fg-3">{text}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-ink-900/70 p-1 ring-1 ring-white/[.06]">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} className={clsx('relative rounded-lg px-3.5 py-1.5 text-sm font-semibold transition', value === t.id ? 'text-on-neon' : 'text-fg-2 hover:text-fg')}>
          {value === t.id && <motion.span layoutId={`tab-${tabs.map(x => x.id).join()}`} className="absolute inset-0 rounded-lg bg-neon" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
          <span className="relative">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight"><span className="grad-text">{title}</span></h1>
        {subtitle && <p className="mt-1 text-fg-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------- toasts ----------------

type Toast = { id: number; tone: 'ok' | 'bad' | 'info'; text: string };
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setItems(i => [...i, { id, tone, text }]);
    setTimeout(() => setItems(i => i.filter(t => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {items.map(t => (
            <motion.div key={t.id} layout initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
              className="glass pointer-events-auto flex items-start gap-3 p-3.5 text-sm">
              {t.tone === 'ok' ? <CheckCircle2 className="shrink-0 text-ok" size={18} /> : t.tone === 'bad' ? <AlertTriangle className="shrink-0 text-bad" size={18} /> : <Info className="shrink-0 text-neon" size={18} />}
              <span>{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/** Runs an async action with a toast on success/failure. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try { await fn(); if (success) toast('ok', success); return true; }
    catch (e) { toast('bad', (e as Error).message); return false; }
    finally { setBusy(null); }
  }, [toast]);
  return { busy, run };
}

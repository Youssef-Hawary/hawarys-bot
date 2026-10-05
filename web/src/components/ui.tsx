import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export { clsx };

export function Card({ children, className, hover, ...rest }: { children: ReactNode; className?: string; hover?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('panel', hover && 'panel-hover', className)} {...rest}>{children}</div>;
}

export function Section({ title, subtitle, actions, children, className, bodyClass }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <Card className={clsx('overflow-hidden', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.06] px-5 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[.12em] text-fg">
            <span className="h-3 w-[3px] rounded-sm bg-neon" />{title}
          </h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-fg-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={clsx('p-5', bodyClass)}>{children}</div>
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
        'inline-flex select-none items-center justify-center gap-2 rounded-[7px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-[14px]',
        variant === 'primary' && 'border border-neon/60 bg-neon text-on-neon shadow-[inset_0_1px_0_rgb(255_255_255/.35),0_6px_18px_-8px_rgb(56_198_244/.6)] hover:bg-neon-soft',
        variant === 'soft' && 'border border-white/[.08] bg-white/[.04] text-fg shadow-[inset_0_1px_0_rgb(255_255_255/.05)] hover:border-white/[.14] hover:bg-white/[.07]',
        variant === 'ghost' && 'text-fg-2 hover:bg-white/[.05] hover:text-fg',
        variant === 'danger' && 'border border-bad/30 bg-bad/10 text-bad hover:bg-bad/20',
        className,
      )}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode; disabled?: boolean; size?: 'sm' | 'md' }) {
  const sm = size === 'sm';
  const sw = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx('relative shrink-0 rounded-full border transition-colors disabled:opacity-45',
        sm ? 'h-[18px] w-8' : 'h-[22px] w-10',
        checked ? 'border-neon/70 bg-neon/85' : 'border-white/10 bg-ink-700')}
    >
      <span className={clsx('absolute top-1/2 -translate-y-1/2 rounded-full transition-[left] duration-100',
        sm ? 'h-3 w-3' : 'h-4 w-4',
        checked ? (sm ? 'left-[15px] bg-white' : 'left-[19px] bg-white') : 'left-[2px] bg-fg-3')} />
    </button>
  );
  if (!label) return sw;
  return (
    <label className="flex items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-[14px] font-semibold">{label}</span>
        {hint && <span className="block text-[12.5px] text-fg-3">{hint}</span>}
      </span>
      {sw}
    </label>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-[12.5px] font-semibold text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-fg-3">{hint}</span>}
    </label>
  );
}

export function Num({ value, onChange, step = 1, min, className, prefix, suffix }: { value: number; onChange: (v: number) => void; step?: number; min?: number; className?: string; prefix?: string; suffix?: string }) {
  return (
    <div className={clsx('relative', className)}>
      {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12.5px] text-fg-3">{prefix}</span>}
      <input type="number" className={clsx('field !py-1.5 text-right', prefix && '!pl-6', suffix && '!pr-7')} value={Number.isFinite(value) ? value : ''} step={step} min={min}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
      {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-fg-3">{suffix}</span>}
    </div>
  );
}

export function Badge({ tone = 'muted', children, className }: { tone?: 'ok' | 'warn' | 'bad' | 'neon' | 'muted' | 'violet'; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-[1px] text-[11.5px] font-bold tracking-wide', {
      'border-ok/25 bg-ok/10 text-ok': tone === 'ok', 'border-warn/25 bg-warn/10 text-warn': tone === 'warn', 'border-bad/25 bg-bad/10 text-bad': tone === 'bad',
      'border-neon/25 bg-neon/10 text-neon': tone === 'neon', 'border-white/10 bg-white/[.04] text-fg-2': tone === 'muted', 'border-violet/25 bg-violet/10 text-violet': tone === 'violet',
    }, className)}>{children}</span>
  );
}

export function GameBadge({ game }: { game: string | null }) {
  const cls = 'inline-flex items-center rounded-[5px] border px-1.5 py-[1px] text-[11px] font-black tracking-[.1em]';
  if (game === 'valorant') return <span className={clsx(cls, 'border-valo/30 bg-valo/10 text-valo')}>VALORANT</span>;
  if (game === 'lol') return <span className={clsx(cls, 'border-lol/30 bg-lol/10 text-lol')}>LEAGUE</span>;
  return <span className={clsx(cls, 'border-white/10 bg-white/5 text-fg-2')}>OTHER</span>;
}

export function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-[6px] font-bold"
      style={{ width: size, height: size, fontSize: size * 0.42, color, background: `${color}1f`, border: `1px solid ${color}55` }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Formats a number. (Kept as a component so pages can stay the same; it no longer animates.) */
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString() }: { value: number; format?: (n: number) => string }) {
  return <>{format(value)}</>;
}

export function Stat({ icon, label, value, sub, tone = 'neon' }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: 'neon' | 'ok' | 'violet' | 'warn'; delay?: number }) {
  const colors = { neon: '#38C6F4', ok: '#3DD68C', violet: '#9D8CF2', warn: '#F2B544' };
  return (
    <Card className="relative overflow-hidden p-4">
      <span className="absolute inset-y-0 left-0 w-[2px]" style={{ background: colors[tone] }} />
      <div className="flex items-start justify-between gap-3">
        <div className="label-caps">{label}</div>
        <span style={{ color: colors[tone] }} className="opacity-80">{icon}</span>
      </div>
      <div className="num mt-2 truncate text-[28px] font-semibold leading-none">{value}</div>
      {sub && <div className="mt-2 text-[12.5px] text-fg-3">{sub}</div>}
    </Card>
  );
}

export function Modal({ open, onClose, title, children, width = 480 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={onClose}>
      <div className="panel w-full" style={{ maxWidth: width }} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-3">
          <h3 className="text-[13px] font-bold uppercase tracking-[.12em]">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-fg-3 hover:bg-white/10 hover:text-fg" aria-label="Close"><X size={17} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon, title, text }: { icon: ReactNode; title: string; text?: string }) {
  return (
    <div className="grid place-items-center gap-2 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-lg border border-white/[.06] bg-white/[.02] text-fg-3">{icon}</div>
      <div className="font-bold text-fg-2">{title}</div>
      {text && <div className="max-w-sm text-[13px] text-fg-3">{text}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={clsx('inline-flex rounded-[8px] border border-white/[.07] bg-black/30 p-[3px]', className)}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={clsx('rounded-[6px] px-3 py-1 text-[13px] font-semibold transition-colors',
            value === t.id ? 'bg-ink-700 text-fg shadow-[inset_0_1px_0_rgb(255_255_255/.08),0_1px_2px_rgb(0_0_0/.5)]' : 'text-fg-3 hover:text-fg-2')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[.06] pb-5">
      <div>
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-fg-3">{subtitle}</p>}
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
        {items.map(t => (
          <div key={t.id} className="panel pointer-events-auto flex items-start gap-3 p-3 text-sm">
            {t.tone === 'ok' ? <CheckCircle2 className="shrink-0 text-ok" size={17} /> : t.tone === 'bad' ? <AlertTriangle className="shrink-0 text-bad" size={17} /> : <Info className="shrink-0 text-neon" size={17} />}
            <span>{t.text}</span>
          </div>
        ))}
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

import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('hb:logout'));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

// ---------------- live events ----------------

export type LogLine = { id: number; ts: number; level: 'info' | 'success' | 'warn' | 'error' | 'skip'; msg: string };
type Listener = { topic: string; fn: (data: any) => void };
const listeners = new Set<Listener>();
let source: EventSource | null = null;

export function connectLive() {
  if (source) return;
  source = new EventSource('/api/events');
  source.addEventListener('log', e => emit('log', JSON.parse((e as MessageEvent).data)));
  source.addEventListener('change', e => emit((e as MessageEvent).data, null));
  source.onerror = () => { /* the browser reconnects automatically */ };
}
export function disconnectLive() { source?.close(); source = null; }
function emit(topic: string, data: unknown) { for (const l of listeners) if (l.topic === topic) l.fn(data); }

export function useLive(topic: string, fn: (data: any) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const l = { topic, fn: (d: any) => ref.current(d) };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [topic]);
}

/** Fetch + auto-refresh when any of `topics` changes on the server. */
export function useData<T = any>(path: string | null, topics: string[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const load = useCallback(async () => {
    if (!path) return;
    try { setData(await api<T>(path)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  const debounced = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(load, 400); };
  for (const t of ['orders', 'requests', 'bot', 'pricing', 'outbox']) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useLive(t, () => { if (topics.includes(t)) debounced(); });
  }
  return { data, error, reload: load, setData };
}

// ---------------- formatting ----------------

export const usd = (n: number | null | undefined, digits = 2) =>
  n == null ? '–' : `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export function timeLeft(ts: number | null) {
  if (!ts) return { text: 'no deadline', tone: 'muted' as const };
  const ms = ts - Date.now();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600_000), m = Math.floor((abs % 3600_000) / 60_000);
  const d = Math.floor(h / 24);
  const text = d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${m}m` : `${m}m`;
  if (ms < 0) return { text: `${text} late`, tone: 'bad' as const };
  return { text: `${text} left`, tone: ms < 2 * 3600_000 ? 'bad' as const : ms < 8 * 3600_000 ? 'warn' as const : 'ok' as const };
}

export function ago(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

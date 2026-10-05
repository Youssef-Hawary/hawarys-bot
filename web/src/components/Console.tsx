import { useEffect, useRef, useState } from 'react';
import { api, useLive, type LogLine } from '../api.ts';
import { clsx } from './ui.tsx';

const TONE: Record<LogLine['level'], string> = {
  info: 'text-fg-2', success: 'text-ok', warn: 'text-warn', error: 'text-bad', skip: 'text-fg-3',
};

export function Console({ height = 300, limit = 150, hideSkipped = false }: { height?: number; limit?: number; hideSkipped?: boolean }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => { api<LogLine[]>(`/logs?limit=${limit}`).then(setLines).catch(() => {}); }, [limit]);
  useLive('log', (l: LogLine) => setLines(prev => [...prev.slice(-limit + 1), l]));
  useEffect(() => { if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines]);

  const shown = hideSkipped ? lines.filter(l => l.level !== 'skip') : lines;
  return (
    <div ref={box} style={{ height }} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
      className="well overflow-y-auto p-3 font-mono text-[12px] leading-relaxed">
      {shown.length === 0 && <div className="text-fg-3">Waiting for activity…</div>}
      {shown.map(l => (
          <div key={l.id} className="flex gap-3">
            <span className="shrink-0 text-fg-3/70">{new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span className={clsx('break-words', TONE[l.level])}>{l.msg}</span>
          </div>
        ))}
    </div>
  );
}

import { useState } from 'react';
import { Check, Copy, Wifi } from 'lucide-react';
import { useData } from '../api.ts';
import { Button, Section } from './ui.tsx';

export type AppInfo = {
  version: string;
  desktop: boolean;
  links: { url: string; adapter: string; kind: 'lan' | 'hotspot' }[];
  dataDir?: string;
};
export const useAppInfo = () => useData<AppInfo>('/app');

// The Clipboard API only works on https/localhost, so fall back to the old way on a plain http LAN address.
function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const t = document.createElement('textarea');
  t.value = text;
  document.body.appendChild(t);
  t.select();
  document.execCommand('copy');
  t.remove();
  return Promise.resolve();
}

function LinkRow({ url, note }: { url: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="well flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[17px] font-bold text-neon">{url}</div>
        {note && <div className="text-[12.5px] text-fg-3">{note}</div>}
      </div>
      <Button size="sm" icon={copied ? <Check size={14} /> : <Copy size={14} />}
        onClick={async () => { await copyText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

/** Where workers open the dashboard: this PC's address on the café/home network. */
export function WorkerLink({ className }: { className?: string }) {
  const { data } = useAppInfo();
  if (!data) return null;
  const lan = data.links.filter(l => l.kind === 'lan');
  const hotspot = data.links.filter(l => l.kind === 'hotspot');
  return (
    <Section className={className} title={<span className="flex items-center gap-2"><Wifi size={16} /> Workers' link</span>}
      subtitle="Workers open this on any PC or phone on the same network (same router or Wi-Fi). Nothing to install, they just log in.">
      {!data.links.length ? (
        <p className="text-sm text-fg-3">
          Other devices can't reach the bot right now. Start it with the <b>Hawary's Bot</b> desktop icon to turn this on.
        </p>
      ) : (
        <div className="space-y-2">
          {lan.map(l => <LinkRow key={l.url} url={l.url} note={lan.length > 1 ? `via ${l.adapter}` : 'Tip: save it as a bookmark on each PC.'} />)}
          {hotspot.map(l => <LinkRow key={l.url} url={l.url} note="Only for phones/PCs connected to this PC's own hotspot" />)}
          {!lan.length && <p className="text-[12.5px] text-warn">This PC is only on its own hotspot. Connect it to the café's router (cable or Wi-Fi) so the other PCs can reach it.</p>}
        </div>
      )}
    </Section>
  );
}

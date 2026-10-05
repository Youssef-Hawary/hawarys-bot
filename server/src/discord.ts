import { getSetting } from './db.ts';

export type DiscordSettings = {
  webhook: string;
  newOrder: boolean;
  newOffer: boolean;
  deadlines: boolean;
  dailyReport: boolean;
  dailyReportHour: number;   // server local time
  dashboardUrl: string;      // used for "Open board" links
};

export const getDiscord = () => getSetting<DiscordSettings>('discord', {
  webhook: '', newOrder: true, newOffer: false, deadlines: true, dailyReport: true, dailyReportHour: 23, dashboardUrl: '',
});

const CYAN = 0x38c6f4;

export async function sendDiscord(title: string, description: string, fields: { name: string; value: string; inline?: boolean }[] = [], color = CYAN) {
  const { webhook, dashboardUrl } = getDiscord();
  if (!webhook) return false;
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: "Hawary's Bot",
      embeds: [{ title, description, color, fields, url: dashboardUrl || undefined, timestamp: new Date().toISOString() }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Discord webhook HTTP ${res.status}`);
  return true;
}

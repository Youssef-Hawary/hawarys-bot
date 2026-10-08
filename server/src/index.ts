import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { api } from './routes.ts';
import { startEngine, log } from './engine.ts';
import { backupNow } from './backup.ts';
import { lanLinks } from './network.ts';

const PORT = Number(process.env.PORT ?? 8787);
const WEB_DIST = resolve(import.meta.dirname, '../../web/dist');

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
  c.header('X-Frame-Options', 'DENY');
});

app.route('/api', api);

if (existsSync(WEB_DIST)) {
  const root = relative(process.cwd(), WEB_DIST);
  app.use('/*', serveStatic({ root }));
  const index = readFileSync(resolve(WEB_DIST, 'index.html'), 'utf8');
  app.get('*', c => c.html(index)); // SPA routes
} else {
  app.get('/', c => c.text("Hawary's Bot API is running. Build the dashboard with: cd web && npm run build"));
}

serve({ fetch: app.fetch, port: PORT, hostname: process.env.HOST ?? '127.0.0.1' }, info => {
  console.log(`Hawary's Bot listening on http://${info.address}:${info.port}`);
  // (The desktop launcher prints its own friendlier version of this.)
  if (process.env.HB_DESKTOP !== '1') for (const l of lanLinks(PORT)) console.log(`  ${l.kind === 'hotspot' ? 'Hotspot devices' : 'Other PCs/phones'}: ${l.url}  (${l.adapter})`);
  log('info', '🚀 Server started');
  startEngine();
  // Daily copy of the database in server/data/backups (newest 14 kept).
  const backup = () => { try { backupNow(); } catch (e) { log('warn', `Backup failed: ${(e as Error).message}`); } };
  setTimeout(backup, 60_000);
  setInterval(backup, 24 * 3600_000);
});

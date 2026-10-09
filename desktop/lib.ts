// Small helpers for the desktop launcher (kept separate so they can be tested on any OS).
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export { newer } from '../server/src/updates.ts';

export function sha256File(file: string): Promise<string> {
  return new Promise((ok, fail) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail);
  });
}

/**
 * Databases from the old "Download ZIP + npm start" setup, newest first.
 * Looks in Documents, Desktop and Downloads for folders named hawarys-bot* (also one level deeper,
 * because Windows "Extract All" makes hawarys-bot-master\hawarys-bot-master).
 */
export function findOldDatabases(home: string): string[] {
  const found: { file: string; at: number }[] = [];
  const check = (dir: string) => {
    const file = join(dir, 'server', 'data', 'hawary.db');
    if (existsSync(file)) found.push({ file, at: statSync(file).mtimeMs });
  };
  const subdirs = (dir: string) => {
    try { return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && /^hawarys-bot/i.test(d.name)).map(d => join(dir, d.name)); }
    catch { return []; }
  };
  for (const place of ['Documents', 'Desktop', 'Downloads', join('OneDrive', 'Documents'), join('OneDrive', 'Desktop')]) {
    for (const dir of subdirs(join(home, place))) {
      check(dir);
      for (const inner of subdirs(dir)) check(inner);
    }
  }
  return found.sort((a, b) => b.at - a.at).map(f => f.file);
}

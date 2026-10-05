// Backups: copies the live database into data/backups and keeps the newest 14 daily ones.
// Runs once a day while the bot runs (index.ts), or by hand: node src/backup.ts
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from './db.ts';

const dir = resolve(import.meta.dirname, '../data/backups');

export function backupNow() {
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `hawary-${new Date().toISOString().slice(0, 10)}.db`);
  rmSync(file, { force: true });
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  const old = readdirSync(dir).filter(f => /^hawary-\d{4}-\d\d-\d\d\.db$/.test(f)).sort().slice(0, -14);
  for (const f of old) rmSync(resolve(dir, f));
  return file;
}

if (import.meta.filename === process.argv[1]) console.log(`backup written: ${backupNow()}`);

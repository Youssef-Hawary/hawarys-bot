// Daily backup: copies the live database into data/backups and keeps the newest 14.
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from './db.ts';

const dir = resolve(import.meta.dirname, '../data/backups');
mkdirSync(dir, { recursive: true });
const file = resolve(dir, `hawary-${new Date().toISOString().slice(0, 10)}.db`);
rmSync(file, { force: true });
db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
const old = readdirSync(dir).filter(f => f.endsWith('.db')).sort().slice(0, -14);
for (const f of old) rmSync(resolve(dir, f));
console.log(`backup written: ${file}`);

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = process.env.DB_PATH ?? resolve(import.meta.dirname, '../data/hawary.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'worker')),
  pay_type TEXT NOT NULL DEFAULT 'percent',   -- percent | fixed | per_division | manual
  pay_value REAL NOT NULL DEFAULT 50,
  color TEXT NOT NULL DEFAULT '#38C6F4',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'web',            -- web | extension
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  game TEXT,
  game_id TEXT,
  category TEXT,
  buyer TEXT,
  buyer_id TEXT,
  created_at INTEGER,
  seen_at INTEGER NOT NULL,
  details TEXT,                                 -- normalized JSON once the extension reads the page
  status TEXT NOT NULL DEFAULT 'needs_details', -- needs_details | skipped | would_offer | offered | error
  reason TEXT,
  price REAL,
  hours REAL,
  offer_id TEXT,
  variant TEXT,
  offered_at INTEGER,
  outcome TEXT                                  -- won | lost
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  game TEXT,
  title TEXT,
  buyer TEXT,
  buyer_id TEXT,
  price REAL NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deadline INTEGER,
  request_id TEXT,
  conversation_id TEXT,
  divisions REAL,
  assigned_to INTEGER REFERENCES users(id),
  assigned_at INTEGER,
  delivered_at INTEGER,
  completed_at INTEGER,
  worker_pay_override REAL,
  deadline_alerted INTEGER NOT NULL DEFAULT 0,
  raw TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL,
  msg TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buyers (
  username TEXT PRIMARY KEY,
  buyer_id TEXT,
  note TEXT,
  blacklisted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,              -- follow_up | accepted | delivered | received
  conversation_id TEXT,
  order_id TEXT,
  request_id TEXT,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed | dropped
  not_before INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS captures (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  method TEXT,
  url TEXT,
  status INTEGER,
  req_body TEXT,
  resp_body TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(state);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);

-- Uploaded files (e.g. the opener image per game). Kept in the database so backups include them.
CREATE TABLE IF NOT EXISTS files (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

// Columns added after the first version.
for (const [table, column, type] of [['outbox', 'image', 'TEXT']] as const) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  const value = JSON.parse(row.value);
  // Merge objects so new default fields appear after upgrades.
  if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) return { ...fallback, ...value };
  return value as T;
}

export function setSetting(key: string, value: unknown) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

export function audit(userId: number | null, action: string, details: unknown = null) {
  db.prepare('INSERT INTO audit (ts, user_id, action, details) VALUES (?, ?, ?, ?)')
    .run(Date.now(), userId, action, details == null ? null : JSON.stringify(details));
}

export const now = () => Date.now();

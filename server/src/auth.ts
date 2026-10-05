import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.ts';

export type User = {
  id: number;
  username: string;
  display_name: string;
  role: 'owner' | 'worker';
  pay_type: string;
  pay_value: number;
  color: string;
  active: number;
};

const SESSION_DAYS = 30;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createSession(userId: number, kind: 'web' | 'extension' = 'web') {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, user_id, kind, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, kind, Date.now() + SESSION_DAYS * 86400_000);
  return token;
}

export function userFromToken(token: string | undefined): User | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.pay_type, u.pay_value, u.color, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.active = 1
  `).get(token, Date.now()) as User | undefined;
  return row ?? null;
}

export function deleteSession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function login(username: string, password: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE lower(username) = lower(?) AND active = 1').get(username) as
    (User & { password_hash: string }) | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  const { password_hash: _, ...user } = row;
  return user;
}

export function userCount() {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

const PALETTE = ['#38C6F4', '#A78BFA', '#34D399', '#FBBF24', '#F472B6', '#FB923C'];

export function createUser(input: { username: string; displayName: string; password: string; role: 'owner' | 'worker'; payType?: string; payValue?: number }) {
  const color = PALETTE[userCount() % PALETTE.length];
  const res = db.prepare(`
    INSERT INTO users (username, display_name, password_hash, role, pay_type, pay_value, color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(input.username.trim(), input.displayName.trim(), hashPassword(input.password), input.role,
    input.payType ?? 'percent', input.payValue ?? 50, color, Date.now());
  return Number(res.lastInsertRowid);
}

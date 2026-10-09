// Where the bot gets its updates: the newest GitHub Release of the (private) repo, read with a read-only GitHub key.
// Used by the desktop launcher (to install updates) and the dashboard (Settings → Updates).
import { createWriteStream, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const REPO = 'Youssef-Hawary/hawarys-bot';
const API = () => process.env.HB_GITHUB_API ?? `https://api.github.com/repos/${REPO}`; // override: testing only

/** Pre-filled GitHub page for making the key: read-only access to repo files, never expires. */
export const KEY_URL = 'https://github.com/settings/personal-access-tokens/new?' + new URLSearchParams({
  name: "Hawary's Bot updates",
  description: "Lets Hawary's Bot download its own updates from the private hawarys-bot repo. Read-only.",
  expires_in: 'none',
  contents: 'read',
});

export type Asset = { name: string; url: string; size: number };
export type Release = { version: string; assets: Asset[] };
export type Manifest = { version: string; runtime: string; app: { sha256: string }; setup: { sha256: string } };

/** true when version `a` (like "1.0.42") is newer than `b`. Anything that isn't a version is never newer. */
export function newer(a: string, b: string) {
  const parse = (v: string) => /^\d+(\.\d+)*$/.test(v) ? v.split('.').map(Number) : null;
  const x = parse(a), y = parse(b);
  if (!x) return false;
  if (!y) return true; // "dev" or a broken install: any real release is newer
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

// ---------------- the key (kept in the data folder, never sent to the browser) ----------------

const keyFile = (dataDir: string) => join(dataDir, 'github-key.txt');
export function readKey(dataDir: string) { try { return readFileSync(keyFile(dataDir), 'utf8').trim(); } catch { return ''; } }
export function saveKey(dataDir: string, key: string) {
  if (key) writeFileSync(keyFile(dataDir), key);
  else rmSync(keyFile(dataDir), { force: true });
}
/** GitHub keys look like github_pat_… (fine-grained) or ghp_… (classic). */
export const looksLikeKey = (k: string) => /^(github_pat_|ghp_)[A-Za-z0-9_]{20,255}$/.test(k);

// ---------------- GitHub ----------------

export type UpdateErrorKind = 'no-key' | 'bad-key' | 'no-access' | 'offline' | 'busy' | 'other';
export class UpdateError extends Error {
  kind: UpdateErrorKind;
  constructor(kind: UpdateErrorKind, message: string) { super(message); this.kind = kind; }
}

const headers = (key: string, accept = 'application/vnd.github+json') => ({
  Accept: accept,
  'User-Agent': 'hawarys-bot',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(key ? { Authorization: `Bearer ${key}` } : {}),
});

/** The newest published release. Throws an UpdateError with a message that tells you what to do. */
export async function latestRelease(key: string): Promise<Release> {
  let r: Response;
  try { r = await fetch(`${API()}/releases/latest`, { headers: headers(key), signal: AbortSignal.timeout(10_000) }); }
  catch { throw new UpdateError('offline', "Can't reach GitHub (no internet?)"); }
  if (r.status === 401) throw new UpdateError('bad-key', 'GitHub refused the key (wrong, expired or deleted). Make a new one in Settings → Updates.');
  if (r.status === 404) {
    throw key
      ? new UpdateError('no-access', "The GitHub key can't see the hawarys-bot repo. Make a new key and pick hawarys-bot under Repository access.")
      : new UpdateError('no-key', 'The repo is private, so updates need your GitHub key: dashboard → Settings → Updates.');
  }
  if (r.status === 403 || r.status === 429) throw new UpdateError('busy', 'GitHub says: too many checks. Try again in an hour.');
  if (!r.ok) throw new UpdateError('other', `GitHub error (HTTP ${r.status})`);
  const rel = await r.json() as { tag_name: string; assets: Asset[] };
  return { version: rel.tag_name.replace(/^v/, ''), assets: rel.assets.map(a => ({ name: a.name, url: a.url, size: a.size })) };
}

export function asset(rel: Release, name: string) {
  const a = rel.assets.find(x => x.name === name);
  if (!a) throw new UpdateError('other', `${name} is missing from release v${rel.version}`);
  return a;
}

/** Downloads a release file through the API (works for private repos; GitHub redirects to its file storage). */
export async function downloadAsset(a: Asset, key: string, file: string) {
  const r = await fetch(a.url, { headers: headers(key, 'application/octet-stream'), signal: AbortSignal.timeout(15 * 60_000) });
  if (!r.ok || !r.body) throw new UpdateError('other', `download failed (HTTP ${r.status})`);
  await pipeline(Readable.fromWeb(r.body as any), createWriteStream(file));
}

export async function readManifest(rel: Release, key: string): Promise<Manifest> {
  const r = await fetch(asset(rel, 'manifest.json').url, { headers: headers(key, 'application/octet-stream'), signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new UpdateError('other', `couldn't read the update info (HTTP ${r.status})`);
  return await r.json() as Manifest;
}

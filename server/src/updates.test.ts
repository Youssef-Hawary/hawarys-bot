import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateError, downloadAsset, latestRelease, looksLikeKey, newer, readKey, readManifest, saveKey } from './updates.ts';

const listen = (s: Server) => new Promise<number>(ok => s.listen(0, '127.0.0.1', () => ok((s.address() as any).port)));
const KEY = 'github_pat_' + 'a'.repeat(40);

// A fake GitHub: private repo (404 without a key), release files redirect to a separate "storage" server.
async function fakeGitHub() {
  const seen: { storageAuth?: string } = {};
  const storage = createServer((req, res) => { seen.storageAuth = req.headers.authorization; res.end('ZIPDATA'); });
  const storagePort = await listen(storage);
  const api = createServer((req, res) => {
    const auth = req.headers.authorization;
    if (auth && auth !== `Bearer ${KEY}`) { res.statusCode = 401; return res.end('{}'); }
    if (!auth) { res.statusCode = 404; return res.end('{}'); }
    const base = `http://127.0.0.1:${(api.address() as any).port}`;
    if (req.url === '/releases/latest') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ tag_name: 'v1.0.9', assets: [
        { name: 'manifest.json', url: `${base}/assets/1`, size: 10 },
        { name: 'app.zip', url: `${base}/assets/2`, size: 7 },
      ] }));
    }
    if (req.url === '/assets/1') return res.end(JSON.stringify({ version: '1.0.9', runtime: 'r1', app: { sha256: 'x' }, setup: { sha256: 'y' } }));
    if (req.url === '/assets/2') { res.statusCode = 302; res.setHeader('location', `http://127.0.0.1:${storagePort}/signed-file`); return res.end(); }
    res.statusCode = 404; res.end('{}');
  });
  process.env.HB_GITHUB_API = `http://127.0.0.1:${await listen(api)}`;
  return { seen, close: () => { api.close(); storage.close(); } };
}

test('private repo: clear messages for no key / wrong key, release + files with the right key', async () => {
  const gh = await fakeGitHub();
  try {
    await assert.rejects(latestRelease(''), (e: UpdateError) => e.kind === 'no-key');
    await assert.rejects(latestRelease('github_pat_wrong'), (e: UpdateError) => e.kind === 'bad-key');
    const rel = await latestRelease(KEY);
    assert.equal(rel.version, '1.0.9');
    assert.equal((await readManifest(rel, KEY)).runtime, 'r1');
    const file = join(mkdtempSync(join(tmpdir(), 'hb-upd-')), 'app.zip');
    await downloadAsset(rel.assets[1], KEY, file);
    assert.equal(readFileSync(file, 'utf8'), 'ZIPDATA');
    assert.equal(gh.seen.storageAuth, undefined, 'the GitHub key must not be sent to the storage server');
  } finally { gh.close(); delete process.env.HB_GITHUB_API; }
});

test('offline is reported as offline', async () => {
  process.env.HB_GITHUB_API = 'http://127.0.0.1:9'; // nothing listens there
  try { await assert.rejects(latestRelease(KEY), (e: UpdateError) => e.kind === 'offline'); }
  finally { delete process.env.HB_GITHUB_API; }
});

test('key file and key format', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-key-'));
  assert.equal(readKey(dir), '');
  saveKey(dir, KEY);
  assert.equal(readKey(dir), KEY);
  saveKey(dir, '');
  assert.equal(readKey(dir), '');
  assert.equal(looksLikeKey(KEY), true);
  assert.equal(looksLikeKey('ghp_' + 'b'.repeat(36)), true);
  assert.equal(looksLikeKey('hello'), false);
  assert.equal(looksLikeKey(KEY + ' extra'), false);
});

test('version compare', () => {
  assert.equal(newer('1.0.10', '1.0.9'), true);
  assert.equal(newer('1.0.9', 'dev'), true);
  assert.equal(newer('1.0.9', '1.0.9'), false);
});

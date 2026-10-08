import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findOldDatabases, newer } from './lib.ts';

test('version compare', () => {
  assert.equal(newer('1.0.10', '1.0.9'), true);
  assert.equal(newer('1.0.9', '1.0.10'), false);
  assert.equal(newer('1.0.9', '1.0.9'), false);
  assert.equal(newer('1.1', '1.0.99'), true);
  assert.equal(newer('2.0.0', 'dev'), true);
  assert.equal(newer('garbage', '1.0.0'), false);
});

test('finds old databases, newest first, including the nested Extract All folder', () => {
  const home = mkdtempSync(join(tmpdir(), 'hb-home-'));
  const db = (rel: string, mtime: number) => {
    const dir = join(home, rel, 'server', 'data');
    mkdirSync(dir, { recursive: true });
    const f = join(dir, 'hawary.db');
    writeFileSync(f, 'x');
    utimesSync(f, mtime, mtime);
    return f;
  };
  const older = db(join('Documents', 'hawarys-bot'), 1_000);
  const nested = db(join('Downloads', 'hawarys-bot-master', 'hawarys-bot-master'), 2_000);
  db(join('Documents', 'something-else'), 3_000); // not ours
  assert.deepEqual(findOldDatabases(home), [nested, older]);
});

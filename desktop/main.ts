// Hawary's Bot desktop launcher, started by runtime\launch.cjs when you click the desktop icon.
//   1. Bot already running? Just open the dashboard.
//   2. Newer version on GitHub? Download it and restart into it (settings are never touched).
//   3. Start the bot with LAN access on, data kept in <install folder>\data.
//   4. Open the bot's own browser with Eldorado + the dashboard, extension already loaded and connected.
// Install folder layout:  runtime\ (node, chrome, launch.cjs)   app\<version>\ (this code)   data\ (database, backups, browser profile)
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, cpSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { findOldDatabases, newer, sha256File } from './lib.ts';
import { lanLinks } from '../server/src/network.ts';

const REPO = 'Youssef-Hawary/hawarys-bot';
const PORT = 8787;
const LOCAL = `http://127.0.0.1:${PORT}`;
const APP_DIR = resolve(import.meta.dirname, '..');
const VERSION = basename(APP_DIR);
const ROOT = process.env.HB_ROOT ?? resolve(APP_DIR, '..', '..');
const APPS = join(ROOT, 'app');
const RUNTIME = join(ROOT, 'runtime');
const DATA = join(ROOT, 'data');
const DB = join(DATA, 'hawary.db');
const CHROME = join(RUNTIME, 'chrome', 'chrome.exe');
// The extension is copied to a fixed folder so Chrome keeps the same extension (and its login) across updates.
const EXT_DIR = join(ROOT, 'extension');
const PROFILE = join(DATA, 'browser');

const c = { cyan: (s: string) => `\x1b[96m${s}\x1b[0m`, green: (s: string) => `\x1b[92m${s}\x1b[0m`, yellow: (s: string) => `\x1b[93m${s}\x1b[0m`, dim: (s: string) => `\x1b[90m${s}\x1b[0m` };
const say = (s = '') => console.log(s);
const read = (f: string) => { try { return readFileSync(f, 'utf8').trim(); } catch { return ''; } };

type Ping = { app?: string; version?: string; desktop?: boolean } | null;
async function ping(): Promise<Ping | 'other'> {
  try {
    const r = await fetch(`${LOCAL}/api/app/ping`, { signal: AbortSignal.timeout(1500) });
    return r.ok ? await r.json() as Ping : 'other';
  } catch { return null; }
}

// ---------------- browser ----------------

function openBrowser(urls: string[]) {
  if (!existsSync(CHROME)) { say(`  Open ${c.cyan(LOCAL)} in your browser.`); return false; }
  spawn(CHROME, [
    `--user-data-dir=${PROFILE}`,
    `--load-extension=${EXT_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...urls,
  ], { detached: true, stdio: 'ignore' })
    .on('error', e => say(c.yellow(`  Couldn't open the bot's browser (${e.message}). Open ${LOCAL} yourself.`)))
    .unref();
  return true;
}

/** Closes only the bot's own browser (the one inside the install folder), never your normal Chrome. */
function stopBotBrowser() {
  const path = RUNTIME.replaceAll("'", "''");
  spawnSync('powershell.exe', ['-NoProfile', '-Command',
    `Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${path}\\*' } | Stop-Process -Force`],
  { stdio: 'ignore', windowsHide: true });
}

// ---------------- updates ----------------

type Asset = { url: string; sha256: string };
type Manifest = { version: string; runtime: string; app: Asset; setup: Asset };

async function download(asset: Asset, file: string) {
  const r = await fetch(asset.url, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!r.ok || !r.body) throw new Error(`download failed (HTTP ${r.status})`);
  await pipeline(Readable.fromWeb(r.body as any), createWriteStream(file));
  if (await sha256File(file) !== asset.sha256) throw new Error('the download is damaged (checksum mismatch)');
}

function setCurrent(version: string, previous: string | null) {
  if (previous) writeFileSync(join(APPS, 'previous.txt'), previous);
  writeFileSync(join(APPS, 'current.txt'), version);
}

/** Exit code that tells runtime\launch.cjs to start us again right away (it re-reads current.txt). */
const RESTART = 75;

async function installApp(m: Manifest) {
  const zip = join(tmpdir(), `hawarys-bot-${m.version}.zip`);
  await download(m.app, zip);
  const target = join(APPS, m.version), partial = `${target}.partial`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(partial, { recursive: true });
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  const r = spawnSync(existsSync(tar) ? tar : 'tar', ['-xf', zip, '-C', partial], { stdio: 'pipe', windowsHide: true });
  if (r.status !== 0) throw new Error(`could not unpack it (${r.stderr?.toString().trim() || r.error?.message})`);
  if (!existsSync(join(partial, 'desktop', 'main.ts'))) throw new Error('the update is incomplete');
  rmSync(target, { recursive: true, force: true });
  renameSync(partial, target);
  rmSync(zip, { force: true });
  setCurrent(m.version, VERSION);
}

function runInstaller(exe: string) {
  stopBotBrowser();
  // Wait a moment so this window has closed before the installer replaces node.exe, then install silently.
  // The installer starts the bot again when it's done.
  spawn('cmd.exe', ['/d', '/s', '/c', `"ping -n 4 127.0.0.1 >nul & "${exe}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART"`],
    { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true })
    .on('error', e => say(c.yellow(`  Couldn't start the installer (${e.message}). Run ${exe} yourself.`)))
    .unref();
  setTimeout(() => process.exit(0), 300);
}

/** Returns true when the launcher is restarting into a new version (stop here). */
async function update(): Promise<boolean> {
  if (process.env.HB_NO_UPDATE === '1') return false;
  let m: Manifest;
  try {
    const url = process.env.HB_UPDATE_MANIFEST ?? `https://github.com/${REPO}/releases/latest/download/manifest.json`; // override: testing only
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
    m = await r.json() as Manifest;
  } catch {
    say(c.dim('  No internet or GitHub not reachable: skipping the update check.'));
    return false;
  }
  if (!newer(m.version, VERSION) || read(join(APPS, 'skip.txt')) === m.version) return false;
  say(`  ${c.yellow('⬇')}  Updating to v${m.version}…`);
  try {
    const runtime = JSON.parse(read(join(RUNTIME, 'runtime.json')) || '{}').id;
    if (m.runtime !== runtime) {
      // Node or the browser changed too: run the full installer (bigger download, still automatic).
      const exe = join(tmpdir(), `HawarysBot-Setup-${m.version}.exe`);
      await download(m.setup, exe);
      say('  The installer runs now and reopens the bot when it is done. This window will close.');
      runInstaller(exe);
      return true;
    }
    await installApp(m);
    say(`  ${c.green('✓')}  Updated to v${m.version}. Restarting…`);
    say();
    process.exit(RESTART);
  } catch (e) {
    say(`  ${c.yellow('!')}  Update failed (${(e as Error).message}). Starting the current version.`);
    return false;
  }
}

/** The new version crashed on start: go back to the previous one and don't install this version again. */
function rollback(err: unknown) {
  const prev = read(join(APPS, 'previous.txt'));
  console.error(err);
  if (!prev || prev === VERSION || !existsSync(join(APPS, prev, 'desktop', 'main.ts'))) return false;
  say();
  say(c.yellow(`  v${VERSION} didn't start. Going back to v${prev}.`));
  writeFileSync(join(APPS, 'skip.txt'), VERSION);
  setCurrent(prev, null);
  process.exit(RESTART);
}

function cleanupOldVersions() {
  const keep = new Set([VERSION, read(join(APPS, 'previous.txt'))]);
  for (const d of readdirSync(APPS, { withFileTypes: true })) {
    if (d.isDirectory() && !keep.has(d.name)) rmSync(join(APPS, d.name), { recursive: true, force: true });
  }
}

// ---------------- first start ----------------

/** Brings over the database from the old "Download ZIP + npm start" setup, once. */
function migrateOldData() {
  if (existsSync(DB)) return;
  const [old] = findOldDatabases(homedir());
  if (!old) return;
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(old + suffix)) copyFileSync(old + suffix, DB + suffix);
  say(`  ${c.green('✓')}  Brought over your accounts, prices and orders from ${dirname(dirname(dirname(old)))}`);
}

function pairSecret() {
  const file = join(DATA, 'pair.secret');
  let s = read(file);
  if (!s) { s = randomBytes(24).toString('hex'); writeFileSync(file, s); }
  return s;
}

function prepareExtension(secret: string) {
  cpSync(join(APP_DIR, 'extension'), EXT_DIR, { recursive: true, force: true });
  writeFileSync(join(EXT_DIR, 'local.json'), JSON.stringify({ server: LOCAL, secret }));
}

/** Stops Windows from going to sleep while the bot runs (the screen can still turn off). Ends with this window. */
function keepAwake() {
  const script = [
    `$k = Add-Type -Name P -Namespace HB -PassThru -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'`,
    `[void]$k::SetThreadExecutionState([uint32]'0x80000001')`,
    `while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 30 }`,
  ].join('; ');
  spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], { stdio: 'ignore', windowsHide: true, detached: true })
    .on('error', () => { /* not on Windows: nothing to do */ })
    .unref();
}

async function waitUp(ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const p = await ping();
    if (p && p !== 'other') return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// ---------------- main ----------------

say();
say(`  ${c.cyan("Hawary's Bot")}  ${c.dim('v' + VERSION)}`);
say(c.dim('  ─────────────────────────────────────────────'));

const running = await ping();
if (running && running !== 'other') {
  say(`  Already running. Opening the dashboard…`);
  openBrowser([LOCAL]);
  setTimeout(() => process.exit(0), 3000);
} else if (running === 'other') {
  say(c.yellow('  Something else is using port 8787, probably the old bot window (start.bat).'));
  say(c.yellow('  Close that black window, then click the Hawary\'s Bot icon again.'));
  setTimeout(() => process.exit(0), 60_000);
} else if (!(await update())) {
  mkdirSync(DATA, { recursive: true });
  migrateOldData();
  const secret = pairSecret();
  prepareExtension(secret);
  Object.assign(process.env, {
    HOST: '0.0.0.0', PORT: String(PORT), DB_PATH: DB,
    HB_PAIR_SECRET: secret, HB_APP_VERSION: VERSION, HB_DESKTOP: '1',
  });
  process.chdir(join(APP_DIR, 'server'));
  let started = true;
  try { await import(pathToFileURL(join(APP_DIR, 'server', 'src', 'index.ts')).href); }
  catch (e) { started = false; if (!rollback(e)) throw e; }
  if (started) {
    if (!(await waitUp(30_000))) throw new Error("The bot didn't start within 30 seconds");
    keepAwake();
    // After a crash the bot's browser is usually still open: don't add duplicate tabs.
    const opened = process.env.HB_AFTER_CRASH === '1' ? false : openBrowser(['https://www.eldorado.gg/', LOCAL]);
    try { cleanupOldVersions(); } catch { /* a file in use; next time */ }
    const links = lanLinks(PORT).filter(l => l.kind === 'lan');
    say();
    say(`  ${c.green('●')}  ${c.green('Running')}.${opened ? " The bot's browser opened with Eldorado and the dashboard." : ''}`);
    say(`     Workers open:  ${links.length ? links.map(l => c.cyan(l.url)).join('  or  ') : c.dim('(no network found)')}`);
    say();
    say(c.dim('  Keep this window open (minimize it). Closing it stops the bot.'));
    say(c.dim('  The PC won\'t go to sleep while the bot runs.'));
    say();
  }
}

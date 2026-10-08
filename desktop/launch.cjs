// Hawary's Bot starter. The installer puts it in <install folder>\runtime\launch.cjs and the desktop icon runs it with
// the bundled node.exe. It never changes on updates. It runs app\<current version>\desktop\main.ts (which does the real
// work and updates itself) and keeps it running:
//   main exits 0  → done, close the window
//   main exits 75 → restart now (after an update or a rollback; reads current.txt again)
//   anything else → it crashed: start it again in 10 seconds (gives up after 5 crashes in 10 minutes)
'use strict';
process.title = "Hawary's Bot";
const { spawn } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join, dirname } = require('node:path');

const root = dirname(__dirname);
const RESTART = 75;
const crashes = [];

function hold(msg) {
  console.error(`\n  ${msg}\n  Take a screenshot of this window and send it to Claude. Then you can close this window.`);
  setInterval(() => {}, 1 << 30); // keep the window open so the error can be read
}

function start(afterCrash = false) {
  let version = '';
  try { version = readFileSync(join(root, 'app', 'current.txt'), 'utf8').trim(); } catch { /* handled below */ }
  const main = version && join(root, 'app', version, 'desktop', 'main.ts');
  if (!main || !existsSync(main)) return hold("Hawary's Bot files are missing. Run HawarysBot-Setup.exe again (your data is kept).");
  const env = { ...process.env, HB_ROOT: root, HB_AFTER_CRASH: afterCrash ? '1' : '' };
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', main], { stdio: 'inherit', env });
  child.on('error', err => hold(`Couldn't start the bot: ${err.message}`));
  child.on('exit', (code, signal) => {
    if (code === 0) return process.exit(0);
    if (code === RESTART) return start();
    const now = Date.now();
    crashes.push(now);
    while (now - crashes[0] > 10 * 60_000) crashes.shift();
    if (crashes.length >= 5) return hold('The bot keeps stopping because of an error.');
    console.error(`\n  The bot stopped (${signal || `code ${code}`}). Starting it again in 10 seconds...\n`);
    setTimeout(() => start(true), 10_000);
  });
}

start();

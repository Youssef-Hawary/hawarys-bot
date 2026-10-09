# Hawary's Bot

An Eldorado.gg boosting bot with a team dashboard, for Valorant and League of Legends.
This repository is **private**: only accounts you invite can see the code and download the installer.

## Install on the bot PC (Windows)

1. Log in to GitHub in your browser, then download
   **[HawarysBot-Setup.exe](https://github.com/Youssef-Hawary/hawarys-bot/releases/latest/download/HawarysBot-Setup.exe)** and open it.
   If Windows says *"Windows protected your PC"*, click **More info → Run anyway** (the installer isn't code-signed).
2. Click **Next** until it's done. When Windows asks for permission (the firewall step), click **Yes**, so the other PCs can connect.
3. The bot starts and opens **its own browser** with Eldorado and the dashboard.

**First time only:** create the owner account in the dashboard, log in to your Eldorado seller account in that browser,
then click the extension icon (puzzle piece → Hawary's Bot) → **Connect Eldorado API (owner)**.
The extension is already installed and connected.
Then **Settings → Updates**: make a read-only GitHub key with the link there and paste it, so the bot can download its
updates from this private repo.

**Every day:** double-click the **Hawary's Bot** icon on the desktop. That's all. It updates itself when it starts.

No GitHub, no Node.js, no `npm`, no "Developer mode".

## Workers

Nothing to install. They open the **Workers' link** (dashboard → *Team & pay*), for example `http://192.168.88.5:8787`,
on any PC or phone on the same network (same router or Wi-Fi), and log in with the account you made for them.
Save it as a bookmark. They use Eldorado in their normal browser as usual.

## Good to know

- A small **Hawary's Bot** window starts minimized in the taskbar. Keep it open: closing it stops the bot.
  The PC won't go to sleep while the bot runs.
- Use the bot's own browser for the Eldorado tab the bot works with. Your normal Chrome isn't touched.
- Your data (accounts, prices, orders, backups, the bot browser's Eldorado login) is in the `data` folder of the install folder
  (default `%LOCALAPPDATA%\Programs\HawarysBot\data`). Updates and reinstalls never touch it.
- **Café PCs that reset on restart** (Deep Freeze and similar): install to a drive that keeps its files, like `D:\HawarysBot`.
  The installer asks where to install.
- **Coming from the old ZIP + `start.bat` setup:** close the old black window first. On its first start the app copies your old data
  automatically (it looks for `hawarys-bot*` folders in Documents, Desktop and Downloads). If it can't find it, use
  *Settings → Download settings* in the old one and *Load settings* in the new one.
- If the bot ever can't start, the window stays open with the error. Take a screenshot and send it to Claude.

## How it works

1. **Server** polls Eldorado's official Seller API for new boosting requests and orders (Start/Stop button).
2. The request list has no ranks, so the **extension** (in the bot's browser, with an Eldorado tab open) reads
   *Current Rank / RR / Desired Rank / Server / Completion Method* through Eldorado's own site.
3. The server prices the request using **Pricing** (per game) and sends the offer through the API, with the
   opening message (A/B test). In **dry run** it only logs what it *would* offer.
4. New orders → Discord alert → a worker opens the **Order board** and clicks **Take**. Deliver/cancel/extend go
   through the API. Accepted/delivered/received/follow-up chat messages are queued for the extension.
5. Money: Eldorado fee % (Settings) + each worker's pay type (% / per division / fixed / manual) → profit,
   what you owe each worker, payouts. Workers only see their own money.

## Project layout

```
server/     Node API + bot engine + SQLite (no build step, Node ≥ 23.6)
web/        Dashboard (React + Vite + Tailwind, WebGL background)
extension/  Chrome extension: reads request details, records Eldorado calls, sends chat messages
desktop/    Windows launcher: starts the bot, opens the bot's browser, self-updates (launch.cjs → main.ts)
installer/  Inno Setup script + which Node/Chrome the installer ships (runtime.json)
scripts/    Packaging (package_windows.py, make_ico.py, zip_extension.py)
deploy/     Linux server setup (systemd + Caddy HTTPS + daily backups)
ELDORADO_API.md   What the official Seller API can do (from Swagger)
legacy/     First Python prototype (not used)
```

## Releases and updates

Every push to `master` builds the installer on GitHub Actions (`.github/workflows/windows-app.yml`) and publishes a
release `v1.0.<build>` with `HawarysBot-Setup.exe`, `app.zip` and `manifest.json`.
When the bot starts it asks the GitHub API for the latest release (with the read-only key saved in
*Settings → Updates*, stored in `data/github-key.txt`, because the repo is private) and reads its `manifest.json`:
if there's a newer version it downloads the small `app.zip`
(checked with SHA-256), switches to it and keeps the previous version. If a new version fails to start, it goes back
to the previous one automatically and skips that version.

The installer ships Node.js and **Chrome for Testing** (branded Chrome no longer allows loading an extension from the
command line). To give every install a newer Node/Chrome, bump `rev` in `installer/runtime.json`: installs then run
the full installer once, silently.

## Development

```bash
npm run setup     # once
npm run build
npm run demo      # fake orders/workers in server/data/demo.db → http://127.0.0.1:8787
```
Log in as `hawary / demo1234` (owner) or `ahmed / demo1234` (worker).

Real mode: `npm start` (empty database, creates the owner account on first visit; only this PC can open it,
set `HOST=0.0.0.0` to allow the network).
For live UI development: `npm start` in one terminal and `npm --prefix web run dev` in another (http://localhost:5173).

`npm test` runs the pricing, network and launcher tests (including the Platinum I → Diamond I example).

## Extension recorder

Settings → Extension → **Recorder** on, then use Eldorado normally (open requests, send a chat message).
Eldorado's own API calls show up in the list (passwords/tokens/emails are redacted). That is how new features
(e.g. a direct request-details endpoint, chat sending) get wired up. Turn it off when done.

## Running it on a server instead (optional)

1. **Server**: any VPS with Ubuntu 24.04 and 1–2 GB RAM (add swap on 1 GB before setup).
2. **Domain**: add an **A record** `bot` → your server's IPv4 where you manage `hawarystore.com` (gives `bot.hawarystore.com`).
3. Copy this folder to the server and run: `sudo bash deploy/setup.sh bot.hawarystore.com`
   (installs Node, Caddy with automatic HTTPS, firewall, the service and daily backups).
4. Open the site → create the owner account → **Settings**: Eldorado keys, Discord webhook, Eldorado fee %.
5. Request details and chat still need the extension in one Chrome with an Eldorado tab
   (dashboard → Settings → Extension → Download, then load it unpacked and log in).

Updates later: copy the new code and run `sudo bash deploy/update.sh`.

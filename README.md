# Hawary's Bot

An Eldorado.gg boosting bot with a team dashboard, for Valorant and League of Legends.

```
server/     Node API + bot engine + SQLite (no build step, Node ≥ 23.6)
web/        Dashboard (React + Vite + Tailwind, WebGL background)
extension/  Chrome extension: reads request pages, records Eldorado calls, sends chat messages
deploy/     Server setup (systemd + Caddy HTTPS + daily backups)
ELDORADO_API.md   What the official Seller API can do (from Swagger)
legacy/     First Python prototype (not used)
```

## How it works

1. **Server** polls Eldorado's official Seller API for new boosting requests and orders (Start/Stop button).
2. The request list has no ranks, so the **extension** (in any teammate's Chrome with an Eldorado tab) opens new
   requests in a hidden window and reads *Current Rank / RR / Desired Rank / Server / Completion Method*.
3. The server prices the request using **Pricing** (per game) and sends the offer through the API, with the
   opening message (A/B test). In **dry run** it only logs what it *would* offer.
4. New orders → Discord alert → a worker opens the **Order board** and clicks **Take**. Deliver/cancel/extend go
   through the API. Accepted/delivered/received/follow-up chat messages are queued for the extension.
5. Money: Eldorado fee % (Settings) + each worker's pay type (% / per division / fixed / manual) → profit,
   what you owe each worker, payouts. Workers only see their own money.

## Try it on your laptop (demo data)

```bash
npm run setup     # once
npm run build
npm run demo      # fake orders/workers in server/data/demo.db → http://127.0.0.1:8787
```
Log in as `hawary / demo1234` (owner) or `ahmed / demo1234` (worker).

Real mode: `npm start` (empty database, creates the owner account on first visit).
For live UI development: `npm start` in one terminal and `npm --prefix web run dev` in another (http://localhost:5173).

## Going live

1. **Server**: Hetzner Cloud → cheapest shared x86 with 2 vCPU / 4 GB → Ubuntu 24.04 → Germany/Finland.
2. **Domain**: add an **A record** `bot` → your server's IPv4 where you manage `hawarystore.com` (gives `bot.hawarystore.com`).
3. Copy this folder to the server and run: `sudo bash deploy/setup.sh bot.hawarystore.com`
   (installs Node, Caddy with automatic HTTPS, firewall, the service and daily backups).
4. Open the site → create the owner account → **Settings**: paste the Eldorado Client ID/Secret
   (create them with `legacy/eldorado.py create-creds`), Discord webhook, Eldorado fee %.
5. **Team & pay** → add workers. Each teammate loads the extension (Settings → Download), logs in, keeps one Eldorado tab open.
6. Open any boosting request on Eldorado once (so the extension learns the page address), keep **dry run** on,
   watch **Live offers** for a while, then turn dry run off.

Updates later: copy the new code and run `sudo bash deploy/update.sh`.

## Extension recorder

Settings → Extension → **Recorder** on, then use Eldorado normally (open requests, send a chat message).
Eldorado's own API calls show up in the list (passwords/tokens/emails are redacted). That is how new features
(e.g. a direct request-details endpoint, chat sending) get wired up. Turn it off when done.

## Tests

`npm test` runs the pricing tests (including the Platinum I → Diamond I example).

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

## Start on a new Windows PC (step by step)

GitHub only stores the code. The bot itself runs on your PC, so that PC is the "server" for now:
keep it on, with Chrome open on Eldorado. (Later it can move to a real server so it runs 24/7 and workers can log in from their own PCs.)

**A. Install (once)**
1. Install **Node.js**: go to <https://nodejs.org>, click the big **LTS** download, install with all defaults.
2. On this GitHub page click the green **Code** button → **Download ZIP**. Right-click the ZIP → **Extract All** → put it somewhere easy, e.g. `Documents\hawarys-bot`.
3. Open that folder (the one with `README.md` in it). Click the address bar at the top of the window, type `cmd`, press Enter. A black window opens.
4. In it, type these one at a time and wait for each to finish:
   ```
   npm run setup
   npm run build
   ```

**B. Start the bot** (do this every time you turn the PC on)
1. Open the folder → address bar → `cmd` → Enter → type `npm start`. Leave the black window open (closing it stops the bot).
2. In Chrome open <http://127.0.0.1:8787>. The first time, it asks you to create the **owner** account (pick a strong password).

**C. Chrome extension (once)**
1. In Chrome go to `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, pick the `extension` folder inside the bot folder.
2. Click the puzzle icon → pin **Hawary's Bot**. Click it: Dashboard address `http://127.0.0.1:8787`, your owner username + password → **Connect** → **Allow**.

**D. Connect Eldorado (once)**
1. Open <https://www.eldorado.gg>, log in to your seller account. Keep the site language **English**.
2. Click the extension → **Connect Eldorado API (owner)**. You should see ✅ *Eldorado API connected*.
3. Open any boosting request on Eldorado once (so the bot learns where request pages are).

**E. Test safely (dry run)**
1. Dashboard → **Settings**: set the Eldorado fee %, check that **Dry run** is ON. Optional: Discord webhook for "new order" alerts.
2. Dashboard → **Pricing**: set your prices, use *Test a request* on the right to check them.
3. Dashboard → **Overview** → **Start bot**. New requests now show up in **Live offers** as *would offer $X* — nothing is sent to buyers yet.
4. Settings → Extension → **Recorder ON**, then on Eldorado open a request and send one chat message to any buyer. Turn the Recorder off.
   Send Claude/the developer a screenshot of the recorded list so chat sending can be matched to Eldorado.

**F. Go live**
When the would-offer prices look right for a day: Settings → **Dry run OFF**. The bot now sends real offers with your opening message.
New orders appear on the **Order board**; click **Take** to claim one.

**Keep in mind:** the PC must not sleep (Windows Settings → System → Power → Sleep: *Never*), Chrome stays open with one Eldorado tab,
and the black `npm start` window stays open. Workers can only use it from *this* PC until it moves to a server.

**Updating later:** download the ZIP again, extract over the old folder (your data in `server\data` stays), run `npm run setup` and `npm run build`, then `npm start`.
In `chrome://extensions` click the reload ↻ icon on Hawary's Bot.

## Try it with demo data

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
   (or click **Connect Eldorado API** in the extension), Discord webhook, Eldorado fee %.
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

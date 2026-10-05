#!/usr/bin/env python3
"""Eldorado seller bot: finds boosting requests, prices + bids on them, watches
orders, auto-replies to buyers, and talks to you on Telegram."""
import sys
import time
import tomllib
import traceback
from pathlib import Path

import endpoints as ep
from eldorado import SellerClient, load_env
from pricing import Pricing, Quote
from store import Store
from telegram import Telegram

HERE = Path(__file__).parent

HELP = """Commands:
/status – what the bot is doing
/pause, /resume – stop/start bidding and order handling
/mode off|approve|auto – how bids are placed
/quote <game> <from> -> <to> [+extra] – test your pricing
   e.g. /quote valorant Gold 1 -> Platinum 2 +duo
/done <order_id> – mark order delivered
/cancel <order_id> – cancel order"""


class Bot:
    def __init__(self, cfg):
        b = cfg.get("bot", {})
        self.dry_run = b.get("dry_run", True)
        self.max_bids = b.get("max_bids_per_day", 30)
        self.poll = max(b.get("poll_seconds", 60), 30)
        self.replies = cfg.get("replies", {})
        self.pricing = Pricing(cfg)
        self.store = Store(HERE / "state.db")
        self.store.set("mode", self.store.get("mode", b.get("auto_bid", "approve")))
        env = load_env()
        if not env.get("TELEGRAM_BOT_TOKEN"):
            sys.exit("TELEGRAM_BOT_TOKEN missing in .env (see README)")
        self.tg = Telegram(env["TELEGRAM_BOT_TOKEN"], env.get("TELEGRAM_CHAT_ID"))
        self._api = None
        self._last_error = 0.0

    @property
    def api(self):
        # Lazy so /quote etc. work before Eldorado credentials exist.
        if self._api is None:
            self._api = SellerClient()
        return self._api

    @property
    def paused(self):
        return self.store.get("paused") == "1"

    # ---------- Telegram ----------

    def handle_telegram(self):
        for kind, data in self.tg.updates():
            try:
                if kind == "button":
                    self.on_button(data)
                else:
                    self.on_command(data.strip())
            except Exception as e:
                self.tg.send(f"⚠️ {e}")

    def on_command(self, text):
        cmd, _, arg = text.partition(" ")
        cmd, arg = cmd.lower().split("@")[0], arg.strip()
        if cmd in ("/start", "/help"):
            self.tg.send(HELP)
        elif cmd == "/status":
            features = {
                "find requests": ep.LIST_OPEN_REQUESTS, "place bids": ep.SUBMIT_REQUEST_OFFER,
                "order alerts": ep.LIST_MY_ORDERS, "auto-reply": ep.SEND_ORDER_MESSAGE,
                "deliver/cancel": ep.DELIVER_ORDER,
            }
            lines = [f"{'✅' if v else '⏳'} {k}" for k, v in features.items()]
            self.tg.send(f"{'⏸ PAUSED' if self.paused else '▶️ running'} | mode: {self.store.get('mode')}"
                         f"{' | DRY RUN' if self.dry_run else ''}\nBids last 24h: {self.store.bids_today()}"
                         f"/{self.max_bids}\n" + "\n".join(lines))
        elif cmd == "/pause":
            self.store.set("paused", "1")
            self.tg.send("⏸ Paused.")
        elif cmd == "/resume":
            self.store.set("paused", "0")
            self.tg.send("▶️ Resumed.")
        elif cmd == "/mode":
            if arg not in ("off", "approve", "auto"):
                return self.tg.send("Usage: /mode off|approve|auto")
            self.store.set("mode", arg)
            self.tg.send(f"Bid mode: {arg}")
        elif cmd == "/quote":
            self.cmd_quote(arg)
        elif cmd == "/done" and arg:
            self.order_action("deliver", arg)
        elif cmd == "/cancel" and arg:
            self.tg.send(f"Cancel order {arg}?", [("Yes, cancel", f"cancel:{arg}"), ("No", "noop:")])
        else:
            self.tg.send(HELP)

    def on_button(self, data):
        action, _, target = data.partition(":")
        if action == "bid":
            q = self.store.pop_pending(target)
            if q:
                self.place_bid(target, Quote(**q))
            else:
                self.tg.send("That request is no longer pending.")
        elif action == "skip":
            self.store.pop_pending(target)
            self.tg.send(f"Skipped {target}.")
        elif action == "cancel":
            self.order_action("cancel", target)

    def cmd_quote(self, arg):
        game, _, rest = arg.partition(" ")
        if "->" not in rest:
            return self.tg.send("Usage: /quote valorant Gold 1 -> Platinum 2 +duo")
        frm, to = (s.strip() for s in rest.split("->", 1))
        extras = [w[1:] for w in to.split() if w.startswith("+")]
        to = " ".join(w for w in to.split() if not w.startswith("+"))
        q = self.pricing.quote_rank(game, frm, to, extras)
        self.tg.send(f"💰 {q.summary}: ${q.price:.2f}, ~{q.eta_hours:g}h" if q
                     else "No price: unknown game/rank/extra, wrong direction, or above max_rank.")

    # ---------- Eldorado ----------

    def check_requests(self):
        mode = self.store.get("mode")
        if not ep.LIST_OPEN_REQUESTS or self.paused or mode == "off":
            return
        seeded = self.store.get("seeded_requests") == "1"
        for raw in self.api.request("GET", ep.LIST_OPEN_REQUESTS) or []:
            req = ep.parse_request(raw)
            if not self.store.first_time("request", req["id"]) or not seeded:
                continue
            q = self.pricing.quote(req)
            if q is None:
                continue  # not something we offer
            if mode == "auto" and self.store.bids_today() < self.max_bids:
                self.place_bid(req["id"], q)
            else:
                self.store.add_pending(req["id"], q)
                self.tg.send(f"📥 New request: {q.summary}\nYour price: ${q.price:.2f}, ~{q.eta_hours:g}h",
                             [(f"Bid ${q.price:.2f}", f"bid:{req['id']}"), ("Skip", f"skip:{req['id']}")])
        self.store.set("seeded_requests", "1")  # first pass only marks existing requests as seen

    def place_bid(self, request_id, q):
        if self.dry_run:
            return self.tg.send(f"🧪 [DRY RUN] would bid ${q.price:.2f} on {q.summary}")
        if not ep.SUBMIT_REQUEST_OFFER:
            return self.tg.send("⏳ Bidding endpoint not set up yet.")
        path = ep.SUBMIT_REQUEST_OFFER.format(request_id=request_id)
        self.api.request("POST", path, ep.offer_body(request_id, q, self.replies.get("bid_message", "")))
        self.store.record_bid(request_id, q.price)
        self.tg.send(f"✅ Bid ${q.price:.2f} on {q.summary}")

    def check_orders(self):
        if not ep.LIST_MY_ORDERS or self.paused:
            return
        seeded = self.store.get("seeded_orders") == "1"
        for raw in self.api.request("GET", ep.LIST_MY_ORDERS) or []:
            o = ep.parse_order(raw)
            if not self.store.first_time("order", o["id"]) or not seeded:
                continue
            self.tg.send(f"🛒 NEW ORDER {o['id']}\n{o['title']}\nBuyer: {o['buyer']} | ${o['price']}\n"
                         f"/done {o['id']} when finished")
            template = self.replies.get("order_started")
            if template and ep.SEND_ORDER_MESSAGE:
                text = template.format(buyer=o["buyer"], title=o["title"], order_id=o["id"])
                if self.dry_run:
                    self.tg.send(f"🧪 [DRY RUN] would message buyer: {text}")
                else:
                    self.api.request("POST", ep.SEND_ORDER_MESSAGE.format(order_id=o["id"]), ep.message_body(text))
        self.store.set("seeded_orders", "1")

    def order_action(self, action, order_id):
        if self.dry_run:
            return self.tg.send(f"🧪 [DRY RUN] would {action} order {order_id}")
        if action == "deliver":
            self.api.request("PUT", ep.DELIVER_ORDER.format(order_id=order_id), ep.deliver_body(order_id))
        else:
            self.api.request("PUT", ep.CANCEL_ORDER.format(order_id=order_id), ep.cancel_body(order_id, ""))
        self.tg.send(f"✅ Order {order_id}: {action} sent.")

    # ---------- Loop ----------

    def safe(self, fn):
        try:
            fn()
        except Exception as e:
            traceback.print_exc()
            if time.time() - self._last_error > 600:  # don't spam Telegram with repeat errors
                self._last_error = time.time()
                try:
                    self.tg.send(f"⚠️ {fn.__name__} failed: {e}")
                except Exception:
                    pass

    def run(self):
        self.safe(lambda: self.tg.send(f"🤖 Bot started{' (DRY RUN)' if self.dry_run else ''}. /help"))
        last_poll = 0.0
        while True:
            self.safe(self.handle_telegram)  # long-polls ~5s, sets the loop pace
            if time.time() - last_poll >= self.poll:
                last_poll = time.time()
                self.safe(self.check_requests)
                self.safe(self.check_orders)


def main():
    cfg_path = HERE / "config.toml"
    if not cfg_path.exists():
        sys.exit("No config.toml. Run: cp config.example.toml config.toml  (then edit it)")
    with open(cfg_path, "rb") as f:
        Bot(tomllib.load(f)).run()


if __name__ == "__main__":
    main()

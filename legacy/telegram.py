"""Minimal Telegram Bot API client (long polling, no server needed)."""
import json
import urllib.request


class Telegram:
    def __init__(self, token, chat_id=None):
        self.base = f"https://api.telegram.org/bot{token}/"
        self.chat_id = str(chat_id) if chat_id else None
        self.offset = 0

    def _call(self, method, **params):
        req = urllib.request.Request(self.base + method, data=json.dumps(params).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=params.get("timeout", 0) + 15) as r:
            res = json.load(r)
        if not res.get("ok"):
            raise RuntimeError(f"Telegram {method}: {res}")
        return res["result"]

    def send(self, text, buttons=None):
        """buttons: list of (label, callback_data) shown in one row."""
        if not self.chat_id:
            print("[telegram not linked]", text)
            return
        params = {"chat_id": self.chat_id, "text": text}
        if buttons:
            params["reply_markup"] = {"inline_keyboard": [[{"text": t, "callback_data": d} for t, d in buttons]]}
        self._call("sendMessage", **params)

    def updates(self, timeout=5):
        """Yields ("text", str) or ("button", data). Ignores everyone except the owner chat."""
        for u in self._call("getUpdates", offset=self.offset, timeout=timeout,
                            allowed_updates=["message", "callback_query"]):
            self.offset = u["update_id"] + 1
            if "message" in u:
                chat = str(u["message"]["chat"]["id"])
                if not self.chat_id:
                    print(f"Telegram chat id: {chat}  →  add TELEGRAM_CHAT_ID={chat} to .env and restart")
                    self._call("sendMessage", chat_id=chat,
                               text=f"Your chat id is {chat}. Add TELEGRAM_CHAT_ID={chat} to .env and restart the bot.")
                elif chat == self.chat_id:
                    yield "text", u["message"].get("text", "")
            elif "callback_query" in u:
                q = u["callback_query"]
                if self.chat_id and str(q["message"]["chat"]["id"]) == self.chat_id:
                    self._call("answerCallbackQuery", callback_query_id=q["id"])
                    yield "button", q.get("data", "")

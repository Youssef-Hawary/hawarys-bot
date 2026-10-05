#!/usr/bin/env python3
"""Eldorado.gg seller API client + credential management CLI.

Credential management (create/list/revoke) uses your browser session cookie
(__Host-EldoradoIdToken). Everything else uses a short-lived Bearer token
obtained from ClientId/ClientSecret, refreshed automatically.

Secrets live in .env next to this file (chmod 600). Never commit it.
"""
import argparse
import json
import os
import stat
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "https://eldorado.gg"
ENV_PATH = Path(__file__).with_name(".env")
USER_AGENT = "eldorado-seller-bot/0.1"


# ---------- .env handling ----------

def load_env():
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    # Real environment variables take precedence.
    for k in ("ELDORADO_SESSION", "ELDORADO_CLIENT_ID", "ELDORADO_CLIENT_SECRET",
              "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def save_env(updates):
    env = {}
    if ENV_PATH.exists():
        env = load_env()
    env.update(updates)
    ENV_PATH.write_text("".join(f"{k}={v}\n" for k, v in env.items()))
    ENV_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)


# ---------- HTTP ----------

class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


def _request(method, path, *, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE_URL + path, data=data, method=method)
    req.add_header("User-Agent", USER_AGENT)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, e.read().decode(errors="replace")) from None
    return json.loads(raw) if raw else None


def _get(d, key):
    """Docs show both camelCase and PascalCase; accept either."""
    return d.get(key) or d.get(key[0].upper() + key[1:])


# ---------- Credential management (session cookie) ----------

def _session_headers(env):
    token = env.get("ELDORADO_SESSION")
    if not token:
        sys.exit("ELDORADO_SESSION missing. Copy the __Host-EldoradoIdToken cookie "
                 "from your logged-in browser into .env (see README).")
    return {"Cookie": f"__Host-EldoradoIdToken={token}"}


def create_credentials(name, days):
    env = load_env()
    res = _request("POST", "/api/client-credentials",
                   body={"name": name, "expiration": f"{days}.00:00:00"},
                   headers=_session_headers(env))
    save_env({"ELDORADO_CLIENT_ID": _get(res, "clientId"),
              "ELDORADO_CLIENT_SECRET": _get(res, "clientSecret")})
    print(f"Created credential '{name}' ({days} days). ClientId + secret saved to {ENV_PATH}")


def list_credentials():
    return _request("GET", "/api/client-credentials", headers=_session_headers(load_env()))


def expiration_options():
    return _request("GET", "/api/client-credentials/expirationOptions",
                    headers=_session_headers(load_env()))


def revoke_credentials(cred_id):
    _request("DELETE", f"/api/client-credentials/{cred_id}",
             headers=_session_headers(load_env()))


# ---------- Seller client (Bearer token) ----------

class SellerClient:
    def __init__(self, client_id=None, client_secret=None):
        env = load_env()
        self.client_id = client_id or env.get("ELDORADO_CLIENT_ID")
        self.client_secret = client_secret or env.get("ELDORADO_CLIENT_SECRET")
        if not (self.client_id and self.client_secret):
            sys.exit("ELDORADO_CLIENT_ID / ELDORADO_CLIENT_SECRET missing. "
                     "Run: ./eldorado.py create-creds")
        self._token = None
        self._expires_at = 0.0

    def _ensure_token(self):
        # Refresh 60s early so a request never goes out with a dying token.
        if self._token and time.time() < self._expires_at - 60:
            return
        res = _request("POST", "/api/authentication/seller/token",
                       body={"clientId": self.client_id, "clientSecret": self.client_secret})
        self._token = _get(res, "accessToken")
        self._expires_at = time.time() + (_get(res, "expiresIn") or 900)

    def request(self, method, path, body=None):
        self._ensure_token()
        try:
            return _request(method, path, body=body,
                            headers={"Authorization": f"Bearer {self._token}"})
        except ApiError as e:
            if e.status != 401:
                raise
            # Token may have been invalidated server-side; retry once with a fresh one.
            self._token = None
            self._ensure_token()
            return _request(method, path, body=body,
                            headers={"Authorization": f"Bearer {self._token}"})

    def deliver_order(self, order_id, payload):
        return self.request("PUT", f"/api/orders/me/{order_id}/deliver", payload)

    def cancel_order(self, order_id, payload):
        return self.request("PUT", f"/api/orders/me/{order_id}/cancel", payload)


# ---------- CLI ----------

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-creds", help="create client credentials (needs session cookie)")
    c.add_argument("--name", default="seller-bot")
    c.add_argument("--days", type=int, default=90, choices=[1, 14, 30, 90, 365])
    sub.add_parser("list-creds", help="list active credentials")
    sub.add_parser("expiration-options", help="show allowed expiration values")
    r = sub.add_parser("revoke-creds", help="revoke a credential by id (from list-creds)")
    r.add_argument("id")
    sub.add_parser("test-token", help="verify ClientId/Secret by fetching an access token")
    raw = sub.add_parser("call", help="raw authenticated call, for exploring endpoints")
    raw.add_argument("method")
    raw.add_argument("path", help="e.g. /api/orders/me/...")
    raw.add_argument("--json", help="request body as JSON string")
    args = p.parse_args()

    try:
        if args.cmd == "create-creds":
            create_credentials(args.name, args.days)
        elif args.cmd == "list-creds":
            print(json.dumps(list_credentials(), indent=2))
        elif args.cmd == "expiration-options":
            print(json.dumps(expiration_options(), indent=2))
        elif args.cmd == "revoke-creds":
            revoke_credentials(args.id)
            print("Revoked.")
        elif args.cmd == "test-token":
            client = SellerClient()
            client._ensure_token()
            print(f"OK — token valid for ~{int(client._expires_at - time.time())}s")
        elif args.cmd == "call":
            body = json.loads(args.json) if args.json else None
            print(json.dumps(SellerClient().request(args.method.upper(), args.path, body), indent=2))
    except ApiError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()

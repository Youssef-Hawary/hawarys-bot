"""Small SQLite state: what we've already seen, pending approvals, bids placed."""
import json
import sqlite3
import time


class Store:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS seen (kind TEXT, id TEXT, ts REAL, PRIMARY KEY (kind, id));
            CREATE TABLE IF NOT EXISTS pending (request_id TEXT PRIMARY KEY, quote TEXT, ts REAL);
            CREATE TABLE IF NOT EXISTS bids (request_id TEXT PRIMARY KEY, price REAL, ts REAL);
            CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
        """)

    def first_time(self, kind, id_):
        cur = self.db.execute("INSERT OR IGNORE INTO seen VALUES (?, ?, ?)", (kind, str(id_), time.time()))
        self.db.commit()
        return cur.rowcount == 1

    def add_pending(self, request_id, quote):
        self.db.execute("INSERT OR REPLACE INTO pending VALUES (?, ?, ?)",
                        (str(request_id), json.dumps(quote.__dict__), time.time()))
        self.db.commit()

    def pop_pending(self, request_id):
        row = self.db.execute("SELECT quote FROM pending WHERE request_id = ?", (request_id,)).fetchone()
        self.db.execute("DELETE FROM pending WHERE request_id = ?", (request_id,))
        self.db.commit()
        return json.loads(row[0]) if row else None

    def record_bid(self, request_id, price):
        self.db.execute("INSERT OR REPLACE INTO bids VALUES (?, ?, ?)", (str(request_id), price, time.time()))
        self.db.commit()

    def bids_today(self):
        return self.db.execute("SELECT COUNT(*) FROM bids WHERE ts > ?", (time.time() - 86400,)).fetchone()[0]

    def get(self, k, default=None):
        row = self.db.execute("SELECT v FROM kv WHERE k = ?", (k,)).fetchone()
        return row[0] if row else default

    def set(self, k, v):
        self.db.execute("INSERT OR REPLACE INTO kv VALUES (?, ?)", (k, str(v)))
        self.db.commit()

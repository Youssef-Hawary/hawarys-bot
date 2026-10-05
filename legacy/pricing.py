"""Turns a boosting request into a price + ETA using config.toml."""
from dataclasses import dataclass


@dataclass
class Quote:
    price: float
    eta_hours: float
    summary: str


def _norm(s):
    return " ".join(s.lower().split())


class Pricing:
    def __init__(self, cfg):
        self.games = cfg.get("games", {})

    def game(self, name):
        n = _norm(name or "")
        for key, g in self.games.items():
            if n in (_norm(key), _norm(g.get("name", ""))):
                return g
        return None

    def quote(self, req):
        """Returns a Quote, or None if we don't offer / can't safely price it."""
        if req.get("from_rank") and req.get("to_rank"):
            return self.quote_rank(req["game"], req["from_rank"], req["to_rank"], req.get("extras", ()))
        return self.quote_fixed(req["game"], req.get("service", ""), req.get("extras", ()))

    def quote_rank(self, game_name, from_rank, to_rank, extras=()):
        g = self.game(game_name)
        rb = g and g.get("rank_boost")
        if not rb:
            return None
        ranks = [_norm(r) for r in rb["ranks"]]
        try:
            i, j = ranks.index(_norm(from_rank)), ranks.index(_norm(to_rank))
        except ValueError:
            return None
        max_rank = rb.get("max_rank")
        if j <= i or (max_rank and j > ranks.index(_norm(max_rank))):
            return None
        total = 0.0
        for k in range(i, j):
            step = rb["step_price"].get(rb["ranks"][k].split()[0])
            if step is None:
                return None  # unpriced tier: never guess a price
            total += step
        mult = self._extras_mult(g, extras)
        if mult is None:
            return None
        price = max(total * mult, g.get("min_price", 0))
        eta = (j - i) * g.get("eta_hours_per_step", 4)
        extra_txt = f" +{'+'.join(extras)}" if extras else ""
        return Quote(round(price, 2), eta, f"{g['name']} {rb['ranks'][i]} → {rb['ranks'][j]}{extra_txt}")

    def quote_fixed(self, game_name, service, extras=()):
        g = self.game(game_name)
        if not g:
            return None
        for name, svc in g.get("fixed", {}).items():
            if _norm(name) == _norm(service):
                mult = self._extras_mult(g, extras)
                if mult is None:
                    return None
                return Quote(round(svc["price"] * mult, 2), svc.get("eta_hours", 24), f"{g['name']} {name}")
        return None

    @staticmethod
    def _extras_mult(g, extras):
        mult = 1.0
        known = {k.lower(): v for k, v in g.get("extras", {}).items()}
        for e in extras:
            if e.lower() not in known:
                return None  # unknown extra: leave it for manual review
            mult *= known[e.lower()]
        return mult

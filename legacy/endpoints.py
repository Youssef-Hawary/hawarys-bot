"""Every Eldorado endpoint the bot uses, in one place.

Only DELIVER_ORDER and CANCEL_ORDER are documented (Eldorado's email).
Everything set to None is UNKNOWN until we capture the real request from the
website (DevTools → Network). The bot skips any feature whose endpoint is None.
"""

# --- Documented ---
DELIVER_ORDER = "/api/orders/me/{order_id}/deliver"   # PUT
CANCEL_ORDER = "/api/orders/me/{order_id}/cancel"     # PUT

# --- Unknown: fill in from DevTools ---
LIST_OPEN_REQUESTS = None     # GET  boosting requests posted by buyers
SUBMIT_REQUEST_OFFER = None   # POST offer on a request, template with {request_id}
LIST_MY_ORDERS = None         # GET  my seller orders
SEND_ORDER_MESSAGE = None     # POST chat message on an order, template with {order_id}


def parse_request(raw):
    """Eldorado request JSON → {id, game, service, from_rank, to_rank, extras, buyer}."""
    raise NotImplementedError("Need a real boosting-request response to map fields")


def parse_order(raw):
    """Eldorado order JSON → {id, status, title, buyer, price}."""
    raise NotImplementedError("Need a real order response to map fields")


def offer_body(request_id, quote, message):
    raise NotImplementedError("Need a captured offer submission to know the body")


def message_body(text):
    raise NotImplementedError("Need a captured chat message to know the body")


def deliver_body(order_id):
    # Email shows the body as '{ ... }' without details; capture a real one.
    return {}


def cancel_body(order_id, reason):
    return {}

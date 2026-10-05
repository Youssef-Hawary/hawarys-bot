# Eldorado Seller API: what matters for Hawary's Bot

Source: official seller Swagger (`https://www.eldorado.gg/swagger/seller/swagger.json`, login required), read 2026-10-05.
Base URL `https://www.eldorado.gg/`. Auth: `Authorization: Bearer <token>` from `/api/authentication/seller/token`.
Every operation lists a required header `swagger: Swager request`. It is probably only for Swagger UI, but send it if calls fail without it.

## Boosting requests (buyer posts → we offer)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/boostingOffers/me/boostingRequests/received` | `filter` = `ActiveRequests` / `OfferSubmitted` / `OfferWon` / `OfferLost`; `gameId`; cursor paging (`cursorValue`, `cursorColumn`, `pageDirection`, `pageSize` ≤ 50) |
| POST | `/api/boostingOffers` | Send an offer (body below) → `BoostingOfferGetPublicDTO` |
| PUT | `/api/boostingOffers/{offerId}/update` | Same fields as POST details |
| DELETE | `/api/boostingOffers/{offerId}/delete` | Withdraw offer |
| PUT | `/api/boostingOffers/boostingRequests/{id}/viewer` | Marks the request as viewed |
| POST | `/api/boostingOffers/boostingRequests/{id}/createConversationForSeller` | Returns `talkJsConversationId` (chat is TalkJS) |
| GET | `/api/boostingOffers/me/boostingSubscriptions` | Which game/category requests we receive |
| POST | `/api/boostingOffers/me/boostingSubscription/create` | `{ boostingId: { gameId, boostingCategoryId } }` |
| DELETE | `/api/boostingOffers/me/boostingSubscription/{gameId}/{boostingCategoryId}` | Unsubscribe = turn a service off at Eldorado level |
| PUT | `/api/boostingUser/{buyerId}/mute` / `unmute` | Blacklist a buyer |

**Request list item** (`BoostingRequestListItemSellerDTO`): `id, gameId, boostingCategoryId, boostingCategoryTitle, createdDate, buyerId, buyerUsername, isBuyerMuted`.
⚠️ It has NO ranks, RR/LP, region, duo or description. To price a request we need the details from the website,
so the extension must capture the endpoint the site uses for request details.

**Offer body** (`BoostingOfferPostPrivateDTO`):
```json
{ "details": {
    "boostingRequestId": "<uuid>",
    "guaranteedDeliveryTime": "Day1",
    "pricing": { "quantity": 1, "minQuantity": 1, "pricePerUnit": { "amount": 22.0, "currency": "USD" } },
    "message": "Hi! ..."
} }
```
`guaranteedDeliveryTime` enum: Minute5, Minute20, Hour1, Hour2, Hour3, Hour5, Hour8, Hour12, Day1, Day2, Day3, Day5, Day7, Day10, Day14, Day28, Day45, Day60, Day80, Day100.
The bot rounds our hours UP to the next value.
The offer has a `message` field, so the opening message goes out with the offer through the API. Follow-ups and order messages need the extension (TalkJS).

## Orders

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/orders/me/seller/orders` | `displayFilter=DisplaySellingOrders` (required), `orderState` (Paid, Disputed, Delivered, Received, Completed, Canceled, PendingReview), `gameId`, `category`, cursor paging |
| PUT | `/api/v1/orders/me/{orderId}/deliver` | no body |
| POST | `/api/v1/orders/me/{orderId}/cancel` | `{ reason: SellerCancelationReason, message? }` |
| POST | `/api/v1/orders/me/{orderId}/extend-delivery-time` | `{ time: Minute5…Hour6, reason: WaitingForBuyer/InGameCoordination/PreparationDelay/TechnicalIssue, message? }` |
| GET | `/api/v1/orders/me/sold-order-data`, `/order-data`, `/invoice/generate` | `fromDate`, `untilDate`; response shape not documented |

**Order** (`OrderPrivateViewModel`): `id, buyerUsername, totalPrice{amount,currency}, state{state,createdDate}, stateLogs[], createdDate,
deliveryTime (timespan), deliveryStartedDate, talkJsConversationId, orderOfferDetails{ boostingRequestId, offerTitle, description, gameId, gameCategoryTitle, guaranteedDeliveryTime }, review{feedbackRating, reviewMessage}, latestDispute, cancelation`.
→ deadline = createdDate + deliveryTime. Eldorado's fee is NOT in the order, so it is a manual % setting.

## Other

- `PUT /api/offerUser/me/switchOnline` / `switchOffline`: Start/Stop can mirror this.
- `GET /api/notifications/me` (events include BoostingRequestCreated, BoostingOfferCreated, OrderCreated, OrderDelivered, OrderReceived, OrderDisputed, BuyerContactedSeller).
- Currency enum has USD/EUR/… but **no EGP**, so EGP is display-only on our side (free exchange-rate API).
- No chat/message endpoints, so the extension handles chat (TalkJS) and request details.

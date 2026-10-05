// Official Eldorado Seller API client. See ../../ELDORADO_API.md for the endpoint notes.
import { getSetting } from './db.ts';

const BASE = 'https://www.eldorado.gg';

export class EldoradoError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Eldorado HTTP ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

export type Creds = { clientId: string; clientSecret: string };
export const getCreds = () => getSetting<Creds>('eldorado', { clientId: '', clientSecret: '' });

let token: string | null = null;
let tokenExpires = 0;
let tokenFor = '';

export function hasCreds() {
  const c = getCreds();
  return Boolean(c.clientId && c.clientSecret);
}

async function raw(method: string, path: string, body?: unknown, auth?: string) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'HawarysBot/1.0',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new EldoradoError(res.status, text);
  return text ? JSON.parse(text) : null;
}

async function ensureToken() {
  const c = getCreds();
  if (!c.clientId || !c.clientSecret) throw new Error('Eldorado API keys not set (Settings → Eldorado)');
  // Refresh 60s early; also refresh if the keys changed in Settings.
  if (token && tokenFor === c.clientId && Date.now() < tokenExpires - 60_000) return token;
  const res = await raw('POST', '/api/authentication/seller/token', { clientId: c.clientId, clientSecret: c.clientSecret });
  token = res.accessToken ?? res.AccessToken;
  tokenExpires = Date.now() + 1000 * (res.expiresIn ?? res.ExpiresIn ?? 900);
  tokenFor = c.clientId;
  return token!;
}

async function call(method: string, path: string, body?: unknown) {
  try {
    return await raw(method, path, body, await ensureToken());
  } catch (e) {
    if (e instanceof EldoradoError && e.status === 401) {
      token = null; // revoked or expired early: retry once with a fresh token
      return raw(method, path, body, await ensureToken());
    }
    throw e;
  }
}

const qs = (o: Record<string, string | number | undefined>) =>
  '?' + Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export type BoostingRequestItem = {
  id: string; gameId: string; boostingCategoryId: string; boostingCategoryTitle: string;
  createdDate: string; buyerId: string; buyerUsername: string; isBuyerMuted: boolean;
};

export const eldorado = {
  testToken: async () => { token = null; await ensureToken(); return true; },
  /** Refreshes the login token shortly before it expires, so offers never wait for a new one. */
  warmToken: async () => { if (!token || Date.now() > tokenExpires - 120_000) { token = null; await ensureToken(); } },

  listRequests: (filter: 'ActiveRequests' | 'OfferSubmitted' | 'OfferWon' | 'OfferLost' = 'ActiveRequests', cursorValue?: string) =>
    call('GET', `/api/boostingOffers/me/boostingRequests/received${qs({ filter, pageSize: 50, cursorValue })}`) as
      Promise<{ results: BoostingRequestItem[] | null; nextPageCursor: string | null }>,

  createOffer: (boostingRequestId: string, amount: number, delivery: string, message: string) =>
    call('POST', '/api/boostingOffers', {
      details: {
        boostingRequestId,
        guaranteedDeliveryTime: delivery,
        pricing: { quantity: 1, minQuantity: 1, pricePerUnit: { amount, currency: 'USD' } },
        message,
      },
    }),

  markViewed: (id: string) => call('PUT', `/api/boostingOffers/boostingRequests/${id}/viewer`),
  createConversation: (id: string) => call('POST', `/api/boostingOffers/boostingRequests/${id}/createConversationForSeller`),
  subscriptions: () => call('GET', '/api/boostingOffers/me/boostingSubscriptions'),
  subscribe: (gameId: string, boostingCategoryId: string) =>
    call('POST', '/api/boostingOffers/me/boostingSubscription/create', { boostingId: { gameId, boostingCategoryId } }),
  unsubscribe: (gameId: string, boostingCategoryId: string) =>
    call('DELETE', `/api/boostingOffers/me/boostingSubscription/${gameId}/${boostingCategoryId}`),

  listOrders: (orderState?: string, cursorValue?: string) =>
    call('GET', `/api/v1/orders/me/seller/orders${qs({ displayFilter: 'DisplaySellingOrders', orderState, pageSize: 50, cursorValue })}`) as
      Promise<{ results: any[] | null; nextPageCursor: string | null }>,
  deliver: (orderId: string) => call('PUT', `/api/v1/orders/me/${orderId}/deliver`),
  cancel: (orderId: string, reason: string, message?: string) => call('POST', `/api/v1/orders/me/${orderId}/cancel`, { reason, message }),
  extend: (orderId: string, time: string, reason: string, message?: string) =>
    call('POST', `/api/v1/orders/me/${orderId}/extend-delivery-time`, { time, reason, message }),

  muteBuyer: (buyerId: string) => call('PUT', `/api/boostingUser/${buyerId}/mute`),
  unmuteBuyer: (buyerId: string) => call('PUT', `/api/boostingUser/${buyerId}/unmute`),
  switchOnline: () => call('PUT', '/api/offerUser/me/switchOnline'),
  switchOffline: () => call('PUT', '/api/offerUser/me/switchOffline'),
};

import type { ChatRoom } from "@comeplayers/chat-core";
import { accessToken, apiUrl } from "./runtime";
import type {
  AccountProfile,
  CheckoutOrder,
  CommunityBundle,
  FriendsResult,
  MarketplaceCategory,
  MarketplaceSearchResult,
  PaymentResult,
  TournamentResult,
  TournamentRegistration,
  VoiceToken,
} from "./types";

function deadline<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Connection timed out. Please try again.")), 20000);
    operation.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

type ApiErrorBody = { error?: string; message?: string };

export async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = false
): Promise<T> {
  let token: string | null = null;
  if (authenticated) {
    token = await deadline(accessToken(false));
    if (!token) throw new Error("Sign in to continue.");
  }

  const createHeaders = (accessToken: string | null) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers || {}).forEach((value, key) => {
      headers[key] = value;
    });
    if (
      init.body &&
      !(init.body instanceof FormData) &&
      !headers["content-type"] &&
      !headers["Content-Type"]
    ) {
      headers["Content-Type"] = "application/json";
    }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  };

  const send = async (accessToken: string | null) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (init.signal?.aborted) controller.abort();
    init.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 20000);
    try {
      const response = await fetch(`${apiUrl}${path}`, { ...init, headers: createHeaders(accessToken), signal: controller.signal });
      const body = await response.json() as ApiErrorBody & T;
      return { response, body };
    } catch (error) { if (controller.signal.aborted) throw new Error("Connection timed out. Please try again."); throw error; }
    finally { clearTimeout(timer); init.signal?.removeEventListener("abort", cancel); }
  };

  let result = await send(token);
  if (authenticated && result.response.status === 401) {
    token = await deadline(accessToken(true));
    if (token) result = await send(token);
  }
  const { response, body } = result;
  if (!response.ok) {
    throw new Error(body.error || body.message || `Request failed (${response.status}).`);
  }
  return body;
}

export function searchMarketplace(
  query: string,
  category = "",
  cursor: number | null = null,
  imagesOnly = true,
): Promise<MarketplaceSearchResult & { nextCursor: number | null }> {
  return request(`/api/marketplace/catalog?q=${encodeURIComponent(query.trim())}&category=${encodeURIComponent(category)}&images=${imagesOnly ? "only" : "all"}${cursor ? `&cursor=${cursor}` : ""}`);
}

export async function loadMarketplaceCategories(): Promise<MarketplaceCategory[]> {
  const result = await request<{ categories: MarketplaceCategory[] }>("/api/game-categories");
  return result.categories || [];
}

export async function createCheckoutOrder(
  productId: number,
  quantity: number,
  quoteToken: string,
  couponCode = ""
): Promise<CheckoutOrder> {
  const result = await request<{ ok: boolean; order: CheckoutOrder }>(
    "/api/checkout/create-order",
    {
      method: "POST",
      body: JSON.stringify({ productId, quantity, quoteToken, couponCode, paymentMethod: "doku" }),
    },
    true
  );
  return result.order;
}

export function createPayment(
  orderId: number,
  paymentMethod: "qris" | "bank_transfer" | "card" | "doku_wallet"
): Promise<PaymentResult> {
  return request<PaymentResult>(
    "/api/doku/create-payment",
    { method: "POST", body: JSON.stringify({ orderId, paymentMethod, returnTo: "mobile" }) },
    true
  );
}

export function payWithWallet(orderId: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    "/api/orders/pay-with-wallet",
    { method: "POST", body: JSON.stringify({ orderId }) },
    true
  );
}

export function loadFriends(): Promise<FriendsResult> {
  return request<FriendsResult>("/api/messages/friends", {}, true);
}

export function requestFriend(identifier: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    "/api/messages/friends",
    { method: "POST", body: JSON.stringify({ action: "request", identifier }) },
    true
  );
}

export function updateFriend(
  friendId: string,
  action: "accept" | "decline" | "remove" | "cancel"
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/messages/friends/${encodeURIComponent(friendId)}`,
    { method: "PATCH", body: JSON.stringify({ action }) },
    true
  );
}

export async function openFriendChat(friendId: string): Promise<ChatRoom> {
  const result = await request<{ room: ChatRoom }>(
    `/api/messages/friends/${encodeURIComponent(friendId)}/chat`,
    { method: "POST", body: JSON.stringify({}) },
    true
  );
  return result.room;
}

export function loadCommunity(roomId: string): Promise<CommunityBundle> {
  return request<CommunityBundle>(
    `/api/messages/communities/by-room/${encodeURIComponent(roomId)}`,
    {},
    true
  );
}

export function createCommunityChannel(
  communityId: string,
  name: string,
  type: "text" | "voice" = "voice"
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/messages/communities/${encodeURIComponent(communityId)}/channels`,
    { method: "POST", body: JSON.stringify({ name, type }) },
    true
  );
}

export function createVoiceToken(roomId: string, channelId: string): Promise<VoiceToken> {
  return request<VoiceToken>(
    "/api/messages/livekit/token",
    { method: "POST", body: JSON.stringify({ roomId, channelId }) },
    true
  );
}

export async function loadAccountProfile(): Promise<AccountProfile> {
  const result = await request<{ profile: AccountProfile }>("/api/account/avatar", {}, true);
  return result.profile;
}

export async function uploadAvatar(input: {
  uri: string;
  name: string;
  type: string;
}): Promise<AccountProfile> {
  const form = new FormData();
  form.append("file", input as unknown as Blob);
  const result = await request<{ profile: AccountProfile }>(
    "/api/account/avatar",
    { method: "POST", body: form },
    true
  );
  return result.profile;
}

export async function loadTournaments(authenticated = false): Promise<TournamentResult> {
  return request<TournamentResult>("/api/tournaments", {}, authenticated);
}

export async function joinTournament(
  tournamentId: string,
  gameUsername: string
): Promise<TournamentRegistration> {
  const result = await request<{ registration: TournamentRegistration }>(
    `/api/tournaments/${encodeURIComponent(tournamentId)}/join`,
    {
      method: "POST",
      body: JSON.stringify({ gameUsername }),
    },
    true
  );
  return result.registration;
}

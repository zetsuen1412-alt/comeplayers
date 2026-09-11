import { supabase } from "@/lib/supabase";

export type MarketplaceEventType =
  | "offer_view"
  | "product_view"
  | "checkout_start";

export type MarketplaceEventPayload = {
  event_type: MarketplaceEventType;
  user_id?: string | null;
  session_id?: string | null;
  seller_id?: string | null;
  product_id?: number | string | null;
  order_id?: number | string | null;
  game_slug?: string | null;
  game_name?: string | null;
  category_slug?: string | null;
  category_name?: string | null;
  page_path?: string | null;
  referrer?: string | null;
  metadata?: Record<string, unknown>;
};

const SESSION_KEY = "comeplayers_marketplace_session_id";

export function getMarketplaceSessionId() {
  if (typeof window === "undefined") return null;

  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(SESSION_KEY, generated);
  return generated;
}

export async function trackMarketplaceEvent(payload: MarketplaceEventPayload) {
  if (typeof window === "undefined") return;

  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    await fetch("/api/marketplace/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        ...payload,
        session_id: payload.session_id || getMarketplaceSessionId(),
        page_path: payload.page_path || window.location.pathname + window.location.search,
        referrer: payload.referrer || document.referrer || null,
      }),
      keepalive: true,
    });
  } catch (error) {
    console.warn("Marketplace event tracking failed:", error);
  }
}

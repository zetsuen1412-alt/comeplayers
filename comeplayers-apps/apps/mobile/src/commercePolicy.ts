export const COMMERCE_CURRENCIES = ["USD", "IDR", "EUR", "GBP", "SGD", "MYR", "PHP", "THB", "VND", "JPY", "KRW", "AUD", "CAD"] as const;
export type CommerceCurrency = typeof COMMERCE_CURRENCIES[number];
export type OrderStage = "awaiting" | "processing" | "delivered" | "completed" | "other";
export const ORDER_STAGES = [
  { key: "awaiting", label: "To pay", icon: "◷" },
  { key: "processing", label: "Processing", icon: "◇" },
  { key: "delivered", label: "Delivered", icon: "↗" },
  { key: "completed", label: "Completed", icon: "✓" },
] as const;
export function orderStage(status: unknown): OrderStage {
  const value = String(status || "").toLowerCase();
  if (["completed", "selesai"].includes(value)) return "completed";
  if (["delivered", "dikirim"].includes(value)) return "delivered";
  if (["paid", "processing", "diproses"].includes(value)) return "processing";
  if (["pending", "pending_payment", "pending payment", "menunggu pembayaran", "payment_verification", "payment verification", "menunggu cek pembayaran"].includes(value)) return "awaiting";
  return "other";
}
export function trustedPaymentUrl(value: string, provider: "doku" | "paypal") {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password &&
      (provider === "doku" ? host === "doku.com" || host.endsWith(".doku.com") || host === "my.dokuwallet.com"
        : host === "paypal.com" || host.endsWith(".paypal.com"));
  } catch { return false; }
}
export type CommerceLink = { kind: "topup" | "order"; id: string };
export function parseCommerceLink(value: string): CommerceLink | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "comeplayers:" || url.hostname !== "commerce" || url.username || url.password || url.port || !["", "/"].includes(url.pathname)) return null;
    const topup = url.searchParams.get("topup"), order = url.searchParams.get("order");
    if (topup && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(topup)) return { kind: "topup", id: topup };
    if (order && /^\d+$/.test(order) && Number.isSafeInteger(Number(order)) && Number(order) > 0) return { kind: "order", id: order };
    return null;
  } catch { return null; }
}
export function idrTotal(order: { total_amount?: number | string | null; total_price?: number | string | null }) {
  const value = Number(order.total_amount) || Number(order.total_price) || 0;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
export function money(value: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: ["IDR", "JPY", "KRW", "VND"].includes(currency) ? 0 : 2 }).format(value);
}

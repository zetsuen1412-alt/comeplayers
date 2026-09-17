/** Shared account status rules. Payment and delivery remain separate. */
export const ORDER_BUCKETS = {
  awaiting: ["pending", "pending_payment", "Pending Payment", "Menunggu Pembayaran", "payment_verification", "Payment Verification", "Menunggu Cek Pembayaran"],
  processing: ["paid", "processing", "Processing", "Diproses"],
  delivered: ["delivered", "Delivered", "Dikirim"],
  completed: ["completed", "Completed", "Selesai"],
  other: ["cancelled", "Cancelled", "Dibatalkan", "expired", "refunded", "Refunded", "refund_pending", "disputed", "Disputed"],
} as const;
export type OrderBucket = keyof typeof ORDER_BUCKETS;
export function orderBucket(status: unknown): OrderBucket {
  const value = String(status || "").toLowerCase();
  for (const [key, values] of Object.entries(ORDER_BUCKETS)) {
    if ((values as readonly string[]).some(item => item.toLowerCase() === value)) return key as OrderBucket;
  }
  return "other";
}
/** Only unassigned legacy orders may fall back to the verified account email. */
export function buyerOrderFilter(user: { id: string; email?: string | null }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) throw new Error("Invalid account.");
  const email = user.email?.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return email ? `buyer_id.eq.${user.id},and(buyer_id.is.null,buyer.eq."${email}")` : `buyer_id.eq.${user.id}`;
}
export function parseOrderPage(params: URLSearchParams) {
  const limit = Number(params.get("limit") || 100);
  const before = params.get("before");
  const bucket = params.get("bucket") || "all";
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 ||
    (before !== null && (!/^\d+$/.test(before) || !Number.isSafeInteger(Number(before)) || Number(before) < 1)) ||
    (bucket !== "all" && !Object.hasOwn(ORDER_BUCKETS, bucket))) throw new Error("Invalid order filter.");
  return { limit, before: before ? Number(before) : null, bucket: bucket as OrderBucket | "all" };
}

export type ChatRoomListScope = "all" | "direct" | "social" | "transaction";

/** PostgREST's OR expression is raw syntax, so only verified UUIDs go into it. */
export function chatRoomListFilter(userId: string, scope: ChatRoomListScope) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("Invalid chat participant.");
  }
  const participants = `or(buyer_id.eq.${userId},seller_id.eq.${userId})`;
  if (scope === "transaction") {
    return `and(${participants},or(product_id.not.is.null,order_id.not.is.null,room_type.in.(product,order)))`;
  }
  if (scope === "social") {
    return `and(${participants},product_id.is.null,order_id.is.null,or(room_type.is.null,room_type.not.in.(product,order)))`;
  }
  return `buyer_id.eq.${userId},seller_id.eq.${userId}`;
}

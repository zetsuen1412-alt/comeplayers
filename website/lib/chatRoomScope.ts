export type ChatRoomScope = {
  room_type?: string | null;
  product_id?: number | string | null;
  order_id?: number | string | null;
  product?: unknown;
  order?: unknown;
};

function hasPositiveId(value: number | string | null | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0;
}

/** Product and order conversations belong to the marketplace inbox. */
export function isTransactionChatRoom(room: ChatRoomScope | null | undefined) {
  if (!room) return false;
  const roomType = String(room.room_type || "").toLowerCase();
  return hasPositiveId(room.product_id) || hasPositiveId(room.order_id) ||
    roomType === "product" || roomType === "order" || Boolean(room.product || room.order);
}

export function isSocialChatRoom(room: ChatRoomScope | null | undefined) {
  return Boolean(room) && !isTransactionChatRoom(room);
}

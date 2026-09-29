import type { ChatRoom } from "@comeplayers/chat-core";

export function roomActivityTime(room: ChatRoom): number {
  const value = Date.parse(room.last_message_at || room.created_at || "");
  return Number.isFinite(value) ? value : 0;
}

export function compareRoomActivity(left: ChatRoom, right: ChatRoom): number {
  return roomActivityTime(right) - roomActivityTime(left) || left.id.localeCompare(right.id);
}

export function sortVisibleRooms(rooms: ChatRoom[], pinnedIds: ReadonlySet<string>): ChatRoom[] {
  return rooms.sort((left, right) => Number(pinnedIds.has(right.id)) - Number(pinnedIds.has(left.id)) || compareRoomActivity(left, right));
}

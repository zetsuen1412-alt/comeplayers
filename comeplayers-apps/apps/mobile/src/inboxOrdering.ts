import type { ChatRoom } from "@comeplayers/chat-core";

export type InboxRoom = ChatRoom & { activity_kind?: "call" | "message" | null; activity_preview?: string | null };

export function isCallActivity(room: ChatRoom): boolean {
  return (room as InboxRoom).activity_kind === "call";
}

export function callInboxPreview(room: ChatRoom): string {
  return (room as InboxRoom).activity_preview || "Panggilan";
}

export function roomActivityTime(room: ChatRoom): number {
  const value = Date.parse(room.last_message_at || room.created_at || "");
  return Number.isFinite(value) ? value : 0;
}

export function compareRoomActivity(left: ChatRoom, right: ChatRoom): number {
  return roomActivityTime(right) - roomActivityTime(left) || left.id.localeCompare(right.id);
}

export function sortVisibleRooms(rooms: ChatRoom[]): ChatRoom[] {
  return rooms.sort(compareRoomActivity);
}

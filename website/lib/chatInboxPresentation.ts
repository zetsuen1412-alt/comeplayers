type InboxRoom = {
  id: string;
  last_message?: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
};

function roomTime(room: InboxRoom) {
  const time = Date.parse(room.last_message_at || room.created_at || "");
  return Number.isFinite(time) ? time : 0;
}

export function sortInboxRooms<T extends InboxRoom>(rooms: readonly T[]): T[] {
  return [...rooms].sort((left, right) => roomTime(right) - roomTime(left) || left.id.localeCompare(right.id));
}

export function chatRoomPreview(room: InboxRoom) {
  return room.last_message?.trim() || (room.last_message_at ? "Pesan baru" : "Belum ada pesan");
}

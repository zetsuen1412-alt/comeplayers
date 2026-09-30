export type PublicProfile = {
  id: string;
  cp_number?: string | null;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  role?: string | null;
};

export type ChatAttachment = {
  id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  moderation_status?: string | null;
  deleted_at?: string | null;
  created_at?: string | null;
};

export type ChatProduct = {
  id: number;
  title?: string | null;
  image_url?: string | null;
  price?: string | number | null;
  game_name?: string | null;
  category?: string | null;
};

export type ChatOrderSummary = {
  id: number;
  status?: string | null;
  payment_status?: string | null;
  product_title?: string | null;
  created_at?: string | null;
};

export type ChatReactionSummary = {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
  users?: PublicProfile[];
};

export type ChatReplyPreview = {
  id: string;
  sender_id: string;
  message: string | null;
  deleted_at?: string | null;
  sender?: PublicProfile | null;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  receiver_id: string;
  message: string | null;
  message_type?: string | null;
  attachment_id?: number | null;
  reply_to_id?: string | null;
  moderation_status?: string | null;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  attachment?: ChatAttachment | null;
  sender?: PublicProfile | null;
  reply_to?: ChatReplyPreview | null;
  reactions?: ChatReactionSummary[];
};

export type ChatRoomMember = {
  room_id: string;
  user_id: string;
  member_role?: string | null;
  status?: string | null;
  last_read_at?: string | null;
  joined_at?: string | null;
  profile?: PublicProfile | null;
};

export type PartyInvitationSource = "direct" | "group_create" | "matchmaking";

export type PartyInvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export type PartyInvitation = {
  id: string;
  room_id: string;
  inviter_id: string;
  invitee_id: string;
  source: PartyInvitationSource;
  status: PartyInvitationStatus;
  message?: string | null;
  expires_at?: string | null;
  responded_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  room?: Pick<
    ChatRoom,
    "id" | "title" | "description" | "room_type" | "status" | "member_count"
  > | null;
  inviter?: PublicProfile | null;
  invitee?: PublicProfile | null;
};

export type ChatStreamState = {
  room_id: string;
  status: "idle" | "live";
  is_live: boolean;
  host_id: string | null;
  title: string;
  started_at: string | null;
  ended_at?: string | null;
  updated_at?: string | null;
  watch_url: string;
  embed_url?: string | null;
  playback_url?: string | null;
  signaling_channel: string;
  platforms: ["web", "desktop", "android"];
  fallback_text: string;
};

export type ChatRoom = {
  blocked_by_me?: boolean;
  contact_unavailable?: boolean;
  server?: { icon_url?: string | null } | null;
  id: string;
  buyer_id: string;
  seller_id: string;
  product_id?: number | null;
  order_id?: number | null;
  room_type?: string | null;
  title?: string | null;
  description?: string | null;
  created_by?: string | null;
  status?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_sender_id?: string | null;
  stream_status?: string | null;
  stream_host_id?: string | null;
  stream_title?: string | null;
  stream_started_at?: string | null;
  stream_ended_at?: string | null;
  stream_updated_at?: string | null;
  created_at?: string | null;
  unread_count: number;
  member_count?: number | null;
  member_role?: string | null;
  other?: PublicProfile | null;
  stream_host?: PublicProfile | null;
  stream?: ChatStreamState;
  product?: ChatProduct | null;
  order?: ChatOrderSummary | null;
  members?: ChatRoomMember[];
};

export type Conversation = {
  channel?: { id: string; name: string; channel_type: string } | null;
  room: ChatRoom & {
    me?: PublicProfile | null;
    role?: string | null;
    members?: ChatRoomMember[];
  };
  messages: ChatMessage[];
  members?: ChatRoomMember[];
};

export function profileName(profile?: PublicProfile | null): string {
  return profile?.username || profile?.full_name || "ComePlayers User";
}

export function profileCpNumber(profile?: Pick<PublicProfile, "cp_number"> | null): string | null {
  const value = profile?.cp_number;
  return typeof value === "string" && /^008\d{10}$/.test(value) ? value : null;
}

export function profileContactLabel(profile?: PublicProfile | null): string {
  const cpNumber = profileCpNumber(profile);
  return cpNumber ? `CP ${cpNumber}` : profile?.username ? `@${profile.username}` : "Kontak ComePlayers";
}

export function roomName(room?: ChatRoom | null): string {
  if (!room) return "Conversation";
  if (String(room.room_type || "").toLowerCase() === "group") {
    return room.title || "Community Group";
  }
  return profileName(room.other);
}

export type ChatRoomBucket = "all" | "live" | "group" | "trade" | "direct";

export type ChatRoomSection = {
  id: Exclude<ChatRoomBucket, "all">;
  label: string;
  hint: string;
  rooms: ChatRoom[];
  unread: number;
};

export function roomKind(room?: ChatRoom | null): "direct" | "group" {
  return String(room?.room_type || "").toLowerCase() === "group" ? "group" : "direct";
}

export function isGroupRoom(room?: ChatRoom | null): boolean {
  return roomKind(room) === "group";
}

export function isLiveRoom(room?: ChatRoom | null): boolean {
  return String(room?.stream_status || "").toLowerCase() === "live";
}

export function isTradeRoom(room?: ChatRoom | null): boolean {
  return Boolean(room?.product_id || room?.order_id || room?.product || room?.order);
}

export function isRoomLocked(room?: ChatRoom | null): boolean {
  return ["archived", "closed", "locked", "suspended"].includes(
    String(room?.status || "active").toLowerCase()
  );
}

export function roomUnreadCount(room?: ChatRoom | null): number {
  const count = Number(room?.unread_count || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function roomPreview(room?: ChatRoom | null): string {
  const lastMessage = String(room?.last_message || "").replace(/\s+/g, " ").trim();
  if (lastMessage) return lastMessage;
  if (isLiveRoom(room)) return "Live stream is active";
  if (isGroupRoom(room)) return "Community group";
  if (room?.order_id) return `Order #${room.order_id}`;
  if (room?.product_id) return `Product #${room.product_id}`;
  return "No messages yet";
}

export function createRoomSections(rooms: ChatRoom[]): ChatRoomSection[] {
  const sections: ChatRoomSection[] = [
    {
      id: "live",
      label: "Live Rooms",
      hint: "Active screen shares and watch parties",
      rooms: rooms.filter(isLiveRoom),
      unread: 0,
    },
    {
      id: "group",
      label: "Community Groups",
      hint: "ComePlayers group channels",
      rooms: rooms.filter(isGroupRoom),
      unread: 0,
    },
    {
      id: "trade",
      label: "Trade Rooms",
      hint: "Buyer, seller, and order chat",
      rooms: rooms.filter((room) => isTradeRoom(room) && !isGroupRoom(room)),
      unread: 0,
    },
    {
      id: "direct",
      label: "Direct Messages",
      hint: "Protected marketplace direct messages",
      rooms: rooms.filter((room) => !isGroupRoom(room) && !isTradeRoom(room)),
      unread: 0,
    },
  ];

  return sections.map((section) => ({
    ...section,
    unread: section.rooms.reduce((sum, room) => sum + roomUnreadCount(room), 0),
  }));
}

export function filterRooms(
  rooms: ChatRoom[],
  options: { bucket?: ChatRoomBucket; query?: string } = {}
): ChatRoom[] {
  const bucket = options.bucket || "all";
  const query = String(options.query || "").trim().toLowerCase();

  return rooms.filter((room) => {
    if (bucket === "live" && !isLiveRoom(room)) return false;
    if (bucket === "group" && !isGroupRoom(room)) return false;
    if (bucket === "trade" && !isTradeRoom(room)) return false;
    if (bucket === "direct" && (isGroupRoom(room) || isTradeRoom(room))) return false;

    if (!query) return true;
    const haystack = [
      roomName(room),
      roomPreview(room),
      room.title || "",
      room.description || "",
      profileName(room.other),
      profileCpNumber(room.other) || "",
      room.product?.title || "",
      room.order?.product_title || "",
      String(room.order_id || ""),
      String(room.product_id || ""),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export type ChatRoomRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_id: number | null;
  order_id: number | null;
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
  party_game?: string | null;
  party_mode?: string | null;
  party_rank?: string | null;
  party_platform?: string | null;
  party_region?: string | null;
  party_size?: number | null;
  party_open?: boolean | null;
  party_updated_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ChatMemberRow = {
  room_id: string;
  user_id: string;
  member_role?: string | null;
  status?: string | null;
  invited_by?: string | null;
  last_read_at?: string | null;
  joined_at?: string | null;
  updated_at?: string | null;
};

export type ChatAccess = {
  room: ChatRoomRow;
  member?: ChatMemberRow | null;
  role:
    | "buyer"
    | "seller"
    | "admin"
    | "group_owner"
    | "group_moderator"
    | "group_member";
};

export async function isAdminUser(
  supabaseAdmin: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return String(data?.role || "").trim().toLowerCase() === "admin";
}

export async function requireChatRoomAccess(input: {
  roomId: string;
  userId: string;
  allowAdmin?: boolean;
  supabaseAdmin?: SupabaseClient;
}): Promise<ChatAccess> {
  const supabaseAdmin = input.supabaseAdmin || createSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("chat_rooms")
    .select(
      "id,buyer_id,seller_id,product_id,order_id,room_type,title,description,created_by,status,last_message,last_message_at,last_message_sender_id,stream_status,stream_host_id,stream_title,stream_started_at,stream_ended_at,stream_updated_at,party_game,party_mode,party_rank,party_platform,party_region,party_size,party_open,party_updated_at,created_at,updated_at"
    )
    .eq("id", input.roomId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    const notFound = new Error("Chat room not found.");
    Object.assign(notFound, { status: 404 });
    throw notFound;
  }

  const room = data as unknown as ChatRoomRow;
  const roomType = String(room.room_type || "").toLowerCase();

  if (roomType === "group") {
    const { data: member, error: memberError } = await supabaseAdmin
      .from("chat_room_members")
      .select("room_id,user_id,member_role,status,invited_by,last_read_at,joined_at,updated_at")
      .eq("room_id", input.roomId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (memberError && !/does not exist|schema cache/i.test(memberError.message)) {
      throw new Error(memberError.message);
    }

    const memberRow = (member || null) as ChatMemberRow | null;
    if (String(memberRow?.status || "").toLowerCase() === "active") {
      const role = String(memberRow?.member_role || "").toLowerCase();
      if (role === "owner") return { room, member: memberRow, role: "group_owner" };
      if (role === "moderator") {
        return { room, member: memberRow, role: "group_moderator" };
      }
      return { room, member: memberRow, role: "group_member" };
    }
  }

  if (room.buyer_id === input.userId) return { room, role: "buyer" };
  if (room.seller_id === input.userId) return { room, role: "seller" };

  if (
    (input.allowAdmin || roomType === "group") &&
    (await isAdminUser(supabaseAdmin, input.userId))
  ) {
    return { room, role: "admin" };
  }

  const forbidden = new Error("You are not allowed to access this conversation.");
  Object.assign(forbidden, { status: 403 });
  throw forbidden;
}

export async function listChatRoomMembers(input: {
  roomId: string;
  supabaseAdmin?: SupabaseClient;
}) {
  const supabaseAdmin = input.supabaseAdmin || createSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("chat_room_members")
    .select("room_id,user_id,member_role,status,invited_by,last_read_at,joined_at,updated_at")
    .eq("room_id", input.roomId)
    .order("member_role", { ascending: true })
    .order("joined_at", { ascending: true });

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }

  return (data || []) as unknown as ChatMemberRow[];
}

export function isGroupRoom(room?: ChatRoomRow | null) {
  return String(room?.room_type || "").toLowerCase() === "group";
}

export async function assertLegacyDirectMessagingAllowed(
  supabaseAdmin: SupabaseClient,
  room: ChatRoomRow,
) {
  if (isGroupRoom(room)) return;
  const secure = await supabaseAdmin.from("cp_secure_accounts").select("user_id")
    .in("user_id", [room.buyer_id, room.seller_id]).limit(1);
  // The compatibility check is additive so the currently deployed API can run
  // during the short migration-before-code rollout window.
  if (secure.error && /does not exist|schema cache/i.test(secure.error.message)) return;
  if (secure.error) throw new Error(secure.error.message);
  if (secure.data?.length) {
    const upgrade = new Error("This conversation still has an encrypted identity. Contact support before switching its message history.");
    Object.assign(upgrade, { status: 426 });
    throw upgrade;
  }
}

export function chatErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }

  const message = error instanceof Error ? error.message : "";
  if (/authentication|token|login/i.test(message)) return 401;
  if (/not allowed|forbidden|admin access/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/required|invalid|unsupported|too large|blocked|suspended|limit|empty|between|cannot/i.test(message)) {
    return 400;
  }
  return 500;
}

export async function assertChatUserCanSend(
  supabaseAdmin: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from("user_account_settings")
    .select("chat_suspended_until,chat_suspension_reason")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && !/column .* does not exist/i.test(error.message)) {
    throw new Error(error.message);
  }

  const suspendedUntil = data?.chat_suspended_until
    ? new Date(String(data.chat_suspended_until))
    : null;
  if (suspendedUntil && suspendedUntil.getTime() > Date.now()) {
    const suspensionError = new Error(
      `Chat access is suspended until ${suspendedUntil.toISOString()}${
        data?.chat_suspension_reason ? `: ${data.chat_suspension_reason}` : "."
      }`
    );
    Object.assign(suspensionError, { status: 403 });
    throw suspensionError;
  }
}

export async function createChatNotification(input: {
  supabaseAdmin: SupabaseClient;
  receiverId: string;
  senderName: string;
  roomId: string;
  preview: string;
  linkUrl?: string;
}) {
  const { error } = await input.supabaseAdmin.from("notifications").insert({
    user_id: input.receiverId,
    type: "chat_message",
    title: `New message from ${input.senderName}`,
    message: input.preview || "Sent you a message.",
    link_url: input.linkUrl || `/cpcommunity?room=${input.roomId}`,
    is_read: false,
  });

  if (error) {
    console.error("Chat notification insert failed:", error.message);
  }
}


export function toPublicChatProfile(
  profile: Record<string, unknown> | null | undefined
) {
  if (!profile) return null;

  return {
    id: String(profile.id || ""),
    username: typeof profile.username === "string" ? profile.username : null,
    cp_number: typeof profile.cp_number === "string" ? profile.cp_number : null,
    full_name: typeof profile.full_name === "string" ? profile.full_name : null,
    avatar_url: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
    role: typeof profile.role === "string" ? profile.role : null,
  };
}

export function safeProfileLabel(profile: Record<string, unknown> | null | undefined) {
  return String(profile?.username || profile?.full_name || "ComePlayers user");
}

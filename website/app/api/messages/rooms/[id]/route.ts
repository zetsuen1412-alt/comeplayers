import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { callActivityPreview } from "@/lib/callRoomActivity";
import {
  chatErrorStatus,
  isGroupRoom,
  listChatRoomMembers,
  requireChatRoomAccess,
  toPublicChatProfile,
} from "@/lib/chatServer";
import { requireCommunityChannel } from "@/lib/communityServer";
import {
  clampPositiveInteger,
  createPublicChatStreamState,
  requestOrigin,
} from "@/lib/chatStream";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string }> };

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string;
  receiver_id: string;
  message: string | null;
  message_type?: string | null;
  attachment_id?: number | null;
  channel_id?: string | null;
  reply_to_id?: string | null;
  moderation_status?: string | null;
  risk_score?: number | null;
  risk_flags?: string[] | null;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
};

type ReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const roomId = String(id || "").trim();
    if (!roomId) {
      return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { room, role } = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      supabaseAdmin,
      allowAdmin: false,
    });
    const { searchParams } = new URL(request.url);
    const limit = clampPositiveInteger(searchParams.get("limit"), 80, 20, 120);
    const before = String(searchParams.get("before") || "").trim();
    const requestedChannelId = String(searchParams.get("channel") || "").trim();
    const search = String(searchParams.get("search") || "").trim().slice(0, 100);
    const groupRoom = isGroupRoom(room);
    const otherContactId = room.buyer_id === user.id ? room.seller_id : room.buyer_id;
    const membersRequest = groupRoom
      ? listChatRoomMembers({ roomId, supabaseAdmin })
      : Promise.resolve([]);
    const productRequest = room.product_id
      ? supabaseAdmin
          .from("products")
          .select("id,title,image_url,price,game_name,category,seller_id")
          .eq("id", Number(room.product_id))
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const orderRequest = room.order_id
      ? supabaseAdmin
          .from("orders")
          .select("id,status,payment_status,product_title,created_at")
          .eq("id", Number(room.order_id))
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const blockRequest = !groupRoom
      ? supabaseAdmin.from("chat_user_blocks").select("blocker_id")
          .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${otherContactId}),and(blocker_id.eq.${otherContactId},blocked_id.eq.${user.id})`)
      : Promise.resolve({ data: [], error: null });
    const [preference, privacy, channelAccess] = await Promise.all([
      supabaseAdmin.from("cp_chat_preferences").select("cleared_before").eq("user_id", user.id).eq("room_id", roomId).maybeSingle(),
      !groupRoom ? supabaseAdmin.from("cp_messaging_settings").select("read_receipts").in("user_id", [room.buyer_id, room.seller_id]) : Promise.resolve({ data: [], error: null }),
      groupRoom ? requireCommunityChannel({
        supabaseAdmin,
        userId: user.id,
        roomId,
        channelId: requestedChannelId || null,
      }) : Promise.resolve(null),
    ]);
    if (preference.error) throw preference.error;
    if (privacy.error) throw privacy.error;
    const shareReceipts = !privacy.data?.some(p => p.read_receipts === false);
    const selectedChannel = channelAccess?.channel || null;

    let messagesQuery = supabaseAdmin
      .from("chat_messages")
      .select(
        "id,room_id,channel_id,sender_id,receiver_id,message,message_type,attachment_id,reply_to_id,moderation_status,risk_score,risk_flags,is_read,read_at,created_at,edited_at,deleted_at"
      )
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (selectedChannel?.id) {
      messagesQuery = messagesQuery.eq("channel_id", selectedChannel.id);
    }

    if (before) {
      messagesQuery = messagesQuery.lt("created_at", before);
    }
    if (preference.data?.cleared_before) messagesQuery = messagesQuery.gt("created_at", preference.data.cleared_before);
    if (search) messagesQuery = messagesQuery.ilike("message", `%${search.replace(/[\\%_]/g, "\\$&")}%`).is("deleted_at", null);
    if (searchParams.get("media") === "true") messagesQuery = messagesQuery.not("attachment_id", "is", null).is("deleted_at", null);
    if (searchParams.get("starred") === "true") {
      const stars = await supabaseAdmin.from("cp_starred_messages").select("message_id").eq("user_id", user.id).limit(1000);
      if (stars.error) throw stars.error;
      messagesQuery = messagesQuery.in("id", stars.data.length ? stars.data.map(s => s.message_id) : ["00000000-0000-0000-0000-000000000000"]);
    }

    const [messagesResult, members, productResult, orderResult, blockResult] = await Promise.all([
      messagesQuery,
      membersRequest,
      productRequest,
      orderRequest,
      blockRequest,
    ]);

    if (messagesResult.error) throw new Error(messagesResult.error.message);
    if (productResult.error) throw new Error(productResult.error.message);
    if (orderResult.error) throw new Error(orderResult.error.message);
    if (blockResult.error) throw new Error(blockResult.error.message);

    const messageRows = ((messagesResult.data || []) as MessageRow[]).reverse();
    const messageMap = new Map(messageRows.map((message) => [message.id, message]));
    const replyIds = Array.from(
      new Set(messageRows.map((message) => message.reply_to_id).filter(Boolean) as string[])
    );
    const missingReplyIds = replyIds.filter((replyId) => !messageMap.has(replyId));
    const visibleMessageIds = messageRows.map((message) => message.id).filter(Boolean);
    const attachmentIds = Array.from(
      new Set(
        messageRows
          .filter((message) => !message.deleted_at)
          .map((message) => Number(message.attachment_id || 0))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );
    // These lookups depend on the visible page, but not on each other.
    const [replyResult, reactionResult, attachmentResult] = await Promise.all([
      missingReplyIds.length
        ? supabaseAdmin.from("chat_messages")
            .select("id,room_id,channel_id,sender_id,receiver_id,message,message_type,attachment_id,reply_to_id,moderation_status,risk_score,risk_flags,is_read,read_at,created_at,edited_at,deleted_at")
            .eq("room_id", roomId)
            .in("id", missingReplyIds)
        : Promise.resolve({ data: [], error: null }),
      visibleMessageIds.length
        ? supabaseAdmin.from("chat_message_reactions")
            .select("message_id,user_id,emoji,created_at")
            .eq("room_id", roomId)
            .in("message_id", visibleMessageIds)
        : Promise.resolve({ data: [], error: null }),
      attachmentIds.length
        ? supabaseAdmin.from("chat_attachments")
            .select("id,room_id,message_id,file_name,mime_type,size_bytes,moderation_status,created_at,deleted_at")
            .in("id", attachmentIds)
            .eq("room_id", roomId)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (replyResult.error) throw new Error(replyResult.error.message);
    for (const reply of (replyResult.data || []) as MessageRow[]) messageMap.set(reply.id, reply);
    if (reactionResult.error && !/does not exist|schema cache/i.test(reactionResult.error.message)) {
      throw new Error(reactionResult.error.message);
    }
    const reactions = (reactionResult.data || []) as ReactionRow[];
    if (attachmentResult.error) throw new Error(attachmentResult.error.message);
    const attachmentMap = new Map<number, Record<string, unknown>>();
    for (const attachment of attachmentResult.data || []) {
      attachmentMap.set(Number(attachment.id), attachment as Record<string, unknown>);
    }

    const profileIds = Array.from(
      new Set(
        [
          room.buyer_id,
          room.seller_id,
          room.stream_host_id,
          user.id,
          ...members.map((member) => member.user_id),
          ...Array.from(messageMap.values()).map((message) => message.sender_id),
          ...reactions.map((reaction) => reaction.user_id),
        ].filter(Boolean) as string[]
      )
    );

    const profilesResult = profileIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id,username,full_name,avatar_url,role,cp_number")
          .in("id", profileIds)
      : { data: [], error: null };
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const profiles = profilesResult.data || [];
    const profileMap = new Map(profiles.map((profile) => [String(profile.id), profile]));
    const otherId = room.buyer_id === user.id ? room.seller_id : room.buyer_id;
    const memberRows = members
      .filter((member) => String(member.status || "").toLowerCase() === "active")
      .map((member) => ({
        ...member,
        profile: toPublicChatProfile(profileMap.get(String(member.user_id)) || null),
      }));

    const reactionsByMessage = new Map<string, Map<string, ReactionRow[]>>();
    for (const reaction of reactions) {
      const emojiMap = reactionsByMessage.get(reaction.message_id) || new Map();
      const emojiRows = emojiMap.get(reaction.emoji) || [];
      emojiRows.push(reaction);
      emojiMap.set(reaction.emoji, emojiRows);
      reactionsByMessage.set(reaction.message_id, emojiMap);
    }

    return NextResponse.json({
      room: {
        ...room,
        last_message: callActivityPreview(room.last_message) || room.last_message,
        blocked_by_me: Boolean(blockResult.data?.some(b => b.blocker_id === user.id)),
        contact_unavailable: Boolean(blockResult.data?.length),
        role,
        other: isGroupRoom(room)
          ? null
          : toPublicChatProfile(profileMap.get(otherId) || null),
        me: toPublicChatProfile(profileMap.get(user.id) || null),
        stream_host: room.stream_host_id
          ? toPublicChatProfile(profileMap.get(String(room.stream_host_id)) || null)
          : null,
        stream: createPublicChatStreamState(room, requestOrigin(request)),
        members: memberRows,
        member_count: memberRows.length,
        product: productResult.data || null,
        order: orderResult.data || null,
      },
      stream: createPublicChatStreamState(room, requestOrigin(request)),
      channel: selectedChannel,
      members: memberRows,
      messages: messageRows.map((message) => {
        const candidateReply = message.reply_to_id ? messageMap.get(message.reply_to_id) || null : null;
        const reply = candidateReply && candidateReply.channel_id === message.channel_id && (!preference.data?.cleared_before || candidateReply.created_at > preference.data.cleared_before) ? candidateReply : null;
        const reactionGroups: Map<string, ReactionRow[]> =
          reactionsByMessage.get(message.id) || new Map<string, ReactionRow[]>();
        return {
          ...message,
          is_read: shareReceipts ? message.is_read : null,
          read_at: shareReceipts ? message.read_at : null,
          message: message.deleted_at ? "[Message deleted]" : message.message,
          sender: toPublicChatProfile(profileMap.get(String(message.sender_id || "")) || null),
          attachment:
            !message.deleted_at && message.attachment_id
              ? attachmentMap.get(Number(message.attachment_id)) || null
              : null,
          reply_to: reply
            ? {
                id: reply.id,
                sender_id: reply.sender_id,
                message: reply.deleted_at ? "[Message deleted]" : reply.message,
                deleted_at: reply.deleted_at || null,
                sender: toPublicChatProfile(profileMap.get(reply.sender_id) || null),
              }
            : null,
          reactions: Array.from(reactionGroups.entries()).map(([emoji, rows]) => ({
            emoji,
            count: rows.length,
            reacted_by_me: rows.some((row) => row.user_id === user.id),
            users: rows
              .slice(0, 8)
              .map((row) => toPublicChatProfile(profileMap.get(row.user_id) || null))
              .filter(Boolean),
          })),
        };
      }),
    });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Chat API error:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to load this conversation.", status) },
      { status }
    );
  }
}

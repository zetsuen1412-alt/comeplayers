import { NextResponse } from "next/server";
import { assertContactAllowed } from "@/lib/chatContacts";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { normalizeChatReaction } from "@/lib/chatInteractions";
import { requireCommunityChannel } from "@/lib/communityServer";
import { assertLegacyDirectMessagingAllowed, chatErrorStatus, isGroupRoom, requireChatRoomAccess } from "@/lib/chatServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id, messageId } = await context.params;
    const roomId = String(id || "").trim();
    const targetMessageId = String(messageId || "").trim();
    const body = (await request.json()) as { emoji?: string };
    const emoji = normalizeChatReaction(body.emoji);
    if (!emoji) {
      return NextResponse.json({ error: "Unsupported reaction." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { room } = await requireChatRoomAccess({ roomId, userId: user.id, supabaseAdmin });
    await assertLegacyDirectMessagingAllowed(supabaseAdmin, room);
    if (!isGroupRoom(room)) await assertContactAllowed(supabaseAdmin, user.id, room.buyer_id === user.id ? room.seller_id : room.buyer_id);

    const { data: message, error: messageError } = await supabaseAdmin
      .from("chat_messages")
      .select("id,channel_id,deleted_at")
      .eq("id", targetMessageId)
      .eq("room_id", roomId)
      .maybeSingle();
    if (messageError) throw new Error(messageError.message);
    if (message?.channel_id && isGroupRoom(room)) {
      await requireCommunityChannel({
        supabaseAdmin,
        userId: user.id,
        roomId,
        channelId: String(message.channel_id),
      });
    }
    if (!message || message.deleted_at) {
      const unavailable = new Error("Message is unavailable.");
      Object.assign(unavailable, { status: 404 });
      throw unavailable;
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("chat_message_reactions")
      .select("message_id")
      .eq("message_id", targetMessageId)
      .eq("user_id", user.id)
      .eq("emoji", emoji)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    let active = true;
    if (existing) {
      const { error } = await supabaseAdmin
        .from("chat_message_reactions")
        .delete()
        .eq("message_id", targetMessageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji);
      if (error) throw new Error(error.message);
      active = false;
    } else {
      const { error } = await supabaseAdmin.from("chat_message_reactions").insert({
        room_id: roomId,
        message_id: targetMessageId,
        user_id: user.id,
        emoji,
      });
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, active, emoji });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Chat API error:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to update this reaction.", status) },
      { status }
    );
  }
}

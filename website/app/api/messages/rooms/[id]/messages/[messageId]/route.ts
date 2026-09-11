import { NextResponse } from "next/server";
import { assertContactAllowed } from "@/lib/chatContacts";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { analyzeChatMessage, chatMessagePreview } from "@/lib/chatSafety";
import { canModerateChatMessage } from "@/lib/chatInteractions";
import { requireCommunityChannel } from "@/lib/communityServer";
import {
  assertChatUserCanSend,
  assertLegacyDirectMessagingAllowed,
  chatErrorStatus,
  isGroupRoom,
  requireChatRoomAccess,
} from "@/lib/chatServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id, messageId } = await context.params;
    const roomId = String(id || "").trim();
    const targetMessageId = String(messageId || "").trim();
    const body = (await request.json()) as { message?: string };
    const rawMessage = String(body.message || "").trim();

    if (!rawMessage) {
      return NextResponse.json({ error: "Message text is required." }, { status: 400 });
    }
    if (rawMessage.length > 2000) {
      return NextResponse.json(
        { error: "Message must be 2,000 characters or fewer." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    await assertChatUserCanSend(supabaseAdmin, user.id);
    const { room } = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      supabaseAdmin,
    });
    await assertLegacyDirectMessagingAllowed(supabaseAdmin, room);
    if (!isGroupRoom(room)) await assertContactAllowed(supabaseAdmin, user.id, room.buyer_id === user.id ? room.seller_id : room.buyer_id);
    if (String(room.status || "active").toLowerCase() !== "active") {
      const locked = new Error("This conversation is currently locked.");
      Object.assign(locked, { status: 403 });
      throw locked;
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("chat_messages")
      .select("id,room_id,channel_id,sender_id,message,attachment_id,created_at,deleted_at")
      .eq("id", targetMessageId)
      .eq("room_id", roomId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    let messageInPrivateChannel = false;
    if (existing?.channel_id && isGroupRoom(room)) {
      const { channel } = await requireCommunityChannel({
        supabaseAdmin,
        userId: user.id,
        roomId,
        channelId: String(existing.channel_id),
      });
      messageInPrivateChannel = Boolean(channel.is_private);
    }
    if (!existing) {
      const notFound = new Error("Message not found.");
      Object.assign(notFound, { status: 404 });
      throw notFound;
    }
    if (existing.sender_id !== user.id) {
      const forbidden = new Error("You can only edit your own messages.");
      Object.assign(forbidden, { status: 403 });
      throw forbidden;
    }
    if (existing.deleted_at) {
      const deleted = new Error("Deleted messages cannot be edited.");
      Object.assign(deleted, { status: 400 });
      throw deleted;
    }

    const safety = analyzeChatMessage(rawMessage);
    if (!safety.allowed) {
      return NextResponse.json(
        {
          error: safety.userMessage || "Message blocked by chat safety.",
          code: "CHAT_SAFETY_BLOCKED",
          flags: safety.flags,
        },
        { status: 422 }
      );
    }

    const moderationStatus = safety.score >= 35 ? "flagged" : "clean";
    const editedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("chat_messages")
      .update({
        message: rawMessage,
        edited_at: editedAt,
        moderation_status: moderationStatus,
        risk_score: safety.score,
        risk_flags: safety.flags,
      })
      .eq("id", targetMessageId)
      .eq("room_id", roomId)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);

    if (
      room.last_message_at &&
      new Date(room.last_message_at).getTime() === new Date(existing.created_at).getTime()
    ) {
      const preview = messageInPrivateChannel
        ? "New message in a private channel"
        : existing.attachment_id
          ? `Attachment: ${chatMessagePreview(rawMessage)}`
          : chatMessagePreview(rawMessage);
      const { error } = await supabaseAdmin
        .from("chat_rooms")
        .update({ last_message: preview, updated_at: editedAt })
        .eq("id", roomId);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, message: updated });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Chat message edit error:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to edit this message.", status) },
      { status }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id, messageId } = await context.params;
    const roomId = String(id || "").trim();
    const targetMessageId = String(messageId || "").trim();

    const supabaseAdmin = createSupabaseAdmin();
    const { role, room } = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      allowAdmin: true,
      supabaseAdmin,
    });
    await assertLegacyDirectMessagingAllowed(supabaseAdmin, room);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("chat_messages")
      .select("id,room_id,channel_id,sender_id,attachment_id,created_at,deleted_at")
      .eq("id", targetMessageId)
      .eq("room_id", roomId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing?.channel_id && isGroupRoom(room)) {
      await requireCommunityChannel({
        supabaseAdmin,
        userId: user.id,
        roomId,
        channelId: String(existing.channel_id),
      });
    }
    if (!existing) {
      const notFound = new Error("Message not found.");
      Object.assign(notFound, { status: 404 });
      throw notFound;
    }
    if (existing.sender_id !== user.id && !canModerateChatMessage(role)) {
      const forbidden = new Error("You are not allowed to delete this message.");
      Object.assign(forbidden, { status: 403 });
      throw forbidden;
    }
    if (existing.deleted_at) return NextResponse.json({ ok: true });

    const deletedAt = new Date().toISOString();
    const { error: deleteError } = await supabaseAdmin
      .from("chat_messages")
      .update({
        message: null,
        deleted_at: deletedAt,
        edited_at: deletedAt,
        moderation_status: "deleted",
      })
      .eq("id", targetMessageId)
      .eq("room_id", roomId);
    if (deleteError) throw new Error(deleteError.message);

    const [reactionDelete, attachmentDelete] = await Promise.all([
      supabaseAdmin.from("chat_message_reactions").delete().eq("message_id", targetMessageId),
      existing.attachment_id
        ? supabaseAdmin
            .from("chat_attachments")
            .update({ deleted_at: deletedAt })
            .eq("id", existing.attachment_id)
            .eq("room_id", roomId)
        : Promise.resolve({ error: null }),
    ]);
    if (reactionDelete.error) throw new Error(reactionDelete.error.message);
    if (attachmentDelete.error) throw new Error(attachmentDelete.error.message);

    const { data: latest, error: latestError } = await supabaseAdmin
      .from("chat_messages")
      .select("sender_id,message,message_type,channel_id,created_at")
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw new Error(latestError.message);

    let latestInPrivateChannel = false;
    if (latest?.channel_id && isGroupRoom(room)) {
      const { data: latestChannel, error: latestChannelError } = await supabaseAdmin
        .from("chat_channels")
        .select("is_private")
        .eq("id", latest.channel_id)
        .maybeSingle();
      if (latestChannelError) throw new Error(latestChannelError.message);
      latestInPrivateChannel = Boolean(latestChannel?.is_private);
    }

    const { error: roomError } = await supabaseAdmin
      .from("chat_rooms")
      .update({
        last_message: latest
          ? latestInPrivateChannel
            ? "New message in a private channel"
            : latest.message || (latest.message_type === "attachment" ? "Attachment" : "Message")
          : null,
        last_message_at: latest?.created_at || null,
        last_message_sender_id: latest?.sender_id || null,
        updated_at: deletedAt,
      })
      .eq("id", roomId);
    if (roomError) throw new Error(roomError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Chat message delete error:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to delete this message.", status) },
      { status }
    );
  }
}

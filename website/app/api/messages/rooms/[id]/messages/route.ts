import { after, NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { dispatchChatPushNotifications } from "@/lib/backgroundJobs";
import { requireCommunityChannel } from "@/lib/communityServer";
import {
  consumeRedisRateLimit,
  invalidateUnreadCache,
  isUpstashRedisConfigured,
} from "@/lib/upstashRedis";
import { analyzeChatMessage, chatMessagePreview } from "@/lib/chatSafety";
import {
  assertChatUserCanSend,
  assertLegacyDirectMessagingAllowed,
  chatErrorStatus,
  createChatNotification,
  isGroupRoom,
  listChatRoomMembers,
  requireChatRoomAccess,
  safeProfileLabel,
} from "@/lib/chatServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const roomId = String(id || "").trim();
    const body = (await request.json()) as {
      message?: string;
      attachmentId?: number | string;
      replyToId?: string;
      channelId?: string;
    };

    const rawMessage = String(body.message || "").trim();
    const attachmentId = Number(body.attachmentId || 0);
    const replyToId = String(body.replyToId || "").trim();
    const requestedChannelId = String(body.channelId || "").trim();
    const hasAttachment = Number.isInteger(attachmentId) && attachmentId > 0;

    if (!rawMessage && !hasAttachment) {
      return NextResponse.json(
        { error: "Message text or an attachment is required." },
        { status: 400 }
      );
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
    const groupRoom = isGroupRoom(room);
    await assertLegacyDirectMessagingAllowed(supabaseAdmin, room);
    if (!groupRoom) {
      return NextResponse.json(
        {
          error: "Direct messages now require end-to-end encryption. Update or reload ComePlayers and send from the secure conversation.",
          code: "E2EE_REQUIRED",
        },
        { status: 426, headers: { "Cache-Control": "no-store" } },
      );
    }
    const selectedChannel = groupRoom
      ? (
          await requireCommunityChannel({
            supabaseAdmin,
            userId: user.id,
            roomId,
            channelId: requestedChannelId || null,
            send: true,
          })
        ).channel
      : null;

    if (String(room.status || "active").toLowerCase() !== "active") {
      const locked = new Error("This conversation is currently locked.");
      Object.assign(locked, { status: 403 });
      throw locked;
    }

    let rateLimitAllowed = true;
    let retryAfterSeconds = 60;
    let redisRateLimitApplied = false;
    if (isUpstashRedisConfigured()) {
      try {
        const result = await consumeRedisRateLimit({
          scope: "message",
          identifier: user.id,
          limit: 20,
          windowSeconds: 60,
        });
        redisRateLimitApplied = true;
        rateLimitAllowed = result.allowed;
        retryAfterSeconds = result.retryAfterSeconds;
      } catch (redisError) {
        console.warn(
          "Redis message rate limit unavailable; using Supabase fallback.",
          redisError instanceof Error ? redisError.message : redisError,
        );
      }
    }
    if (!redisRateLimitApplied) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count, error: countError } = await supabaseAdmin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", user.id)
        .gte("created_at", since);
      if (countError) throw new Error(countError.message);
      rateLimitAllowed = (count || 0) < 20;
    }
    if (!rateLimitAllowed) {
      const limited = new Error("Message rate limit reached. Please wait one minute.");
      Object.assign(limited, { status: 429, retryAfterSeconds });
      throw limited;
    }

    let replyTo: Record<string, unknown> | null = null;
    if (replyToId) {
      const { data, error } = await supabaseAdmin
        .from("chat_messages")
        .select("id,room_id,channel_id,sender_id,message,deleted_at")
        .eq("id", replyToId)
        .eq("room_id", roomId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (
        !data ||
        data.deleted_at ||
        (selectedChannel?.id && String(data.channel_id || "") !== String(selectedChannel.id))
      ) {
        const invalidReply = new Error("The message you are replying to is unavailable.");
        Object.assign(invalidReply, { status: 400 });
        throw invalidReply;
      }
      replyTo = data as Record<string, unknown>;
    }

    let attachment: Record<string, unknown> | null = null;
    if (hasAttachment) {
      const { data, error } = await supabaseAdmin
        .from("chat_attachments")
        .select("*")
        .eq("id", attachmentId)
        .eq("room_id", roomId)
        .eq("uploaded_by", user.id)
        .is("message_id", null)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Attachment is invalid or already used.");
      if (String(data.moderation_status || "approved") !== "approved") {
        throw new Error("Attachment is not approved for sending.");
      }
      attachment = data as Record<string, unknown>;
    }

    const safety = analyzeChatMessage(rawMessage);
    if (!safety.allowed) {
      const { error: moderationError } = await supabaseAdmin
        .from("chat_moderation_events")
        .insert({
          room_id: roomId,
          user_id: user.id,
          event_type: "blocked_message",
          risk_score: safety.score,
          risk_level: safety.level,
          flags: safety.flags,
          redacted_excerpt: chatMessagePreview(safety.redactedText),
          status: "open",
        });
      if (moderationError) {
        console.error("Blocked chat event insert failed:", moderationError.message);
      }

      return NextResponse.json(
        {
          error: safety.userMessage || "Message blocked by chat safety.",
          code: "CHAT_SAFETY_BLOCKED",
          flags: safety.flags,
        },
        { status: 422 }
      );
    }

    const receiverId = groupRoom
      ? user.id
      : room.buyer_id === user.id
        ? room.seller_id
        : room.buyer_id;
    const messageText = rawMessage || (attachment ? "Attachment" : "");
    const moderationStatus = safety.score >= 35 ? "flagged" : "clean";
    const readAt = groupRoom ? new Date().toISOString() : null;

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        room_id: roomId,
        channel_id: selectedChannel?.id || null,
        sender_id: user.id,
        receiver_id: receiverId,
        message: messageText,
        message_type: attachment ? "attachment" : "text",
        attachment_id: attachmentId || null,
        reply_to_id: replyTo ? String(replyTo.id) : null,
        moderation_status: moderationStatus,
        risk_score: safety.score,
        risk_flags: safety.flags,
        is_read: groupRoom,
        read_at: readAt,
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);

    if (attachment) {
      const { error } = await supabaseAdmin
        .from("chat_attachments")
        .update({ message_id: inserted.id })
        .eq("id", attachmentId)
        .is("message_id", null);
      if (error) throw new Error(error.message);
    }

    if (groupRoom) {
      const now = new Date().toISOString();
      if (selectedChannel?.is_default) {
        const legacyRead = await supabaseAdmin
          .from("chat_room_members")
          .update({ last_read_at: inserted.created_at, updated_at: now })
          .eq("room_id", roomId)
          .eq("user_id", user.id);
        if (legacyRead.error && !/does not exist|schema cache/i.test(legacyRead.error.message)) {
          throw new Error(legacyRead.error.message);
        }
      }
      if (selectedChannel?.id) {
        const { error: channelReadError } = await supabaseAdmin
          .from("chat_channel_read_states")
          .upsert({
            channel_id: selectedChannel.id,
            user_id: user.id,
            last_read_message_id: inserted.id,
            last_read_at: inserted.created_at,
            updated_at: now,
          }, { onConflict: "channel_id,user_id" });
        if (channelReadError) throw new Error(channelReadError.message);
      }
    }

    const previewBase = attachment
      ? `Attachment: ${String(attachment.file_name || "file")}`
      : chatMessagePreview(messageText);
    const preview = replyTo ? `Reply: ${previewBase}` : previewBase;
    const roomListPreview = selectedChannel?.is_private
      ? "New message in a private channel"
      : preview;
    const { error: roomError } = await supabaseAdmin
      .from("chat_rooms")
      .update({
        last_message: roomListPreview,
        last_message_at: inserted.created_at,
        last_message_sender_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", roomId);
    if (roomError) throw new Error(roomError.message);

    if (moderationStatus === "flagged") {
      const { error } = await supabaseAdmin.from("chat_moderation_events").insert({
        room_id: roomId,
        message_id: inserted.id,
        user_id: user.id,
        event_type: "flagged_message",
        risk_score: safety.score,
        risk_level: safety.level,
        flags: safety.flags,
        redacted_excerpt: chatMessagePreview(safety.redactedText),
        status: "open",
      });
      if (error) console.error("Flagged chat event insert failed:", error.message);
    }

    // The message and room preview are committed before acknowledging delivery.
    // Provider push latency must not make the sender retry an already saved message.
    after(async () => {
      try {
        const { data: senderProfile } = await supabaseAdmin
          .from("profiles")
          .select("username,full_name,email")
          .eq("id", user.id)
          .maybeSingle();

        const senderName = safeProfileLabel(senderProfile);
        let notificationReceiverIds: string[] = [];
        let notificationPreview = preview;

        if (groupRoom) {
          const members = await listChatRoomMembers({ roomId, supabaseAdmin });
          notificationReceiverIds = Array.from(
            new Set(
              members
                .filter((member) => String(member.status || "").toLowerCase() === "active")
                .map((member) => member.user_id)
                .filter((memberId) => memberId && memberId !== user.id)
            )
          ).slice(0, 100);

          // Never reveal a private channel name or message preview to members who
          // cannot view that channel. The database permission function is also
          // used by RLS, keeping realtime and push-notification access aligned.
          if (selectedChannel?.is_private && selectedChannel.id && notificationReceiverIds.length) {
            const accessChecks = await Promise.all(
              notificationReceiverIds.map(async (memberId) => {
                const { data, error } = await supabaseAdmin.rpc("cp_can_view_chat_channel_v27", {
                  p_channel_id: selectedChannel.id,
                  p_user_id: memberId,
                });
                if (error) throw new Error(error.message);
                return data === true ? memberId : null;
              }),
            );
            notificationReceiverIds = accessChecks.filter((memberId): memberId is string => Boolean(memberId));
          }

          notificationPreview = `${String(room.title || "Group chat")} #${String(selectedChannel?.name || "general")}: ${preview}`;

          await Promise.all(
            notificationReceiverIds.map((memberId) =>
              createChatNotification({
                supabaseAdmin,
                receiverId: memberId,
                senderName,
                roomId,
                preview: notificationPreview,
              })
            )
          );
        } else {
          notificationReceiverIds = receiverId ? [receiverId] : [];
          await createChatNotification({
            supabaseAdmin,
            receiverId,
            senderName,
            roomId,
            preview: notificationPreview,
            linkUrl: `/chat?room=${encodeURIComponent(roomId)}`,
          });
        }

        await dispatchChatPushNotifications({
          supabaseAdmin,
          receiverIds: notificationReceiverIds,
          senderName,
          roomId,
          preview: notificationPreview,
        });

        await invalidateUnreadCache([user.id, ...notificationReceiverIds]);

      } catch (error) { console.error("Chat notification delivery failed:", error instanceof Error ? error.message : "Notification error"); }
    });

    return NextResponse.json({
      ok: true,
      message: inserted,
      channel: selectedChannel,
      safety: {
        level: safety.level,
        flags: safety.flags,
        moderated: moderationStatus === "flagged",
      },
    });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Chat API error:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to send this message.", status) },
      { status }
    );
  }
}

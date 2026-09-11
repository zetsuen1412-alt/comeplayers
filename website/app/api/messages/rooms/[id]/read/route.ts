import { NextResponse } from "next/server";
import { requireCommunityChannel } from "@/lib/communityServer";
import { invalidateUnreadCache } from "@/lib/upstashRedis";
import {
  chatErrorStatus,
  isGroupRoom,
  requireChatRoomAccess,
} from "@/lib/chatServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const roomId = String(id || "").trim();
    const body = (await request.json().catch(() => ({}))) as {
      channelId?: string;
      lastReadMessageId?: string;
    };
    const supabaseAdmin = createSupabaseAdmin();

    const access = await requireChatRoomAccess({ roomId, userId: user.id, supabaseAdmin });
    const now = new Date().toISOString();

    if (isGroupRoom(access.room)) {
      const { channel } = await requireCommunityChannel({
        supabaseAdmin,
        userId: user.id,
        roomId,
        channelId: String(body.channelId || "").trim() || null,
      });
      if (channel.is_default) {
        const { error } = await supabaseAdmin
          .from("chat_room_members")
          .update({ last_read_at: now, updated_at: now })
          .eq("room_id", roomId)
          .eq("user_id", user.id);
        if (error && !/does not exist|schema cache/i.test(error.message)) {
          throw new Error(error.message);
        }
      }

      let lastReadMessageId = String(body.lastReadMessageId || "").trim() || null;
      if (lastReadMessageId) {
        const { data: requestedMessage, error: requestedMessageError } = await supabaseAdmin
          .from("chat_messages")
          .select("id")
          .eq("id", lastReadMessageId)
          .eq("room_id", roomId)
          .eq("channel_id", channel.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (requestedMessageError) throw new Error(requestedMessageError.message);
        if (!requestedMessage) {
          return NextResponse.json(
            { error: "The read position does not belong to this channel." },
            { status: 400 },
          );
        }
      } else {
        const { data: latest, error: latestError } = await supabaseAdmin
          .from("chat_messages")
          .select("id")
          .eq("room_id", roomId)
          .eq("channel_id", channel.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestError) throw new Error(latestError.message);
        lastReadMessageId = latest?.id ? String(latest.id) : null;
      }

      const { error: channelReadError } = await supabaseAdmin
        .from("chat_channel_read_states")
        .upsert({
          channel_id: channel.id,
          user_id: user.id,
          last_read_message_id: lastReadMessageId,
          last_read_at: now,
          updated_at: now,
        }, { onConflict: "channel_id,user_id" });
      if (channelReadError) throw new Error(channelReadError.message);

      await invalidateUnreadCache([user.id]);
      return NextResponse.json({ ok: true, channelId: channel.id });
    }

    const { error } = await supabaseAdmin
      .from("chat_messages")
      .update({ is_read: true, read_at: now })
      .eq("room_id", roomId)
      .eq("receiver_id", user.id)
      .eq("is_read", false);
    if (error) throw new Error(error.message);

    await invalidateUnreadCache([user.id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected read receipt error.";
    return NextResponse.json({ error: message }, { status: chatErrorStatus(error) });
  }
}

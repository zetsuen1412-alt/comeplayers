import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";
import type { ChatMemberRow, ChatRoomRow } from "@/lib/chatServer";
import { getUnreadCache, setUnreadCache } from "@/lib/upstashRedis";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const cached = await getUnreadCache(user.id);
    if (cached !== null) {
      return NextResponse.json({ count: cached, cache: "upstash" });
    }
    const supabaseAdmin = createSupabaseAdmin();
    const { count, error } = await supabaseAdmin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .eq("is_read", false)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("chat_room_members")
      .select("room_id,user_id,member_role,status,last_read_at")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (membershipError && !/does not exist|schema cache/i.test(membershipError.message)) {
      throw new Error(membershipError.message);
    }

    const memberRows = ((memberships || []) as unknown as ChatMemberRow[]).filter(
      (member) => String(member.status || "").toLowerCase() === "active"
    );
    const groupRoomIds = memberRows.map((member) => member.room_id).filter(Boolean);
    let groupUnread = 0;
    let usedChannelReadState = false;

    if (groupRoomIds.length) {
      const communitiesResult = await supabaseAdmin
        .from("chat_communities")
        .select("id,room_id")
        .in("room_id", groupRoomIds);

      if (!communitiesResult.error) {
        const communities = communitiesResult.data || [];
        const communityIds = communities.map((community) => String(community.id));
        const channelsResult = communityIds.length
          ? await supabaseAdmin
              .from("chat_channels")
              .select("id,community_id,is_private")
              .in("community_id", communityIds)
              .eq("is_private", false)
          : { data: [], error: null };

        if (!channelsResult.error) {
          const channelIds = (channelsResult.data || []).map((channel) => String(channel.id));
          const [readStatesResult, messagesResult] = await Promise.all([
            channelIds.length
              ? supabaseAdmin
                  .from("chat_channel_read_states")
                  .select("channel_id,last_read_at")
                  .eq("user_id", user.id)
                  .in("channel_id", channelIds)
              : Promise.resolve({ data: [], error: null }),
            channelIds.length
              ? supabaseAdmin
                  .from("chat_messages")
                  .select("channel_id,created_at")
                  .in("channel_id", channelIds)
                  .neq("sender_id", user.id)
                  .is("deleted_at", null)
                  .order("created_at", { ascending: false })
                  .range(0, 4999)
              : Promise.resolve({ data: [], error: null }),
          ]);

          if (!readStatesResult.error && !messagesResult.error) {
            usedChannelReadState = true;
            const readAtByChannel = new Map(
              (readStatesResult.data || []).map((state) => [
                String(state.channel_id),
                new Date(String(state.last_read_at || 0)).getTime(),
              ]),
            );
            for (const message of messagesResult.data || []) {
              const channelId = String(message.channel_id || "");
              if (
                new Date(String(message.created_at || 0)).getTime() >
                (readAtByChannel.get(channelId) || 0)
              ) {
                groupUnread += 1;
              }
            }
          }
        }
      } else if (!/does not exist|schema cache/i.test(communitiesResult.error.message)) {
        throw new Error(communitiesResult.error.message);
      }

      if (!usedChannelReadState) {
        const { data: rooms, error: roomsError } = await supabaseAdmin
          .from("chat_rooms")
          .select("id,room_type,last_message_at,last_message_sender_id,status")
          .in("id", groupRoomIds)
          .eq("room_type", "group");
        if (roomsError) throw new Error(roomsError.message);

        const memberMap = new Map(memberRows.map((member) => [String(member.room_id), member]));
        for (const room of (rooms || []) as unknown as ChatRoomRow[]) {
          const member = memberMap.get(String(room.id));
          if (
            room.last_message_at &&
            room.last_message_sender_id !== user.id &&
            (!member?.last_read_at ||
              new Date(room.last_message_at).getTime() >
                new Date(member.last_read_at).getTime())
          ) {
            groupUnread += 1;
          }
        }
      }
    }

    const total = (count || 0) + groupUnread;
    await setUnreadCache(user.id, total);
    return NextResponse.json({ count: total, cache: "supabase" });
  } catch (error) {
    const status = chatErrorStatus(error);
    console.error("Unread message count failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to load unread messages.",
          status,
        ),
      },
      { status },
    );
  }
}

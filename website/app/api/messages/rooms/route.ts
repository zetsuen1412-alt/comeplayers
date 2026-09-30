import { NextResponse } from "next/server";
import { chatRoomListFilter } from "@/lib/chatRoomListFilter";
import { callActivityPreview } from "@/lib/callRoomActivity";
import {
  chatErrorStatus,
  isGroupRoom,
  requireChatRoomAccess,
  type ChatMemberRow,
  type ChatRoomRow,
} from "@/lib/chatServer";
import {
  clampPositiveInteger,
  createPublicChatStreamState,
  requestOrigin,
} from "@/lib/chatStream";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

const roomSelect =
  "id,buyer_id,seller_id,product_id,order_id,room_type,title,description,created_by,status,last_message,last_message_at,last_message_sender_id,stream_status,stream_host_id,stream_title,stream_started_at,stream_ended_at,stream_updated_at,party_game,party_mode,party_rank,party_platform,party_region,party_size,party_open,party_updated_at,created_at,updated_at";

function numericId(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const limit = clampPositiveInteger(searchParams.get("limit"), 60, 20, 100);
    const scope = searchParams.get("scope");
    const directOnly = scope === "direct";
    const transactionOnly = scope === "transaction";
    const socialOnly = scope === "social";
    // Apply the inbox scope before LIMIT. Client-side filtering could hide a
    // recent order behind a long list of ordinary direct messages (or vice versa).
    let directQuery = supabaseAdmin.from("chat_rooms").select(roomSelect)
      .or(chatRoomListFilter(user.id, transactionOnly ? "transaction" : socialOnly ? "social" : directOnly ? "direct" : "all"));
    if (directOnly || transactionOnly) directQuery = directQuery.neq("room_type", "group");

    const [directRoomsResult, memberRoomsResult] = await Promise.all([
      directQuery
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
        .limit(limit),
      directOnly || transactionOnly ? Promise.resolve({ data: [], error: null }) : supabaseAdmin
        .from("chat_room_members")
        .select("room_id,user_id,member_role,status,invited_by,last_read_at,joined_at,updated_at")
        .eq("user_id", user.id)
        .eq("status", "active"),
    ]);

    if (directRoomsResult.error) throw new Error(directRoomsResult.error.message);
    if (
      memberRoomsResult.error &&
      !/does not exist|schema cache/i.test(memberRoomsResult.error.message)
    ) {
      throw new Error(memberRoomsResult.error.message);
    }

    const currentMemberships = ((memberRoomsResult.data || []) as unknown as ChatMemberRow[])
      .filter((member) => String(member.status || "").toLowerCase() === "active");
    const membershipRoomIds = Array.from(
      new Set(currentMemberships.map((member) => member.room_id).filter(Boolean))
    );

    let membershipRoomsQuery = supabaseAdmin.from("chat_rooms").select(roomSelect)
      .in("id", membershipRoomIds.length ? membershipRoomIds : ["00000000-0000-0000-0000-000000000000"]);
    if (socialOnly) membershipRoomsQuery = membershipRoomsQuery.eq("room_type", "group");
    const membershipRoomsResult = membershipRoomIds.length
      ? await membershipRoomsQuery
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(limit)
      : { data: [], error: null };

    if (membershipRoomsResult.error) throw new Error(membershipRoomsResult.error.message);

    const roomMap = new Map<string, ChatRoomRow>();
    for (const room of [
      ...((directRoomsResult.data || []) as unknown as ChatRoomRow[]),
      ...((membershipRoomsResult.data || []) as unknown as ChatRoomRow[]),
    ]) {
      roomMap.set(String(room.id), room);
    }

    const roomRows = Array.from(roomMap.values()).sort((left, right) => {
      const leftTime = new Date(left.last_message_at || left.created_at || 0).getTime();
      const rightTime = new Date(right.last_message_at || right.created_at || 0).getTime();
      return rightTime - leftTime;
    }).slice(0, limit);
    const groupRoomIds = roomRows.filter(isGroupRoom).map((room) => room.id);
    const visibleRoomIds = roomRows.map((room) => room.id).filter(Boolean);
    const profileIds = Array.from(
      new Set(
        roomRows
          .flatMap((room) => [room.buyer_id, room.seller_id, room.stream_host_id])
          .filter(Boolean)
      )
    );
    const productIds = Array.from(
      new Set(
        roomRows
          .map((room) => Number(room.product_id || 0))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );
    const orderIds = Array.from(
      new Set(
        roomRows
          .map((room) => Number(room.order_id || 0))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );

    const [profilesResult, productsResult, ordersResult, unreadResult, membersResult] =
      await Promise.all([
        profileIds.length
          ? supabaseAdmin
              .from("profiles")
              .select("id,username,full_name,avatar_url,role,cp_number")
              .in("id", profileIds)
          : Promise.resolve({ data: [], error: null }),
        productIds.length
          ? supabaseAdmin
              .from("products")
              .select("id,title,image_url,price,game_name,category,seller_id")
              .in("id", productIds)
          : Promise.resolve({ data: [], error: null }),
        orderIds.length
          ? supabaseAdmin
              .from("orders")
              .select("id,status,payment_status,product_title,created_at")
              .in("id", orderIds)
          : Promise.resolve({ data: [], error: null }),
        supabaseAdmin
          .from("chat_messages")
          .select("room_id")
          .in("room_id", visibleRoomIds.length ? visibleRoomIds : ["00000000-0000-0000-0000-000000000000"])
          .eq("receiver_id", user.id)
          .eq("is_read", false)
          .is("deleted_at", null)
          .range(0, 999),
        groupRoomIds.length
          ? supabaseAdmin
              .from("chat_room_members")
              .select("room_id,user_id,member_role,status,last_read_at")
              .in("room_id", groupRoomIds)
              .eq("status", "active")
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (productsResult.error) throw new Error(productsResult.error.message);
    if (ordersResult.error) throw new Error(ordersResult.error.message);
    if (unreadResult.error) throw new Error(unreadResult.error.message);
    if (membersResult.error) throw new Error(membersResult.error.message);

    const profileMap = new Map(
      (profilesResult.data || []).map((profile) => [String(profile.id), profile])
    );
    const productMap = new Map(
      (productsResult.data || []).map((product) => [Number(product.id), product])
    );
    const orderMap = new Map(
      (ordersResult.data || []).map((order) => [Number(order.id), order])
    );
    const unreadMap = new Map<string, number>();
    for (const row of unreadResult.data || []) {
      const roomId = String(row.room_id || "");
      if (!roomId) continue;
      unreadMap.set(roomId, (unreadMap.get(roomId) || 0) + 1);
    }
    const currentMemberMap = new Map(
      currentMemberships.map((member) => [String(member.room_id), member])
    );
    const memberCountMap = new Map<string, number>();
    for (const member of (membersResult.data || []) as Array<{ room_id?: string }>) {
      const roomId = String(member.room_id || "");
      if (!roomId) continue;
      memberCountMap.set(roomId, (memberCountMap.get(roomId) || 0) + 1);
    }

    const groupUnreadMap = new Map<string, number>();
    const serverByRoom = new Map<string, Record<string, unknown>>();
    let channelUnreadAvailable = false;
    if (groupRoomIds.length) {
      const communitiesResult = await supabaseAdmin
        .from("chat_communities")
        .select("id,room_id,name,description,icon_url,status")
        .in("room_id", groupRoomIds);

      if (!communitiesResult.error) {
        const communities = communitiesResult.data || [];
        for (const community of communities) {
          serverByRoom.set(
            String(community.room_id),
            community as Record<string, unknown>,
          );
        }
        const communityIds = communities.map((community) => String(community.id));
        const roomByCommunity = new Map(
          communities.map((community) => [String(community.id), String(community.room_id)]),
        );
        const channelsResult = communityIds.length
          ? await supabaseAdmin
              .from("chat_channels")
              .select("id,community_id,is_private")
              .in("community_id", communityIds)
              .eq("is_private", false)
          : { data: [], error: null };

        if (!channelsResult.error) {
          const channels = channelsResult.data || [];
          const channelIds = channels.map((channel) => String(channel.id));
          const roomByChannel = new Map(
            channels.map((channel) => [
              String(channel.id),
              roomByCommunity.get(String(channel.community_id)) || "",
            ]),
          );
          const [readStatesResult, groupMessagesResult] = await Promise.all([
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
                  .select("room_id,channel_id,sender_id,created_at")
                  .in("channel_id", channelIds)
                  .neq("sender_id", user.id)
                  .is("deleted_at", null)
                  .order("created_at", { ascending: false })
                  .range(0, 4999)
              : Promise.resolve({ data: [], error: null }),
          ]);

          if (!readStatesResult.error && !groupMessagesResult.error) {
            channelUnreadAvailable = true;
            const readAtByChannel = new Map(
              (readStatesResult.data || []).map((state) => [
                String(state.channel_id),
                new Date(String(state.last_read_at || 0)).getTime(),
              ]),
            );
            for (const message of groupMessagesResult.data || []) {
              const channelId = String(message.channel_id || "");
              const roomId = roomByChannel.get(channelId) || String(message.room_id || "");
              if (!roomId) continue;
              const createdAt = new Date(String(message.created_at || 0)).getTime();
              const readAt = readAtByChannel.get(channelId) || 0;
              if (createdAt > readAt) {
                groupUnreadMap.set(roomId, (groupUnreadMap.get(roomId) || 0) + 1);
              }
            }
          }
        }
      } else if (!/does not exist|schema cache/i.test(communitiesResult.error.message)) {
        throw new Error(communitiesResult.error.message);
      }
    }

    return NextResponse.json({
      rooms: roomRows.map((room) => {
        const otherId = room.buyer_id === user.id ? room.seller_id : room.buyer_id;
        const member = currentMemberMap.get(String(room.id));
        const legacyGroupUnread =
          isGroupRoom(room) &&
          room.last_message_at &&
          room.last_message_sender_id !== user.id &&
          (!member?.last_read_at ||
            new Date(room.last_message_at).getTime() >
              new Date(member.last_read_at).getTime())
            ? 1
            : 0;
        const groupUnread = channelUnreadAvailable
          ? groupUnreadMap.get(String(room.id)) || 0
          : legacyGroupUnread;
        const group = isGroupRoom(room);
        const callPreview = group ? null : callActivityPreview(room.last_message);
        return {
          ...room,
          last_message: group ? room.last_message : null,
          last_message_sender_id: group ? room.last_message_sender_id : null,
          activity_kind: callPreview ? "call" : room.last_message_at ? "message" : null,
          activity_preview: callPreview,
          other: isGroupRoom(room) ? null : profileMap.get(otherId) || null,
          stream_host: room.stream_host_id
            ? profileMap.get(String(room.stream_host_id)) || null
            : null,
          stream: createPublicChatStreamState(room, requestOrigin(request)),
          server: isGroupRoom(room)
            ? serverByRoom.get(String(room.id)) || null
            : null,
          member_count: memberCountMap.get(String(room.id)) || 0,
          member_role: member?.member_role || null,
          product: room.product_id
            ? productMap.get(Number(room.product_id)) || null
            : null,
          order: room.order_id
            ? orderMap.get(Number(room.order_id)) || null
            : null,
          unread_count: isGroupRoom(room)
            ? groupUnread
            : unreadMap.get(String(room.id)) || 0,
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat room error.";
    return NextResponse.json({ error: message }, { status: chatErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      sellerId?: string;
      productId?: number | string;
      orderId?: number | string;
    };

    const sellerId = String(body.sellerId || "").trim() || null;
    const productId = numericId(body.productId);
    const orderId = numericId(body.orderId);

    if (!productId && !orderId) {
      return NextResponse.json(
        { error: "A valid product or order is required." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc(
      "cp_get_or_create_chat_room_v12",
      {
        p_actor_id: user.id,
        p_seller_id: sellerId,
        p_product_id: productId,
        p_order_id: orderId,
      }
    );

    if (error) throw new Error(error.message);

    const result = (data || {}) as { room_id?: string };
    const roomId = String(result.room_id || "");
    if (!roomId) throw new Error("Chat room creation returned no room ID.");

    const access = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      supabaseAdmin,
    });

    return NextResponse.json({ ok: true, room: { ...access.room, last_message: callActivityPreview(access.room.last_message) || access.room.last_message } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected room creation error.";
    return NextResponse.json({ error: message }, { status: chatErrorStatus(error) });
  }
}

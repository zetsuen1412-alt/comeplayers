import { NextResponse } from "next/server";
import { callActivityPreview } from "@/lib/callRoomActivity";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { CONTACT_PROFILE_SELECT, limitContactSearch, resolveContact } from "@/lib/chatContacts";
import { chatErrorStatus } from "@/lib/chatServer";

export const runtime = "nodejs";

type PresenceStatus = "online" | "away" | "invisible" | "offline";

const PROFILE_SELECT = CONTACT_PROFILE_SELECT;
const ROOM_SELECT =
  "id,buyer_id,seller_id,product_id,order_id,room_type,last_message,last_message_at,last_message_sender_id,status,created_at";

function pairFor(left: string, right: string) {
  return left.localeCompare(right) <= 0
    ? { userA: left, userB: right }
    : { userA: right, userB: left };
}

function cleanIdentifier(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown): PresenceStatus {
  const status = String(value || "").toLowerCase();
  if (status === "away" || status === "invisible" || status === "offline") {
    return status;
  }
  return "online";
}

function publicStatus(
  row: { status?: string | null; last_seen_at?: string | null } | null | undefined,
): { status: "online" | "away" | "offline"; lastSeenAt: string | null } {
  const lastSeenAt = row?.last_seen_at ? String(row.last_seen_at) : null;
  const fresh = lastSeenAt
    ? Date.now() - new Date(lastSeenAt).getTime() < 90_000
    : false;
  const raw = String(row?.status || "offline").toLowerCase();
  if (!fresh || raw === "offline" || raw === "invisible") {
    return { status: "offline", lastSeenAt };
  }
  return { status: raw === "away" ? "away" : "online", lastSeenAt };
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();

    const [friendshipsResult, roomsResult, ownPresenceResult] = await Promise.all([
      supabaseAdmin
        .from("chat_friendships")
        .select(
          "id,user_a,user_b,requested_by,status,created_at,updated_at,accepted_at",
        )
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .in("status", ["pending", "accepted"])
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("chat_rooms")
        .select(ROOM_SELECT)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100),
      supabaseAdmin
        .from("chat_user_presence")
        .select("user_id,status,last_seen_at,updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (friendshipsResult.error) throw new Error(friendshipsResult.error.message);
    if (roomsResult.error) throw new Error(roomsResult.error.message);
    if (ownPresenceResult.error) throw new Error(ownPresenceResult.error.message);

    const friendships = friendshipsResult.data || [];
    const directRooms = (roomsResult.data || []).filter(
      (room) =>
        String(room.room_type || "").toLowerCase() !== "group" &&
        !room.product_id &&
        !room.order_id,
    );

    const otherIds = new Set<string>();
    for (const friendship of friendships) {
      const otherId =
        String(friendship.user_a) === user.id
          ? String(friendship.user_b)
          : String(friendship.user_a);
      if (otherId) otherIds.add(otherId);
    }
    for (const room of directRooms) {
      const otherId =
        String(room.buyer_id) === user.id
          ? String(room.seller_id)
          : String(room.buyer_id);
      if (otherId) otherIds.add(otherId);
    }

    const ids = Array.from(otherIds);
    const [profilesResult, presenceResult, unreadResult] = await Promise.all([
      ids.length
        ? supabaseAdmin.from("profiles").select(PROFILE_SELECT).in("id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? supabaseAdmin
            .from("chat_user_presence")
            .select("user_id,status,last_seen_at,updated_at")
            .in("user_id", ids)
        : Promise.resolve({ data: [], error: null }),
      directRooms.length
        ? supabaseAdmin
            .from("chat_messages")
            .select("room_id")
            .in(
              "room_id",
              directRooms.map((room) => String(room.id)),
            )
            .eq("receiver_id", user.id)
            .eq("is_read", false)
            .is("deleted_at", null)
            .range(0, 999)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (presenceResult.error) throw new Error(presenceResult.error.message);
    if (unreadResult.error) throw new Error(unreadResult.error.message);

    const profileMap = new Map(
      (profilesResult.data || []).map((profile) => [String(profile.id), profile]),
    );
    const presenceMap = new Map(
      (presenceResult.data || []).map((presence) => [
        String(presence.user_id),
        presence,
      ]),
    );
    const unreadMap = new Map<string, number>();
    for (const row of unreadResult.data || []) {
      const roomId = String(row.room_id || "");
      unreadMap.set(roomId, (unreadMap.get(roomId) || 0) + 1);
    }
    const roomByOther = new Map<string, (typeof directRooms)[number]>();
    for (const room of directRooms) {
      const otherId =
        String(room.buyer_id) === user.id
          ? String(room.seller_id)
          : String(room.buyer_id);
      if (!roomByOther.has(otherId)) roomByOther.set(otherId, room);
    }

    const friendRows = friendships.map((friendship) => {
      const otherId =
        String(friendship.user_a) === user.id
          ? String(friendship.user_b)
          : String(friendship.user_a);
      const room = roomByOther.get(otherId) || null;
      const presence = publicStatus(presenceMap.get(otherId));
      return {
        relationId: String(friendship.id),
        profile: profileMap.get(otherId) || {
          id: otherId,
          username: null,
          full_name: null,
          avatar_url: null,
          role: null,
        },
        relationshipStatus: String(friendship.status),
        requestDirection:
          String(friendship.requested_by) === user.id ? "outgoing" : "incoming",
        presenceStatus: presence.status,
        lastSeenAt: presence.lastSeenAt,
        roomId: room ? String(room.id) : null,
        unreadCount: room ? unreadMap.get(String(room.id)) || 0 : 0,
        lastMessage: callActivityPreview(room?.last_message) || room?.last_message || null,
        lastMessageAt: room?.last_message_at || null,
      };
    });

    const accepted = friendRows
      .filter((row) => row.relationshipStatus === "accepted")
      .sort((left, right) => {
        const order = { online: 0, away: 1, offline: 2 } as const;
        const statusDelta =
          order[left.presenceStatus] - order[right.presenceStatus];
        if (statusDelta) return statusDelta;
        const leftName = String(
          left.profile.username || left.profile.full_name || "",
        );
        const rightName = String(
          right.profile.username || right.profile.full_name || "",
        );
        return leftName.localeCompare(rightName);
      });

    const recentChats = directRooms.map((room) => {
      const otherId =
        String(room.buyer_id) === user.id
          ? String(room.seller_id)
          : String(room.buyer_id);
      const presence = publicStatus(presenceMap.get(otherId));
      return {
        roomId: String(room.id),
        profile: profileMap.get(otherId) || {
          id: otherId,
          username: null,
          full_name: null,
          avatar_url: null,
          role: null,
        },
        presenceStatus: presence.status,
        lastSeenAt: presence.lastSeenAt,
        unreadCount: unreadMap.get(String(room.id)) || 0,
        lastMessage: callActivityPreview(room.last_message) || room.last_message || null,
        lastMessageAt: room.last_message_at || null,
      };
    });

    return NextResponse.json({
      friends: accepted,
      incomingRequests: friendRows.filter(
        (row) =>
          row.relationshipStatus === "pending" &&
          row.requestDirection === "incoming",
      ),
      outgoingRequests: friendRows.filter(
        (row) =>
          row.relationshipStatus === "pending" &&
          row.requestDirection === "outgoing",
      ),
      recentChats,
      onlineCount: accepted.filter((row) => row.presenceStatus === "online")
        .length,
      ownStatus: normalizeStatus(ownPresenceResult.data?.status || "online"),
    });
  } catch (error) {
    console.error("Friends lookup failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load friends." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      identifier?: string;
      status?: PresenceStatus;
    };
    const action = String(body.action || "request").toLowerCase();

    if (action === "heartbeat" || action === "status") {
      const status = normalizeStatus(body.status);
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin.from("chat_user_presence").upsert(
        {
          user_id: user.id,
          status,
          last_seen_at: now,
          updated_at: now,
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, status });
    }

    const identifier = cleanIdentifier(body.identifier);
    if (identifier.length < 2) {
      return NextResponse.json(
        { error: "Enter an exact username or CP number." },
        { status: 400 },
      );
    }

    await limitContactSearch(user.id);
    const target = await resolveContact(supabaseAdmin, user.id, identifier);
    if (!target) {
      return NextResponse.json({ error: "Player was not found." }, { status: 404 });
    }
    if (String(target.id) === user.id) {
      return NextResponse.json(
        { error: "You cannot add yourself as a friend." },
        { status: 400 },
      );
    }

    const pair = pairFor(user.id, String(target.id));
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("chat_friendships")
      .select("id,user_a,user_b,requested_by,status")
      .eq("user_a", pair.userA)
      .eq("user_b", pair.userB)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (existing?.status === "accepted") {
      return NextResponse.json({ ok: true, alreadyFriends: true, profile: target });
    }
    if (existing?.status === "pending") {
      if (String(existing.requested_by) !== user.id) {
        const now = new Date().toISOString();
        const { error } = await supabaseAdmin
          .from("chat_friendships")
          .update({ status: "accepted", accepted_at: now, updated_at: now })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, accepted: true, profile: target });
      }
      return NextResponse.json({ ok: true, pending: true, profile: target });
    }

    const now = new Date().toISOString();
    const payload = {
      user_a: pair.userA,
      user_b: pair.userB,
      requested_by: user.id,
      status: "pending",
      accepted_at: null,
      updated_at: now,
    };

    const mutation = existing
      ? supabaseAdmin
          .from("chat_friendships")
          .update(payload)
          .eq("id", existing.id)
          .select("id")
          .single()
      : supabaseAdmin
          .from("chat_friendships")
          .insert(payload)
          .select("id")
          .single();
    const { data, error } = await mutation;
    if (error) throw new Error(error.message);

    return NextResponse.json(
      { ok: true, requestId: data.id, profile: target },
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    console.error("Friend action failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Friend action failed." },
      { status: chatErrorStatus(error) },
    );
  }
}

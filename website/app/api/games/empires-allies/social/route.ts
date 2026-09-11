import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_SELECT = "id,username,full_name,avatar_url,role";
type PresenceStatus = "online" | "playing" | "offline";

function pairFor(left: string, right: string) {
  return left.localeCompare(right) <= 0
    ? { userA: left, userB: right }
    : { userA: right, userB: left };
}

function publicPresence(
  row:
    | { status?: string | null; last_seen_at?: string | null }
    | null
    | undefined,
): PresenceStatus {
  const lastSeen = row?.last_seen_at
    ? new Date(String(row.last_seen_at)).getTime()
    : 0;
  if (!lastSeen || Date.now() - lastSeen > 100_000) return "offline";
  return String(row?.status) === "playing" ? "playing" : "online";
}

async function acceptedFriendship(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  friendId: string,
) {
  const pair = pairFor(userId, friendId);
  const { data, error } = await supabaseAdmin
    .from("chat_friendships")
    .select("id,status")
    .eq("user_a", pair.userA)
    .eq("user_b", pair.userB)
    .eq("status", "accepted")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const freshSince = new Date(Date.now() - 100_000).toISOString();

    await supabaseAdmin
      .from("empires_allies_invites")
      .update({ status: "expired", updated_at: nowIso })
      .eq("status", "pending")
      .lt("expires_at", nowIso);

    const [friendshipsResult, invitesResult, onlinePresenceResult] =
      await Promise.all([
        supabaseAdmin
          .from("chat_friendships")
          .select("id,user_a,user_b,requested_by,status,updated_at")
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
          .in("status", ["pending", "accepted"])
          .order("updated_at", { ascending: false }),
        supabaseAdmin
          .from("empires_allies_invites")
          .select(
            "id,sender_id,recipient_id,status,expires_at,created_at,updated_at",
          )
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .eq("status", "pending")
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("empires_allies_presence")
          .select("user_id,status,world_name,level,last_seen_at")
          .neq("user_id", user.id)
          .gte("last_seen_at", freshSince)
          .order("last_seen_at", { ascending: false })
          .limit(60),
      ]);
    if (friendshipsResult.error) throw new Error(friendshipsResult.error.message);
    if (invitesResult.error) throw new Error(invitesResult.error.message);
    if (onlinePresenceResult.error)
      throw new Error(onlinePresenceResult.error.message);

    const relatedIds = new Set<string>();
    for (const row of friendshipsResult.data || []) {
      relatedIds.add(
        String(row.user_a) === user.id ? String(row.user_b) : String(row.user_a),
      );
    }
    for (const row of invitesResult.data || []) {
      relatedIds.add(String(row.sender_id));
      relatedIds.add(String(row.recipient_id));
    }
    for (const row of onlinePresenceResult.data || []) {
      relatedIds.add(String(row.user_id));
    }
    relatedIds.delete(user.id);

    const ids = Array.from(relatedIds).filter(Boolean);
    const [profilesResult, presenceResult] = await Promise.all([
      ids.length
        ? supabaseAdmin.from("profiles").select(PROFILE_SELECT).in("id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? supabaseAdmin
            .from("empires_allies_presence")
            .select("user_id,status,world_name,level,last_seen_at")
            .in("user_id", ids)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (presenceResult.error) throw new Error(presenceResult.error.message);

    const profileMap = new Map(
      (profilesResult.data || []).map((profile) => [String(profile.id), profile]),
    );
    const presenceMap = new Map(
      (presenceResult.data || []).map((presence) => [
        String(presence.user_id),
        presence,
      ]),
    );
    const acceptedIds = new Set<string>();

    const friendships = (friendshipsResult.data || []).map((row) => {
      const friendId =
        String(row.user_a) === user.id ? String(row.user_b) : String(row.user_a);
      if (String(row.status) === "accepted") acceptedIds.add(friendId);
      const presence = presenceMap.get(friendId);
      return {
        relationId: String(row.id),
        profile: profileMap.get(friendId) || {
          id: friendId,
          username: null,
          full_name: null,
          avatar_url: null,
          role: null,
        },
        relationshipStatus: String(row.status),
        requestDirection:
          String(row.requested_by) === user.id ? "outgoing" : "incoming",
        gameStatus: publicPresence(presence),
        worldName: presence?.world_name || null,
        level: Number(presence?.level || 0),
        lastSeenAt: presence?.last_seen_at || null,
      };
    });

    const invitations = (invitesResult.data || []).map((row) => {
      const senderId = String(row.sender_id);
      const recipientId = String(row.recipient_id);
      const otherId = senderId === user.id ? recipientId : senderId;
      return {
        id: String(row.id),
        direction: senderId === user.id ? "outgoing" : "incoming",
        profile: profileMap.get(otherId) || {
          id: otherId,
          username: null,
          full_name: null,
          avatar_url: null,
          role: null,
        },
        expiresAt: String(row.expires_at),
        createdAt: String(row.created_at),
      };
    });

    const onlinePlayers = (onlinePresenceResult.data || []).map((row) => {
      const playerId = String(row.user_id);
      return {
        profile: profileMap.get(playerId) || {
          id: playerId,
          username: null,
          full_name: null,
          avatar_url: null,
          role: null,
        },
        gameStatus: publicPresence(row),
        worldName: row.world_name || null,
        level: Number(row.level || 0),
        isFriend: acceptedIds.has(playerId),
      };
    });

    return NextResponse.json({
      friends: friendships.filter((row) => row.relationshipStatus === "accepted"),
      incomingFriendRequests: friendships.filter(
        (row) =>
          row.relationshipStatus === "pending" &&
          row.requestDirection === "incoming",
      ),
      outgoingFriendRequests: friendships.filter(
        (row) =>
          row.relationshipStatus === "pending" &&
          row.requestDirection === "outgoing",
      ),
      incomingInvites: invitations.filter((row) => row.direction === "incoming"),
      outgoingInvites: invitations.filter((row) => row.direction === "outgoing"),
      onlinePlayers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load CP Empires & Allies social data.",
      },
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
      targetUserId?: string;
      inviteId?: string;
      status?: PresenceStatus;
      worldName?: string;
      level?: number;
    };
    const action = String(body.action || "heartbeat").toLowerCase();
    const nowIso = new Date().toISOString();

    if (action === "heartbeat") {
      const status: PresenceStatus =
        body.status === "offline"
          ? "offline"
          : body.status === "online"
            ? "online"
            : "playing";
      const { error } = await supabaseAdmin
        .from("empires_allies_presence")
        .upsert(
          {
            user_id: user.id,
            status,
            world_name: String(body.worldName || "").trim().slice(0, 80) || null,
            level: Math.max(0, Math.min(10_000, Number(body.level || 0))),
            last_seen_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: "user_id" },
        );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, status });
    }

    const targetUserId = String(body.targetUserId || "").trim();

    if (action === "add_friend") {
      if (!targetUserId || targetUserId === user.id) {
        return NextResponse.json({ error: "Invalid player." }, { status: 400 });
      }
      const pair = pairFor(user.id, targetUserId);
      const { data: target, error: targetError } = await supabaseAdmin
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", targetUserId)
        .maybeSingle();
      if (targetError) throw new Error(targetError.message);
      if (!target) {
        return NextResponse.json({ error: "Player was not found." }, { status: 404 });
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("chat_friendships")
        .select("id,requested_by,status")
        .eq("user_a", pair.userA)
        .eq("user_b", pair.userB)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);

      if (existing?.status === "accepted") {
        return NextResponse.json({ ok: true, alreadyFriends: true });
      }
      if (
        existing?.status === "pending" &&
        String(existing.requested_by) !== user.id
      ) {
        const { error } = await supabaseAdmin
          .from("chat_friendships")
          .update({ status: "accepted", accepted_at: nowIso, updated_at: nowIso })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, accepted: true });
      }
      if (existing?.status === "pending") {
        return NextResponse.json({ ok: true, pending: true });
      }

      const payload = {
        user_a: pair.userA,
        user_b: pair.userB,
        requested_by: user.id,
        status: "pending",
        accepted_at: null,
        updated_at: nowIso,
      };
      const mutation = existing
        ? supabaseAdmin
            .from("chat_friendships")
            .update(payload)
            .eq("id", existing.id)
        : supabaseAdmin.from("chat_friendships").insert(payload);
      const { error } = await mutation;
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, requested: true });
    }

    if (action === "friend_accept" || action === "friend_decline") {
      if (!targetUserId) {
        return NextResponse.json({ error: "Invalid player." }, { status: 400 });
      }
      const pair = pairFor(user.id, targetUserId);
      const { data: friendship, error } = await supabaseAdmin
        .from("chat_friendships")
        .select("id,requested_by,status")
        .eq("user_a", pair.userA)
        .eq("user_b", pair.userB)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (
        !friendship ||
        friendship.status !== "pending" ||
        String(friendship.requested_by) === user.id
      ) {
        return NextResponse.json(
          { error: "Friend request was not found." },
          { status: 404 },
        );
      }
      if (action === "friend_accept") {
        const { error: updateError } = await supabaseAdmin
          .from("chat_friendships")
          .update({ status: "accepted", accepted_at: nowIso, updated_at: nowIso })
          .eq("id", friendship.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: deleteError } = await supabaseAdmin
          .from("chat_friendships")
          .delete()
          .eq("id", friendship.id);
        if (deleteError) throw new Error(deleteError.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "invite") {
      if (!targetUserId || targetUserId === user.id) {
        return NextResponse.json({ error: "Invalid friend." }, { status: 400 });
      }
      if (!(await acceptedFriendship(supabaseAdmin, user.id, targetUserId))) {
        return NextResponse.json(
          { error: "Only accepted friends can receive game invitations." },
          { status: 403 },
        );
      }
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("empires_allies_invites")
        .select("id")
        .eq("sender_id", user.id)
        .eq("recipient_id", targetUserId)
        .eq("status", "pending")
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);

      const mutation = existing
        ? supabaseAdmin
            .from("empires_allies_invites")
            .update({ expires_at: expiresAt, updated_at: nowIso })
            .eq("id", existing.id)
            .select("id")
            .single()
        : supabaseAdmin
            .from("empires_allies_invites")
            .insert({
              sender_id: user.id,
              recipient_id: targetUserId,
              status: "pending",
              expires_at: expiresAt,
              updated_at: nowIso,
            })
            .select("id")
            .single();
      const { data, error } = await mutation;
      if (error) throw new Error(error.message);

      const { data: senderProfile } = await supabaseAdmin
        .from("profiles")
        .select("username,full_name")
        .eq("id", user.id)
        .maybeSingle();
      await supabaseAdmin.from("notifications").insert({
        user_id: targetUserId,
        type: "game_invite",
        title: "CP Empires & Allies invitation",
        message: `${senderProfile?.username || senderProfile?.full_name || "A friend"} invited you to play CP Empires & Allies.`,
        link_url: "/cpcommunity?game=empires-allies",
        is_read: false,
      });

      return NextResponse.json({ ok: true, inviteId: data.id, expiresAt });
    }

    if (
      action === "invite_accept" ||
      action === "invite_decline" ||
      action === "invite_cancel"
    ) {
      const inviteId = String(body.inviteId || "").trim();
      if (!inviteId) {
        return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });
      }
      const { data: invite, error } = await supabaseAdmin
        .from("empires_allies_invites")
        .select("id,sender_id,recipient_id,status,expires_at")
        .eq("id", inviteId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!invite || invite.status !== "pending") {
        return NextResponse.json(
          { error: "Invitation is no longer available." },
          { status: 404 },
        );
      }
      const isRecipient = String(invite.recipient_id) === user.id;
      const isSender = String(invite.sender_id) === user.id;
      if (
        (action === "invite_cancel" && !isSender) ||
        (action !== "invite_cancel" && !isRecipient)
      ) {
        return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      }
      const status =
        action === "invite_accept"
          ? "accepted"
          : action === "invite_decline"
            ? "declined"
            : "cancelled";
      const { error: updateError } = await supabaseAdmin
        .from("empires_allies_invites")
        .update({ status, updated_at: nowIso })
        .eq("id", inviteId);
      if (updateError) throw new Error(updateError.message);
      return NextResponse.json({ ok: true, status, openGame: status === "accepted" });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "CP Empires & Allies social action failed.",
      },
      { status: 500 },
    );
  }
}

import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { bootstrapCommunityForRoom } from "@/lib/communityServer";
import {
  chatErrorStatus,
  createChatNotification,
  requireChatRoomAccess,
  safeProfileLabel,
  toPublicChatProfile,
} from "@/lib/chatServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

function clean(value: unknown, max = 80) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function statusError(message: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
}

function canManageParty(role?: string | null) {
  return ["admin", "group_owner", "group_moderator"].includes(
    String(role || "").toLowerCase(),
  );
}

function apiError(error: unknown, fallback: string) {
  const status = chatErrorStatus(error);
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json(
    { error: status >= 500 ? fallback : message },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const game = clean(searchParams.get("game"));
    const region = clean(searchParams.get("region"), 40);
    const platform = clean(searchParams.get("platform"), 40);
    const requestedLimit = Number(searchParams.get("limit") || 12);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(30, Math.max(3, Math.trunc(requestedLimit)))
      : 12;

    let query = supabaseAdmin
      .from("chat_rooms")
      .select(
        "id,title,description,created_by,party_game,party_mode,party_rank,party_platform,party_region,party_size,party_open,party_updated_at,stream_status,created_at",
      )
      .eq("room_type", "group")
      .eq("status", "active")
      .eq("party_open", true)
      .order("party_updated_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (game)
      query = query.ilike("party_game", `%${game.replace(/[,%()]/g, "")}%`);
    if (region) query = query.ilike("party_region", region);
    if (platform) query = query.ilike("party_platform", platform);

    const { data: rooms, error } = await query;
    if (error) throw new Error(error.message);

    const roomRows = rooms || [];
    const roomIds = roomRows.map((room) => String(room.id));
    const ownerIds = Array.from(
      new Set(
        roomRows.map((room) => String(room.created_by || "")).filter(Boolean),
      ),
    );

    const [membersResult, profilesResult] = await Promise.all([
      roomIds.length
        ? supabaseAdmin
            .from("chat_room_members")
            .select("room_id,user_id,status")
            .in("room_id", roomIds)
            .eq("status", "active")
        : Promise.resolve({ data: [], error: null }),
      ownerIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id,username,full_name,avatar_url,role,cp_number")
            .in("id", ownerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (membersResult.error) throw new Error(membersResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const membersByRoom = new Map<string, string[]>();
    for (const member of membersResult.data || []) {
      const roomId = String(member.room_id || "");
      const values = membersByRoom.get(roomId) || [];
      values.push(String(member.user_id || ""));
      membersByRoom.set(roomId, values);
    }
    const profileMap = new Map(
      (profilesResult.data || []).map((profile) => [
        String(profile.id),
        profile,
      ]),
    );

    return NextResponse.json({
      parties: roomRows.map((room) => {
        const memberIds = membersByRoom.get(String(room.id)) || [];
        return {
          ...room,
          member_count: memberIds.length,
          joined: memberIds.includes(user.id),
          leader: toPublicChatProfile(
            profileMap.get(String(room.created_by || "")) || null,
          ),
        };
      }),
    });
  } catch (error) {
    console.error("Squad Finder load failed:", error);
    return apiError(error, "Unable to load Squad Finder.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      roomId?: string;
      action?: "join" | "auto-invite";
      count?: number | string;
    };
    const roomId = clean(body.roomId, 60);
    const action = clean(body.action || "join", 24).toLowerCase();
    if (!roomId) {
      return NextResponse.json(
        { error: "Party is required." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    if (action === "auto-invite") {
      const access = await requireChatRoomAccess({
        roomId,
        userId: user.id,
        supabaseAdmin,
      });
      if (!canManageParty(access.role)) {
        throw statusError("Only a party leader can auto-invite players.", 403);
      }
      if (String(access.room.status || "active").toLowerCase() !== "active") {
        throw statusError("This party is no longer active.", 409);
      }

      const requestedCount = Number(body.count || 1);
      const count = Number.isFinite(requestedCount)
        ? Math.min(10, Math.max(1, Math.trunc(requestedCount)))
        : 1;
      const capacity = Math.max(
        2,
        Math.min(20, Number(access.room.party_size || 5)),
      );

      const [membersResult, pendingResult, profilesResult] = await Promise.all([
        supabaseAdmin
          .from("chat_room_members")
          .select("user_id")
          .eq("room_id", roomId)
          .eq("status", "active"),
        supabaseAdmin
          .from("chat_party_invitations")
          .select("invitee_id")
          .eq("room_id", roomId)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString()),
        supabaseAdmin
          .from("profiles")
          .select("id,username,full_name,avatar_url,role,cp_number")
          .neq("id", user.id)
          .limit(250),
      ]);
      if (membersResult.error) throw new Error(membersResult.error.message);
      if (pendingResult.error) throw new Error(pendingResult.error.message);
      if (profilesResult.error) throw new Error(profilesResult.error.message);

      const excludedIds = new Set<string>([
        user.id,
        ...(membersResult.data || []).map((member) => String(member.user_id)),
        ...(pendingResult.data || []).map((invite) =>
          String(invite.invitee_id),
        ),
      ]);
      const availableSlots = Math.max(
        0,
        capacity -
          (membersResult.data?.length || 0) -
          (pendingResult.data?.length || 0),
      );
      const inviteCount = Math.min(count, availableSlots);
      if (inviteCount < 1) {
        throw statusError(
          "No invitation slots are available for this squad.",
          409,
        );
      }

      const candidates = (profilesResult.data || []).filter(
        (candidate) => !excludedIds.has(String(candidate.id)),
      );
      for (let index = candidates.length - 1; index > 0; index -= 1) {
        const swapIndex = randomInt(index + 1);
        [candidates[index], candidates[swapIndex]] = [
          candidates[swapIndex],
          candidates[index],
        ];
      }
      const selected = candidates.slice(0, inviteCount);
      if (!selected.length)
        throw statusError("No eligible random players were found.", 404);

      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { data: invitations, error: invitationsError } = await supabaseAdmin
        .from("chat_party_invitations")
        .insert(
          selected.map((candidate) => ({
            room_id: roomId,
            inviter_id: user.id,
            invitee_id: String(candidate.id),
            source: "matchmaking",
            status: "pending",
            message: access.room.party_game
              ? `Random match for ${String(access.room.party_game)}`
              : "Random squad invitation",
            expires_at: expiresAt,
            updated_at: now,
          })),
        )
        .select("id,invitee_id,expires_at");
      if (invitationsError) throw new Error(invitationsError.message);

      const { data: inviterProfile } = await supabaseAdmin
        .from("profiles")
        .select("username,full_name,email")
        .eq("id", user.id)
        .maybeSingle();
      await Promise.all(
        selected.map((candidate) =>
          createChatNotification({
            supabaseAdmin,
            receiverId: String(candidate.id),
            senderName: safeProfileLabel(inviterProfile),
            roomId,
            preview: `Random squad invite for ${String(access.room.party_game || access.room.title || "ComePlayers")}. Accept to join.`,
          }),
        ),
      );

      return NextResponse.json({
        ok: true,
        roomId,
        action: "auto-invite",
        invitations: (invitations || []).map((invitation) => ({
          ...invitation,
          player: toPublicChatProfile(
            selected.find(
              (candidate) =>
                String(candidate.id) === String(invitation.invitee_id),
            ) || null,
          ),
        })),
      });
    }

    if (action !== "join") {
      return NextResponse.json(
        { error: "Unknown matchmaking action." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc("cp_join_open_party_v33", {
      p_room_id: roomId,
      p_user_id: user.id,
    });
    if (error) {
      const message = String(error.message || "Unable to join this party.");
      if (/not found/i.test(message)) throw statusError(message, 404);
      if (/closed|full|no longer active/i.test(message))
        throw statusError(message, 409);
      throw new Error(message);
    }

    try {
      await bootstrapCommunityForRoom({
        supabaseAdmin,
        roomId,
        actorId: user.id,
      });
    } catch (communityError) {
      console.error("Party community sync failed:", communityError);
    }

    const { data: room } = await supabaseAdmin
      .from("chat_rooms")
      .select("id,title,created_by")
      .eq("id", roomId)
      .maybeSingle();
    if (room?.created_by && String(room.created_by) !== user.id) {
      const { data: joiningProfile } = await supabaseAdmin
        .from("profiles")
        .select("username,full_name,email")
        .eq("id", user.id)
        .maybeSingle();
      await createChatNotification({
        supabaseAdmin,
        receiverId: String(room.created_by),
        senderName: safeProfileLabel(joiningProfile),
        roomId,
        preview: `Joined ${String(room.title || "your party")} through Squad Finder.`,
      });
    }

    return NextResponse.json({ ok: true, roomId, result: data || {} });
  } catch (error) {
    console.error("Squad Finder join failed:", error);
    return apiError(error, "Unable to join this party.");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      roomId?: string;
      open?: boolean;
      game?: string;
      mode?: string;
      rank?: string;
      platform?: string;
      region?: string;
      partySize?: number | string;
    };
    const roomId = clean(body.roomId, 60);
    if (!roomId) {
      return NextResponse.json(
        { error: "Party is required." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      supabaseAdmin,
    });
    if (!canManageParty(access.role)) {
      const forbidden = new Error(
        "Only a party leader can update Squad Finder.",
      );
      Object.assign(forbidden, { status: 403 });
      throw forbidden;
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      party_open: body.open === true,
      party_updated_at: now,
      updated_at: now,
    };
    if (body.game !== undefined) patch.party_game = clean(body.game);
    if (body.mode !== undefined)
      patch.party_mode = clean(body.mode, 60) || null;
    if (body.rank !== undefined)
      patch.party_rank = clean(body.rank, 60) || null;
    if (body.platform !== undefined)
      patch.party_platform = clean(body.platform, 40) || null;
    if (body.region !== undefined)
      patch.party_region = clean(body.region, 40) || null;
    if (body.partySize !== undefined) {
      const value = Number(body.partySize);
      if (!Number.isInteger(value) || value < 2 || value > 20) {
        return NextResponse.json(
          { error: "Party size must be between 2 and 20." },
          { status: 400 },
        );
      }
      patch.party_size = value;
    }

    if (
      patch.party_open === true &&
      !String(patch.party_game || access.room.party_game || "")
    ) {
      return NextResponse.json(
        { error: "Choose a game before opening Squad Finder." },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("chat_rooms")
      .update(patch)
      .eq("id", roomId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, roomId, open: patch.party_open });
  } catch (error) {
    console.error("Squad Finder update failed:", error);
    return apiError(error, "Unable to update this party.");
  }
}

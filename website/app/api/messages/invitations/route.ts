import { NextResponse } from "next/server";
import { bootstrapCommunityForRoom } from "@/lib/communityServer";
import {
  chatErrorStatus,
  createChatNotification,
  safeProfileLabel,
  toPublicChatProfile,
} from "@/lib/chatServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

type InvitationRow = {
  id: string;
  room_id: string;
  inviter_id: string;
  invitee_id: string;
  source: string;
  status: string;
  message?: string | null;
  expires_at: string;
  responded_at?: string | null;
  created_at: string;
  updated_at: string;
};

function clean(value: unknown, max = 80) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function apiError(error: unknown, fallback: string) {
  const status = chatErrorStatus(error);
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json(
    { error: status >= 500 ? fallback : message },
    { status },
  );
}

function statusError(message: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number(searchParams.get("limit") || 40);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
      : 40;
    const now = new Date().toISOString();

    const [receivedResult, sentResult] = await Promise.all([
      supabaseAdmin
        .from("chat_party_invitations")
        .select(
          "id,room_id,inviter_id,invitee_id,source,status,message,expires_at,responded_at,created_at,updated_at",
        )
        .eq("invitee_id", user.id)
        .eq("status", "pending")
        .gt("expires_at", now)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from("chat_party_invitations")
        .select(
          "id,room_id,inviter_id,invitee_id,source,status,message,expires_at,responded_at,created_at,updated_at",
        )
        .eq("inviter_id", user.id)
        .eq("status", "pending")
        .gt("expires_at", now)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);
    if (receivedResult.error) throw new Error(receivedResult.error.message);
    if (sentResult.error) throw new Error(sentResult.error.message);

    const received = (receivedResult.data || []) as InvitationRow[];
    const sent = (sentResult.data || []) as InvitationRow[];
    const all = [...received, ...sent];
    const roomIds = Array.from(new Set(all.map((invite) => invite.room_id)));
    const profileIds = Array.from(
      new Set(all.flatMap((invite) => [invite.inviter_id, invite.invitee_id])),
    );

    const [roomsResult, profilesResult] = await Promise.all([
      roomIds.length
        ? supabaseAdmin
            .from("chat_rooms")
            .select(
              "id,title,description,room_type,status,party_game,party_mode,party_rank,party_platform,party_region,party_size,party_open,stream_status,created_by",
            )
            .in("id", roomIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id,username,full_name,avatar_url,role")
            .in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (roomsResult.error) throw new Error(roomsResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const roomMap = new Map(
      (roomsResult.data || []).map((room) => [String(room.id), room]),
    );
    const profileMap = new Map(
      (profilesResult.data || []).map((item) => [String(item.id), item]),
    );
    const decorate = (
      invite: InvitationRow,
      direction: "received" | "sent",
    ) => ({
      ...invite,
      direction,
      room: roomMap.get(invite.room_id) || null,
      inviter: toPublicChatProfile(profileMap.get(invite.inviter_id) || null),
      invitee: toPublicChatProfile(profileMap.get(invite.invitee_id) || null),
    });

    return NextResponse.json({
      received: received.map((invite) => decorate(invite, "received")),
      sent: sent.map((invite) => decorate(invite, "sent")),
    });
  } catch (error) {
    console.error("Message invitations load failed:", error);
    return apiError(error, "Unable to load invitations.");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      invitationId?: string;
      action?: "accept" | "decline";
    };
    const invitationId = clean(body.invitationId, 60);
    const action = clean(body.action, 16).toLowerCase();
    if (!invitationId)
      return NextResponse.json(
        { error: "Invitation is required." },
        { status: 400 },
      );
    if (!["accept", "decline"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be accept or decline." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("chat_party_invitations")
      .select("id,room_id,inviter_id,invitee_id,status")
      .eq("id", invitationId)
      .eq("invitee_id", user.id)
      .maybeSingle();
    if (invitationError) throw new Error(invitationError.message);
    if (!invitation) throw statusError("Invitation was not found.", 404);

    const { data, error } = await supabaseAdmin.rpc(
      "cp_respond_party_invite_v34",
      {
        p_invite_id: invitationId,
        p_user_id: user.id,
        p_action: action,
      },
    );
    if (error) {
      const message = String(error.message || "Unable to answer invitation.");
      if (/not found/i.test(message)) throw statusError(message, 404);
      if (/expired|already|full|no longer active/i.test(message))
        throw statusError(message, 409);
      throw new Error(message);
    }

    if (action === "accept") {
      try {
        await bootstrapCommunityForRoom({
          supabaseAdmin,
          roomId: String(invitation.room_id),
          actorId: user.id,
          newMemberId: user.id,
        });
      } catch (communityError) {
        console.error(
          "Community sync after invitation acceptance failed:",
          communityError,
        );
      }
    }

    const [{ data: actorProfile }, { data: room }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("username,full_name,email")
        .eq("id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("chat_rooms")
        .select("title")
        .eq("id", invitation.room_id)
        .maybeSingle(),
    ]);
    await createChatNotification({
      supabaseAdmin,
      receiverId: String(invitation.inviter_id),
      senderName: safeProfileLabel(actorProfile),
      roomId: String(invitation.room_id),
      preview:
        action === "accept"
          ? `Accepted your invitation to ${String(room?.title || "the squad")}.`
          : `Declined your invitation to ${String(room?.title || "the squad")}.`,
    });

    return NextResponse.json({
      ok: true,
      invitationId,
      roomId: String(invitation.room_id),
      action,
      result: data || {},
    });
  } catch (error) {
    console.error("Message invitation response failed:", error);
    return apiError(error, "Unable to answer invitation.");
  }
}

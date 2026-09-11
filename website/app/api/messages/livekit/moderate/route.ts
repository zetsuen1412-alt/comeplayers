import { TrackSource } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import {
  hasCommunityPermission,
  requireCommunityChannel,
} from "@/lib/communityServer";
import {
  createCommunityVoiceRoomName,
  createLiveKitRoomServiceClient,
} from "@/lib/livekitServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

function statusError(message: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
}

function legacyRolePosition(role: string) {
  if (role === "owner") return 100;
  if (role === "admin") return 80;
  if (role === "moderator") return 60;
  return 10;
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      roomId?: string;
      channelId?: string;
      participantIdentity?: string;
      action?: string;
    };
    const roomId = String(body.roomId || "").trim();
    const channelId = String(body.channelId || "").trim();
    const targetUserId = String(body.participantIdentity || "").trim();
    const action = String(body.action || "").trim().toLowerCase();

    if (!roomId || !channelId || !targetUserId) {
      throw statusError("Room, channel, and participant are required.", 400);
    }
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
      throw statusError("Invalid participant identity.", 400);
    }
    if (action !== "mute" && action !== "remove") {
      throw statusError("Unsupported voice moderation action.", 400);
    }
    if (targetUserId === user.id) {
      throw statusError("Use your own voice controls for your account.", 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { access, channel } = await requireCommunityChannel({
      supabaseAdmin,
      userId: user.id,
      roomId,
      channelId,
    });
    if (String(channel.channel_type || "").toLowerCase() !== "voice") {
      throw statusError("The selected channel is not a voice channel.", 400);
    }
    if (!hasCommunityPermission(access, "moderate_voice")) {
      throw statusError("You do not have permission to moderate this voice channel.", 403);
    }

    const [{ data: targetMember, error: targetMemberError }, { data: targetAssignments, error: targetRoleError }] =
      await Promise.all([
        supabaseAdmin
          .from("chat_room_members")
          .select("user_id,member_role,status")
          .eq("room_id", roomId)
          .eq("user_id", targetUserId)
          .maybeSingle(),
        supabaseAdmin
          .from("chat_community_member_roles")
          .select("role_id,chat_community_roles(name,position,permissions)")
          .eq("community_id", access.community.id)
          .eq("user_id", targetUserId),
      ]);
    if (targetMemberError) throw new Error(targetMemberError.message);
    if (targetRoleError) throw new Error(targetRoleError.message);
    if (!targetMember || String(targetMember.status || "").toLowerCase() !== "active") {
      throw statusError("The participant is not an active community member.", 404);
    }

    const targetIsOwner = String(access.community.owner_id) === targetUserId;
    if (targetIsOwner && !access.isAdmin) {
      throw statusError("The community owner cannot be moderated by another member.", 403);
    }

    if (!access.isOwner && !access.isAdmin) {
      const { data: actorRoles, error: actorRolesError } = access.roleIds.length
        ? await supabaseAdmin
            .from("chat_community_roles")
            .select("id,position")
            .in("id", access.roleIds)
        : { data: [], error: null };
      if (actorRolesError) throw new Error(actorRolesError.message);

      const actorPosition = Math.max(
        legacyRolePosition(access.memberRole),
        ...(actorRoles || []).map((role) => Number(role.position || 0)),
      );
      const targetPosition = Math.max(
        legacyRolePosition(String(targetMember.member_role || "member").toLowerCase()),
        ...(targetAssignments || []).map((assignment) => {
          const roleValue = assignment.chat_community_roles as unknown;
          const role = Array.isArray(roleValue) ? roleValue[0] : roleValue;
          return role && typeof role === "object" && "position" in role
            ? Number((role as { position?: number }).position || 0)
            : 0;
        }),
      );
      if (actorPosition <= targetPosition) {
        throw statusError("You can only moderate members below your highest role.", 403);
      }
    }

    const roomName = createCommunityVoiceRoomName({
      communityId: access.community.id,
      channelId: String(channel.id),
    });
    const livekit = createLiveKitRoomServiceClient();
    const participants = await livekit.listParticipants(roomName);
    const participant = participants.find((row) => row.identity === targetUserId);
    if (!participant) throw statusError("The participant is no longer connected to voice.", 404);

    if (action === "mute") {
      const microphone = (participant.tracks || []).find(
        (track) => track.source === TrackSource.MICROPHONE,
      );
      if (!microphone?.sid) {
        throw statusError("The participant does not have an active microphone track.", 409);
      }
      if (!microphone.muted) {
        await livekit.mutePublishedTrack(roomName, targetUserId, microphone.sid, true);
      }
    } else {
      await livekit.removeParticipant(roomName, targetUserId);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("username,full_name")
      .eq("id", targetUserId)
      .maybeSingle();
    const targetName = String(profile?.username || profile?.full_name || participant.name || "Participant");

    const { error: auditError } = await supabaseAdmin.from("chat_community_audit_logs").insert({
      community_id: access.community.id,
      actor_id: user.id,
      action: action === "mute" ? "voice.participant_muted" : "voice.participant_removed",
      target_type: "user",
      target_id: targetUserId,
      metadata: {
        room_id: roomId,
        channel_id: channelId,
        livekit_room: roomName,
      },
    });
    if (auditError) console.warn("Voice moderation audit log failed:", auditError.message);

    return NextResponse.json(
      {
        ok: true,
        action,
        participantIdentity: targetUserId,
        message:
          action === "mute"
            ? `${targetName} was server-muted.`
            : `${targetName} was disconnected from voice.`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("LiveKit voice moderation failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to moderate voice participant.", status) },
      { status },
    );
  }
}

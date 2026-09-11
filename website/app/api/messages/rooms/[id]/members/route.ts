import { NextResponse } from "next/server";
import { resolveContact, assertContactAllowed, limitContactSearch } from "@/lib/chatContacts";
import { bootstrapCommunityForRoom } from "@/lib/communityServer";
import {
  chatErrorStatus,
  createChatNotification,
  isGroupRoom,
  requireChatRoomAccess,
  safeProfileLabel,
  toPublicChatProfile,
  type ChatMemberRow,
} from "@/lib/chatServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

const memberSelect =
  "room_id,user_id,member_role,status,invited_by,last_read_at,joined_at,updated_at";
const profileSelect = "id,email,username,full_name,avatar_url,role";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function canManageGroupMembers(role?: string | null) {
  const normalized = String(role || "").toLowerCase();
  return (
    normalized === "admin" ||
    normalized === "group_owner" ||
    normalized === "group_moderator"
  );
}

function statusError(message: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const roomId = String(id || "").trim();
    const body = (await request.json()) as {
      userId?: string;
      identifier?: string;
      email?: string;
      username?: string;
    };
    const identifier = String(
      body.userId || body.identifier || body.email || body.username || "",
    ).trim();

    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required." },
        { status: 400 },
      );
    }
    if (!identifier) {
      return NextResponse.json(
        { error: "Username or verified phone number is required." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      supabaseAdmin,
    });

    if (!isGroupRoom(access.room)) {
      throw statusError("Members can only be managed inside group chats.", 400);
    }
    if (!canManageGroupMembers(access.role)) {
      throw statusError(
        "Only group owners, moderators, or admins can invite members.",
        403,
      );
    }
    if (String(access.room.status || "active").toLowerCase() !== "active") {
      throw statusError("This group chat is currently locked.", 403);
    }

    await limitContactSearch(user.id);
    const target = await resolveContact(supabaseAdmin, user.id, identifier);
    if (!target?.id) throw statusError("User was not found.", 404);
    if (String(target.id) === user.id) {
      throw statusError("You are already in this group.", 409);
    }

    await assertContactAllowed(supabaseAdmin, user.id, String(target.id));
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("chat_room_members")
      .select(memberSelect)
      .eq("room_id", roomId)
      .eq("user_id", String(target.id))
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    const existingMember = (existing || null) as ChatMemberRow | null;
    if (String(existingMember?.status || "").toLowerCase() === "active") {
      throw statusError("This user is already an active member.", 409);
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: existingInvitation, error: invitationReadError } =
      await supabaseAdmin
        .from("chat_party_invitations")
        .select("id,status,expires_at")
        .eq("room_id", roomId)
        .eq("invitee_id", String(target.id))
        .eq("status", "pending")
        .maybeSingle();
    if (invitationReadError) throw new Error(invitationReadError.message);

    const invitationWrite = existingInvitation?.id
      ? supabaseAdmin
          .from("chat_party_invitations")
          .update({
            inviter_id: user.id,
            source: "direct",
            expires_at: expiresAt,
            responded_at: null,
            updated_at: now,
          })
          .eq("id", existingInvitation.id)
      : supabaseAdmin.from("chat_party_invitations").insert({
          room_id: roomId,
          inviter_id: user.id,
          invitee_id: String(target.id),
          source: "direct",
          status: "pending",
          expires_at: expiresAt,
          updated_at: now,
        });

    const { data: invitation, error: invitationWriteError } =
      await invitationWrite
        .select(
          "id,room_id,inviter_id,invitee_id,source,status,expires_at,created_at",
        )
        .single();
    if (invitationWriteError) throw new Error(invitationWriteError.message);

    const { data: inviterProfile } = await supabaseAdmin
      .from("profiles")
      .select("username,full_name,email")
      .eq("id", user.id)
      .maybeSingle();

    await createChatNotification({
      supabaseAdmin,
      receiverId: String(target.id),
      senderName: safeProfileLabel(inviterProfile),
      roomId,
      preview: `Invited you to ${String(access.room.title || "a group chat")}. Accept to join.`,
    });

    return NextResponse.json({
      ok: true,
      invitation: {
        ...invitation,
        profile: toPublicChatProfile(target),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected member invite error.";
    return NextResponse.json(
      { error: message },
      { status: chatErrorStatus(error) },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const roomId = String(id || "").trim();
    const body = (await request.json()) as {
      userId?: string;
      role?: "member" | "moderator";
    };
    const targetUserId = String(body.userId || "").trim();
    const nextRole = String(body.role || "").toLowerCase();

    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required." },
        { status: 400 },
      );
    }
    if (!isUuid(targetUserId)) {
      return NextResponse.json(
        { error: "Valid user ID is required." },
        { status: 400 },
      );
    }
    if (!["member", "moderator"].includes(nextRole)) {
      return NextResponse.json(
        { error: "Role must be member or moderator." },
        { status: 400 },
      );
    }
    if (targetUserId === user.id) {
      throw statusError("You cannot change your own leader role.", 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      supabaseAdmin,
    });

    if (!isGroupRoom(access.room)) {
      throw statusError("Roles can only be managed inside group chats.", 400);
    }
    if (!["group_owner", "admin"].includes(access.role)) {
      throw statusError(
        "Only the group creator can appoint or remove leaders.",
        403,
      );
    }

    const { data: targetMember, error: targetError } = await supabaseAdmin
      .from("chat_room_members")
      .select(memberSelect)
      .eq("room_id", roomId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetError) throw new Error(targetError.message);
    if (
      !targetMember ||
      String(targetMember.status || "").toLowerCase() !== "active"
    ) {
      throw statusError("Active member was not found.", 404);
    }
    if (String(targetMember.member_role || "").toLowerCase() === "owner") {
      throw statusError("The creator role cannot be changed.", 403);
    }

    const now = new Date().toISOString();
    const { data: updatedMember, error: updateError } = await supabaseAdmin
      .from("chat_room_members")
      .update({ member_role: nextRole, updated_at: now })
      .eq("room_id", roomId)
      .eq("user_id", targetUserId)
      .select(memberSelect)
      .single();
    if (updateError) throw new Error(updateError.message);

    try {
      await bootstrapCommunityForRoom({
        supabaseAdmin,
        roomId,
        actorId: user.id,
      });
      const { data: community } = await supabaseAdmin
        .from("chat_communities")
        .select("id")
        .eq("room_id", roomId)
        .maybeSingle();
      if (community?.id) {
        const { data: desiredRole, error: roleReadError } = await supabaseAdmin
          .from("chat_community_roles")
          .select("id")
          .eq("community_id", community.id)
          .ilike("name", nextRole === "moderator" ? "Moderator" : "Member")
          .maybeSingle();
        if (roleReadError) throw new Error(roleReadError.message);

        const { error: deleteError } = await supabaseAdmin
          .from("chat_community_member_roles")
          .delete()
          .eq("community_id", community.id)
          .eq("user_id", targetUserId);
        if (
          deleteError &&
          !/does not exist|schema cache/i.test(deleteError.message)
        ) {
          throw new Error(deleteError.message);
        }

        if (desiredRole?.id) {
          const { error: insertError } = await supabaseAdmin
            .from("chat_community_member_roles")
            .insert({
              community_id: community.id,
              user_id: targetUserId,
              role_id: desiredRole.id,
              assigned_by: user.id,
              assigned_at: now,
            });
          if (insertError) throw new Error(insertError.message);
        }
      }
    } catch (communityError) {
      console.error("Community leader-role sync failed:", communityError);
    }

    const [{ data: targetProfile }, { data: actorProfile }] = await Promise.all(
      [
        supabaseAdmin
          .from("profiles")
          .select(profileSelect)
          .eq("id", targetUserId)
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("username,full_name,email")
          .eq("id", user.id)
          .maybeSingle(),
      ],
    );

    await createChatNotification({
      supabaseAdmin,
      receiverId: targetUserId,
      senderName: safeProfileLabel(actorProfile),
      roomId,
      preview:
        nextRole === "moderator"
          ? `Appointed you as a leader in ${String(access.room.title || "the group")}.`
          : `Changed your role to member in ${String(access.room.title || "the group")}.`,
    });

    return NextResponse.json({
      ok: true,
      member: {
        ...updatedMember,
        profile: toPublicChatProfile(targetProfile || null),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected role update error.";
    return NextResponse.json(
      { error: message },
      { status: chatErrorStatus(error) },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const roomId = String(id || "").trim();
    const body = (await request.json()) as { userId?: string };
    const targetUserId = String(body.userId || "").trim();

    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required." },
        { status: 400 },
      );
    }
    if (!isUuid(targetUserId)) {
      return NextResponse.json(
        { error: "Valid user ID is required." },
        { status: 400 },
      );
    }
    if (targetUserId === user.id) {
      throw statusError("You cannot remove yourself from the group.", 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      supabaseAdmin,
    });

    if (!isGroupRoom(access.room)) {
      throw statusError("Members can only be managed inside group chats.", 400);
    }
    if (!canManageGroupMembers(access.role)) {
      throw statusError(
        "Only group owners, moderators, or admins can remove members.",
        403,
      );
    }

    const { data: targetMember, error: targetError } = await supabaseAdmin
      .from("chat_room_members")
      .select(memberSelect)
      .eq("room_id", roomId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetError) throw new Error(targetError.message);
    if (
      !targetMember ||
      String(targetMember.status || "").toLowerCase() !== "active"
    ) {
      throw statusError("Active member was not found.", 404);
    }
    const targetRole = String(
      targetMember.member_role || "member",
    ).toLowerCase();
    if (targetRole === "owner") {
      throw statusError("Group owner cannot be removed.", 403);
    }
    if (access.role === "group_moderator" && targetRole === "moderator") {
      throw statusError("Only the group owner can remove another leader.", 403);
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("chat_room_members")
      .update({ status: "removed", updated_at: now })
      .eq("room_id", roomId)
      .eq("user_id", targetUserId);

    if (updateError) throw new Error(updateError.message);

    const { data: community } = await supabaseAdmin
      .from("chat_communities")
      .select("id")
      .eq("room_id", roomId)
      .maybeSingle();
    if (community?.id) {
      const { error: roleDeleteError } = await supabaseAdmin
        .from("chat_community_member_roles")
        .delete()
        .eq("community_id", community.id)
        .eq("user_id", targetUserId);
      if (
        roleDeleteError &&
        !/does not exist|schema cache/i.test(roleDeleteError.message)
      ) {
        throw new Error(roleDeleteError.message);
      }
    }

    if (access.room.stream_host_id === targetUserId) {
      const { error: streamError } = await supabaseAdmin
        .from("chat_rooms")
        .update({
          stream_status: "idle",
          stream_host_id: null,
          stream_title: null,
          stream_ended_at: now,
          stream_updated_at: now,
          updated_at: now,
        })
        .eq("id", roomId);

      if (streamError) throw new Error(streamError.message);
    }

    return NextResponse.json({ ok: true, removedUserId: targetUserId });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected member removal error.";
    return NextResponse.json(
      { error: message },
      { status: chatErrorStatus(error) },
    );
  }
}

import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import { bootstrapCommunityForRoom } from "@/lib/communityServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ code: string }> };

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { code: rawCode } = await context.params;
    const code = String(rawCode || "").trim();
    if (!code) {
      return NextResponse.json({ error: "Invite code is required." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("chat_community_invites")
      .select(
        "code,max_uses,uses,expires_at,revoked_at,chat_communities(id,room_id,name,description,icon_url,status)",
      )
      .eq("code", code)
      .maybeSingle();
    if (inviteError) throw new Error(inviteError.message);
    if (!invite || invite.revoked_at) {
      return NextResponse.json({ error: "Server invite was not found." }, { status: 404 });
    }
    if (invite.expires_at && new Date(String(invite.expires_at)).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Server invite has expired." }, { status: 410 });
    }
    if (invite.max_uses != null && Number(invite.uses || 0) >= Number(invite.max_uses)) {
      return NextResponse.json({ error: "Server invite has reached its usage limit." }, { status: 410 });
    }

    const communityValue = invite.chat_communities as unknown;
    const community = Array.isArray(communityValue) ? communityValue[0] : communityValue;
    if (
      !community ||
      typeof community !== "object" ||
      !("room_id" in community) ||
      String((community as { status?: string }).status || "active") !== "active"
    ) {
      return NextResponse.json({ error: "Server is unavailable." }, { status: 404 });
    }
    const server = community as {
      id: string;
      room_id: string;
      name: string;
      description?: string | null;
      icon_url?: string | null;
    };
    const { count, error: countError } = await supabaseAdmin
      .from("chat_room_members")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", server.room_id)
      .eq("status", "active");
    if (countError) throw new Error(countError.message);

    return NextResponse.json({
      server: {
        id: server.id,
        roomId: server.room_id,
        name: server.name,
        description: server.description || null,
        iconUrl: server.icon_url || null,
        memberCount: count || 0,
      },
    });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Server invite preview failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to preview this server.", status) },
      { status },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { code: rawCode } = await context.params;
    const code = String(rawCode || "").trim();
    if (!code) return NextResponse.json({ error: "Invite code is required." }, { status: 400 });

    const supabaseAdmin = createSupabaseAdmin();
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("chat_community_invites")
      .select("id,community_id,created_by,max_uses,uses,expires_at,revoked_at,chat_communities(id,room_id,name,status,owner_id)")
      .eq("code", code)
      .maybeSingle();
    if (inviteError) throw new Error(inviteError.message);
    if (!invite) return NextResponse.json({ error: "Invite link was not found." }, { status: 404 });
    if (invite.revoked_at) return NextResponse.json({ error: "Invite link has been revoked." }, { status: 410 });
    if (invite.expires_at && new Date(String(invite.expires_at)).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Invite link has expired." }, { status: 410 });
    }
    if (invite.max_uses != null && Number(invite.uses || 0) >= Number(invite.max_uses)) {
      return NextResponse.json({ error: "Invite link has reached its usage limit." }, { status: 410 });
    }

    const communityValue = invite.chat_communities as unknown;
    const community = Array.isArray(communityValue) ? communityValue[0] : communityValue;
    if (!community || typeof community !== "object" || !("room_id" in community)) {
      return NextResponse.json({ error: "Invite community is unavailable." }, { status: 404 });
    }
    const roomId = String((community as { room_id: string }).room_id);
    const communityId = String(invite.community_id);

    const { data: ban, error: banError } = await supabaseAdmin
      .from("chat_community_bans")
      .select("expires_at")
      .eq("community_id", communityId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (banError) throw new Error(banError.message);
    if (ban && (!ban.expires_at || new Date(String(ban.expires_at)).getTime() > Date.now())) {
      return NextResponse.json({ error: "You are banned from this community." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const { data: existingMember, error: existingError } = await supabaseAdmin
      .from("chat_room_members")
      .select("status,joined_at")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const alreadyActive = String(existingMember?.status || "").toLowerCase() === "active";
    if (!alreadyActive) {
      const { error: memberError } = await supabaseAdmin
        .from("chat_room_members")
        .upsert({
          room_id: roomId,
          user_id: user.id,
          member_role: "member",
          status: "active",
          invited_by: invite.created_by,
          last_read_at: now,
          joined_at: existingMember?.joined_at || now,
          updated_at: now,
        }, { onConflict: "room_id,user_id" });
      if (memberError) throw new Error(memberError.message);

      const { error: useError } = await supabaseAdmin
        .from("chat_community_invites")
        .update({ uses: Number(invite.uses || 0) + 1 })
        .eq("id", invite.id)
        .eq("uses", Number(invite.uses || 0));
      if (useError) throw new Error(useError.message);
    }

    await bootstrapCommunityForRoom({ supabaseAdmin, roomId, actorId: user.id });
    await supabaseAdmin.from("chat_community_audit_logs").insert({
      community_id: communityId,
      actor_id: user.id,
      action: alreadyActive ? "member.invite_reopened" : "member.joined",
      target_type: "member",
      target_id: user.id,
      metadata: { invite_id: invite.id },
    });

    return NextResponse.json({
      ok: true,
      roomId,
      communityId,
      alreadyMember: alreadyActive,
    });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Community invite join failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to join this community.", status) },
      { status },
    );
  }
}

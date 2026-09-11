import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import { requireCommunityAccess } from "@/lib/communityServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string }> };

type InviteRow = {
  id: string;
  code: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: string;
};

export const runtime = "nodejs";

const MAX_INVITE_AGE_DAYS = 30;
const DEFAULT_INVITE_AGE_DAYS = 30;

function statusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function inviteUrl(origin: string, code: string) {
  return `${origin}/invite/${encodeURIComponent(code)}`;
}

function publicInvite(origin: string, invite: InviteRow) {
  const expiresAt = invite.expires_at ? String(invite.expires_at) : null;
  const expired = expiresAt
    ? new Date(expiresAt).getTime() <= Date.now()
    : false;
  const exhausted =
    invite.max_uses != null &&
    Number(invite.uses || 0) >= Number(invite.max_uses);

  return {
    ...invite,
    url: inviteUrl(origin, invite.code),
    isPermanent: !expiresAt,
    isActive: !invite.revoked_at && !expired && !exhausted,
    expired,
    exhausted,
  };
}

function createShortInviteCode() {
  // 9 URL-safe characters, similar to a Discord invite code, while still
  // carrying about 54 bits of randomness.
  return randomBytes(8).toString("base64url").slice(0, 9);
}

async function insertUniqueInvite(input: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  communityId: string;
  createdBy: string;
  expiresAt: string | null;
  maxUses: number | null;
}) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createShortInviteCode();
    const { data, error } = await input.supabaseAdmin
      .from("chat_community_invites")
      .insert({
        community_id: input.communityId,
        code,
        created_by: input.createdBy,
        max_uses: input.maxUses,
        expires_at: input.expiresAt,
      })
      .select(
        "id,code,max_uses,uses,expires_at,revoked_at,created_at,created_by",
      )
      .single();

    if (!error && data) return data as InviteRow;
    if (error?.code !== "23505") throw new Error(error?.message || "Invite creation failed.");
  }

  throw statusError("A unique invite code could not be generated. Try again.", 503);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const communityId = String(id || "").trim();
    if (!communityId) throw statusError("Server ID is required.", 400);

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireCommunityAccess({
      supabaseAdmin,
      userId: user.id,
      communityId,
      permission: "create_invite",
    });

    const [{ data: inviteRows, error: inviteError }, { data: channel, error: channelError }] =
      await Promise.all([
        supabaseAdmin
          .from("chat_community_invites")
          .select(
            "id,code,max_uses,uses,expires_at,revoked_at,created_at,created_by",
          )
          .eq("community_id", communityId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("chat_channels")
          .select("id,name")
          .eq("community_id", communityId)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle(),
      ]);

    if (inviteError) throw new Error(inviteError.message);
    if (channelError) throw new Error(channelError.message);

    const origin = new URL(request.url).origin;
    return NextResponse.json(
      {
        server: {
          id: access.community.id,
          roomId: access.community.room_id,
          name: access.community.name,
          channelId: channel?.id || null,
          channelName: channel?.name || "general",
          channelUrl: channel?.id
            ? `${origin}/cpcommunity/servers/${encodeURIComponent(communityId)}/channels/${encodeURIComponent(channel.id)}`
            : `${origin}/cpcommunity?server=${encodeURIComponent(communityId)}`,
        },
        invites: ((inviteRows || []) as InviteRow[]).map((invite) =>
          publicInvite(origin, invite),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = chatErrorStatus(error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to load invite links.", status) },
      { status },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const communityId = String(id || "").trim();
    if (!communityId) throw statusError("Server ID is required.", 400);

    const body = (await request.json().catch(() => ({}))) as {
      expiresInDays?: number | null;
      expiresInHours?: number | null;
      maxUses?: number | null;
      permanent?: boolean;
    };

    const permanent = body.permanent === true || body.expiresInDays === null;
    const requestedHours =
      body.expiresInHours != null
        ? Number(body.expiresInHours)
        : Number(body.expiresInDays ?? DEFAULT_INVITE_AGE_DAYS) * 24;
    const expiresInHours = Math.min(
      MAX_INVITE_AGE_DAYS * 24,
      Math.max(1, Number.isFinite(requestedHours) ? requestedHours : DEFAULT_INVITE_AGE_DAYS * 24),
    );
    const maxUsesRaw =
      body.maxUses == null ? null : Math.floor(Number(body.maxUses));
    const maxUses =
      maxUsesRaw && maxUsesRaw > 0 ? Math.min(maxUsesRaw, 10000) : null;

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireCommunityAccess({
      supabaseAdmin,
      userId: user.id,
      communityId,
      permission: "create_invite",
    });

    const expiresAt = permanent
      ? null
      : new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    const invite = await insertUniqueInvite({
      supabaseAdmin,
      communityId,
      createdBy: user.id,
      expiresAt,
      maxUses,
    });

    await supabaseAdmin.from("chat_community_audit_logs").insert({
      community_id: access.community.id,
      actor_id: user.id,
      action: "invite.created",
      target_type: "invite",
      target_id: invite.id,
      metadata: {
        expires_at: expiresAt,
        max_uses: maxUses,
        permanent,
      },
    });

    const origin = new URL(request.url).origin;
    return NextResponse.json(
      {
        ok: true,
        invite: publicInvite(origin, invite),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Community invite creation failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to create an invite link.", status) },
      { status },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const communityId = String(id || "").trim();
    const body = (await request.json().catch(() => ({}))) as {
      inviteId?: string;
      code?: string;
    };
    const inviteId = String(body.inviteId || "").trim();
    const code = String(body.code || "").trim();
    if (!communityId) throw statusError("Server ID is required.", 400);
    if (!inviteId && !code) throw statusError("Invite ID or code is required.", 400);

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireCommunityAccess({
      supabaseAdmin,
      userId: user.id,
      communityId,
      permission: "create_invite",
    });

    const updateQuery = supabaseAdmin
      .from("chat_community_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("community_id", communityId)
      .is("revoked_at", null);
    const filteredUpdate = inviteId
      ? updateQuery.eq("id", inviteId)
      : updateQuery.eq("code", code);

    const { data: revoked, error } = await filteredUpdate
      .select("id,code")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!revoked) throw statusError("Active invite link was not found.", 404);

    await supabaseAdmin.from("chat_community_audit_logs").insert({
      community_id: access.community.id,
      actor_id: user.id,
      action: "invite.revoked",
      target_type: "invite",
      target_id: revoked.id,
      metadata: { code: revoked.code },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = chatErrorStatus(error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to revoke the invite link.", status) },
      { status },
    );
  }
}

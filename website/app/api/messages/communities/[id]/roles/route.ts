import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import {
  COMMUNITY_PERMISSION_NAMES,
  assertCommunityPermissionsGrantable,
  notifyCommunityChanged,
  requireCommunityAccess,
} from "@/lib/communityServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const communityId = String(id || "").trim();
    const supabaseAdmin = createSupabaseAdmin();
    await requireCommunityAccess({ supabaseAdmin, userId: user.id, communityId });
    const { data, error } = await supabaseAdmin
      .from("chat_community_roles")
      .select("id,name,color,position,is_default,is_managed,permissions,created_at,updated_at")
      .eq("community_id", communityId)
      .order("position", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ roles: data || [] });
  } catch (error) {
    const status = chatErrorStatus(error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to load community roles.", status) },
      { status },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const communityId = String(id || "").trim();
    const body = (await request.json()) as { name?: string; color?: string; permissions?: string[] };
    const name = String(body.name || "").trim().replace(/\s+/g, " ");
    const color = /^#[0-9a-f]{6}$/i.test(String(body.color || "")) ? String(body.color) : "#94a3b8";
    const allowed = new Set<string>(COMMUNITY_PERMISSION_NAMES);
    if (body.permissions !== undefined && (!Array.isArray(body.permissions) || body.permissions.some((permission) => typeof permission !== "string" || !allowed.has(permission)))) {
      return NextResponse.json({ error: "Choose valid community permissions." }, { status: 400 });
    }
    const permissions = Array.from(new Set(body.permissions || []));
    if (!name || name.length > 40) {
      return NextResponse.json({ error: "Role name is required and must be 40 characters or fewer." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireCommunityAccess({
      supabaseAdmin,
      userId: user.id,
      communityId,
      permission: "manage_roles",
    });
    assertCommunityPermissionsGrantable(access, permissions as (typeof COMMUNITY_PERMISSION_NAMES)[number][]);
    const { data: highest, error: highestError } = await supabaseAdmin
      .from("chat_community_roles")
      .select("position")
      .eq("community_id", communityId)
      .lt("position", 80)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (highestError) throw new Error(highestError.message);

    const { data: role, error } = await supabaseAdmin
      .from("chat_community_roles")
      .insert({
        community_id: communityId,
        name,
        color,
        position: Math.min(79, Number(highest?.position || 10) + 1),
        is_default: false,
        is_managed: false,
        permissions,
      })
      .select("id,name,color,position,is_default,is_managed,permissions,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("chat_community_audit_logs").insert({
      community_id: access.community.id,
      actor_id: user.id,
      action: "role.created",
      target_type: "role",
      target_id: role.id,
      metadata: { name, permissions },
    });
    await notifyCommunityChanged(supabaseAdmin, access.community.room_id);
    return NextResponse.json({ ok: true, role }, { status: 201 });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Community role creation failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to create the role.", status) },
      { status },
    );
  }
}

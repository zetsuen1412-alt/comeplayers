import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import { requireCommunityAccess } from "@/lib/communityServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const communityId = String(id || "").trim();
    const body = (await request.json()) as { name?: string };
    const name = String(body.name || "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!name || name.length > 60) {
      return NextResponse.json({ error: "Category name is required and must be 60 characters or fewer." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireCommunityAccess({
      supabaseAdmin,
      userId: user.id,
      communityId,
      permission: "manage_channels",
    });
    const { data: lastCategory, error: positionError } = await supabaseAdmin
      .from("chat_channel_categories")
      .select("position")
      .eq("community_id", communityId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (positionError) throw new Error(positionError.message);

    const { data: category, error: insertError } = await supabaseAdmin
      .from("chat_channel_categories")
      .insert({
        community_id: communityId,
        name,
        position: Number(lastCategory?.position || 0) + 10,
        created_by: user.id,
      })
      .select("id,community_id,name,position,created_at,updated_at")
      .single();
    if (insertError) {
      if (/duplicate|unique/i.test(insertError.message)) {
        return NextResponse.json({ error: "A category with this name already exists." }, { status: 409 });
      }
      throw new Error(insertError.message);
    }

    await supabaseAdmin.from("chat_community_audit_logs").insert({
      community_id: access.community.id,
      actor_id: user.id,
      action: "category.created",
      target_type: "category",
      target_id: category.id,
      metadata: { name },
    });

    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Community category creation failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to create the category.", status) },
      { status },
    );
  }
}

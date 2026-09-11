import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import {
  normalizeCommunityChannelName,
  requireCommunityAccess,
} from "@/lib/communityServer";
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
    const body = (await request.json()) as {
      name?: string;
      type?: string;
      topic?: string;
      categoryId?: string | null;
      isPrivate?: boolean;
      isReadOnly?: boolean;
    };
    const channelType = String(body.type || "text").toLowerCase();
    const name = normalizeCommunityChannelName(String(body.name || ""));
    const topic = String(body.topic || "").trim();
    const categoryId = String(body.categoryId || "").trim() || null;

    if (!name || name.length > 60) {
      return NextResponse.json(
        { error: "Channel name must contain letters or numbers and be 60 characters or fewer." },
        { status: 400 },
      );
    }
    if (!["text", "announcement", "voice"].includes(channelType)) {
      return NextResponse.json({ error: "Unsupported channel type." }, { status: 400 });
    }
    if (topic.length > 500) {
      return NextResponse.json({ error: "Channel topic must be 500 characters or fewer." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireCommunityAccess({
      supabaseAdmin,
      userId: user.id,
      communityId,
      permission: "manage_channels",
    });

    if (categoryId) {
      const { data: category, error } = await supabaseAdmin
        .from("chat_channel_categories")
        .select("id")
        .eq("id", categoryId)
        .eq("community_id", communityId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!category) {
        return NextResponse.json({ error: "Category was not found." }, { status: 404 });
      }
    }

    const { count, error: countError } = await supabaseAdmin
      .from("chat_channels")
      .select("id", { count: "exact", head: true })
      .eq("community_id", communityId);
    if (countError) throw new Error(countError.message);
    if ((count || 0) >= 100) {
      return NextResponse.json({ error: "A community can have up to 100 channels." }, { status: 400 });
    }

    let positionQuery = supabaseAdmin
      .from("chat_channels")
      .select("position")
      .eq("community_id", communityId);
    positionQuery = categoryId
      ? positionQuery.eq("category_id", categoryId)
      : positionQuery.is("category_id", null);
    const { data: lastChannel, error: positionError } = await positionQuery
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (positionError) throw new Error(positionError.message);

    const { data: channel, error: insertError } = await supabaseAdmin
      .from("chat_channels")
      .insert({
        community_id: communityId,
        category_id: categoryId,
        name,
        channel_type: channelType,
        topic: topic || null,
        position: Number(lastChannel?.position || 0) + 10,
        is_private: Boolean(body.isPrivate),
        is_read_only: channelType === "announcement" ? true : Boolean(body.isReadOnly),
        is_default: false,
        created_by: user.id,
      })
      .select("id,community_id,category_id,name,channel_type,topic,position,is_private,is_read_only,is_default,created_at,updated_at")
      .single();
    if (insertError) {
      if (/duplicate|unique/i.test(insertError.message)) {
        return NextResponse.json({ error: "A channel with this name already exists." }, { status: 409 });
      }
      throw new Error(insertError.message);
    }

    await supabaseAdmin.from("chat_community_audit_logs").insert({
      community_id: access.community.id,
      actor_id: user.id,
      action: "channel.created",
      target_type: "channel",
      target_id: channel.id,
      metadata: { name, type: channelType },
    });

    return NextResponse.json({ ok: true, channel }, { status: 201 });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Community channel creation failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to create the channel.", status) },
      { status },
    );
  }
}

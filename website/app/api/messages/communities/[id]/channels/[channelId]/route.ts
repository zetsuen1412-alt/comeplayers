import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import {
  normalizeCommunityChannelName,
  notifyCommunityChanged,
  requireCommunityAccess,
} from "@/lib/communityServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string; channelId: string }> };

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id, channelId: rawChannelId } = await context.params;
    const communityId = String(id || "").trim();
    const channelId = String(rawChannelId || "").trim();
    const body = (await request.json()) as {
      name?: string;
      topic?: string;
      categoryId?: string | null;
      isPrivate?: boolean;
      isReadOnly?: boolean;
    };
    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireCommunityAccess({
      supabaseAdmin,
      userId: user.id,
      communityId,
      permission: "manage_channels",
    });

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("chat_channels")
      .select("id,name,is_default,channel_type")
      .eq("id", channelId)
      .eq("community_id", communityId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) return NextResponse.json({ error: "Channel was not found." }, { status: 404 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = normalizeCommunityChannelName(String(body.name || ""));
      if (!name) return NextResponse.json({ error: "Valid channel name is required." }, { status: 400 });
      updates.name = name;
    }
    if (body.topic !== undefined) {
      const topic = String(body.topic || "").trim();
      if (topic.length > 500) {
        return NextResponse.json({ error: "Channel topic must be 500 characters or fewer." }, { status: 400 });
      }
      updates.topic = topic || null;
    }
    if (body.categoryId !== undefined) {
      const categoryId = String(body.categoryId || "").trim() || null;
      if (categoryId) {
        const { data: category, error: categoryError } = await supabaseAdmin
          .from("chat_channel_categories")
          .select("id")
          .eq("id", categoryId)
          .eq("community_id", communityId)
          .maybeSingle();
        if (categoryError) throw new Error(categoryError.message);
        if (!category) {
          return NextResponse.json({ error: "Category was not found." }, { status: 404 });
        }
      }
      updates.category_id = categoryId;
    }
    if (body.isPrivate !== undefined) updates.is_private = Boolean(body.isPrivate);
    if (body.isReadOnly !== undefined && existing.channel_type !== "announcement") {
      updates.is_read_only = Boolean(body.isReadOnly);
    }

    const { data: channel, error: updateError } = await supabaseAdmin
      .from("chat_channels")
      .update(updates)
      .eq("id", channelId)
      .eq("community_id", communityId)
      .select("id,community_id,category_id,name,channel_type,topic,position,is_private,is_read_only,is_default,created_at,updated_at")
      .single();
    if (updateError) throw new Error(updateError.message);

    await supabaseAdmin.from("chat_community_audit_logs").insert({
      community_id: access.community.id,
      actor_id: user.id,
      action: "channel.updated",
      target_type: "channel",
      target_id: channelId,
      metadata: updates,
    });

    await notifyCommunityChanged(supabaseAdmin, access.community.room_id);
    return NextResponse.json({ ok: true, channel });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Community channel update failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to update the channel.", status) },
      { status },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id, channelId: rawChannelId } = await context.params;
    const communityId = String(id || "").trim();
    const channelId = String(rawChannelId || "").trim();
    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireCommunityAccess({
      supabaseAdmin,
      userId: user.id,
      communityId,
      permission: "manage_channels",
    });

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("chat_channels")
      .select("id,name,is_default")
      .eq("id", channelId)
      .eq("community_id", communityId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) return NextResponse.json({ error: "Channel was not found." }, { status: 404 });
    if (existing.is_default) {
      return NextResponse.json({ error: "The default #general channel cannot be deleted." }, { status: 400 });
    }

    const { count, error: messageCountError } = await supabaseAdmin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId);
    if (messageCountError) throw new Error(messageCountError.message);
    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: "This channel contains messages and cannot be deleted yet. Archive support will be added next." },
        { status: 409 },
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("chat_channels")
      .delete()
      .eq("id", channelId)
      .eq("community_id", communityId);
    if (deleteError) throw new Error(deleteError.message);

    await supabaseAdmin.from("chat_community_audit_logs").insert({
      community_id: access.community.id,
      actor_id: user.id,
      action: "channel.deleted",
      target_type: "channel",
      target_id: channelId,
      metadata: { name: existing.name },
    });

    await notifyCommunityChanged(supabaseAdmin, access.community.room_id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Community channel deletion failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to delete the channel.", status) },
      { status },
    );
  }
}

import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import {
  bootstrapCommunityForRoom,
  loadCommunityBundle,
  requireCommunityAccess,
} from "@/lib/communityServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ roomId: string }> };

export const runtime = "nodejs";

function normalizeServerIconUrl(value: unknown) {
  const iconUrl = String(value || "").trim();
  if (!iconUrl) return null;
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(iconUrl)) {
    if (iconUrl.length > 400_000) {
      throw Object.assign(new Error("Server icon must be smaller than 300 KB."), {
        status: 400,
      });
    }
    return iconUrl;
  }
  if (iconUrl.length > 2_048) {
    throw Object.assign(new Error("Server icon URL is too long."), { status: 400 });
  }
  try {
    const url = new URL(iconUrl);
    if (url.protocol !== "https:") throw new Error("invalid protocol");
  } catch {
    throw Object.assign(
      new Error("Server icon must be an HTTPS image URL or uploaded image."),
      { status: 400 },
    );
  }
  return iconUrl;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { roomId: rawRoomId } = await context.params;
    const roomId = String(rawRoomId || "").trim();
    if (!roomId) {
      return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const bundle = await loadCommunityBundle({
      supabaseAdmin,
      userId: user.id,
      roomId,
    });
    return NextResponse.json(bundle);
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Community bundle load failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to load community channels.", status) },
      { status },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { roomId: rawRoomId } = await context.params;
    const roomId = String(rawRoomId || "").trim();
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      iconUrl?: string | null;
    };
    const hasName = typeof body.name === "string";
    const hasDescription = body.description !== undefined;
    const hasIcon = body.iconUrl !== undefined;
    const name = hasName
      ? String(body.name || "").trim().replace(/\s+/g, " ")
      : "";
    const description = hasDescription
      ? String(body.description || "").trim()
      : "";

    if (!hasName && !hasDescription && !hasIcon) {
      return NextResponse.json(
        { error: "At least one server setting is required." },
        { status: 400 },
      );
    }
    if (hasName && (name.length < 3 || name.length > 80)) {
      return NextResponse.json(
        { error: "Server name must be between 3 and 80 characters." },
        { status: 400 },
      );
    }
    if (hasDescription && description.length > 500) {
      return NextResponse.json(
        { error: "Server description must be 500 characters or fewer." },
        { status: 400 },
      );
    }
    const iconUrl = hasIcon ? normalizeServerIconUrl(body.iconUrl) : undefined;

    const supabaseAdmin = createSupabaseAdmin();
    let access;
    try {
      access = await requireCommunityAccess({
        supabaseAdmin,
        userId: user.id,
        roomId,
        permission: "manage_channels",
      });
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) {
        await bootstrapCommunityForRoom({ supabaseAdmin, roomId, actorId: user.id });
        access = await requireCommunityAccess({
          supabaseAdmin,
          userId: user.id,
          roomId,
          permission: "manage_channels",
        });
      } else {
        throw error;
      }
    }

    if (hasDescription && !access.isOwner) {
      return NextResponse.json(
        { error: "Only the server owner can edit the server bio." },
        { status: 403 },
      );
    }

    const now = new Date().toISOString();
    const communityUpdates: Record<string, unknown> = { updated_at: now };
    const roomUpdates: Record<string, unknown> = { updated_at: now };
    if (hasName) {
      communityUpdates.name = name;
      roomUpdates.title = name;
    }
    if (hasDescription) {
      communityUpdates.description = description || null;
      roomUpdates.description = description || null;
    }
    if (hasIcon) communityUpdates.icon_url = iconUrl;

    const roomUpdate = hasName || hasDescription
      ? supabaseAdmin.from("chat_rooms").update(roomUpdates).eq("id", roomId)
      : Promise.resolve({ error: null });
    const [{ data: community, error: communityError }, { error: roomError }] = await Promise.all([
      supabaseAdmin
        .from("chat_communities")
        .update(communityUpdates)
        .eq("id", access.community.id)
        .select("id,room_id,owner_id,name,description,icon_url,status,created_at,updated_at")
        .single(),
      roomUpdate,
    ]);
    if (communityError) throw new Error(communityError.message);
    if (roomError) throw new Error(roomError.message);

    await supabaseAdmin.from("chat_community_audit_logs").insert({
      community_id: access.community.id,
      actor_id: user.id,
      action: "community.updated",
      target_type: "community",
      target_id: access.community.id,
      metadata: {
        ...(hasName ? { name } : {}),
        ...(hasDescription ? { description: description || null } : {}),
        ...(hasIcon ? { icon_updated: Boolean(iconUrl) } : {}),
      },
    });

    return NextResponse.json({ ok: true, community });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Community update failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to update the server.", status) },
      { status },
    );
  }
}

import { assertContactAllowed } from "@/lib/chatContacts";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { NextResponse } from "next/server";
import { chatErrorStatus, requireChatRoomAccess, safeProfileLabel } from "@/lib/chatServer";
import { requireCommunityChannel } from "@/lib/communityServer";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { consumeRedisRateLimit, isUpstashRedisConfigured, readTyping, safeRedis, writeTyping } from "@/lib/upstashRedis";

export const runtime = "nodejs";

async function authorize(input: { request: Request; roomId: string; channelId: string }) {
  const user = await requireAuthenticatedUser(input.request);
  const supabaseAdmin = createSupabaseAdmin();
  const access = await requireChatRoomAccess({ roomId: input.roomId, userId: user.id, supabaseAdmin });
  if (String(access.room.room_type || "").toLowerCase() === "group") {
    await requireCommunityChannel({ supabaseAdmin, userId: user.id, roomId: input.roomId, channelId: input.channelId || null });
  }
  if (access.room.room_type !== "group") await assertContactAllowed(supabaseAdmin, user.id, access.room.buyer_id === user.id ? access.room.seller_id : access.room.buyer_id);
  return { user, supabaseAdmin };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { roomId?: string; channelId?: string; active?: boolean };
    const roomId = String(body.roomId || "").trim();
    const channelId = String(body.channelId || "").trim();
    if (!roomId) return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
    const { user, supabaseAdmin } = await authorize({ request, roomId, channelId });
    const limited = await safeRedis("typing-rate", () => consumeRedisRateLimit({ scope: "typing", identifier: user.id, limit: 30, windowSeconds: 30 }), { allowed: true, count: 0, remaining: 30, retryAfterSeconds: 0 });
    if (!limited.allowed) return NextResponse.json({ error: "Typing updates are too frequent." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
    const { data: profile } = await supabaseAdmin.from("profiles").select("username,full_name,email").eq("id", user.id).maybeSingle();
    await safeRedis("typing-write", () => writeTyping({ userId: user.id, roomId, channelId, name: safeProfileLabel(profile), at: Date.now() }, body.active !== false), undefined);
    return NextResponse.json({ ok: true, enabled: isUpstashRedisConfigured() });
  } catch (error) {
    const status = chatErrorStatus(error);
    return NextResponse.json({ error: safeApiErrorMessage(error, "Typing update failed.", status) }, { status });
  }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const roomId = String(params.get("roomId") || "").trim();
    const channelId = String(params.get("channelId") || "").trim();
    if (!roomId) return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
    const { user } = await authorize({ request, roomId, channelId });
    const users = await safeRedis("typing-read", () => readTyping(roomId, channelId, user.id), []);
    return NextResponse.json({ enabled: isUpstashRedisConfigured(), users });
  } catch (error) {
    const status = chatErrorStatus(error);
    return NextResponse.json({ error: safeApiErrorMessage(error, "Typing lookup failed.", status) }, { status });
  }
}

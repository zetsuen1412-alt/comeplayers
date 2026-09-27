import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { requireCommunityAccess, requireCommunityChannel } from "@/lib/communityServer";
import { chatErrorStatus, listChatRoomMembers, requireChatRoomAccess, safeProfileLabel } from "@/lib/chatServer";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { consumeRedisRateLimit, isUpstashRedisConfigured, readPresence, safeRedis, writePresence } from "@/lib/upstashRedis";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json().catch(() => ({}))) as { roomId?: string; channelId?: string };
    const roomId = String(body.roomId || "").trim();
    if (!roomId) return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireChatRoomAccess({ roomId, userId: user.id, supabaseAdmin });
    if (access.room.room_type === "group") {
      await requireCommunityChannel({ supabaseAdmin, userId: user.id, roomId, channelId: String(body.channelId || "") || null });
    }
    const allowed = await safeRedis("presence-rate", () => consumeRedisRateLimit({ scope: "presence", identifier: user.id, limit: 6, windowSeconds: 30 }), { allowed: true, count: 0, remaining: 6, retryAfterSeconds: 0 });
    if (!allowed.allowed) return NextResponse.json({ error: "Presence heartbeat is too frequent." }, { status: 429, headers: { "Retry-After": String(allowed.retryAfterSeconds) } });
    const { data: profile } = await supabaseAdmin.from("profiles").select("username,full_name,email").eq("id", user.id).maybeSingle();
    await safeRedis("presence-write", () => writePresence({ userId: user.id, roomId, channelId: String(body.channelId || ""), name: safeProfileLabel(profile), lastSeen: Date.now() }), undefined);
    return NextResponse.json({ ok: true, enabled: isUpstashRedisConfigured() });
  } catch (error) {
    const status = chatErrorStatus(error);
    return NextResponse.json({ error: safeApiErrorMessage(error, "Presence update failed.", status) }, { status });
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const roomId = String(new URL(request.url).searchParams.get("roomId") || "").trim();
    if (!roomId) return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireChatRoomAccess({ roomId, userId: user.id, supabaseAdmin });
    if (access.room.room_type === "group") await requireCommunityAccess({ supabaseAdmin, userId: user.id, roomId });
    const members = await listChatRoomMembers({ roomId, supabaseAdmin });
    const records = await safeRedis("presence-read", () => readPresence(roomId, members.map((member) => member.user_id)), []);
    // Room presence must not reveal which private channel someone is visiting.
    const users = records.map(({ userId, name, lastSeen }) => ({ userId, name, lastSeen }));
    return NextResponse.json({ enabled: isUpstashRedisConfigured(), users });
  } catch (error) {
    const status = chatErrorStatus(error);
    return NextResponse.json({ error: safeApiErrorMessage(error, "Presence lookup failed.", status) }, { status });
  }
}

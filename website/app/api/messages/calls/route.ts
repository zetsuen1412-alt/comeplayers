import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { accountApiError, inputError } from "@/lib/accountApi";
import { requireChatRoomAccess } from "@/lib/chatServer";
import { assertContactAllowed } from "@/lib/chatContacts";
import { createDirectCallToken, createLiveKitRoomServiceClient, getLiveKitServerUrl } from "@/lib/livekitServer";
import { limitedBody, privateActor, privateRoom, uuid } from "@/lib/privateMessaging";
import { secureActor } from "@/lib/secureHistoryProtocol";
import { activeCallFilter, visibleCallStatus } from "@/lib/callPresence";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const params = new URL(request.url).searchParams;
    const activeOnly = params.get("active") === "1";
    const current = params.get("id");
    const now = Date.now();
    const scope = `caller_id.eq.${user.id},callee_id.eq.${user.id}`;
    // The frequent active-call poll must stay read-only. Historical cleanup can
    // run when the call history is opened or before a new call is created.
    if (!activeOnly) {
      const expiry = await db.from("cp_calls").update({ status: "missed", ended_at: new Date(now).toISOString() }).eq("status", "ringing").lt("created_at", new Date(now - 60000).toISOString()).or(scope);
      if (expiry.error) throw expiry.error;
      const expiredActive = await db.from("cp_calls").update({ status: "ended", ended_at: new Date(now).toISOString() }).eq("status", "accepted").lt("answered_at", new Date(now - 3600000).toISOString()).or(scope).select("id");
      if (expiredActive.error) throw expiredActive.error;
      for (const call of expiredActive.data || []) await createLiveKitRoomServiceClient().deleteRoom(`cp-call-${call.id}`).catch(() => undefined);
    }
    const query = db.from("cp_calls").select("*").or(activeOnly ? activeCallFilter(user.id, current, now) : scope);
    const calls = await query.order("created_at", { ascending: false }).limit(activeOnly ? 4 : 100);
    if (calls.error) throw calls.error;
    const ids = [...new Set(calls.data.flatMap(c => [c.caller_id, c.callee_id]))];
    const people = ids.length ? await db.from("profiles").select("id,username,full_name,avatar_url").in("id", ids) : { data: [], error: null };
    if (people.error) throw people.error;
    return NextResponse.json({ calls: calls.data.map(c => ({ ...visibleCallStatus(c, now), other: people.data?.find(p => p.id === (c.caller_id === user.id ? c.callee_id : c.caller_id)) || null })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request), db = createSupabaseAdmin();
    const bodyText = await limitedBody(request, 4096);
    let body: { roomId?: unknown; media?: unknown; scheduledAt?: unknown; secureEventId?: unknown };
    try { body = JSON.parse(bodyText); } catch { throw inputError("Invalid call request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw inputError("Invalid call request.");
    if (body.secureEventId != null || request.headers.has("x-cp-device")) throw inputError("Update ComePlayers to use account-based calls.", 426);
    const roomId = uuid(body.roomId);
    const { room, target } = await privateRoom(db, user.id, roomId);
    // Voice calls use a separate LiveKit room and do not access message keys or
    // history. An enrolled private-message identity must not block account calls.
    const scheduled = body.scheduledAt ? String(body.scheduledAt) : null;
    if (scheduled && !Number.isFinite(Date.parse(scheduled))) throw inputError("Choose a valid call time.");
    getLiveKitServerUrl();
    const result = await db.rpc("cp_start_call", { p_actor: user.id, p_target: target, p_room: room.id, p_media: body.media === "video" ? "video" : "audio", p_scheduled: scheduled });
    if (result.error) throw inputError(/already in a call|limit|blocked|accepting|scheduled|verification/i.test(result.error.message) ? result.error.message : "The call could not be started.", 409);
    return NextResponse.json({ call: result.data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const bodyText = await limitedBody(request, 4096);
    let body;
    try { body = JSON.parse(bodyText); } catch { throw inputError("Invalid call request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw inputError("Invalid call request.");
    const found = await db.from("cp_calls").select("*").eq("id", String(body.id || "")).or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`).maybeSingle();
    if (found.error) throw found.error;
    const call = found.data;
    if (!call) throw inputError("Call not found.", 404);
    if (call.secure_event_id) await secureActor(request, bodyText);
    else if (call.encryption_envelope) await privateActor(request, bodyText);
    const own = call.caller_id === user.id;
    const target = own ? call.callee_id : call.caller_id;
    const roomName = `cp-call-${call.id}`;
    if (body.action === "token") {
      if (call.status !== "accepted" || !call.answered_at || Date.parse(call.answered_at) < Date.now() - 3600000) throw inputError("This call is no longer active.", 409);
      await requireChatRoomAccess({ roomId: call.room_id, userId: user.id, supabaseAdmin: db, allowAdmin: false });
      await assertContactAllowed(db, user.id, target);
      const profile = await db.from("profiles").select("username,full_name").eq("id", user.id).single();
      if (profile.error) throw profile.error;
      return NextResponse.json({ serverUrl: getLiveKitServerUrl(), participantToken: await createDirectCallToken({ userId: user.id, name: profile.data.username || profile.data.full_name || "ComePlayers", roomName, video: call.media === "video" }), roomName, channel: { id: call.id, name: "ComePlayers call" }, permissions: { canPublishVideo: call.media === "video", canShareScreen: false, canModerateVoice: false } });
    }
    let status: string;
    if (body.action === "accept" && !own && call.status === "ringing" && Date.parse(call.created_at) > Date.now() - 60000) {
      await assertContactAllowed(db, user.id, target);
      status = "accepted";
    } else if (body.action === "decline" && !own && ["ringing", "scheduled"].includes(call.status)) status = "declined";
    else if (body.action === "end" && ["ringing", "accepted", "scheduled"].includes(call.status)) status = call.status === "accepted" ? "ended" : own ? "cancelled" : "declined";
    else throw inputError("The call state has changed. Refresh and try again.", 409);
    const now = new Date().toISOString();
    const updated = await db.from("cp_calls").update({ status, ...(status === "accepted" ? { answered_at: now } : { ended_at: now }) }).eq("id", call.id).eq("status", call.status).select("id").maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) throw inputError("The call state has changed.", 409);
    if (call.status === "accepted" && status === "ended") await createLiveKitRoomServiceClient().deleteRoom(roomName).catch(() => undefined);
    return NextResponse.json({ ok: true, status });
  } catch (error) { return accountApiError(error); }
}

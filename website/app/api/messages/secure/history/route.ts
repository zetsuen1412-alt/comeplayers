import { after, NextResponse } from "next/server";
import { accountApiError, inputError } from "@/lib/accountApi";
import { limitedBody, privateRoom, uuid } from "@/lib/privateMessaging";
import {
  secureActor, secureHistoryHash, verifySecureHistory, type SecureEpoch,
} from "@/lib/secureHistoryProtocol";
import { inspectR2Object } from "@/lib/r2Server";
import { dispatchChatPushNotifications } from "@/lib/backgroundJobs";
import { createChatNotification, safeProfileLabel } from "@/lib/chatServer";
import { isTransactionChatRoom } from "@/lib/chatRoomScope";
import { recordSecureRoomActivity } from "@/lib/secureRoomActivity";

const json = (value: unknown) => NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    const { user, db } = await secureActor(request), url = new URL(request.url);
    const after = Number(url.searchParams.get("after") || 0);
    if (!Number.isSafeInteger(after) || after < 0) throw inputError("Invalid encrypted-history cursor.");
    const pulled = await db.rpc("cp_secure_pull_events", { p_user: user.id, p_after: after, p_limit: 50 });
    if (pulled.error) throw pulled.error;
    const events = pulled.data || [];
    return json({ events, next: events.length ? Number(events[events.length - 1].sequence) : after, hasMore: events.length === 50 });
  } catch (error) { return accountApiError(error); }
}

export async function POST(request: Request) {
  try {
    const text = await limitedBody(request, 80000), { user, db, device } = await secureActor(request, text);
    let body: { event?: unknown; notify?: unknown }; try { body = JSON.parse(text); } catch { throw inputError("Invalid encrypted-history request."); }
    if (body.notify !== undefined && typeof body.notify !== "boolean") throw inputError("Invalid encrypted notification request.");
    const roomId = uuid((body.event as { roomId?: unknown } | undefined)?.roomId);
    const { room } = await privateRoom(db, user.id, roomId);
    const latest = await db.from("cp_secure_epochs").select("id,payload,epoch_hash").eq("room_id", roomId).order("epoch", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw latest.error;
    if (!latest.data) throw inputError("Create the encrypted conversation key first.", 409);
    const event = verifySecureHistory(body.event, latest.data.payload as SecureEpoch);
    if (event.senderId !== user.id || event.deviceId !== device.id) throw inputError("The signed request and message sender do not match.", 403);
    if (event.blobId) {
      const blob = await db.from("cp_secure_blobs").select("object_key,size_bytes,owner_id,owner_device_id,room_id,epoch_id,attached_event_id,prepare_expires_at").eq("id", event.blobId).maybeSingle();
      if (blob.error) throw blob.error;
      if (!blob.data || blob.data.owner_id !== user.id || blob.data.owner_device_id !== device.id || blob.data.room_id !== roomId || blob.data.epoch_id !== event.epochId || blob.data.attached_event_id) throw inputError("Encrypted attachment is unavailable.", 409);
      const stored = await inspectR2Object(blob.data.object_key);
      if (stored.contentLength !== blob.data.size_bytes || stored.contentType !== "application/octet-stream") throw inputError("Encrypted attachment upload is incomplete.", 409);
    }
    const saved = await db.rpc("cp_secure_put_event", { p_actor: user.id, p_device: device.id, p_event: event, p_hash: secureHistoryHash(event), p_blob: event.blobId });
    if (saved.error) throw inputError(/current conversation key|rotate|inactive|absent/i.test(saved.error.message) ? "Device authorization changed. Rotate the conversation key before sending." : /rate limit/i.test(saved.error.message) ? "Too many messages. Try again shortly." : "The encrypted message could not be saved.", /rate limit/i.test(saved.error.message) ? 429 : 409);
    if (body.notify === true) {
      // A message updates only public ordering metadata, never its contents.
      await recordSecureRoomActivity(db, event.id, roomId, user.id);
      // Notification content is deliberately generic: this route cannot and
      // must not inspect the encrypted event payload.
      after(async () => {
        try {
          const claim = await db.rpc("cp_secure_claim_notification", { p_actor: user.id, p_event: event.id });
          if (claim.error || !claim.data) { if (claim.error) console.warn("Secure notification claim failed:", claim.error.message); return; }
          const profile = await db.from("profiles").select("username,full_name,email").eq("id", user.id).maybeSingle();
          if (profile.error) throw profile.error;
          const senderName = safeProfileLabel(profile.data), preview = "New end-to-end encrypted message";
          const inbox = isTransactionChatRoom(room) ? "/chat" : "/cpcommunity";
          await createChatNotification({ supabaseAdmin: db, receiverId: String(claim.data), senderName, roomId, preview, linkUrl: `${inbox}?room=${encodeURIComponent(roomId)}` });
          await dispatchChatPushNotifications({ supabaseAdmin: db, receiverIds: [String(claim.data)], senderName, roomId, preview });
        } catch (error) { console.warn("Secure message notification failed:", error instanceof Error ? error.message : error); }
      });
    }
    return json({ sequence: Number(saved.data) });
  } catch (error) { return accountApiError(error); }
}

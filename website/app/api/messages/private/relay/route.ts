import { NextResponse } from "next/server";
import { accountApiError, inputError } from "@/lib/accountApi";
import { limitedBody, PRIVATE_KEYS, privateActor, privateRoom, uuid, verifyEnvelope, type PrivateDevice } from "@/lib/privateMessaging";
import { deleteR2Object, inspectR2Object } from "@/lib/r2Server";

const json = (body: unknown) => NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    const { user, db } = await privateActor(request);
    const result = await db.from("cp_private_mailbox").select("id,room_id,sender_id,envelope,blob_id,created_at").eq("recipient_id", user.id).is("received_at", null).gt("expires_at", new Date().toISOString()).order("created_at").order("id").limit(20);
    if (result.error) throw result.error;
    return json({ messages: result.data });
  } catch (error) { return accountApiError(error); }
}
export async function POST(request: Request) {
  try {
    const text = await limitedBody(request), { user, db, device } = await privateActor(request, text), body = JSON.parse(text);
    const { room, target } = await privateRoom(db, user.id, body.envelope?.roomId);
    const peer = await db.from("cp_private_devices").select(PRIVATE_KEYS).eq("user_id", target).maybeSingle();
    if (peer.error) throw peer.error;
    if (!peer.data) throw inputError("Your contact must update ComePlayers and open private Messages first.", 409);
    const envelope = verifyEnvelope(body.envelope, device, peer.data as PrivateDevice, room.id);
    if (body.blobId) {
      const blob = await db.from("cp_private_blobs").select("object_key,size_bytes").eq("id", uuid(body.blobId)).eq("sender_id", user.id).eq("recipient_id", target).eq("room_id", room.id).is("delete_after", null).maybeSingle();
      if (blob.error) throw blob.error;
      if (!blob.data) {
        // The original delivery may already have been acknowledged and its
        // bytes removed. The RPC still checks the immutable envelope hash.
        const old = await db.from("cp_private_mailbox").select("received_at").eq("id", String(envelope.id)).eq("sender_id", user.id).not("received_at", "is", null).maybeSingle();
        if (old.error || !old.data) throw inputError("Encrypted attachment is unavailable.", 409);
      } else {
        const stored = await inspectR2Object(blob.data.object_key);
        if (stored.contentLength !== blob.data.size_bytes) throw inputError("Attachment upload is incomplete.", 409);
      }
    }
    const result = await db.rpc("cp_enqueue_private_message", { p_sender: user.id, p_recipient: target, p_room: room.id, p_id: envelope.id, p_envelope: envelope, p_blob: body.blobId ? uuid(body.blobId) : null });
    if (result.error) throw inputError(/full|limit/i.test(result.error.message) ? "The delivery queue is full. Try again later." : "The encrypted message could not be queued.", 409);
    return json({ ok: true, received: !!result.data });
  } catch (error) { return accountApiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const text = await limitedBody(request, 4096), { user, db } = await privateActor(request, text), body = JSON.parse(text);
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 20) throw inputError("Invalid delivery receipts.");
    const ids = body.ids.map(uuid);
    // The native client sends this only after its SQLite transaction and all
    // encrypted media chunks have committed with synchronous=FULL.
    const result = await db.rpc("cp_ack_private_messages", { p_recipient: user.id, p_ids: ids });
    if (result.error) throw result.error;
    for (const blob of (result.data || []) as { id: string; object_key: string }[]) {
      try { await deleteR2Object(blob.object_key); const deleted = await db.from("cp_private_blobs").delete().eq("id", blob.id).not("delete_after", "is", null); if (deleted.error) throw deleted.error; }
      catch { /* A cleanup job retries objects marked delete_after. */ }
    }
    return json({ ok: true });
  } catch (error) { return accountApiError(error); }
}

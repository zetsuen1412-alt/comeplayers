import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { accountApiError, inputError } from "@/lib/accountApi";
import { limitedBody, privateRoom, uuid } from "@/lib/privateMessaging";
import { secureActor } from "@/lib/secureHistoryProtocol";
import { createR2DownloadUrl, createR2UploadUrl } from "@/lib/r2Server";

const json = (value: unknown) => NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  try {
    const text = await limitedBody(request, 1024), { user, db, device } = await secureActor(request, text);
    let body: { roomId?: unknown; epochId?: unknown; size?: unknown }; try { body = JSON.parse(text); } catch { throw inputError("Invalid attachment request."); }
    const roomId = uuid(body.roomId), epochId = uuid(body.epochId), size = Number(body.size);
    if (!Number.isInteger(size) || size < 41 || size > 8 * 1024 * 1024 + 40) throw inputError("Choose a file under 8 MB.");
    await privateRoom(db, user.id, roomId);
    const id = randomUUID();
    const prepared = await db.rpc("cp_secure_prepare_blob", { p_id: id, p_actor: user.id, p_device: device.id, p_room: roomId, p_epoch: epochId, p_size: size });
    if (prepared.error) throw inputError(/quota/i.test(prepared.error.message) ? "Encrypted attachment storage is full." : /rate limit/i.test(prepared.error.message) ? "Too many attachment uploads. Try again later." : "Use the current conversation key before uploading.", /quota|rate limit/i.test(prepared.error.message) ? 429 : 409);
    return json({ id, url: await createR2UploadUrl({ objectKey: prepared.data, contentType: "application/octet-stream", expiresIn: 300 }) });
  } catch (error) { return accountApiError(error); }
}

export async function GET(request: Request) {
  try {
    const { user, db } = await secureActor(request), id = uuid(new URL(request.url).searchParams.get("id"));
    const blob = await db.from("cp_secure_blobs").select("object_key,size_bytes,room_id,attached_event_id").eq("id", id).maybeSingle();
    if (blob.error) throw blob.error;
    if (!blob.data?.attached_event_id) throw inputError("Encrypted attachment is unavailable.", 404);
    await privateRoom(db, user.id, blob.data.room_id);
    return json({ size: blob.data.size_bytes, url: await createR2DownloadUrl({ objectKey: blob.data.object_key, fileName: `${id}.bin`, contentType: "application/octet-stream", expiresIn: 120 }) });
  } catch (error) { return accountApiError(error); }
}

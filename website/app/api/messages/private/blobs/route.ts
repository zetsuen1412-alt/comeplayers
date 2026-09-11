import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { accountApiError, inputError } from "@/lib/accountApi";
import { limitedBody, privateActor, privateRoom, uuid } from "@/lib/privateMessaging";
import { createR2UploadUrl, createR2DownloadUrl } from "@/lib/r2Server";

export async function POST(request: Request) {
  try {
    const text = await limitedBody(request, 1024), { user, db } = await privateActor(request, text), body = JSON.parse(text);
    const { room, target } = await privateRoom(db, user.id, body.roomId);
    const size = Number(body.size);
    if (!Number.isInteger(size) || size < 41 || size > 4194344) throw inputError("Choose a file under 4 MB.");
    const id = randomUUID();
    const result = await db.rpc("cp_prepare_private_blob", { p_id: id, p_sender: user.id, p_recipient: target, p_room: room.id, p_size: size });
    if (result.error) throw inputError("The attachment delivery limit has been reached. Try again later.", 429);
    const url = await createR2UploadUrl({ objectKey: result.data as string, contentType: "application/octet-stream", expiresIn: 90 });
    return NextResponse.json({ id, url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
export async function GET(request: Request) {
  try {
    const { user, db } = await privateActor(request);
    const id = uuid(new URL(request.url).searchParams.get("id"));
    const result = await db.from("cp_private_blobs").select("object_key,room_id,size_bytes").eq("id", id).eq("recipient_id", user.id).is("delete_after", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw inputError("This attachment is no longer in the delivery queue.", 404);
    await privateRoom(db, user.id, result.data.room_id);
    const url = await createR2DownloadUrl({ objectKey: result.data.object_key, contentType: "application/octet-stream", fileName: "encrypted-attachment", expiresIn: 90 });
    return NextResponse.json({ url, size: result.data.size_bytes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}

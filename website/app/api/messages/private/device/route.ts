import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { accountApiError, inputError } from "@/lib/accountApi";
import { limitedBody, PRIVATE_KEYS, privateActor, privateRoom, publicDevice, uuid, verifySignature, type PrivateDevice } from "@/lib/privateMessaging";

export async function GET(request: Request) {
  try {
    const { user, db } = await privateActor(request);
    const roomId = new URL(request.url).searchParams.get("roomId");
    const target = roomId ? (await privateRoom(db, user.id, roomId)).target : user.id;
    const result = await db.from("cp_private_devices").select(PRIVATE_KEYS).eq("user_id", target).maybeSingle();
    if (result.error) throw result.error;
    return NextResponse.json({ identity: result.data ? publicDevice(result.data as PrivateDevice) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request), db = createSupabaseAdmin();
    const body = JSON.parse(await limitedBody(request, 2048));
    const identity = { userId: user.id, encryptionKey: String(body.identity?.encryptionKey || ""), signingKey: String(body.identity?.signingKey || "") };
    const deviceId = uuid(body.deviceId), timestamp = String(body.timestamp || "");
    if (body.identity?.userId !== user.id || !/^[0-9a-f]{64}$/.test(identity.encryptionKey) || !Number.isFinite(Date.parse(timestamp)) || Math.abs(Date.now() - Date.parse(timestamp)) > 300000 || !verifySignature(identity.signingKey, String(body.proof || ""), JSON.stringify(["cp-device-v1", identity, deviceId, timestamp]))) throw inputError("Invalid device registration.", 403);
    const result = await db.rpc("cp_register_private_device", { p_user: user.id, p_device: deviceId, p_encryption_key: identity.encryptionKey, p_signing_key: identity.signingKey, p_timestamp: timestamp });
    if (result.error) throw inputError("This account already has private history on another device. Restore its encrypted backup before continuing.", 409);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}

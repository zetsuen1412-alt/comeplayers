import { createHash, createPublicKey, verify } from "node:crypto";
import { createSupabaseAdmin, requireAuthenticatedUser } from "./serverSupabase";
import { inputError } from "./accountApi";
import { requireChatRoomAccess } from "./chatServer";
import { assertContactAllowed } from "./chatContacts";

export const PRIVATE_KEYS = "user_id,device_id,encryption_key,signing_key,updated_at";
export type PrivateDevice = { user_id: string; device_id: string; encryption_key: string; signing_key: string; updated_at: string };
export const publicDevice = (device: PrivateDevice) => ({ userId: device.user_id, encryptionKey: device.encryption_key, signingKey: device.signing_key });
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const deviceFingerprint = (device: PrivateDevice) => hash(JSON.stringify(["cp-identity-v1", device.user_id, device.encryption_key, device.signing_key]));
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw inputError("Invalid private message identifier.");
  return value;
}
export function verifySignature(key: string, signature: string, bytes: string | Buffer): boolean {
  if (!/^[0-9a-f]{64}$/.test(key) || !/^[0-9a-f]{128}$/.test(signature)) return false;
  try { return verify(null, Buffer.from(bytes), createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(key, "hex")]), format: "der", type: "spki" }), Buffer.from(signature, "hex")); } catch { return false; }
}
export async function limitedBody(request: Request, max = 75000): Promise<string> {
  if (Number(request.headers.get("content-length") || 0) > max) throw inputError("Request is too large.", 413);
  const reader = request.body?.getReader(); if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > max) { await reader.cancel(); throw inputError("Request is too large.", 413); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
export async function privateActor(request: Request, body = "") {
  const user = await requireAuthenticatedUser(request), db = createSupabaseAdmin();
  const result = await db.from("cp_private_devices").select(PRIVATE_KEYS).eq("user_id", user.id).maybeSingle();
  if (result.error) throw result.error;
  const device = result.data as PrivateDevice | null;
  const deviceId = request.headers.get("x-cp-device") || "", timestamp = request.headers.get("x-cp-time") || "";
  const url = new URL(request.url);
  const proof = JSON.stringify(["cp-request-v1", user.id, deviceId, timestamp, request.method.toUpperCase(), url.pathname + url.search, hash(body)]);
  if (!device || device.device_id !== deviceId || !Number.isFinite(Date.parse(timestamp)) || Math.abs(Date.now() - Date.parse(timestamp)) > 300000 || !verifySignature(device.signing_key, request.headers.get("x-cp-proof") || "", proof)) throw inputError("Open private Messages on your primary device, or restore your encrypted backup.", 403);
  return { user, db, device };
}
export async function privateRoom(db: ReturnType<typeof createSupabaseAdmin>, userId: string, roomId: string) {
  const { room } = await requireChatRoomAccess({ roomId: uuid(roomId), userId, supabaseAdmin: db, allowAdmin: false });
  if (room.room_type === "group") throw inputError("Community rooms are separate from private Messages.", 409);
  if (["closed", "locked", "archived", "suspended"].includes(room.status || "")) throw inputError("This conversation is closed.", 403);
  const target = room.buyer_id === userId ? room.seller_id : room.buyer_id;
  if (target === userId) throw inputError("Choose another contact.");
  await assertContactAllowed(db, userId, target);
  return { room, target };
}
export function verifyEnvelope(value: unknown, sender: PrivateDevice, recipient: PrivateDevice, roomId: string) {
  const e = value as Record<string, unknown>;
  if (!e || e.v !== 1 || e.senderId !== sender.user_id || e.recipientId !== recipient.user_id || e.roomId !== roomId || e.senderKey !== deviceFingerprint(sender) || e.recipientKey !== deviceFingerprint(recipient)) throw inputError("Message identities do not match.");
  uuid(e.id);
  if (typeof e.createdAt !== "string" || !Number.isFinite(Date.parse(e.createdAt)) || typeof e.enc !== "string" || !/^[0-9a-f]{64}$/.test(e.enc) || typeof e.ciphertext !== "string" || !/^(?:[0-9a-f]{2}){16,32784}$/.test(e.ciphertext) || typeof e.signature !== "string") throw inputError("Invalid encrypted message.");
  const meta = JSON.stringify(["cp-private-message-v1", 1, e.id, e.roomId, e.senderId, e.recipientId, e.senderKey, e.recipientKey, e.createdAt]);
  if (!verifySignature(sender.signing_key, e.signature, Buffer.concat([Buffer.from(meta), Buffer.from(e.enc, "hex"), Buffer.from(e.ciphertext, "hex")]))) throw inputError("Invalid message signature.", 403);
  // Whitelist only ciphertext and authenticated metadata; never persist extra
  // client properties which could accidentally include plaintext or key material.
  return { v: 1, id: e.id, roomId: e.roomId, senderId: e.senderId, recipientId: e.recipientId, senderKey: e.senderKey, recipientKey: e.recipientKey, createdAt: e.createdAt, enc: e.enc, ciphertext: e.ciphertext, signature: e.signature };
}

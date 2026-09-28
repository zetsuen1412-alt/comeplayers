import { decryptBytes, digest, encryptBytes, hex, random, unhex } from "./crypto";

export const MAX_SECURE_ATTACHMENT = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY = /^[0-9a-f]{64}$/;
const allowedMime = /^(image\/(jpeg|png|webp)|video\/mp4|audio\/(mp4|m4a|mpeg)|application\/pdf)$/;

export type SecureAttachment = {
  v: 2; id: string; key: string; digest: string; size: number;
  encryptedSize: number; name: string; mime: string;
};

function context(eventId: string, roomId: string, epochId: string, blobId: string) {
  return `cp-attachment-v2:${eventId}:${roomId}:${epochId}:${blobId}`;
}

export function verifySecureAttachment(value: unknown, blobId?: string): SecureAttachment {
  if (!value || typeof value !== "object") throw new Error("Invalid encrypted attachment metadata.");
  const item = value as Partial<SecureAttachment>;
  if (item.v !== 2 || typeof item.id !== "string" || !UUID.test(item.id) || (blobId && item.id !== blobId)
    || typeof item.key !== "string" || !KEY.test(item.key) || typeof item.digest !== "string" || !KEY.test(item.digest)
    || !Number.isSafeInteger(item.size) || item.size! < 1 || item.size! > MAX_SECURE_ATTACHMENT
    || item.encryptedSize !== item.size! + 40 || typeof item.name !== "string" || !item.name.trim() || item.name.length > 180
    || typeof item.mime !== "string" || !allowedMime.test(item.mime)) throw new Error("Invalid encrypted attachment metadata.");
  return item as SecureAttachment;
}

export function encryptSecureAttachment(bytes: Uint8Array, details: { eventId: string; roomId: string; epochId: string; blobId: string; name: string; mime: string }): { attachment: SecureAttachment; ciphertext: Uint8Array } {
  if (!bytes.length || bytes.length > MAX_SECURE_ATTACHMENT) throw new Error("Choose a file under 8 MB.");
  if (![details.eventId, details.roomId, details.epochId, details.blobId].every(value => UUID.test(value))) throw new Error("Invalid encrypted attachment destination.");
  const key = random(), ciphertext = encryptBytes(key, bytes, context(details.eventId, details.roomId, details.epochId, details.blobId));
  const attachment = verifySecureAttachment({
    v: 2, id: details.blobId, key: hex(key), digest: digest(ciphertext), size: bytes.length,
    encryptedSize: ciphertext.length, name: details.name.trim().slice(0, 180), mime: details.mime,
  }, details.blobId);
  key.fill(0);
  return { attachment, ciphertext };
}

export function decryptSecureAttachment(ciphertext: Uint8Array, attachmentValue: unknown, details: { eventId: string; roomId: string; epochId: string; blobId: string }): Uint8Array {
  const attachment = verifySecureAttachment(attachmentValue, details.blobId);
  if (ciphertext.length !== attachment.encryptedSize || digest(ciphertext) !== attachment.digest) throw new Error("Encrypted attachment integrity check failed.");
  const plaintext = decryptBytes(unhex(attachment.key), ciphertext, context(details.eventId, details.roomId, details.epochId, details.blobId));
  if (plaintext.length !== attachment.size) throw new Error("Encrypted attachment size does not match.");
  return plaintext;
}

import test from "node:test";
import assert from "node:assert/strict";
import { newId } from "../apps/mobile/src/secure/crypto";
import { MAX_SECURE_ATTACHMENT, decryptSecureAttachment, encryptSecureAttachment, verifySecureAttachment } from "../apps/mobile/src/secure/secureAttachment";

test("v2 attachments encrypt bytes and bind their event, room, epoch and retained blob", () => {
  const details = { eventId: newId(), roomId: newId(), epochId: newId(), blobId: newId(), name: "bukti.png", mime: "image/png" };
  const bytes = new TextEncoder().encode("private attachment bytes");
  const encrypted = encryptSecureAttachment(bytes, details);
  assert.ok(!new TextDecoder().decode(encrypted.ciphertext).includes("private attachment"));
  assert.deepEqual(decryptSecureAttachment(encrypted.ciphertext, encrypted.attachment, details), bytes);
  for (const field of ["eventId", "roomId", "epochId", "blobId"] as const) {
    assert.throws(() => decryptSecureAttachment(encrypted.ciphertext, encrypted.attachment, { ...details, [field]: newId() }));
  }
  assert.throws(() => decryptSecureAttachment(Uint8Array.from(encrypted.ciphertext, (value, index) => index ? value : value ^ 1), encrypted.attachment, details));
  assert.throws(() => verifySecureAttachment({ ...encrypted.attachment, mime: "text/html" }));
});

test("short videos up to 8 MiB have bounded encrypted metadata", () => {
  const details = { eventId: newId(), roomId: newId(), epochId: newId(), blobId: newId(), name: "clip.mp4", mime: "video/mp4" };
  const encrypted = encryptSecureAttachment(new Uint8Array(16), details);
  assert.equal(MAX_SECURE_ATTACHMENT, 8 * 1024 * 1024);
  assert.doesNotThrow(() => verifySecureAttachment({ ...encrypted.attachment, size: MAX_SECURE_ATTACHMENT, encryptedSize: MAX_SECURE_ATTACHMENT + 40 }));
  assert.throws(() => verifySecureAttachment({ ...encrypted.attachment, size: MAX_SECURE_ATTACHMENT + 1, encryptedSize: MAX_SECURE_ATTACHMENT + 41 }));
});

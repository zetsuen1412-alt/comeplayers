import test from "node:test";
import assert from "node:assert/strict";
import { newId } from "../apps/mobile/src/secure/crypto";
import { decryptSecureAttachment, encryptSecureAttachment, verifySecureAttachment } from "../apps/mobile/src/secure/secureAttachment";

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

import test from "node:test";
import assert from "node:assert/strict";
import { createIdentity, sealMessage, openMessage, publicIdentity, encryptBytes, decryptBytes, random, safetyCode, validateIdentity, hex, type Envelope } from "../apps/mobile/src/secure/crypto";
import { encodeBackup, decodeBackup } from "../apps/mobile/src/secure/backupFormat";

test("HPKE messages decrypt only at the intended endpoint, including Unicode", async () => {
  const alice = createIdentity("alice"), bob = createIdentity("bob"), mallory = createIdentity("mallory");
  const payload = { text: "Pesan pribadi 🔒 Indonesia", attachment: { key: hex(random()), name: "photo.jpg" } };
  const envelope = await sealMessage(alice, publicIdentity(bob), "room", payload);
  assert.deepEqual(await openMessage(bob, publicIdentity(alice), envelope, "room"), payload);
  assert.ok(!JSON.stringify(envelope).includes(payload.text));
  await assert.rejects(openMessage(mallory, publicIdentity(alice), envelope, "room"));
  await assert.rejects(openMessage(bob, publicIdentity(mallory), envelope, "room"));
  await assert.rejects(openMessage(bob, publicIdentity(alice), envelope, "other-room"));
});
test("signed envelope binds routing, identity, time, encapsulation and ciphertext", async () => {
  const a = createIdentity("alice"), b = createIdentity("bob");
  const envelope = await sealMessage(a, b, "room", { text: "secret" });
  for (const field of ["id", "roomId", "senderId", "recipientId", "createdAt", "enc", "ciphertext", "signature", "senderKey", "recipientKey"] as const) {
    const corrupted: Envelope = { ...envelope, [field]: (envelope[field][0] === "a" ? "b" : "a") + envelope[field].slice(1) };
    await assert.rejects(openMessage(b, a, corrupted, "room"), `tampering ${field} must fail`);
  }
  const second = await sealMessage(a, b, "room", { text: "secret" });
  assert.notEqual(second.enc, envelope.enc); assert.notEqual(second.ciphertext, envelope.ciphertext);
});
test("safety codes are symmetric and change when either identity changes", () => {
  const a = createIdentity("alice"), b = createIdentity("bob"), replacement = createIdentity("bob");
  assert.equal(safetyCode(a, b), safetyCode(b, a));
  assert.notEqual(safetyCode(a, b), safetyCode(a, replacement));
  assert.doesNotThrow(() => validateIdentity(a, "alice"));
  assert.throws(() => validateIdentity(a, "bob"));
  assert.throws(() => validateIdentity({ ...a, signingSecret: b.signingSecret }, "alice"));
});
test("binary encryption preserves all bytes, isolates contexts, and rejects corruption", () => {
  const key = random(), bytes = new Uint8Array(49152).map((_, i) => i % 256);
  const sealed = encryptBytes(key, bytes, "attachment-1");
  assert.deepEqual(decryptBytes(key, sealed, "attachment-1"), bytes);
  assert.throws(() => decryptBytes(key, sealed, "attachment-2"));
  assert.throws(() => decryptBytes(random(), sealed, "attachment-1"));
  const corrupt = sealed.slice(); corrupt[40] ^= 1;
  assert.throws(() => decryptBytes(key, corrupt, "attachment-1"));
  assert.throws(() => decryptBytes(key, sealed.slice(1), "attachment-1"));
});
async function* values(items: unknown[]) { yield* items; }
async function* lines(items: string[]) { yield* items; }
async function collect(iterable: AsyncIterable<unknown>) { const result = []; for await (const item of iterable) result.push(item); return result; }
test("encrypted backups round-trip and reject wrong keys, account changes, truncation, reordering and appended data", async () => {
  const key = random(), records = [{ identity: createIdentity("alice") }, { text: "Only on my device", bytes: "001122" }];
  const encoded = (await collect(encodeBackup(key, "alice", values(records))) as string[]).map(s => s.trimEnd());
  assert.deepEqual(await collect(decodeBackup(key, "alice", lines(encoded))), records);
  assert.ok(!encoded.join("").includes("Only on my device"));
  await assert.rejects(collect(decodeBackup(random(), "alice", lines(encoded))));
  await assert.rejects(collect(decodeBackup(key, "bob", lines(encoded))));
  for (const invalid of [encoded.slice(0, -1), [encoded[0], encoded[2], encoded[1], encoded[3]], [...encoded, encoded[1]], [encoded[0], encoded[1], encoded[3]]]) await assert.rejects(collect(decodeBackup(key, "alice", lines(invalid))));
});

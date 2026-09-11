import test from "node:test";
import assert from "node:assert/strict";
import { createIdentity, newId, publicIdentity } from "../../comeplayers-apps/apps/mobile/src/secure/crypto";
import {
  authorizeDevices, createDevice, createEpoch, encryptHistory, epochHash, rosterHash,
} from "../../comeplayers-apps/apps/mobile/src/secure/multiDevice";
import {
  secureEpochHash, secureHistoryHash, verifySecureEpoch, verifySecureHistory,
} from "../lib/secureHistoryProtocol";

async function fixture() {
  const alice = createIdentity(newId()), bob = createIdentity(newId());
  const a1 = createDevice(alice.userId), b1 = createDevice(bob.userId);
  const ar = authorizeDevices(alice, [a1]), br = authorizeDevices(bob, [b1]);
  const roots = new Map([[alice.userId, publicIdentity(alice)], [bob.userId, publicIdentity(bob)]]);
  const accounts = new Map([[alice.userId, { roster: ar, roster_hash: rosterHash(ar) }], [bob.userId, { roster: br, roster_hash: rosterHash(br) }]]);
  const room = newId(), created = await createEpoch(a1, room, [{ roster: ar, admin: true }, { roster: br, admin: true }], roots);
  return { alice, bob, a1, b1, ar, br, roots, accounts, room, ...created };
}
const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, reorder(item)])) : value;

test("server validates mobile epoch packages and preserves hashes through jsonb ordering", async () => {
  const f = await fixture();
  const verified = verifySecureEpoch(reorder(f.epoch), f.room, [f.bob.userId, f.alice.userId], f.accounts);
  assert.equal(secureEpochHash(verified), epochHash(f.epoch));
  assert.deepEqual(verified, f.epoch);
});

test("epoch verification rejects member, admin, device, wrap, room and signature substitution", async () => {
  const f = await fixture();
  for (const patch of [
    (epoch: typeof f.epoch) => { epoch.roomId = newId(); },
    (epoch: typeof f.epoch) => { epoch.authorDeviceId = f.b1.id; },
    (epoch: typeof f.epoch) => { epoch.members[0]!.admin = false; epoch.members[1]!.admin = false; },
    (epoch: typeof f.epoch) => { epoch.members.pop(); },
    (epoch: typeof f.epoch) => { epoch.wraps[0]!.target += "x"; },
    (epoch: typeof f.epoch) => { epoch.wraps[0]!.envelope.ciphertext = "00" + epoch.wraps[0]!.envelope.ciphertext.slice(2); },
    (epoch: typeof f.epoch) => { epoch.signature = "00".repeat(64); },
  ]) {
    const changed = structuredClone(f.epoch); patch(changed);
    assert.throws(() => verifySecureEpoch(changed, f.room, [f.alice.userId, f.bob.userId], f.accounts));
  }
  const unexpected = structuredClone(f.epoch); unexpected.members[0]!.roster = authorizeDevices(f.alice, [f.a1, createDevice(f.alice.userId)], f.ar);
  assert.throws(() => verifySecureEpoch(unexpected, f.room, [f.alice.userId, f.bob.userId], f.accounts));
});

test("server and mobile agree on retained event authentication including optional blob ID", async () => {
  const f = await fixture(), blobId = newId();
  const message = encryptHistory(f.a1, f.epoch, f.key, { kind: "message", text: "retained ciphertext 🔒" }, newId(), blobId);
  const verified = verifySecureHistory(reorder(message), f.epoch);
  assert.deepEqual(verified, message);
  assert.match(secureHistoryHash(verified), /^[0-9a-f]{64}$/);
  for (const patch of [{ blobId: null }, { deviceId: f.b1.id }, { senderId: f.bob.userId }, { ciphertext: "00" + message.ciphertext.slice(2) }, { signature: "00".repeat(64) }]) {
    assert.throws(() => verifySecureHistory({ ...message, ...patch }, f.epoch));
  }
});

test("a root-authorized roster revision can rotate the epoch but old or forked links fail", async () => {
  const f = await fixture(), a2 = createDevice(f.alice.userId), ar2 = authorizeDevices(f.alice, [a2], f.ar);
  const accounts = new Map([[f.alice.userId, { roster: ar2, roster_hash: rosterHash(ar2) }], [f.bob.userId, { roster: f.br, roster_hash: rosterHash(f.br) }]]);
  const next = await createEpoch(a2, f.room, [{ roster: ar2, admin: true }, { roster: f.br, admin: true }], f.roots, f.epoch);
  assert.equal(secureEpochHash(verifySecureEpoch(next.epoch, f.room, [f.alice.userId, f.bob.userId], accounts, f.epoch)), epochHash(next.epoch));
  assert.throws(() => verifySecureEpoch({ ...next.epoch, previous: "00".repeat(32) }, f.room, [f.alice.userId, f.bob.userId], accounts, f.epoch));
  assert.throws(() => verifySecureEpoch({ ...next.epoch, epoch: next.epoch.epoch + 1 }, f.room, [f.alice.userId, f.bob.userId], accounts, f.epoch));
  assert.throws(() => verifySecureEpoch(f.epoch, f.room, [f.alice.userId, f.bob.userId], accounts));
});

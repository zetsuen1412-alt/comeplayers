import test from "node:test";
import assert from "node:assert/strict";
import { createIdentity, fingerprint, newId, publicIdentity } from "../apps/mobile/src/secure/crypto";
import {
  assertCurrentEpoch, authorizeDevices, createDevice, createEpoch, createRecoveryKey,
  decryptHistory, encryptHistory, epochHash, openEpochKey, openIdentityBackup,
  publicDevice, rosterHash, sealIdentityBackup, verifyEpoch, verifyRoster,
} from "../apps/mobile/src/secure/multiDevice";

function fixture() {
  const alice = createIdentity(newId()), bob = createIdentity(newId());
  const a1 = createDevice(alice.userId), b1 = createDevice(bob.userId);
  const ar = authorizeDevices(alice, [a1]), br = authorizeDevices(bob, [b1]);
  const roots = new Map([alice, bob].map(root => [root.userId, publicIdentity(root)]));
  return { alice, bob, a1, b1, ar, br, roots, room: newId(), members: [{ roster: ar, admin: true }, { roster: br, admin: true }] };
}

test("identity backup is opaque and rejects a wrong recovery key, account, pinned identity or metadata", () => {
  const f = fixture(), recovery = createRecoveryKey();
  const backup = sealIdentityBackup(f.alice, recovery);
  const serialized = JSON.stringify(backup);
  assert.ok(!serialized.includes(f.alice.encryptionSecret));
  assert.ok(!serialized.includes(f.alice.signingSecret));
  assert.ok(!serialized.includes(recovery));
  assert.deepEqual(openIdentityBackup(backup, recovery, f.alice.userId, f.alice), f.alice);
  assert.throws(() => openIdentityBackup(backup, createRecoveryKey(), f.alice.userId));
  assert.throws(() => openIdentityBackup(backup, recovery, f.bob.userId));
  assert.throws(() => openIdentityBackup(backup, recovery, f.alice.userId, createIdentity(f.alice.userId)));
  assert.throws(() => openIdentityBackup({ ...backup, id: newId() }, recovery, f.alice.userId));
  assert.throws(() => openIdentityBackup({ ...backup, ciphertext: backup.ciphertext.slice(0, -2) }, recovery, f.alice.userId));
});

test("device roster grants independent keys without replacing existing devices", () => {
  const f = fixture(), second = createDevice(f.alice.userId);
  const next = authorizeDevices(f.alice, [f.a1, second], f.ar);
  verifyRoster(next, f.alice, f.ar);
  assert.equal(next.devices.length, 2);
  assert.ok(next.devices.some(device => device.id === f.a1.id));
  assert.notEqual(fingerprint(f.a1.identity), fingerprint(second.identity));
  assert.notEqual(fingerprint(f.a1.identity), fingerprint(f.alice));
  assert.ok(!JSON.stringify(next).includes(f.alice.signingSecret));
  assert.ok(!JSON.stringify(next).includes(second.identity.encryptionSecret));
  assert.deepEqual(publicDevice(second).identity, publicIdentity(second.identity));
});

test("device authorization rejects root reuse, foreign users, duplicate keys and substituted identifiers", () => {
  const f = fixture();
  assert.throws(() => authorizeDevices(f.alice, [{ ...f.a1, identity: f.alice }]));
  assert.throws(() => authorizeDevices(f.alice, [f.b1]));
  assert.throws(() => authorizeDevices(f.alice, [f.a1, { ...f.a1, id: newId() }]));
  assert.throws(() => authorizeDevices(f.alice, [{ ...createDevice(f.alice.userId), id: f.a1.id }], f.ar));
  const forged = structuredClone(f.ar);
  forged.devices[0]!.identity = publicIdentity(createIdentity(f.alice.userId));
  assert.throws(() => verifyRoster(forged, f.alice));
});

test("known device roster rollback, revision gaps and same-revision forks fail closed", () => {
  const f = fixture(), second = createDevice(f.alice.userId);
  const next = authorizeDevices(f.alice, [f.a1, second], f.ar);
  verifyRoster(next, f.alice, next);
  assert.throws(() => verifyRoster(f.ar, f.alice, next));
  const fork = authorizeDevices(f.alice, [f.a1, createDevice(f.alice.userId)], f.ar);
  assert.notEqual(rosterHash(next), rosterHash(fork));
  assert.throws(() => verifyRoster(fork, f.alice, next));
  const third = authorizeDevices(f.alice, [second], next);
  assert.throws(() => verifyRoster(third, f.alice, f.ar));
});

test("a complete signed roster chain permits epoch rotation across several device revisions", async () => {
  const f = fixture(), a2 = createDevice(f.alice.userId), a3 = createDevice(f.alice.userId);
  const revision2 = authorizeDevices(f.alice, [f.a1, a2], f.ar);
  const revision3 = authorizeDevices(f.alice, [a3], revision2);
  const first = await createEpoch(f.a1, f.room, f.members, f.roots);
  const members = [{ roster: revision3, admin: true }, { roster: f.br, admin: true }];
  const chains = new Map<string, readonly typeof f.ar[]>([
    [f.alice.userId, [f.ar, revision2, revision3]],
    [f.bob.userId, [f.br]],
  ]);
  const next = await createEpoch(a3, f.room, members, f.roots, first.epoch, chains);
  verifyEpoch(next.epoch, f.roots, first.epoch, undefined, chains);
  assert.deepEqual(await openEpochKey(next.epoch, a3.identity, a3.id), next.key);
  await assert.rejects(createEpoch(a3, f.room, members, f.roots, first.epoch));
});

test("one conversation key opens on both users' devices and a separately recovered PC", async () => {
  const f = fixture();
  const { epoch, key } = await createEpoch(f.a1, f.room, f.members, f.roots);
  verifyEpoch(epoch, f.roots, undefined, f.alice.userId);
  assert.deepEqual(await openEpochKey(epoch, f.a1.identity, f.a1.id), key);
  assert.deepEqual(await openEpochKey(epoch, f.b1.identity, f.b1.id), key);
  const message = encryptHistory(f.a1, epoch, key, { text: "Halo PC baru 👋 日本語", attachment: { key: createRecoveryKey() } });
  const recovery = createRecoveryKey(), backup = sealIdentityBackup(f.alice, recovery);
  const rootOnPC = openIdentityBackup(backup, recovery, f.alice.userId);
  const historyKey = await openEpochKey(epoch, rootOnPC);
  const payload = decryptHistory<{ text: string }>(message, epoch, historyKey);
  assert.equal(payload.text, "Halo PC baru 👋 日本語");
  // A bare account login/new local identity never grants the decryption key.
  await assert.rejects(openEpochKey(epoch, createDevice(f.alice.userId).identity));
  const pc = createDevice(f.alice.userId);
  const pcRoster = authorizeDevices(rootOnPC, [f.a1, pc], f.ar);
  assert.equal(pcRoster.devices.length, 2);
  assert.ok(!JSON.stringify(pc).includes(rootOnPC.encryptionSecret));
  assert.ok(!JSON.stringify(pc).includes(rootOnPC.signingSecret));
});

test("private groups use distinct keys and reject injected members or key packages", async () => {
  const f = fixture(), charlie = createIdentity(newId()), c1 = createDevice(charlie.userId);
  const cr = authorizeDevices(charlie, [c1]); f.roots.set(charlie.userId, publicIdentity(charlie));
  const members = [...f.members, { roster: cr, admin: false }];
  const first = await createEpoch(f.a1, f.room, members, f.roots);
  const other = await createEpoch(f.a1, newId(), members, f.roots);
  assert.notEqual(first.key.secret, other.key.secret);
  assert.deepEqual(await openEpochKey(first.epoch, c1.identity, c1.id), first.key);
  const injection = structuredClone(first.epoch);
  injection.members.find(item => item.roster.identity.userId === charlie.userId)!.admin = true;
  assert.throws(() => verifyEpoch(injection, f.roots, undefined, f.alice.userId));
  const wrongWrap = structuredClone(first.epoch);
  const targetIndex = wrongWrap.wraps.findIndex(wrap => wrap.target === `d:${f.alice.userId}:${f.a1.id}`);
  wrongWrap.wraps[targetIndex] = other.epoch.wraps[targetIndex]!;
  assert.throws(() => verifyEpoch(wrongWrap, f.roots, undefined, f.alice.userId));
  await assert.rejects(openEpochKey(wrongWrap, f.a1.identity, f.a1.id));
  assert.throws(() => verifyEpoch(first.epoch, new Map([[f.alice.userId, f.alice], [f.bob.userId, f.bob]]), undefined, f.alice.userId));
  await assert.rejects(createEpoch(c1, f.room, members, f.roots, first.epoch));
});

test("device revocation rotates future keys while already downloaded history remains readable", async () => {
  const f = fixture(), b2 = createDevice(f.bob.userId);
  const both = authorizeDevices(f.bob, [f.b1, b2], f.br);
  const first = await createEpoch(f.a1, f.room, [{ roster: f.ar, admin: true }, { roster: both, admin: true }], f.roots);
  const oldMessage = encryptHistory(f.a1, first.epoch, first.key, { text: "before removal" });
  const remaining = authorizeDevices(f.bob, [b2], both);
  assert.throws(() => assertCurrentEpoch(first.epoch, new Map([[f.alice.userId, f.ar], [f.bob.userId, remaining]])));
  const next = await createEpoch(f.a1, f.room, [{ roster: f.ar, admin: true }, { roster: remaining, admin: true }], f.roots, first.epoch);
  verifyEpoch(next.epoch, f.roots, first.epoch);
  assertCurrentEpoch(next.epoch, new Map([[f.alice.userId, f.ar], [f.bob.userId, remaining]]));
  assert.notEqual(next.key.secret, first.key.secret);
  await assert.rejects(openEpochKey(next.epoch, f.b1.identity, f.b1.id));
  // The revoked device doesn't hold the root secret and cannot use its recovery wrap.
  await assert.rejects(openEpochKey(next.epoch, f.b1.identity));
  const message = encryptHistory(f.a1, next.epoch, next.key, { text: "after removal" });
  assert.throws(() => decryptHistory(message, next.epoch, { ...next.key, secret: first.key.secret }));
  assert.deepEqual(decryptHistory(oldMessage, first.epoch, first.key), { text: "before removal" });
  assert.deepEqual(decryptHistory(message, next.epoch, await openEpochKey(next.epoch, b2.identity, b2.id)), { text: "after removal" });
  assert.throws(() => encryptHistory(f.b1, next.epoch, next.key, { text: "unauthorized" }));
});

test("a root-authorized replacement administrator can rotate after losing all old devices", async () => {
  const f = fixture(), first = await createEpoch(f.a1, f.room, f.members, f.roots);
  const pc = createDevice(f.alice.userId), recoveredRoster = authorizeDevices(f.alice, [pc], f.ar);
  const next = await createEpoch(pc, f.room, [{ roster: recoveredRoster, admin: true }, { roster: f.br, admin: true }], f.roots, first.epoch);
  verifyEpoch(next.epoch, f.roots, first.epoch);
  assert.deepEqual(await openEpochKey(next.epoch, pc.identity, pc.id), next.key);
  await assert.rejects(openEpochKey(next.epoch, f.a1.identity, f.a1.id));
});

test("removed group members cannot decrypt the next epoch or authorize their return", async () => {
  const f = fixture(), charlie = createIdentity(newId()), c1 = createDevice(charlie.userId);
  const cr = authorizeDevices(charlie, [c1]); f.roots.set(charlie.userId, charlie);
  const first = await createEpoch(f.a1, f.room, [...f.members, { roster: cr, admin: false }], f.roots);
  const next = await createEpoch(f.a1, f.room, f.members, f.roots, first.epoch);
  await assert.rejects(openEpochKey(next.epoch, charlie));
  await assert.rejects(openEpochKey(next.epoch, c1.identity, c1.id));
  await assert.rejects(createEpoch(c1, f.room, [...f.members, { roster: cr, admin: true }], f.roots, next.epoch));
});

test("message signatures bind text, sender device, room, epoch, id and time", async () => {
  const f = fixture(), first = await createEpoch(f.a1, f.room, f.members, f.roots);
  const message = encryptHistory(f.a1, first.epoch, first.key, { text: "authentic" });
  for (const tamper of [
    { id: newId() }, { roomId: newId() }, { deviceId: f.b1.id }, { senderId: f.bob.userId },
    { epochId: newId() }, { epochHash: "00".repeat(32) }, { createdAt: "2020-01-01T00:00:00.000Z" }, { blobId: newId() },
    { ciphertext: "00" + message.ciphertext.slice(2) }, { signature: "00".repeat(64) },
  ]) assert.throws(() => decryptHistory({ ...message, ...tamper }, first.epoch, first.key));
  assert.equal(epochHash(first.epoch), first.key.epochHash);
  assert.throws(() => encryptHistory(f.a1, first.epoch, first.key, { text: "x".repeat(33000) }));
});

test("network key packages must be verified before use and cannot change after verification", async () => {
  const f = fixture(), first = await createEpoch(f.a1, f.room, f.members, f.roots);
  const fromNetwork = structuredClone(first.epoch);
  await assert.rejects(openEpochKey(fromNetwork, f.a1.identity, f.a1.id));
  assert.throws(() => encryptHistory(f.a1, fromNetwork, first.key, { text: "unverified" }));
  verifyEpoch(fromNetwork, f.roots, undefined, f.alice.userId);
  assert.deepEqual(await openEpochKey(fromNetwork, f.a1.identity, f.a1.id), first.key);
  fromNetwork.members[0]!.admin = !fromNetwork.members[0]!.admin;
  await assert.rejects(openEpochKey(fromNetwork, f.a1.identity, f.a1.id));
});

test("JSON database property reordering preserves roster, epoch and history authentication", async () => {
  const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1).map(([key, item]) => [key, reorder(item)])) : value;
  const f = fixture(), first = await createEpoch(f.a1, f.room, f.members, f.roots);
  const fromDatabase = reorder(first.epoch) as typeof first.epoch;
  verifyEpoch(fromDatabase, f.roots, undefined, f.alice.userId);
  assert.equal(epochHash(fromDatabase), epochHash(first.epoch));
  assert.deepEqual(await openEpochKey(fromDatabase, f.b1.identity, f.b1.id), first.key);
  const message = encryptHistory(f.a1, first.epoch, first.key, { text: "database round trip" });
  assert.deepEqual(decryptHistory(reorder(message) as typeof message, fromDatabase, first.key), { text: "database round trip" });
});

import test from "node:test";
import assert from "node:assert/strict";
import { createIdentity, newId } from "../../comeplayers-apps/apps/mobile/src/secure/crypto";
import { authorizeDevices, createDevice, createRecoveryKey, proveDeviceRequest, rosterHash, sealIdentityBackup } from "../../comeplayers-apps/apps/mobile/src/secure/multiDevice";
import { signedRosterHash, verifyAccountRoster, verifyDeviceRequest, verifyRootBackup } from "../lib/secureAccountProtocol";

test("Node verifies mobile root/device signatures and canonical hashes without retaining private extras", () => {
  const root = createIdentity(newId()), device = createDevice(root.userId);
  const roster = authorizeDevices(root, [device]);
  const backup = sealIdentityBackup(root, createRecoveryKey());
  assert.deepEqual(verifyAccountRoster(roster, root.userId), roster);
  assert.equal(signedRosterHash(roster), rosterHash(roster));
  assert.deepEqual(verifyRootBackup(backup, root), backup);
  const noisy = { ...roster, identity: { ...roster.identity, signingSecret: root.signingSecret }, secret: "never persist", devices: [{ ...device, localKey: "never persist" }] };
  const selected = verifyAccountRoster(noisy, root.userId);
  assert.deepEqual(selected, roster);
  assert.ok(!JSON.stringify(selected).includes(device.identity.signingSecret));
  assert.ok(!JSON.stringify(selected).includes(root.signingSecret));
  assert.deepEqual(verifyRootBackup({ ...backup, recoveryKey: "never persist" }, root), backup);
});

test("server rejects unauthenticated account replacement, roster forks and backup substitution", () => {
  const root = createIdentity(newId()), device = createDevice(root.userId), first = authorizeDevices(root, [device]);
  const second = authorizeDevices(root, [device, createDevice(root.userId)], first);
  verifyAccountRoster(second, root.userId, first);
  const jsonbLike = { ...first, identity: { signingKey: root.signingKey, encryptionKey: root.encryptionKey, userId: root.userId }, devices: first.devices.map(item => ({ createdAt: item.createdAt, identity: { signingKey: item.identity.signingKey, encryptionKey: item.identity.encryptionKey, userId: root.userId }, id: item.id })) };
  assert.equal(signedRosterHash(jsonbLike), rosterHash(first));
  verifyAccountRoster(second, root.userId, jsonbLike);
  assert.throws(() => verifyAccountRoster(first, root.userId, second));
  assert.throws(() => verifyAccountRoster(authorizeDevices(createIdentity(root.userId), [device]), root.userId, first));
  assert.throws(() => verifyAccountRoster({ ...second, signature: "00".repeat(64) }, root.userId, first));
  const fork = authorizeDevices(root, [device, createDevice(root.userId)], first);
  assert.throws(() => verifyAccountRoster(fork, root.userId, second));
  const backup = sealIdentityBackup(root, createRecoveryKey());
  assert.throws(() => verifyRootBackup({ ...backup, id: newId() }, root));
  assert.throws(() => verifyRootBackup({ ...backup, ciphertext: "00" + backup.ciphertext.slice(2) }, root));
});

test("device proof binds body, account, method, query, timestamp and nonce", () => {
  const root = createIdentity(newId()), device = createDevice(root.userId), roster = authorizeDevices(root, [device]);
  const path = "/api/messages/secure/account", body = JSON.stringify({ roster });
  const proof = proveDeviceRequest(device, "POST", path, body);
  const headers = { "x-cp-device": proof.deviceId, "x-cp-time": proof.timestamp, "x-cp-nonce": proof.nonce, "x-cp-proof": proof.signature };
  const make = (patch = {}, url = path, method = "POST") => new Request(`https://comeplayers.com${url}`, { method, headers: { ...headers, ...patch } });
  assert.equal(verifyDeviceRequest(make(), body, root.userId, roster.devices).id, device.id);
  assert.throws(() => verifyDeviceRequest(make(), body + " ", root.userId, roster.devices));
  assert.throws(() => verifyDeviceRequest(make(), body, newId(), roster.devices));
  assert.throws(() => verifyDeviceRequest(make({}, path, "DELETE"), body, root.userId, roster.devices));
  assert.throws(() => verifyDeviceRequest(make({}, path + "?other=1"), body, root.userId, roster.devices));
  assert.throws(() => verifyDeviceRequest(make({ "x-cp-nonce": newId() }), body, root.userId, roster.devices));
  assert.throws(() => verifyDeviceRequest(make(), body, root.userId, roster.devices, Date.parse(proof.timestamp) + 300001));
  assert.throws(() => verifyDeviceRequest(make(), body, root.userId, []));
  // A root private key is not accepted as an operational device credential.
  const rootProof = proveDeviceRequest({ ...device, identity: root }, "POST", path, body);
  assert.throws(() => verifyDeviceRequest(make({ "x-cp-proof": rootProof.signature, "x-cp-time": rootProof.timestamp, "x-cp-nonce": rootProof.nonce }), body, root.userId, roster.devices));
});

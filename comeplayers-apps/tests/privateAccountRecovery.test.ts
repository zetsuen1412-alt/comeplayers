import test from "node:test";
import assert from "node:assert/strict";
import { fingerprint, newId, openMessage } from "../apps/mobile/src/secure/crypto";
import { activateVerifiedDevice, prepareFirstDevice, prepareRecoveredDevice, type AccountSnapshot, type VerifiedSession, type RecoveryTransport } from "../apps/mobile/src/secure/accountRecovery";
import { createEpoch, createRecoveryKey, decryptHistory, encryptHistory, openEpochKey, openIdentityBackup, rosterHash } from "../apps/mobile/src/secure/multiDevice";
import { verifyAccountRoster, verifyDeviceRequest, verifyRootBackup, signedRosterHash } from "../../website/lib/secureAccountProtocol";

function server(userId: string) {
  let state: AccountSnapshot | null = null;
  const sent: string[] = [];
  const transport: RecoveryTransport = async <T>(path: string, options?: Parameters<RecoveryTransport>[1]): Promise<T> => {
    if (!options?.body) return { account: state } as T;
    sent.push(options.body);
    const body = JSON.parse(options.body), request = new Request("https://comeplayers.com" + path, { method: options.method, headers: options.headers });
    const roster = verifyAccountRoster(body.roster, userId, state?.roster);
    verifyDeviceRequest(request, options.body, userId, roster.devices);
    const backup = body.backup ? verifyRootBackup(body.backup, roster.identity) : state?.encrypted_backup;
    assert.ok(backup);
    state = { roster, roster_hash: signedRosterHash(roster), encrypted_backup: backup, updated_at: new Date().toISOString() };
    return { revision: roster.revision, rosterHash: state.roster_hash } as T;
  };
  return { transport, sent, snapshot: () => { assert.ok(state); return state; } };
}

test("enrollment requests and device session descriptors exclude root secrets and the recovery key", async () => {
  const userId = newId(), initial = prepareFirstDevice(userId), api = server(userId);
  const local: VerifiedSession[] = [];
  await activateVerifiedDevice(initial.plan, api.transport, async (session, recoveryIdentity) => { assert.equal(fingerprint(recoveryIdentity), fingerprint(session.root)); local.push(session); });
  const snapshot = api.snapshot(), root = openIdentityBackup(snapshot.encrypted_backup, initial.recoveryKey, userId);
  const pc = prepareRecoveredDevice(userId, snapshot, initial.recoveryKey, { pinnedRoot: initial.plan.session.root });
  await activateVerifiedDevice(pc, api.transport, async (session, recoveryIdentity) => { assert.equal(fingerprint(recoveryIdentity), fingerprint(session.root)); local.push(session); });
  assert.equal(api.snapshot().roster.devices.length, 2);
  assert.notEqual(local[0]!.device.identity.encryptionSecret, local[1]!.device.identity.encryptionSecret);
  const persisted = JSON.stringify(local), requests = api.sent.join(" ");
  for (const secret of [root.signingSecret, root.encryptionSecret, initial.recoveryKey]) {
    assert.ok(!persisted.includes(secret)); assert.ok(!requests.includes(secret));
  }
  assert.ok(!requests.includes(pc.session.device.identity.encryptionSecret));
  assert.ok(!requests.includes(pc.session.device.identity.signingSecret));
});

test("stale recovery plans fail without overwriting local device state; retry of an accepted plan is idempotent", async () => {
  const userId = newId(), initial = prepareFirstDevice(userId), api = server(userId);
  await activateVerifiedDevice(initial.plan, api.transport, async () => {});
  const snapshot = api.snapshot();
  const one = prepareRecoveredDevice(userId, snapshot, initial.recoveryKey);
  const two = prepareRecoveredDevice(userId, snapshot, initial.recoveryKey);
  await activateVerifiedDevice(one, api.transport, async () => {});
  await activateVerifiedDevice(one, api.transport, async () => {});
  let saved = false;
  await assert.rejects(activateVerifiedDevice(two, api.transport, async () => { saved = true; }));
  assert.equal(saved, false);
  assert.equal(api.snapshot().roster.devices.length, 2);
});

test("wrong recovery keys, modified device lists and unconfirmed API replies never activate a device", async () => {
  const userId = newId(), initial = prepareFirstDevice(userId), api = server(userId);
  await activateVerifiedDevice(initial.plan, api.transport, async () => {});
  assert.throws(() => prepareRecoveredDevice(userId, api.snapshot(), createRecoveryKey()));
  assert.throws(() => prepareRecoveredDevice(userId, { ...api.snapshot(), roster_hash: "00".repeat(32) }, initial.recoveryKey));
  let saved = false;
  const wrongReply: RecoveryTransport = async <T>() => ({ revision: 999, rosterHash: rosterHash(initial.plan.session.roster) }) as T;
  await assert.rejects(activateVerifiedDevice(initial.plan, wrongReply, async () => { saved = true; }));
  assert.equal(saved, false);
});

test("recovered account opens historical ciphertext but a copied device key cannot open future recovery envelopes", async () => {
  const alice = prepareFirstDevice(newId()), bob = prepareFirstDevice(newId());
  const a = alice.plan.session, b = bob.plan.session, roots = new Map([[a.root.userId, a.root], [b.root.userId, b.root]]);
  const first = await createEpoch(a.device, newId(), [{ roster: a.roster, admin: true }, { roster: b.roster, admin: true }], roots);
  const old = encryptHistory(b.device, first.epoch, first.key, { text: "Chat before PC login" });
  const snapshot: AccountSnapshot = { roster: a.roster, roster_hash: rosterHash(a.roster), encrypted_backup: alice.plan.backup!, updated_at: new Date().toISOString() };
  const recoveredRoot = openIdentityBackup(snapshot.encrypted_backup, alice.recoveryKey, a.root.userId);
  assert.deepEqual(decryptHistory(old, first.epoch, await openEpochKey(first.epoch, recoveredRoot)), { text: "Chat before PC login" });
  const pc = prepareRecoveredDevice(a.root.userId, snapshot, alice.recoveryKey, { removeDeviceIds: [a.device.id] });
  const next = await createEpoch(pc.session.device, first.epoch.roomId, [{ roster: pc.session.roster, admin: true }, { roster: b.roster, admin: true }], roots, first.epoch);
  const recoveryWrap = next.epoch.wraps.find(wrap => wrap.target === `r:${a.root.userId}`)!;
  await assert.rejects(openMessage(a.device.identity, pc.session.device.identity, recoveryWrap.envelope, first.epoch.roomId));
});

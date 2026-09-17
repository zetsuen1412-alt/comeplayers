import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "@noble/hashes/sha2.js";
import { createIdentity, hex, newId, random, utf8 } from "../lib/e2ee/crypto";
import { openIdentityBackup, rosterHash } from "../lib/e2ee/protocol";
import { activateVerifiedDevice, prepareFirstDevice, prepareRecoveredDevice } from "../lib/e2ee/account";
import { sealPasskeyRecovery, openPasskeyRecovery, openAccountBackup, RECOVERY_RP_ID } from "../lib/e2ee/passkeyRecovery";
import { openPasskeyRecovery as openMobile, sealPasskeyRecovery as sealMobile } from "../../comeplayers-apps/apps/mobile/src/secure/passkeyRecovery";
import { validateRecoveryAssertion, base64url, fromBase64, recoveryCreateOptions } from "../lib/e2ee/passkeyProvider";
import { verifyRootBackup } from "../lib/secureAccountProtocol";

test("synced passkey restores the same account root on web and mobile without the manual key", () => {
  const user = newId(), { plan } = prepareFirstDevice(user), prf = random(), credential = base64url(random()), salt = hex(random());
  for (const [seal, open] of [[sealPasskeyRecovery, openMobile], [sealMobile, openPasskeyRecovery]] as const) {
    const passkey = seal(plan.recoveryIdentity, prf, credential, salt);
    const stored = verifyRootBackup({ ...plan.backup, passkey }, plan.session.root);
    const key = open(JSON.parse(JSON.stringify(stored.passkey)), new Uint8Array(prf), plan.session.root);
    const restored = prepareRecoveredDevice(user, { roster: plan.session.roster, roster_hash: rosterHash(plan.session.roster), encrypted_backup: stored.passkey!.backup, updated_at: new Date().toISOString() }, key);
    assert.deepEqual(restored.recoveryIdentity, plan.recoveryIdentity);
    assert.notEqual(restored.session.device.id, plan.session.device.id);
    const wire = JSON.stringify(stored);
    for (const secret of [hex(prf), key, plan.recoveryIdentity.encryptionSecret, plan.recoveryIdentity.signingSecret]) assert.equal(wire.includes(secret), false);
  }
});

test("adding passkey recovery preserves the old recovery backup and strips private extras", () => {
  const { plan, recoveryKey } = prepareFirstDevice(newId());
  const passkey = sealPasskeyRecovery(plan.recoveryIdentity, random(), base64url(random()), hex(random()));
  const clean = verifyRootBackup({ ...plan.backup, passkey: { ...passkey, prf: "must not persist", clientExtensionResults: { secret: "must not persist" } } }, plan.session.root);
  assert.deepEqual(openIdentityBackup(clean, recoveryKey, plan.session.root.userId, plan.session.root), plan.recoveryIdentity);
  assert.equal(JSON.stringify(clean).includes("must not persist"), false);
});

test("wrong passkey, account, salt, credential or ciphertext cannot recover or substitute a root", () => {
  const root = createIdentity(newId()), prf = random(), passkey = sealPasskeyRecovery(root, prf, base64url(random()), hex(random()));
  assert.throws(() => openPasskeyRecovery(passkey, random(), root));
  assert.throws(() => openPasskeyRecovery(passkey, prf, createIdentity(newId())));
  const changedCiphertext = (parseInt(passkey.backup.ciphertext.slice(0, 2), 16) ^ 1).toString(16).padStart(2, "0") + passkey.backup.ciphertext.slice(2);
  for (const changed of [{ ...passkey, salt: hex(random()) }, { ...passkey, credentialId: base64url(random()) }, { ...passkey, rpId: "attacker.example" },
    { ...passkey, backup: { ...passkey.backup, ciphertext: changedCiphertext } }]) {
    assert.throws(() => openPasskeyRecovery(changed, prf, root));
    assert.throws(() => verifyRootBackup({ ...passkey.backup, passkey: changed }, root));
  }
  assert.throws(() => verifyRootBackup({ ...passkey.backup, passkey: { ...passkey, backup: { ...passkey.backup, passkey } } }, root));
});

test("encryption recovery requires PRF, verified presence, the right RP and an actually backed-up credential", () => {
  const data = new Uint8Array(37); data.set(sha256(utf8(RECOVERY_RP_ID))); data[32] = 0x1d;
  const prf = random();
  assert.equal(validateRecoveryAssertion(data, prf), prf);
  for (const flag of [0, 1, 5, 9, 13, 25]) { const changed = new Uint8Array(data); changed[32] = flag; assert.throws(() => validateRecoveryAssertion(changed, prf)); }
  assert.throws(() => validateRecoveryAssertion(data, undefined));
  assert.throws(() => validateRecoveryAssertion(data, random(16)));
  assert.throws(() => validateRecoveryAssertion(new Uint8Array(37), prf));
  const salt = random(); assert.deepEqual(fromBase64(recoveryCreateOptions(newId(), salt).extensions.prf.eval.first), salt);
});

test("activation requires confirmation that the encrypted passkey backup was stored", async () => {
  const { plan } = prepareFirstDevice(newId());
  plan.backup = { ...plan.backup!, passkey: sealPasskeyRecovery(plan.recoveryIdentity, random(), base64url(random()), hex(random())) };
  let persisted = false;
  await assert.rejects(activateVerifiedDevice(plan, async <T>() => ({ revision: plan.session.roster.revision, rosterHash: rosterHash(plan.session.roster) }) as T,
    async () => { persisted = true; }));
  assert.equal(persisted, false);
  await activateVerifiedDevice(plan, async <T>() => ({ revision: plan.session.roster.revision, rosterHash: rosterHash(plan.session.roster), passkeySignature: plan.backup!.passkey!.signature }) as T,
    async () => { persisted = true; });
  assert.equal(persisted, true);
});

test("history archive protection accepts both the original key and the account passkey without changing the root", () => {
  const { plan, recoveryKey } = prepareFirstDevice(newId()), prf = random();
  const passkey = sealMobile(plan.recoveryIdentity, prf, base64url(random()), hex(random()));
  const backup = { ...plan.backup!, passkey };
  const derived = openMobile(passkey, prf, plan.session.root);
  assert.deepEqual(openAccountBackup(backup, recoveryKey, plan.session.root), plan.recoveryIdentity);
  assert.deepEqual(openAccountBackup(backup, derived, plan.session.root), plan.recoveryIdentity);
  assert.throws(() => openAccountBackup(backup, hex(random()), plan.session.root));
});

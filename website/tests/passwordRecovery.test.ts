import test from "node:test";
import assert from "node:assert/strict";
import { newId, fingerprint } from "../lib/e2ee/crypto";
import { prepareFirstDevice, prepareRecoveredDevice } from "../lib/e2ee/account";
import { sealPasswordRecovery, openPasswordRecovery, verifyPasswordRecovery } from "../lib/e2ee/passwordRecovery";
import { openPasswordRecovery as openMobile } from "../../comeplayers-apps/apps/mobile/src/secure/passwordRecovery";
import { openAccountBackup } from "../lib/e2ee/passkeyRecovery";
import { rosterHash } from "../lib/e2ee/protocol";
import { verifyRootBackup } from "../lib/secureAccountProtocol";

test("optional password backup restores the same root across mobile/web, without uploading secrets", async () => {
  const { plan, recoveryKey } = prepareFirstDevice(newId()), password = "four random words for testing only";
  const { recovery, key } = await sealPasswordRecovery(plan.recoveryIdentity, password);
  const stored = verifyRootBackup({ ...plan.backup, password: { ...recovery, plaintext: password, key } }, plan.session.root);
  assert.equal(await openMobile(recovery, password, plan.session.root), key);
  assert.equal(fingerprint(openAccountBackup(stored, key, plan.session.root)), fingerprint(plan.session.root));
  assert.equal(fingerprint(openAccountBackup(stored, recoveryKey, plan.session.root)), fingerprint(plan.session.root));
  const recovered = prepareRecoveredDevice(plan.session.root.userId, { roster: plan.session.roster, roster_hash: rosterHash(plan.session.roster), encrypted_backup: recovery.backup, updated_at: "" }, key);
  assert.equal(fingerprint(recovered.session.root), fingerprint(plan.session.root));
  assert.notEqual(recovered.session.device.id, plan.session.device.id);
  for (const secret of [password, key, plan.recoveryIdentity.signingSecret, plan.recoveryIdentity.encryptionSecret]) assert.ok(!JSON.stringify(stored).includes(secret));
  await assert.rejects(openPasswordRecovery(recovery, "wrong password for test", plan.session.root), /tidak cocok/);
  for (const changed of [{ ...recovery, iterations: 1 }, { ...recovery, iterations: 1e12 }, { ...recovery, salt: "00".repeat(32) }, { ...recovery, backup: { ...recovery.backup, password: recovery } }]) {
    assert.throws(() => verifyPasswordRecovery(changed as typeof recovery, plan.session.root));
    assert.throws(() => verifyRootBackup({ ...plan.backup, password: changed }, plan.session.root));
  }
  await assert.rejects(sealPasswordRecovery(plan.recoveryIdentity, "short"), /12 karakter/);
});

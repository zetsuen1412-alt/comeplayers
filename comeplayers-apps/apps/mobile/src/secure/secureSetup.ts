import { activateVerifiedDevice, prepareRecoveredDevice, type AccountSnapshot, type EnrollmentPlan } from "./accountRecovery";
import { mobileSecureTransport } from "./mobileSecureTransport";
import { persistVerifiedSession } from "./verifiedVault";
import { createNativePasskeyRecovery, unlockNativePasskeyRecovery } from "./nativePasskey";

export type SecureSetup = { kind: "new"; recoveryKey: string; plan: EnrollmentPlan } | { kind: "recover"; snapshot: AccountSnapshot };

export async function activateSecureSetup(userId: string, setup: SecureSetup, recoveryKey?: string): Promise<void> {
  const plan = setup.kind === "new" ? setup.plan : prepareRecoveredDevice(userId, setup.snapshot, String(recoveryKey || "").replace(/\s/g, "").toLowerCase());
  await activateVerifiedDevice(plan, mobileSecureTransport, persistVerifiedSession);
}

export async function activatePasskeySetup(userId: string, setup: SecureSetup): Promise<void> {
  let plan: EnrollmentPlan;
  if (setup.kind === "new") {
    if (!setup.plan.backup) throw new Error("The encrypted identity backup is missing.");
    const passkey = await createNativePasskeyRecovery(setup.plan.recoveryIdentity);
    plan = { ...setup.plan, backup: { ...setup.plan.backup, passkey } };
  } else {
    const passkey = setup.snapshot.encrypted_backup.passkey;
    if (!passkey) throw new Error("Enable passkey recovery on your previous verified device, or use your existing recovery key once.");
    const key = await unlockNativePasskeyRecovery(passkey, setup.snapshot.roster.identity);
    plan = prepareRecoveredDevice(userId, { ...setup.snapshot, encrypted_backup: passkey.backup }, key);
  }
  await activateVerifiedDevice(plan, mobileSecureTransport, persistVerifiedSession);
}

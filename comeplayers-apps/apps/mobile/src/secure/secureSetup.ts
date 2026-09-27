import { activateVerifiedDevice, prepareRecoveredDevice, type AccountSnapshot, type EnrollmentPlan, type RecoveryTransport } from "./accountRecovery";
import { mobileSecureTransport } from "./mobileSecureTransport";
import { persistVerifiedSession } from "./verifiedVault";
import { createNativePasskeyRecovery, unlockNativePasskeyRecovery } from "./nativePasskey";
import { fingerprint } from "./crypto";
import { rosterHash, verifyRoster } from "./multiDevice";
import { supabase } from "../runtime";
import { LEGACY_RECOVERY_POLICY, parseRecoveryPolicy, recoveryHeaders, validateDeviceReplacement, type RecoveryPolicy } from "./recoveryPolicy";

export type SecureSetup = ({ kind: "new"; recoveryKey: string; plan: EnrollmentPlan } | { kind: "recover"; snapshot: AccountSnapshot }) & { policy?: RecoveryPolicy };
const plans = new WeakMap<SecureSetup, { plan: EnrollmentPlan; selection: string }>();
const activations = new WeakMap<SecureSetup, Promise<void>>();

async function assertUser(userId: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.id !== userId) throw new Error("The signed-in account changed. Reopen Messages to continue.");
  return data.session.user;
}

/** Legacy archive compatibility only; the setup UI never requests this key. */
export async function activateSecureSetup(userId: string, setup: SecureSetup, recoveryKey?: string): Promise<void> {
  if (setup.policy?.requirePasskey) throw new Error("Use account passkey recovery for this account.");
  await assertUser(userId);
  const plan = setup.kind === "new" ? setup.plan : prepareRecoveredDevice(userId, setup.snapshot, String(recoveryKey || "").replace(/\s/g, "").toLowerCase());
  await activateVerifiedDevice(plan, mobileSecureTransport, async (session, root) => { await assertUser(userId); await persistVerifiedSession(session, root); });
}

export function activatePasskeySetup(userId: string, setup: SecureSetup, removeDeviceIds: string[] = []): Promise<void> {
  // Leaving a conversation while its system prompt is open must not let a
  // remounted screen create another passkey or register a duplicate device.
  const pending = activations.get(setup);
  if (pending) return pending;
  const activation = activatePasskeySetupOnce(userId, setup, removeDeviceIds).finally(() => activations.delete(setup));
  activations.set(setup, activation);
  return activation;
}

async function activatePasskeySetupOnce(userId: string, setup: SecureSetup, removeDeviceIds: string[]): Promise<void> {
  const user = await assertUser(userId);
  const policy = setup.policy ?? LEGACY_RECOVERY_POLICY;
  const selection = [...removeDeviceIds].sort().join(",");
  let cached = plans.get(setup);
  if (cached && cached.selection !== selection) { plans.delete(setup); cached = undefined; }
  if (!cached) {
    let plan: EnrollmentPlan;
    if (setup.kind === "new") {
      if (!setup.plan.backup) throw new Error("The encrypted identity backup is missing.");
      const passkey = await createNativePasskeyRecovery(setup.plan.recoveryIdentity, { email: user.email });
      plan = { ...setup.plan, backup: { ...setup.plan.backup, passkey } };
    } else {
      const passkey = setup.snapshot.encrypted_backup.passkey;
      if (!passkey) throw new Error("This account is waiting for the approved recovery reset. Refresh after the new release is active.");
      validateDeviceReplacement(setup.snapshot.roster.devices.map(device => device.id), removeDeviceIds);
      const key = await unlockNativePasskeyRecovery(passkey, setup.snapshot.roster.identity);
      plan = prepareRecoveredDevice(userId, { ...setup.snapshot, encrypted_backup: passkey.backup }, key, { pinnedRoot: setup.snapshot.roster.identity, removeDeviceIds });
    }
    cached = { plan, selection }; plans.set(setup, cached);
  }
  const { plan } = cached;
  await assertUser(userId);
  const latest = await mobileSecureTransport<{ account: AccountSnapshot | null; recovery?: unknown }>("/api/messages/secure/account");
  if (parseRecoveryPolicy(latest.recovery).generation !== policy.generation) throw new Error("The recovery policy changed. Refresh before continuing.");
  if (latest.account) {
    verifyRoster(latest.account.roster, latest.account.roster.identity);
    if (latest.account.roster.identity.userId !== userId || rosterHash(latest.account.roster) !== latest.account.roster_hash) throw new Error("Invalid account recovery checkpoint.");
    // Recover a lost POST response without creating another passkey or device.
    if (latest.account.roster_hash === rosterHash(plan.session.roster) && fingerprint(latest.account.roster.identity) === fingerprint(plan.session.root) && (!plan.backup?.passkey || latest.account.encrypted_backup.passkey?.signature === plan.backup.passkey.signature)) {
      await assertUser(userId); await persistVerifiedSession(plan.session, plan.recoveryIdentity); plans.delete(setup); return;
    }
    if (setup.kind === "new" || latest.account.roster_hash !== setup.snapshot.roster_hash) throw new Error("The device list changed. Refresh before continuing.");
  } else if (setup.kind === "recover") throw new Error("The encrypted account changed. Refresh before continuing.");
  const transport: RecoveryTransport = async (path, init = {}) => {
    await assertUser(userId);
    return mobileSecureTransport(path, { ...init, headers: { ...init.headers, ...recoveryHeaders(policy) } });
  };
  await activateVerifiedDevice(plan, transport, async (session, root) => { await assertUser(userId); await persistVerifiedSession(session, root); });
  plans.delete(setup);
}

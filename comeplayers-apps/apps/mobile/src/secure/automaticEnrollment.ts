import { activateVerifiedDevice, prepareFirstDevice, type AccountSnapshot, type RecoveryTransport } from "./accountRecovery";
import { readPendingEnrollment, savePendingEnrollment, clearPendingEnrollment } from "./enrollmentJournal";
import { mobileSecureTransport } from "./mobileSecureTransport";
import { openVerifiedVault, persistVerifiedSession } from "./verifiedVault";
import { fingerprint } from "./crypto";
import { rosterHash, verifyRoster } from "./multiDevice";
import { parseRecoveryPolicy, recoveryHeaders, type RecoveryPolicy } from "./recoveryPolicy";
import { supabase } from "../runtime";

const pending = new Map<string, Promise<boolean>>();
async function assertUser(userId: string) {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== userId) throw new Error("The signed-in account changed. Reopen Messages to continue.");
}

/** Only first-device enrollment is automatic. Existing identities require recovery. */
export function ensureAutomaticEnrollment(userId: string, policy: RecoveryPolicy): Promise<boolean> {
  const running = pending.get(userId);
  if (running) return running;
  const task = enroll(userId, policy).finally(() => pending.delete(userId));
  pending.set(userId, task);
  return task;
}

async function enroll(userId: string, policy: RecoveryPolicy): Promise<boolean> {
  if (!policy.allowDeviceSetup) return false;
  await assertUser(userId);
  if (await openVerifiedVault(userId)) return true;
  const latest = await mobileSecureTransport<{ account: AccountSnapshot | null; recovery?: unknown }>("/api/messages/secure/account");
  await assertUser(userId);
  const current = parseRecoveryPolicy(latest.recovery);
  if (current.generation !== policy.generation || !current.allowDeviceSetup) throw new Error("The recovery policy changed. Refresh before continuing.");
  if (latest.account === undefined) throw new Error("Invalid secure account response.");
  let saved = await readPendingEnrollment(userId);
  if (saved && saved.generation !== policy.generation) throw new Error("The recovery policy changed. Local setup keys were preserved.");
  if (latest.account) {
    const { roster } = latest.account;
    verifyRoster(roster, roster.identity);
    if (roster.identity.userId !== userId || rosterHash(roster) !== latest.account.roster_hash) throw new Error("Invalid account recovery checkpoint.");
    if (!saved) return false;
    const session = saved.plan.session;
    if (fingerprint(roster.identity) !== fingerprint(session.root)) return false;
    // A previous POST may have committed before the process/connection stopped.
    if (!roster.devices.some(device => device.id === session.device.id && fingerprint(device.identity) === fingerprint(session.device.identity))) return false;
    if (roster.revision < session.roster.revision || (roster.revision === session.roster.revision && rosterHash(roster) !== rosterHash(session.roster))) throw new Error("The device list changed. Refresh before continuing.");
    await assertUser(userId);
    await persistVerifiedSession({ ...session, roster }, saved.plan.recoveryIdentity);
  } else {
    if (!saved) {
      saved = { version: 1, generation: policy.generation, ...prepareFirstDevice(userId) };
      await savePendingEnrollment(userId, saved);
    }
    await assertUser(userId);
    const transport: RecoveryTransport = (path, init = {}) => mobileSecureTransport(path, { ...init, headers: { ...init.headers, ...recoveryHeaders(policy) } });
    await activateVerifiedDevice(saved.plan, transport, async (session, root) => {
      await assertUser(userId); await persistVerifiedSession(session, root);
    });
  }
  // Keep the original backup key only inside this device's encrypted vault.
  const vault = await openVerifiedVault(userId);
  if (!vault) throw new Error("Chat setup could not be saved on this device.");
  await vault.put("local-recovery-key-v1", userId, saved.recoveryKey);
  await clearPendingEnrollment(userId);
  return true;
}

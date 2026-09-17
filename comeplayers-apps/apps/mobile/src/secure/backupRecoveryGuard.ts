import type { AccountSnapshot, RecoveryTransport } from "./accountRecovery";
import { fingerprint, type PublicIdentity } from "./crypto";
import { rosterHash, verifyRoster } from "./multiDevice";
import { assertLocalAccountMatch, parseRecoveryPolicy } from "./recoveryPolicy";

/** Check authorization without clearing a vault or exposing any private key. */
export async function createBackupRecoveryGuard(
  userId: string,
  root: PublicIdentity,
  deviceId: string,
  localGeneration: number,
  transport: RecoveryTransport,
) {
  async function readCurrent(): Promise<AccountSnapshot> {
    const response = await transport<{ account: AccountSnapshot | null; recovery?: unknown }>("/api/messages/secure/account");
    const policy = parseRecoveryPolicy(response.recovery);
    if (policy.generation !== localGeneration) throw new Error("Account recovery changed. Reopen Messages before saving or restoring history.");
    const snapshot = response.account;
    if (!snapshot || root.userId !== userId || snapshot.roster.identity.userId !== userId) throw new Error("The encrypted account changed. Reopen Messages before continuing.");
    verifyRoster(snapshot.roster, root);
    if (rosterHash(snapshot.roster) !== snapshot.roster_hash) throw new Error("The device list failed verification.");
    assertLocalAccountMatch(fingerprint(root), fingerprint(snapshot.roster.identity), deviceId, snapshot.roster.devices.map(device => device.id));
    return snapshot;
  }
  const snapshot = await readCurrent();
  return { snapshot, assertCurrent: async () => { await readCurrent(); } };
}

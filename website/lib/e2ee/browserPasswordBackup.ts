import type { AccountSnapshot, RecoveryTransport } from "./account";
import { openBrowserVault } from "./browserVault";
import { fingerprint, validateIdentity, type Identity } from "./crypto";
import { openPasswordRecovery, sealPasswordRecovery, verifyPasswordRecovery, type PasswordRecovery } from "./passwordRecovery";
import { proveDeviceRequest, rosterHash, verifyRoster } from "./protocol";
import { assertLocalAccountMatch, parseRecoveryPolicy, readRecoveryGeneration, recoveryGenerationKey, recoveryHeaders } from "./recoveryPolicy";

const PENDING = "password-backup-pending-v1";
type PendingBackup = { version: 1; generation: number; recovery: PasswordRecovery };
const operations = new Map<string, Promise<void>>();

/** Explicit, optional setup. Passwords and derived keys never enter storage or a request. */
export function enableBrowserPasswordBackup(userId: string, password: string, transport: RecoveryTransport, assertUser: () => Promise<unknown>): Promise<void> {
  const run = async () => {
    await assertUser();
    const vault = await openBrowserVault(userId);
    const root = await vault?.get<Identity>("root-recovery-v2", userId);
    if (!vault || !root) throw new Error("Buka chat di perangkat lama yang masih dapat membaca pesan, lalu coba lagi.");
    validateIdentity(root, userId);
    const { device } = await vault.session();
    const read = async () => {
      await assertUser();
      const response = await transport<{ account: AccountSnapshot | null; recovery?: unknown }>("/api/messages/secure/account");
      await assertUser();
      const account = response.account, policy = parseRecoveryPolicy(response.recovery);
      if (policy.generation !== readRecoveryGeneration(localStorage.getItem(recoveryGenerationKey(userId)))) throw new Error("Status akun berubah. Buka kembali chat sebelum mengatur cadangan.");
      if (!account) throw new Error("Akun chat belum tersedia. Data di perangkat ini tetap disimpan.");
      verifyRoster(account.roster, root);
      assertLocalAccountMatch(vault.checkpoint.rootFingerprint, fingerprint(account.roster.identity), device.id, account.roster.devices.map(item => item.id));
      const own = account.roster.devices.find(item => item.id === device.id);
      if (account.roster.identity.userId !== userId || rosterHash(account.roster) !== account.roster_hash || !own || fingerprint(own.identity) !== fingerprint(device.identity)) throw new Error("Daftar perangkat berubah. Buka kembali chat sebelum mengatur cadangan.");
      return { account, policy };
    };
    const initial = await read();
    const pending = await vault.list<PendingBackup>(PENDING);
    const clearConfirmed = async (signature: string) => {
      // Unique signed IDs prevent another tab's pending attempt from being overwritten.
      for (const row of pending) if (row.value.recovery.signature === signature) await vault.remove(PENDING, row.id);
    };
    if (initial.account.encrypted_backup.password) {
      await openPasswordRecovery(initial.account.encrypted_backup.password, password, root);
      await assertUser();
      await clearConfirmed(initial.account.encrypted_backup.password.signature);
      return;
    }
    let recovery: PasswordRecovery | undefined;
    for (const row of pending) {
      if (row.value.version !== 1 || row.value.generation !== initial.policy.generation) throw new Error("Status cadangan berubah. Percobaan sebelumnya tetap disimpan.");
      verifyPasswordRecovery(row.value.recovery, root);
      try { await openPasswordRecovery(row.value.recovery, password, root); recovery = row.value.recovery; break; }
      catch { /* A separate tab may have a different still-pending password. */ }
    }
    if (!recovery) {
      if (pending.length) throw new Error("Sandi cadangan tidak cocok dengan percobaan sebelumnya. Gunakan sandi yang tadi Anda pilih.");
      ({ recovery } = await sealPasswordRecovery(root, password));
      await assertUser();
      // Durability precedes the remote write, including when its response is lost.
      await vault.put(PENDING, recovery.signature, { version: 1, generation: initial.policy.generation, recovery } satisfies PendingBackup);
    }
    const latest = await read();
    if (latest.policy.generation !== initial.policy.generation || latest.account.roster_hash !== initial.account.roster_hash) throw new Error("Status akun berubah. Coba simpan lagi dengan sandi yang sama.");
    if (latest.account.encrypted_backup.password) {
      await openPasswordRecovery(latest.account.encrypted_backup.password, password, root);
      await assertUser();
      if (latest.account.encrypted_backup.password.signature === recovery.signature) await vault.remove(PENDING, recovery.signature);
      return;
    }
    const path = "/api/messages/secure/account/password", body = JSON.stringify({ recovery });
    const proof = proveDeviceRequest(device, "POST", path, body);
    await assertUser();
    const result = await transport<{ passwordSignature: string }>(path, { method: "POST", body, headers: {
      ...recoveryHeaders(initial.policy), "x-cp-device": proof.deviceId, "x-cp-time": proof.timestamp, "x-cp-nonce": proof.nonce, "x-cp-proof": proof.signature,
    } });
    if (result.passwordSignature !== recovery.signature) throw new Error("Cadangan belum terkonfirmasi. Coba lagi dengan sandi yang sama.");
    const confirmed = await read();
    if (confirmed.policy.generation !== initial.policy.generation || confirmed.account.encrypted_backup.password?.signature !== recovery.signature) throw new Error("Cadangan belum terkonfirmasi. Coba lagi dengan sandi yang sama.");
    await vault.remove(PENDING, recovery.signature);
  };
  // Serialize local forms without making a second password inherit the first result.
  const previous = operations.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  operations.set(userId, next);
  void next.finally(() => { if (operations.get(userId) === next) operations.delete(userId); }).catch(() => undefined);
  return next;
}

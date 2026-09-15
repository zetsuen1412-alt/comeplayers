import { File, Paths } from "expo-file-system";
import { encodeBackup, decodeBackup } from "./backupFormat";
import { fingerprint, newId, publicIdentity, unhex, utf8, type PublicIdentity } from "./crypto";
import { createBackupRecoveryGuard } from "./backupRecoveryGuard";
import { readNativeRecoveryGeneration } from "./nativeRecoveryPolicy";
import { verifyRoster, type AccountRoster } from "./multiDevice";
import { openAccountBackup } from "./passkeyRecovery";
import { mobileSecureTransport } from "./mobileSecureTransport";
import { openVerifiedVault } from "./verifiedVault";
import type { VaultRow } from "./vault";
import { BACKUP_CONTENT_KINDS, historyBackupRecord, mergeHistoryBackupRecord, verifyHistoryBackupIdentity } from "./verifiedBackupRecords";
import { checkBackupCancellation } from "./backupCancellation";

async function backupContext(userId: string, recoveryKey: string, checkRecovery: boolean) {
  const normalized = recoveryKey.replace(/\s/g, "");
  if (!/^[0-9a-f]{64}$/i.test(normalized)) throw new Error("Enter the complete 64-character recovery key.");
  const vault = await openVerifiedVault(userId);
  if (!vault) throw new Error("Verify this device in Messages before backing up or restoring history.");
  const roster = await vault.get<AccountRoster>("account-roster", userId);
  if (!roster) throw new Error("The verified account is unavailable.");
  // The signed roster carries the root identity; verify before trusting it.
  const root = roster.identity;
  verifyRoster(roster, root);
  const { snapshot, assertCurrent } = await createBackupRecoveryGuard(userId, root, vault.descriptor.deviceId, await readNativeRecoveryGeneration(userId), mobileSecureTransport);
  if (checkRecovery) {
    const recovered = openAccountBackup(snapshot.encrypted_backup, normalized, root);
    if (fingerprint(recovered) !== fingerprint(root)) throw new Error("The recovery key does not match this account.");
  }
  return { vault, root: publicIdentity(root), key: unhex(normalized), assertCurrent };
}

export async function exportVerifiedBackup(userId: string, recoveryKey: string, signal?: AbortSignal): Promise<File> {
  checkBackupCancellation(signal);
  const { vault, root, key, assertCurrent } = await backupContext(userId, recoveryKey, true);
  const file = new File(Paths.cache, `ComePlayers-${new Date().toISOString().slice(0, 10)}-${newId()}.cpbackup`);
  let handle: ReturnType<File["open"]> | undefined;
  try {
    file.create(); handle = file.open();
    await vault.transaction(async tx => {
      async function* records() {
        yield { format: "comeplayers-verified-history", version: 2, root };
        let count = 0;
        for await (const row of tx.getEachAsync<VaultRow>("SELECT * FROM records ORDER BY kind,id")) {
          if (!BACKUP_CONTENT_KINDS.has(row.kind)) continue;
          yield { kind: row.kind, id: row.id, room: row.room, sort: row.sort, value: vault.decode(row) };
          if (++count % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      for await (const line of encodeBackup(key, userId, records())) {
        checkBackupCancellation(signal);
        handle!.writeBytes(utf8(line));
        if ((handle!.offset || 0) > 2 * 1024 ** 3) throw new Error("This backup exceeds the 2 GB archive limit.");
      }
    });
    // A reset or device revocation during encoding must not produce a usable export.
    await assertCurrent();
    checkBackupCancellation(signal);
    return file;
  } catch (error) {
    handle?.close(); handle = undefined;
    if (file.exists) file.delete();
    throw error;
  } finally { handle?.close(); key.fill(0); }
}

async function* lines(file: File) {
  if (!file.size || file.size > 2 * 1024 ** 3) throw new Error("Choose a complete backup under 2 GB.");
  const handle = file.open(); let pending = "";
  try {
    while ((handle.offset || 0) < file.size) {
      pending += new TextDecoder().decode(handle.readBytes(65536));
      let index: number;
      while ((index = pending.indexOf("\n")) !== -1) { yield pending.slice(0, index); pending = pending.slice(index + 1); }
      if (pending.length > 600000) throw new Error("Invalid backup record size.");
    }
    if (pending) throw new Error("Backup is incomplete.");
  } finally { handle.close(); }
}

export async function restoreVerifiedBackup(userId: string, uri: string, recoveryKey: string, signal?: AbortSignal): Promise<void> {
  checkBackupCancellation(signal);
  const { vault, root, key, assertCurrent } = await backupContext(userId, recoveryKey, false);
  try {
    // One transaction rolls back every imported record if authentication, footer
    // validation or the download fails. The verified device pointer never changes.
    await vault.transaction(async tx => {
      let first = true, count = 0;
      for await (const value of decodeBackup(key, userId, lines(new File(uri)))) {
        checkBackupCancellation(signal);
        if (first) { verifyHistoryBackupIdentity(value, userId, root as PublicIdentity); first = false; continue; }
        const incoming = historyBackupRecord(value);
        const saved = await tx.getFirstAsync<VaultRow>("SELECT * FROM records WHERE kind=? AND id=?", incoming.kind, incoming.id);
        const merged = mergeHistoryBackupRecord(saved ? vault.decode(saved) : null, incoming);
        const row = vault.encode(incoming.kind, incoming.id, merged, saved?.room || incoming.room, saved && saved.sort > incoming.sort ? saved.sort : incoming.sort);
        await tx.runAsync("INSERT INTO records(kind,id,room,sort,value) VALUES (?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET room=excluded.room,sort=excluded.sort,value=excluded.value", row.kind, row.id, row.room, row.sort, row.value);
        if (++count % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (first) throw new Error("The backup has no verified history header.");
      // Keep this inside the transaction so a reset, lost access, or failed
      // policy request rolls back every imported record before the commit.
      await assertCurrent();
      checkBackupCancellation(signal);
    });
  } finally { key.fill(0); }
}

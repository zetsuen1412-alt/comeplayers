import { File, Paths } from "expo-file-system";
import { decodeBackup, encodeBackup } from "./backupFormat";
import { fingerprint, newId, unhex, utf8, validateIdentity } from "./crypto";
import { activateRestoredVault, createVaultDatabase, openVault, type VaultDescriptor, type VaultRow } from "./vault";
import { mergeRestoredValue } from "./restoreMerge";

export async function exportPrivateBackup(userId: string, recoveryKey: string): Promise<File> {
  const key = unhex(recoveryKey.replace(/\s/g, ""));
  if (key.length !== 32) throw new Error("Use the complete 64-character recovery key.");
  const vault = await openVault(userId);
  const file = new File(Paths.cache, `ComePlayers-${new Date().toISOString().slice(0, 10)}-${newId()}.cpbackup`);
  file.create(); const handle = file.open();
  try {
    // A consistent read snapshot includes the outbox and encrypted media chunks.
    await vault.transaction(async tx => {
      async function* records() {
        yield { descriptor: vault.descriptor };
        for await (const row of tx.getEachAsync<VaultRow>("SELECT * FROM records ORDER BY kind,id")) yield { row };
      }
      for await (const line of encodeBackup(key, userId, records())) handle.writeBytes(utf8(line));
    });
    return file;
  } catch (error) { handle.close(); if (file.exists) file.delete(); throw error; }
  finally { try { handle.close(); } catch { /* already closed on failure */ } key.fill(0); }
}

async function* readLines(file: File): AsyncGenerator<string> {
  if (!file.size || file.size > 2 * 1024 * 1024 * 1024) throw new Error("Choose a valid backup under 2 GB.");
  const handle = file.open(); let pending = "";
  try {
    while ((handle.offset || 0) < file.size) {
      // Archive bytes are ASCII. Fixed chunks keep restore memory bounded.
      pending += new TextDecoder().decode(handle.readBytes(65536));
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) { yield pending.slice(0, newline); pending = pending.slice(newline + 1); }
      if (pending.length > 600000) throw new Error("Invalid backup record size.");
    }
    if (pending) throw new Error("Backup is incomplete.");
  } finally { handle.close(); }
}
export async function restorePrivateBackup(userId: string, uri: string, recoveryKey: string): Promise<void> {
  const key = unhex(recoveryKey.replace(/\s/g, ""));
  if (key.length !== 32) throw new Error("Enter the complete recovery key saved with this backup.");
  const iterator = decodeBackup(key, userId, readLines(new File(uri)))[Symbol.asyncIterator]();
  try {
    const first = await iterator.next();
    const descriptor = (first.value as { descriptor?: VaultDescriptor })?.descriptor;
    if (first.done || !descriptor || descriptor.version !== 1 || !/^[0-9a-f]{64}$/.test(descriptor.localKey)) throw new Error("Invalid backup identity.");
    validateIdentity(descriptor.identity, userId);
    // New DB and primary-device ID: interrupted restores cannot replace a
    // working history, and the old device cannot consume the new device's inbox.
    const staged = await createVaultDatabase({ ...descriptor, database: `cp-private-${newId()}.db`, deviceId: newId() });
    try {
      await staged.transaction(async tx => {
        while (true) {
          const next = await iterator.next(); if (next.done) break;
          const row = (next.value as { row?: VaultRow })?.row;
          if (!row || ![row.kind, row.id, row.room, row.sort, row.value].every(v => typeof v === "string") || row.kind.length > 50 || row.id.length > 150 || row.room.length > 100 || row.sort.length > 100 || row.value.length > 280000) throw new Error("Invalid history record.");
          staged.decode(row); // Authenticate inner records as well as the archive.
          await tx.runAsync("INSERT INTO records(kind,id,room,sort,value) VALUES (?,?,?,?,?)", row.kind, row.id, row.room, row.sort, row.value);
        }
      });
      const current = await openVault(userId);
      if (fingerprint(current.descriptor.identity) === fingerprint(descriptor.identity)) {
        // Preserve newer history already on this phone. Re-encrypt it under the
        // restored vault key rather than silently hiding messages newer than the backup.
        await staged.transaction(async tx => {
          for await (const row of current.db.getEachAsync<VaultRow>("SELECT * FROM records ORDER BY kind,id")) {
            if (row.kind === "meta" && row.id === "registered-device") continue;
            const saved = await tx.getFirstAsync<VaultRow>("SELECT * FROM records WHERE kind=? AND id=?", row.kind, row.id);
            const merged = mergeRestoredValue(row.kind, current.decode(row), saved ? staged.decode(saved) : null);
            const restored = staged.encode(row.kind, row.id, merged, row.room, row.sort > (saved?.sort || "") ? row.sort : saved?.sort || row.sort);
            await tx.runAsync("INSERT INTO records(kind,id,room,sort,value) VALUES (?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET room=excluded.room,sort=excluded.sort,value=excluded.value", restored.kind, restored.id, restored.room, restored.sort, restored.value);
          }
        });
      }
      await activateRestoredVault(userId, staged);
    } catch (error) { await staged.db.closeAsync(); throw error; }
  } finally { key.fill(0); await iterator.return?.(undefined); }
}

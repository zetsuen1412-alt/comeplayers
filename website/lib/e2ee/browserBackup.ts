import type { BrowserVault, BrowserVaultRow } from "./browserVault";
import { decryptJson, digest, encryptJson, newId, unhex, utf8 } from "./crypto";

export const DRIVE_BACKUP_KEY_KIND = "drive-backup-key-v1";
export const BROWSER_BACKUP_FORMAT = "comeplayers-browser-history";
export const BROWSER_BACKUP_VERSION = 3;
const MAX_RECORDS = 250_000;
const MAX_LINE = 16 * 1024 * 1024;
export const MAX_BROWSER_BACKUP_BYTES = 1024 * 1024 * 1024;

const JSON_KINDS = new Set([
  "message-v2",
  "history-event-v2",
  "conversation-key",
  "conversation-epoch",
  "root-pin-v2",
  "room",
  "legacy-cursor-v2",
  "legacy-complete-v2",
  "meta",
]);

export type BrowserBackupHeader = {
  format: typeof BROWSER_BACKUP_FORMAT;
  version: typeof BROWSER_BACKUP_VERSION;
  account: string;
  rootFingerprint: string;
  id: string;
  createdAt: string;
};

export type BrowserBackupRecord = {
  kind: string;
  id: string;
  room: string;
  sort: string;
  value: unknown;
};

function keyBytes(recoveryKey: string): Uint8Array {
  const normalized = recoveryKey.replace(/\s/g, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Passkey tidak menghasilkan kunci backup yang valid.");
  }
  return unhex(normalized);
}

function validateAccount(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Akun backup tidak valid.");
}

function validateRootFingerprint(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error("Identitas enkripsi backup tidak valid.");
}

function validateRecord(value: unknown): BrowserBackupRecord {
  if (!value || typeof value !== "object") throw new Error("Catatan backup tidak valid.");
  const row = value as Partial<BrowserBackupRecord>;
  if (
    typeof row.kind !== "string" ||
    !JSON_KINDS.has(row.kind) ||
    typeof row.id !== "string" ||
    !row.id ||
    row.id.length > 180 ||
    typeof row.room !== "string" ||
    row.room.length > 120 ||
    typeof row.sort !== "string" ||
    row.sort.length > 120 ||
    row.value === undefined
  ) {
    throw new Error("Backup berisi data yang tidak dapat dipulihkan.");
  }
  const encoded = JSON.stringify(row.value);
  if (encoded === undefined || encoded.length > 2_000_000) {
    throw new Error("Salah satu catatan backup terlalu besar.");
  }
  if (row.kind === "conversation-key" && (typeof row.value !== "string" || !/^[0-9a-f]{64}$/i.test(row.value))) {
    throw new Error("Kunci percakapan pada backup tidak valid.");
  }
  return row as BrowserBackupRecord;
}

export async function* encodeBrowserBackupLines(
  recoveryKey: string,
  userId: string,
  rootFingerprint: string,
  records: AsyncIterable<BrowserBackupRecord>,
): AsyncGenerator<string> {
  validateAccount(userId);
  validateRootFingerprint(rootFingerprint);
  const key = keyBytes(recoveryKey);
  const header: BrowserBackupHeader = {
    format: BROWSER_BACKUP_FORMAT,
    version: BROWSER_BACKUP_VERSION,
    account: userId,
    rootFingerprint,
    id: newId(),
    createdAt: new Date().toISOString(),
  };
  const first = JSON.stringify(header);
  yield first + "\n";
  let chain = digest(utf8(first));
  let index = 0;
  try {
    for await (const raw of records) {
      if (index >= MAX_RECORDS) throw new Error("Backup berisi terlalu banyak catatan.");
      const row = validateRecord(raw);
      const line = encryptJson(key, { type: "record", value: row }, `${first}:${index}:${chain}`);
      if (line.length > MAX_LINE) throw new Error("Salah satu catatan backup terlalu besar.");
      yield line + "\n";
      chain = digest(utf8(line));
      index += 1;
    }
    const footer = encryptJson(key, { type: "end", count: index }, `${first}:${index}:${chain}`);
    yield footer + "\n";
  } finally {
    key.fill(0);
  }
}

export async function* decodeBrowserBackupLines(
  recoveryKey: string,
  userId: string,
  rootFingerprint: string,
  lines: AsyncIterable<string>,
): AsyncGenerator<BrowserBackupRecord> {
  validateAccount(userId);
  validateRootFingerprint(rootFingerprint);
  const key = keyBytes(recoveryKey);
  const iterator = lines[Symbol.asyncIterator]();
  try {
    const first = await iterator.next();
    if (first.done || first.value.length > 1024) throw new Error("Header backup tidak valid.");
    const header = JSON.parse(first.value) as Partial<BrowserBackupHeader>;
    if (
      header.format !== BROWSER_BACKUP_FORMAT ||
      header.version !== BROWSER_BACKUP_VERSION ||
      header.account !== userId ||
      header.rootFingerprint !== rootFingerprint ||
      typeof header.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(header.id) ||
      typeof header.createdAt !== "string" ||
      !Number.isFinite(Date.parse(header.createdAt))
    ) {
      throw new Error("Backup ini bukan milik akun atau identitas enkripsi yang sedang digunakan.");
    }
    let chain = digest(utf8(first.value));
    let index = 0;
    let finished = false;
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      const line = next.value;
      if (finished || !line || line.length > MAX_LINE || index > MAX_RECORDS) {
        throw new Error("Catatan backup tidak valid.");
      }
      const decoded = decryptJson<{ type?: string; value?: unknown; count?: number }>(
        key,
        line,
        `${first.value}:${index}:${chain}`,
      );
      if (decoded.type === "end" && decoded.count === index) {
        finished = true;
      } else if (decoded.type === "record") {
        const row = validateRecord(decoded.value);
        yield row;
        chain = digest(utf8(line));
        index += 1;
      } else {
        throw new Error("Catatan backup tidak valid.");
      }
    }
    if (!finished) throw new Error("Backup tidak lengkap. Riwayat belum dipulihkan.");
  } finally {
    key.fill(0);
    await iterator.return?.();
  }
}

async function* vaultRecords(vault: BrowserVault): AsyncGenerator<BrowserBackupRecord> {
  for (const kind of JSON_KINDS) {
    const rows = await vault.list<unknown>(kind);
    for (const row of rows) {
      yield {
        kind: row.kind,
        id: row.id,
        room: row.room,
        sort: row.sort,
        value: row.value,
      };
    }
  }
}

export async function exportBrowserBackup(vault: BrowserVault, recoveryKey: string): Promise<Blob> {
  const chunks: string[] = [];
  let size = 0;
  for await (const line of encodeBrowserBackupLines(
    recoveryKey,
    vault.userId,
    vault.checkpoint.rootFingerprint,
    vaultRecords(vault),
  )) {
    size += line.length;
    if (size > MAX_BROWSER_BACKUP_BYTES) {
      throw new Error("Backup browser melebihi batas 1 GB.");
    }
    chunks.push(line);
  }
  return new Blob(chunks, { type: "application/octet-stream" });
}

async function* blobLines(blob: Blob): AsyncGenerator<string> {
  if (!blob.size || blob.size > MAX_BROWSER_BACKUP_BYTES) {
    throw new Error("Pilih backup ComePlayers yang lengkap di bawah 1 GB.");
  }
  const reader = blob.stream().getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      pending += decoder.decode(result.value, { stream: true });
      let index = pending.indexOf("\n");
      while (index !== -1) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        if (line.length > MAX_LINE) throw new Error("Catatan backup terlalu besar.");
        yield line;
        index = pending.indexOf("\n");
      }
      if (pending.length > MAX_LINE) throw new Error("Catatan backup terlalu besar.");
    }
    pending += decoder.decode();
    if (pending) throw new Error("Backup tidak lengkap.");
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function restoreBrowserBackup(
  vault: BrowserVault,
  blob: Blob,
  recoveryKey: string,
): Promise<{ restored: number; skipped: number }> {
  const current = new Map<string, Map<string, BrowserVaultRow<unknown>>>();
  for (const kind of JSON_KINDS) {
    const rows = await vault.list<unknown>(kind);
    current.set(kind, new Map(rows.map((row) => [row.id, row])));
  }
  let restored = 0;
  let skipped = 0;
  for await (const row of decodeBrowserBackupLines(
    recoveryKey,
    vault.userId,
    vault.checkpoint.rootFingerprint,
    blobLines(blob),
  )) {
    const saved = current.get(row.kind)?.get(row.id);
    if (saved && (!row.sort || saved.sort >= row.sort)) {
      skipped += 1;
      continue;
    }
    await vault.put(row.kind, row.id, row.value, row.room, row.sort);
    current.get(row.kind)?.set(row.id, { ...row });
    restored += 1;
  }
  return { restored, skipped };
}

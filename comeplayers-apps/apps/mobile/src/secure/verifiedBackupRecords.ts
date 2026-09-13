import { fingerprint, type PublicIdentity } from "./crypto";
import { mergeRestoredValue } from "./restoreMerge";

// Device authorization, private device keys, outbox requests and synchronization
// cursors must never be restored from another device's archive.
export const BACKUP_CONTENT_KINDS = new Set([
  "message-v2", "history-event-v2", "conversation-key", "conversation-epoch", "root-pin-v2",
  "room", "media", "media-chunk", "call-history",
]);
export type HistoryBackupRecord = { kind: string; id: string; room: string; sort: string; value: unknown };
export function verifyHistoryBackupIdentity(value: unknown, userId: string, root: PublicIdentity): void {
  const header = value as { format?: string; version?: number; root?: PublicIdentity } | null;
  if (!header || header.format !== "comeplayers-verified-history" || header.version !== 2 ||
    header.root?.userId !== userId || fingerprint(header.root) !== fingerprint(root)) {
    throw new Error("This history backup does not match your verified encryption identity.");
  }
}
export function historyBackupRecord(value: unknown): HistoryBackupRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid backup record.");
  const row = value as HistoryBackupRecord;
  if (!BACKUP_CONTENT_KINDS.has(row.kind) || ![row.id, row.room, row.sort].every(v => typeof v === "string") ||
    !row.id || row.id.length > 150 || row.room.length > 100 || row.sort.length > 100 ||
    row.value === null || row.value === undefined || JSON.stringify(row.value).length > 280000) {
    throw new Error("Invalid or non-transferable history record.");
  }
  if (row.kind === "conversation-key" ? typeof row.value !== "string" || !/^[0-9a-f]{64}$/.test(row.value) :
    row.kind === "media-chunk" ? typeof row.value !== "string" || !/^(?:[0-9a-f]{2}){1,49152}$/.test(row.value) :
    typeof row.value !== "object" || Array.isArray(row.value)) throw new Error("Invalid history record value.");
  return row;
}
export function mergeHistoryBackupRecord(current: unknown, incoming: HistoryBackupRecord): unknown {
  return current === null ? incoming.value : mergeRestoredValue(incoming.kind, current, incoming.value);
}

import { decryptJson, digest, encryptJson, newId, utf8 } from "./crypto";

export type BackupHeader = { format: "comeplayers-backup"; version: 1; account: string; id: string };
const MAX_LINE = 600000;
const MAX_RECORDS = 1000000;
export async function* encodeBackup(key: Uint8Array, account: string, records: AsyncIterable<unknown>): AsyncGenerator<string> {
  const header: BackupHeader = { format: "comeplayers-backup", version: 1, account, id: newId() };
  const first = JSON.stringify(header); yield first + "\n";
  let chain = digest(utf8(first)), index = 0;
  for await (const value of records) {
    if (index >= MAX_RECORDS) throw new Error("Backup contains too many records.");
    const line = encryptJson(key, { type: "record", value }, `${first}:${index}:${chain}`);
    if (line.length > MAX_LINE) throw new Error("Backup record is too large.");
    yield line + "\n"; chain = digest(utf8(line)); index++;
  }
  yield encryptJson(key, { type: "end", count: index }, `${first}:${index}:${chain}`) + "\n";
}
// Callers MUST stage records in a transaction and commit only when the iterator
// completes. The authenticated footer prevents partial/truncated backup restores.
export async function* decodeBackup(key: Uint8Array, account: string, lines: AsyncIterable<string>): AsyncGenerator<unknown> {
  const iterator = lines[Symbol.asyncIterator]();
  try {
  const first = await iterator.next();
  if (first.done || first.value.length > 512) throw new Error("Invalid backup header.");
  const header = JSON.parse(first.value) as BackupHeader;
  if (header.format !== "comeplayers-backup" || header.version !== 1 || header.account !== account || !/^[0-9a-f-]{36}$/.test(header.id)) throw new Error("This backup belongs to another account or version.");
  let chain = digest(utf8(first.value)), index = 0, finished = false;
  while (true) {
    const next = await iterator.next(); if (next.done) break;
    const line = next.value;
    if (finished || !line || line.length > MAX_LINE || index > MAX_RECORDS) throw new Error("Invalid backup records.");
    const record = decryptJson<{ type: string; value?: unknown; count?: number }>(key, line, `${first.value}:${index}:${chain}`);
    if (record.type === "end" && record.count === index) finished = true;
    else if (record.type === "record") { yield record.value; chain = digest(utf8(line)); index++; }
    else throw new Error("Invalid backup record.");
  }
  if (!finished) throw new Error("Backup is incomplete. No history was restored.");
  } finally { await iterator.return?.(); }
}

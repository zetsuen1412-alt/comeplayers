import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeBrowserBackupLines,
  encodeBrowserBackupLines,
  type BrowserBackupRecord,
} from "../lib/e2ee/browserBackup";

const userId = "11111111-1111-4111-8111-111111111111";
const rootFingerprint = "22".repeat(32);
const recoveryKey = "33".repeat(32);

async function* records(values: BrowserBackupRecord[]) {
  for (const value of values) yield value;
}

async function encoded(values: BrowserBackupRecord[]) {
  const result: string[] = [];
  for await (const line of encodeBrowserBackupLines(recoveryKey, userId, rootFingerprint, records(values))) {
    result.push(line.trimEnd());
  }
  return result;
}

async function* lines(values: string[]) {
  for (const value of values) yield value;
}

test("browser E2EE backup round-trips local history without plaintext", async () => {
  const original: BrowserBackupRecord[] = [
    { kind: "message-v2", id: "msg-1", room: "room-1", sort: "2026-09-19T00:00:00.000Z", value: { message: "contoh lokal", starred: true } },
    { kind: "conversation-key", id: "epoch-1", room: "room-1", sort: "1", value: "44".repeat(32) },
    { kind: "meta", id: "secure-history-cursor", room: "", sort: "", value: 42 },
  ];
  const archive = await encoded(original);
  assert.equal(archive[0].includes("contoh lokal"), false);
  assert.equal(archive.slice(1).join("\n").includes("contoh lokal"), false);

  const restored: BrowserBackupRecord[] = [];
  for await (const value of decodeBrowserBackupLines(recoveryKey, userId, rootFingerprint, lines(archive))) {
    restored.push(value);
  }
  assert.deepEqual(restored, original);
});

test("browser E2EE backup is bound to account encryption identity", async () => {
  const archive = await encoded([
    { kind: "room", id: "room-1", room: "", sort: "1", value: { id: "room-1" } },
  ]);
  await assert.rejects(async () => {
    for await (const value of decodeBrowserBackupLines(recoveryKey, userId, "55".repeat(32), lines(archive))) void value;
  }, /identitas enkripsi/i);
});

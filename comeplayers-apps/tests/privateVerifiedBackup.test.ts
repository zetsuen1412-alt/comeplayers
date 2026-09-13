import test from "node:test";
import assert from "node:assert/strict";
import { createIdentity, publicIdentity, random } from "../apps/mobile/src/secure/crypto";
import { encodeBackup, decodeBackup } from "../apps/mobile/src/secure/backupFormat";
import { historyBackupRecord, mergeHistoryBackupRecord, verifyHistoryBackupIdentity } from "../apps/mobile/src/secure/verifiedBackupRecords";
import { checkBackupCancellation } from "../apps/mobile/src/secure/backupCancellation";
const user = "11111111-1111-4111-8111-111111111111";
test("cancellation works with the React Native AbortSignal surface", () => {
  assert.doesNotThrow(() => checkBackupCancellation({ aborted: false } as AbortSignal));
  assert.throws(() => checkBackupCancellation({ aborted: true } as AbortSignal), { name: "AbortError" });
});
async function* iterable<T>(values: T[]) { yield* values; }
test("verified archive binds account root and excludes device authorization", () => {
  const root = createIdentity(user);
  const header = { format: "comeplayers-verified-history", version: 2, root: publicIdentity(root) };
  assert.doesNotThrow(() => verifyHistoryBackupIdentity(header, user, root));
  assert.throws(() => verifyHistoryBackupIdentity(header, user, createIdentity(user)));
  for (const kind of ["account-roster", "root-recovery-v2", "history-pending-v2", "meta"]) {
    assert.throws(() => historyBackupRecord({ kind, id: "x", room: "", sort: "", value: {} }));
  }
});
test("archive supports actual media strings and epoch keys, rejects malformed values", () => {
  for (const [kind, value] of [["media-chunk", "aabb"], ["conversation-key", "ab".repeat(32)]]) {
    assert.equal(historyBackupRecord({ kind, id: "x", room: "", sort: "", value }).value, value);
  }
  assert.throws(() => historyBackupRecord({ kind: "media-chunk", id: "x", room: "", sort: "", value: "bad hex" }));
});
test("v2 message import preserves deletions, newest edits and read receipts", () => {
  const incoming = historyBackupRecord({ kind: "message-v2", id: "m", room: "r", sort: "", value: { message: "old", delivery: "read", created_at: "2026-09-01" } });
  const merged = mergeHistoryBackupRecord({ message: null, deleted_at: "2026-09-02", delivery: "sent" }, incoming) as { message: unknown; delivery: string };
  assert.equal(merged.message, null); assert.equal(merged.delivery, "read");
});
test("verified history archive authenticates footer and key before transaction commit", async () => {
  const key = random(), root = createIdentity(user);
  const records = [{ format: "comeplayers-verified-history", version: 2, root: publicIdentity(root) }, { kind: "media-chunk", id: "x", room: "", sort: "", value: "aabb" }];
  const lines: string[] = [];
  for await (const line of encodeBackup(key, user, iterable(records))) lines.push(line.trimEnd());
  async function restore(input: string[], secret = key) { const staged = []; for await (const value of decodeBackup(secret, user, iterable(input))) staged.push(value); return staged; }
  assert.deepEqual(await restore(lines), records);
  await assert.rejects(restore(lines.slice(0, -1)), /incomplete/);
  await assert.rejects(restore(lines, random()));
});

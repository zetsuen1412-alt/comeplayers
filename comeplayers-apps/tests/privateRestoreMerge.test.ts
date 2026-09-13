import test from "node:test";
import assert from "node:assert/strict";
import { mergeRestoredValue } from "../apps/mobile/src/secure/restoreMerge";
test("restore preserves the latest edit and monotonic delivery/read state", () => {
  const old = { message: "old", created_at: "2026-09-01", delivery: "read", is_read: true };
  const edited = { message: "edited", created_at: "2026-09-01", edited_at: "2026-09-03", delivery: "sent" };
  for (const [a,b] of [[old,edited],[edited,old]]) {
    const result = mergeRestoredValue("message",a,b) as typeof old;
    assert.equal(result.message,"edited"); assert.equal(result.delivery,"read"); assert.equal(result.is_read,true);
  }
});
test("restore cannot resurrect deleted messages or rewind completed calls", () => {
  const deleted = { message: null, deleted_at: "2026-09-02" };
  assert.equal((mergeRestoredValue("message", { message: "edit", edited_at: "2026-09-03" }, deleted) as typeof deleted).message,null);
  const ended = { status:"ended", ended_at:"2026-09-03" };
  assert.deepEqual(mergeRestoredValue("call-history",{status:"accepted",answered_at:"2026-09-02"},ended),ended);
});

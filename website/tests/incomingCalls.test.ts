import assert from "node:assert/strict";
import test from "node:test";
import { selectIncomingCall, type IncomingCall } from "../lib/incomingCalls";
const now = Date.now();
const call: IncomingCall = { id: "call", room_id: "unopened-room", caller_id: "alice", callee_id: "bob", media: "video", status: "ringing", secure_event_id: null, created_at: new Date(now - 1000).toISOString() };
test("discovers account incoming calls regardless of selected conversation", () => {
  assert.equal(selectIncomingCall([call], "bob", now)?.room_id, "unopened-room");
});
test("excludes outgoing, expired, ended and retired encrypted calls", () => {
  assert.equal(selectIncomingCall([call], "alice", now), null);
  for (const changed of [{ status: "ended" }, { secure_event_id: "secure" }, { encryption_envelope: {} }, { created_at: new Date(now - 61000).toISOString() }, { created_at: "invalid" }]) {
    assert.equal(selectIncomingCall([{ ...call, ...changed }], "bob", now), null);
  }
});

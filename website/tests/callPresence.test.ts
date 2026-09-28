import assert from "node:assert/strict";
import test from "node:test";
import { activeCallFilter, selectCurrentAccountCall, visibleCallStatus } from "../lib/callPresence";

const user = "11111111-1111-4111-8111-111111111111";
const current = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-09-28T12:00:00.000Z");

test("active call query scopes every status and current-id branch to the authenticated user", () => {
  const filter = activeCallFilter(user, current, now);
  const branches = filter.match(/and\([^)]*\)/g) || [];
  assert.equal(branches.length, 6);
  assert.ok(branches.every(branch => branch.includes(`caller_id.eq.${user}`) || branch.includes(`callee_id.eq.${user}`)));
  assert.equal(branches.filter(branch => branch.includes(`id.eq.${current}`)).length, 2);
  assert.equal(branches.filter(branch => branch.includes("created_at.gte.")).length, 2);
  assert.equal(branches.filter(branch => branch.includes("answered_at.gte.")).length, 2);
  assert.equal(activeCallFilter(user, "not-a-uuid", now).match(/and\(/g)?.length, 4);
});

test("expired ringing and accepted calls stop appearing active without writes on every poll", () => {
  const ringing = { id: current, room_id: "room", status: "ringing", created_at: new Date(now - 61_000).toISOString(), answered_at: null };
  assert.equal(visibleCallStatus(ringing, now).status, "missed");
  assert.equal(visibleCallStatus({ ...ringing, created_at: new Date(now - 1_000).toISOString() }, now).status, "ringing");
  const accepted = { ...ringing, status: "accepted", answered_at: new Date(now - 3_600_001).toISOString() };
  assert.equal(visibleCallStatus(accepted, now).status, "ended");
  assert.equal(visibleCallStatus({ ...accepted, answered_at: new Date(now - 1_000).toISOString() }, now).status, "accepted");
});

test("conversation call selection ignores terminal and retired encrypted calls", () => {
  const base = { id: current, room_id: "room", status: "ringing", created_at: new Date(now).toISOString() };
  const legacy = { ...base, id: "legacy", secure_event_id: "old-event" };
  const ended = { ...base, status: "ended" };
  const active = { ...base, id: "new" };
  assert.deepEqual(selectCurrentAccountCall([legacy, ended, active], "room", current), active);
  assert.equal(selectCurrentAccountCall([legacy, ended], "room", current), null);
  assert.equal(selectCurrentAccountCall([active], "another-room"), null);
});

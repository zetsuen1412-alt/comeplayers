import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRecoveryPolicy, needsRecoveryReset, readRecoveryGeneration, recoveryGenerationKey, recoveryHeaders, validateDeviceReplacement, assertLocalAccountMatch } from "../lib/e2ee/recoveryPolicy";
const reset = { generation: 1, resetAt: "2026-09-15T00:00:00.000Z", requirePasskey: true };
test("old server metadata is non-destructive", () => { assert.equal(needsRecoveryReset(parseRecoveryPolicy(undefined), 0), false); });
test("a reset is applied only once per account generation", () => { assert.equal(needsRecoveryReset(reset, 0), true); assert.equal(needsRecoveryReset(reset, 1), false); });
test("a stale server cannot roll back the checkpoint", () => { assert.throws(() => needsRecoveryReset(parseRecoveryPolicy(undefined), 1), /backwards/); });
test("malformed policy is rejected before storage changes", () => { for (const value of [null, {}, [], { ...reset, generation: -1 }, { ...reset, generation: 1.2 }, { ...reset, resetAt: null }, { ...reset, requirePasskey: false }]) assert.throws(() => parseRecoveryPolicy(value)); });
test("local checkpoints are validated", () => { assert.equal(readRecoveryGeneration(null), 0); assert.equal(readRecoveryGeneration("1"), 1); for (const value of ["NaN", "-1", "1e3", "01", "1.2", ""]) assert.throws(() => readRecoveryGeneration(value)); });
test("storage is scoped to the account, not all app storage", () => { const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"; assert.notEqual(recoveryGenerationKey(a), recoveryGenerationKey(b)); assert.throws(() => recoveryGenerationKey("../anything")); });
test("transport metadata contains no encryption secret", () => { assert.deepEqual(recoveryHeaders(reset), { "x-cp-recovery-client": "1", "x-cp-recovery-generation": "1" }); });
test("device limit requires an explicit valid selection", () => { const ids = Array.from({ length: 8 }, (_, i) => String(i)); assert.throws(() => validateDeviceReplacement(ids, [])); validateDeviceReplacement(ids, ["0"]); assert.throws(() => validateDeviceReplacement(ids, ["missing"])); assert.throws(() => validateDeviceReplacement(ids, ["0", "0"])); });
test("missing account or identity mismatch does not silently reset local history", () => { assert.throws(() => assertLocalAccountMatch("old", null, "d", []), /preserved/); assert.throws(() => assertLocalAccountMatch("old", "other", "d", ["d"]), /preserved/); assert.throws(() => assertLocalAccountMatch("root", "root", "d", []), /no longer authorized/); assert.doesNotThrow(() => assertLocalAccountMatch("root", "root", "d", ["d"])); });

test("automatic device setup is an additive capability, not a reset", () => { const next = parseRecoveryPolicy({ ...reset, allowDeviceSetup: true }); assert.equal(next.allowDeviceSetup, true); assert.equal(needsRecoveryReset(next, 1), false); assert.throws(() => parseRecoveryPolicy({ ...reset, allowDeviceSetup: "true" })); });

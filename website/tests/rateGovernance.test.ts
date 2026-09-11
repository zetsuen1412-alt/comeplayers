import assert from "node:assert/strict";
import test from "node:test";
import { approvalProgress, normalizeRateProposal } from "@/lib/rateGovernance";

test("normalizes a global marketplace fee proposal", () => {
  const result = normalizeRateProposal({
    rateType: "marketplace_fee",
    ratePercent: 7.12555,
    effectiveFrom: "2026-07-01T00:00:00Z",
    sourceReference: "Owner pricing policy 2026-07",
    reason: "Updated marketplace operating cost",
  });
  assert.equal(result.ratePercent, 7.1256);
  assert.equal(result.fixedAmount, 0);
  assert.equal(result.countryCode, null);
});

test("withdrawal tax proposal requires jurisdiction dimensions", () => {
  assert.throws(() => normalizeRateProposal({
    rateType: "withdrawal_tax",
    ratePercent: 2,
    fixedAmount: 1,
    effectiveFrom: "2026-07-01T00:00:00Z",
    sourceReference: "Tax rule",
    reason: "New rule",
  }), /country code/i);
});

test("two distinct approvers excluding requester complete governance", () => {
  assert.deepEqual(
    approvalProgress({ requestedBy: "requester", firstApprovedBy: "admin-a", secondApprovedBy: "admin-b" }),
    { approvals: 2, complete: true, approvers: ["admin-a", "admin-b"] }
  );
  assert.equal(approvalProgress({ requestedBy: "admin-a", firstApprovedBy: "admin-a", secondApprovedBy: "admin-b" }).complete, false);
});

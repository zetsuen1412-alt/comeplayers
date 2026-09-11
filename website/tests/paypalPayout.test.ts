import assert from "node:assert/strict";
import test from "node:test";
import { buildPayPalPayoutRequest, normalizePayPalPayoutStatus } from "@/lib/paypalPayout";

test("PayPal payout request uses deterministic sender identifiers", () => {
  const request = buildPayPalPayoutRequest({
    batchId: "cp-wd-42-request",
    recipient: { withdrawalId: 42, receiver: "seller@example.com", amount: 12.5, currency: "usd" },
  });
  assert.equal(request.sender_batch_header.sender_batch_id, "cp-wd-42-request");
  assert.equal(request.items[0].sender_item_id, "withdrawal-42");
  assert.deepEqual(request.items[0].amount, { value: "12.50", currency: "USD" });
});

test("PayPal payout statuses map to marketplace terminal states", () => {
  assert.equal(normalizePayPalPayoutStatus("SUCCESS"), "paid");
  assert.equal(normalizePayPalPayoutStatus("RETURNED"), "failed");
  assert.equal(normalizePayPalPayoutStatus("PENDING"), "processing");
  assert.equal(normalizePayPalPayoutStatus("mystery"), "unknown");
});

import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeLogData } from "../lib/observability";

test("structured logging redacts sensitive keys recursively", () => {
  const sanitized = sanitizeLogData({
    orderId: 12,
    authorization: "Bearer secret",
    nested: {
      payout_account_number: "123456789",
      safe: "visible",
    },
  }) as Record<string, unknown>;

  assert.equal(sanitized.authorization, "[REDACTED]");
  assert.deepEqual(sanitized.nested, {
    payout_account_number: "[REDACTED]",
    safe: "visible",
  });
  assert.equal(sanitized.orderId, 12);
});

test("structured logging truncates oversized strings", () => {
  const sanitized = sanitizeLogData({ message: "x".repeat(2100) }) as {
    message: string;
  };

  assert.equal(sanitized.message.length, 2001);
  assert.equal(sanitized.message.endsWith("…"), true);
});

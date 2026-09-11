import assert from "node:assert/strict";
import test from "node:test";
import { comparePayPalProviderCapture } from "@/lib/paypalProviderReconciliation";

const local = {
  transactionId: "9",
  marketplaceOrderId: "101",
  captureId: "CAPTURE-1",
  amountUsd: 12.5,
  transactionStatus: "completed",
  orderPaymentStatus: "paid",
  orderStatus: "paid",
};

test("provider reconciliation matches an equivalent completed capture", () => {
  const result = comparePayPalProviderCapture(local, {
    id: "CAPTURE-1",
    status: "COMPLETED",
    amount: { currency_code: "USD", value: "12.50" },
  });
  assert.equal(result.status, "matched");
  assert.equal(result.mismatches.length, 0);
});

test("provider reconciliation flags amount and currency discrepancies", () => {
  const result = comparePayPalProviderCapture(local, {
    id: "CAPTURE-1",
    status: "COMPLETED",
    amount: { currency_code: "EUR", value: "10.00" },
  });
  assert.equal(result.status, "mismatch");
  assert.equal(result.severity, "critical");
  assert.deepEqual(
    result.mismatches.map((item) => item.field).sort(),
    ["amount_usd", "currency"]
  );
});

test("refunded provider state matches a locally refunded order", () => {
  const result = comparePayPalProviderCapture(
    { ...local, transactionStatus: "refunded", orderPaymentStatus: "refunded" },
    {
      id: "CAPTURE-1",
      status: "REFUNDED",
      amount: { currency_code: "USD", value: "12.50" },
    }
  );
  assert.equal(result.status, "matched");
});

test("provider refund not reflected locally is a critical mismatch", () => {
  const result = comparePayPalProviderCapture(local, {
    id: "CAPTURE-1",
    status: "REFUNDED",
    amount: { currency_code: "USD", value: "12.50" },
  });
  assert.equal(result.status, "mismatch");
  assert.equal(result.severity, "critical");
  assert.equal(result.mismatches[0]?.field, "provider_status");
});

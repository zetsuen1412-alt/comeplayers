import assert from "node:assert/strict";
import test from "node:test";
import {
  getMarketplaceOrderId,
  getPayPalEventIdentity,
} from "../lib/paypalWebhook";
import { webhookResultIsFinal } from "../lib/webhookInbox";

test("PayPal webhook extracts marketplace order from custom_id", () => {
  assert.equal(
    getMarketplaceOrderId({ resource: { custom_id: "481:buyer-checkout" } }),
    481
  );
});

test("PayPal webhook falls back to ComePlayers invoice ID", () => {
  assert.equal(
    getMarketplaceOrderId({ resource: { invoice_id: "CP-902-20260630" } }),
    902
  );
});

test("PayPal webhook identity is trimmed and bounded", () => {
  const identity = getPayPalEventIdentity({
    id: `  ${"a".repeat(250)}  `,
    event_type: "  PAYMENT.CAPTURE.COMPLETED  ",
  });

  assert.equal(identity.eventId.length, 200);
  assert.equal(identity.eventType, "PAYMENT.CAPTURE.COMPLETED");
});

test("only processed and ignored webhook states are final", () => {
  assert.equal(webhookResultIsFinal("processed"), true);
  assert.equal(webhookResultIsFinal("ignored"), true);
  assert.equal(webhookResultIsFinal("failed"), false);
  assert.equal(webhookResultIsFinal("processing"), false);
});

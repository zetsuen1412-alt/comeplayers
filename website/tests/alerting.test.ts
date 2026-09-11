import assert from "node:assert/strict";
import test from "node:test";
import {
  createAlertFingerprint,
  severityAtLeast,
} from "../lib/alerting";

test("alert severity ordering protects high-priority routes", () => {
  assert.equal(severityAtLeast("critical", "high"), true);
  assert.equal(severityAtLeast("high", "high"), true);
  assert.equal(severityAtLeast("warning", "high"), false);
  assert.equal(severityAtLeast("info", "warning"), false);
});

test("alert fingerprints are stable and normalized", () => {
  const left = createAlertFingerprint(["PayPal", "Webhook", 123]);
  const right = createAlertFingerprint([" paypal ", "webhook", "123"]);
  const different = createAlertFingerprint(["PayPal", "Webhook", 124]);

  assert.equal(left, right);
  assert.notEqual(left, different);
  assert.match(left, /^[a-f0-9]{48}$/);
});

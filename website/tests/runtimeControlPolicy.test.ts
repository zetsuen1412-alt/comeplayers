import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutBucket,
  evaluateCheckoutAccess,
  type CheckoutControl,
} from "@/lib/runtimeControlPolicy";

function control(overrides: Partial<CheckoutControl> = {}): CheckoutControl {
  return {
    key: "checkout",
    mode: "enabled",
    percentage: 100,
    message: "Maintenance",
    allowlist: [],
    source: "default",
    ...overrides,
  };
}

test("checkout bucket is deterministic and bounded", () => {
  const first = checkoutBucket("user-123");
  assert.equal(first, checkoutBucket("user-123"));
  assert.ok(first >= 0 && first < 100);
});

test("disabled checkout rejects every user including allowlisted users", () => {
  const result = evaluateCheckoutAccess(
    control({ mode: "disabled", percentage: 0, allowlist: ["user-1"] }),
    "user-1"
  );
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "checkout_disabled");
});

test("canary allocation consistently allows or rejects by bucket", () => {
  const userId = "stable-canary-user";
  const bucket = checkoutBucket(userId);
  const allowed = evaluateCheckoutAccess(
    control({ mode: "canary", percentage: bucket + 1 }),
    userId
  );
  const rejected = evaluateCheckoutAccess(
    control({ mode: "canary", percentage: bucket }),
    userId
  );
  assert.equal(allowed.allowed, true);
  assert.equal(rejected.allowed, false);
});

test("canary allowlist bypasses percentage allocation", () => {
  const result = evaluateCheckoutAccess(
    control({ mode: "canary", percentage: 0, allowlist: ["vip-user"] }),
    "vip-user"
  );
  assert.equal(result.allowed, true);
  assert.equal(result.allowlisted, true);
});

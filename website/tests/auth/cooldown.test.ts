import assert from "node:assert/strict";
import test from "node:test";
import {
  createCooldownDeadline,
  getCooldownSeconds,
  isRateLimitMessage,
} from "../../lib/auth/cooldown";

test("cooldown seconds round up and never become negative", () => {
  assert.equal(getCooldownSeconds(12_001, 10_000), 3);
  assert.equal(getCooldownSeconds(9_000, 10_000), 0);
});

test("cooldown deadline uses the requested duration", () => {
  assert.equal(createCooldownDeadline(60, 1_000), 61_000);
});

test("common provider rate-limit messages are detected", () => {
  assert.equal(isRateLimitMessage("Email rate limit exceeded"), true);
  assert.equal(isRateLimitMessage("Too many requests"), true);
  assert.equal(isRateLimitMessage("Invalid login credentials"), false);
});

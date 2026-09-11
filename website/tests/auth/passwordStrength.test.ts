import assert from "node:assert/strict";
import test from "node:test";
import { getPasswordStrength } from "../../lib/auth/passwordStrength";

test("empty passwords are very weak", () => {
  const result = getPasswordStrength("");
  assert.equal(result.score, 0);
  assert.equal(result.label, "Very weak");
});

test("a complete password satisfies all checks", () => {
  const result = getPasswordStrength("ComePlayers!2026");
  assert.equal(result.score, 4);
  assert.equal(result.label, "Very strong");
  assert.deepEqual(result.checks, {
    minimumLength: true,
    mixedCase: true,
    number: true,
    symbol: true,
  });
});

test("long lowercase passwords remain below strong", () => {
  const result = getPasswordStrength("onlylowercasepassword");
  assert.equal(result.checks.minimumLength, true);
  assert.equal(result.checks.mixedCase, false);
  assert.ok(result.score < 3);
});

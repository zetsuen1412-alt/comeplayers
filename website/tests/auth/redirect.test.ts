import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthCallbackUrl,
  resolveAuthCallbackAction,
  sanitizeAuthRedirect,
} from "../../lib/auth/redirect";

test("auth redirects only allow local application paths", () => {
  assert.equal(sanitizeAuthRedirect("/reset-password"), "/reset-password");
  assert.equal(sanitizeAuthRedirect("/orders/123?from=auth"), "/orders/123?from=auth");
  assert.equal(sanitizeAuthRedirect("https://evil.example/reset"), "/");
  assert.equal(sanitizeAuthRedirect("//evil.example/reset"), "/");
  assert.equal(sanitizeAuthRedirect("/api/admin/users"), "/");
  assert.equal(sanitizeAuthRedirect("/_next/static/app.js"), "/");
  assert.equal(sanitizeAuthRedirect("/auth/confirm?next=/marketplace"), "/");
});

test("auth callback URL preserves a sanitized next path", () => {
  const callback = new URL(
    buildAuthCallbackUrl("https://comeplayers.example", "/reset-password")
  );

  assert.equal(callback.origin, "https://comeplayers.example");
  assert.equal(callback.pathname, "/auth/confirm");
  assert.equal(callback.searchParams.get("next"), "/reset-password");
});

test("only a fresh signup token can show the verification success screen", () => {
  assert.deepEqual(resolveAuthCallbackAction(null, null), {
    kind: "resume-session",
  });
  assert.deepEqual(resolveAuthCallbackAction("signup-token", "signup"), {
    kind: "verify-signup",
    type: "signup",
  });
  assert.deepEqual(resolveAuthCallbackAction("recovery-token", "recovery"), {
    kind: "verify-and-redirect",
    type: "recovery",
  });
  assert.equal(resolveAuthCallbackAction(null, "signup").kind, "invalid");
});

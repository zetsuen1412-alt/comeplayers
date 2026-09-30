import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { normalizePhone, phoneCountries } from "../lib/phoneNumbers";
import { confirmedPhone, phoneRequirementEnabled, requireVerifiedPhone } from "../lib/phoneVerification";
import { phoneOtpChannels } from "../lib/phoneOtpLimits";
import { GET as phoneOptions, POST as changePhone } from "../app/api/account/phone/route";
import { GET as preferences, PATCH as updatePreferences } from "../app/api/account/preferences/route";
import { GET as avatarProfile } from "../app/api/account/avatar/route";
import type { User } from "@supabase/supabase-js";

const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const user = { id: userId, email: "player@example.test", phone: "", factors: [], app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" } as User;
function request(body: Record<string, unknown>, token = "fixture-token") {
  return new Request("https://app.example.test/api/account/phone", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}
type Call = { path: string; method: string; body: Record<string, unknown> | null; select: string | null };
function fixture(t: TestContext, authUser = user, savedPhone: string | null = null, phoneRequired = false) {
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test", SUPABASE_SERVICE_ROLE_KEY: "service-test", PHONE_OTP_ENABLED: "false" };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const calls: Call[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method, body, select: new URL(String(input)).searchParams.get("select") });
    if (path === "/auth/v1/user" && method === "GET") return Response.json(authUser);
    if (method === "POST" && ["/rest/v1/user_account_settings", "/rest/v1/cp_messaging_settings"].includes(path)) return new Response(null, { status: 201 });
    if (path === "/rest/v1/profiles") return Response.json({ id: userId, username: "player", username_changes: 0, cp_number: "0081234567890" });
    if (path === "/rest/v1/cp_messaging_settings") return Response.json({ phone_country: "ID" });
    if (path === "/rest/v1/user_account_settings") return Response.json({ phone_number: savedPhone });
    if (path === "/rest/v1/cp_platform_settings") return Response.json({ phone_required: phoneRequired });
    throw new Error(`Unexpected external request: ${method} ${path}`);
  });
  return calls;
}

test("Local numbers normalize by country; malformed input cannot become an identity", () => {
  for (const [raw, country, expected] of [["0812 3456 7890", "ID", "+6281234567890"], ["+62 81234567890", "ID", "+6281234567890"], ["07400 123456", "GB", "+447400123456"], ["(202) 555-0199", "US", "+12025550199"], ["06 12 34 56 78", "FR", "+33612345678"]]) assert.equal(normalizePhone(raw, country).e164, expected);
  for (const raw of ["08", "player@example.test", "6281234567890;drop", "+12025550199 ext 1"]) assert.throws(() => normalizePhone(raw));
  assert.throws(() => normalizePhone("081234567890", "ZZ"));
  assert.ok(phoneCountries().length > 200);
  assert.equal(confirmedPhone({ phone: "6281234567890", phone_confirmed_at: undefined }), null);
});

test("OTP is opt-in and sends no requests while disabled", async t => {
  const calls = fixture(t);
  t.mock.method(console, "error", () => undefined);
  assert.deepEqual(phoneOtpChannels(), []);
  assert.equal((await (await phoneOptions()).json()).otpEnabled, false);
  for (const action of ["send", "verify"]) {
    const response = await changePhone(request({ action, phone: "081234567890", country: "ID", code: "123456" }));
    assert.equal(response.status, 503);
  }
  assert.deepEqual(calls.map(c => [c.path, c.method]), [["/auth/v1/user", "GET"], ["/auth/v1/user", "GET"]]);
});

test("Saving a phone binds only the authenticated account and cannot forge verification", async t => {
  const calls = fixture(t);
  const result = await changePhone(request({ action: "save", phone: "081234567890", country: "ID", user_id: otherId, phoneVerified: true, phone_verified: true }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, phone: "+6281234567890", country: "ID", phoneVerified: false });
  const writes = calls.filter(c => c.method !== "GET");
  assert.equal(writes.length, 2);
  for (const write of writes) { assert.equal(write.body?.user_id, userId); assert.equal(write.body?.phone_verified, undefined); assert.equal(write.body?.phoneVerified, undefined); }
  assert.equal(writes[0].body?.phone_number, "+6281234567890");
  assert.ok(writes.every(c => !c.path.includes("user_verifications") && !c.path.includes("/auth/")));
});

test("Phone save requires a session, accepts removal, and rejects invalid numbers", async t => {
  const calls = fixture(t);
  assert.equal((await changePhone(request({ action: "save", phone: "081234567890" }, ""))).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await changePhone(request({ action: "save", phone: "wrong" }))).status, 400);
  const response = await changePhone(request({ action: "save", phone: "", country: "GB" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).phone, null);
  assert.equal(calls.filter(c => c.method === "POST").at(-1)?.body?.phone_country, "GB");
});

test("Saved contact number remains unverified and optional in account preferences", async t => {
  fixture(t, user, "+6281234567890");
  const response = await preferences(new Request("https://app.example.test/api/account/preferences", { headers: { Authorization: "Bearer fixture-token" } }));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.phone, "+6281234567890");
  assert.equal(data.phoneVerified, false);
  assert.equal(data.phoneRequired, false);
  assert.equal(data.verifiedPhone, null);
  assert.equal(await phoneRequirementEnabled(), false);
  await assert.doesNotReject(requireVerifiedPhone(user));
});

test("account preferences and avatar profile expose the permanent CP number as text", async t => {
  const calls = fixture(t);
  for (const handler of [preferences, avatarProfile]) {
    const response = await handler(new Request("https://app.example.test/api/account/preferences", { headers: { Authorization: "Bearer fixture-token" } }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).profile.cp_number, "0081234567890");
  }
  assert.ok(calls.filter(c => c.path === "/rest/v1/profiles").every(c => c.select?.split(",").includes("cp_number")));
});

test("every preference action rejects attempts to change or clear a CP number without writing", async t => {
  const calls = fixture(t);
  for (const action of ["profile", "username", "settings"]) {
    for (const change of [{ cp_number: "0081111111111" }, { cp_number: null }, { cpNumber: "0081111111111" }]) {
      const response = await updatePreferences(request({ action, fullName: "Changed", username: "changed", ...change }));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /CP number is permanent/);
    }
  }
  assert.ok(calls.every(c => c.path === "/auth/v1/user" && c.method === "GET"));
});

test("A verified old number never verifies a different saved number", async t => {
  fixture(t, { ...user, phone: "12025550199", phone_confirmed_at: "2026-01-01T00:00:00Z" }, "+6281234567890");
  const response = await preferences(new Request("https://app.example.test/api/account/preferences", { headers: { Authorization: "Bearer fixture-token" } }));
  const data = await response.json();
  assert.equal(data.phoneVerified, false);
  assert.equal(data.verifiedPhone, "+12025550199");
});

test("Accounts with enrolled MFA cannot edit phone fields from an AAL1 session", async t => {
  const calls = fixture(t, { ...user, factors: [{ id: "factor", factor_type: "totp", status: "verified", created_at: "2026-01-01", updated_at: "2026-01-01" }] });
  const response = await changePhone(request({ action: "save", phone: "081234567890" }));
  assert.equal(response.status, 403);
  assert.equal(calls.filter(c => c.method !== "GET").length, 0);
});

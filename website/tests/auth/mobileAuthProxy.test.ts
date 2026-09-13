import { strict as assert } from "node:assert";
import { test } from "node:test";
import { relayMobileAuth } from "../../lib/auth/mobileAuthProxy";
import { authTransport, authenticationMessage } from "../../../comeplayers-apps/apps/mobile/src/authTransport";

test("mobile Auth relay forwards only the configured project's public Auth API", async () => {
  let calls = 0;
  const transport: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), "https://project.supabase.co/auth/v1/token?grant_type=password");
    assert.equal(new Headers(init?.headers).get("apikey"), "public-key");
    assert.equal(new Headers(init?.headers).has("cookie"), false);
    assert.equal(init?.redirect, "error");
    return Response.json({ access_token: "synthetic-token" });
  };
  const config = { supabaseUrl: "https://project.supabase.co", publicKey: "public-key", fetch: transport };
  for (const route of [["admin", "users"], ["..", "rest"], ["https:", "evil.test"]]) {
    const result = await relayMobileAuth(new Request("https://www.comeplayers.com/api/auth/mobile/token", { method: "POST", body: "{}" }), route, config);
    assert.equal(result.status, 404);
  }
  assert.equal(calls, 0);
  const result = await relayMobileAuth(new Request("https://www.comeplayers.com/api/auth/mobile/token?grant_type=password&url=https://evil.test", {
    method: "POST", body: JSON.stringify({ email: "synthetic@example.test", password: "test-only-password" }), headers: { Cookie: "must-not-forward" },
  }), ["token"], config);
  assert.equal(result.status, 200);
  assert.match(result.headers.get("cache-control")!, /no-store/);
  assert.equal(calls, 1);
});

test("Auth relay rejects oversized bodies and conceals backend connection details", async () => {
  const config = { supabaseUrl: "https://project.supabase.co", publicKey: "public-key", fetch: (async () => { throw new Error("internal hostname"); }) as typeof fetch };
  const oversized = await relayMobileAuth(new Request("https://www.comeplayers.com/api/auth/mobile/token", { method: "POST", body: "x".repeat(40000) }), ["token"], config);
  assert.equal(oversized.status, 413);
  const unavailable = await relayMobileAuth(new Request("https://www.comeplayers.com/api/auth/mobile/token", { method: "POST", body: "{}" }), ["token"], config);
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /internal hostname/);
});

test("mobile transport changes Auth URLs only and preserves login parameters", async () => {
  const urls: string[] = [];
  const transport = authTransport("https://project.supabase.co", "https://www.comeplayers.com", async input => {
    urls.push(String(input)); return Response.json({});
  });
  await transport("https://project.supabase.co/auth/v1/token?grant_type=id_token", { method: "POST", body: "{}" });
  await transport("https://project.supabase.co/rest/v1/profiles");
  await transport("https://different.supabase.co/auth/v1/token");
  assert.deepEqual(urls, ["https://www.comeplayers.com/api/auth/mobile/token?grant_type=id_token", "https://project.supabase.co/rest/v1/profiles", "https://different.supabase.co/auth/v1/token"]);
  assert.doesNotMatch(authenticationMessage(new Error("UnknownHostException: Unable to resolve host private.example")), /private.example|UnknownHost/);
});

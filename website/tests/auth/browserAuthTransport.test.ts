import assert from "node:assert/strict";
import test from "node:test";
import { browserAuthTransport, readableAuthError } from "../../lib/auth/browserAuthTransport";

test("browser sign-in and refresh requests use the allowlisted same-origin relay", async () => {
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push({ url: request.url, method: request.method, body: await request.text() || null });
    return Response.json({ access_token: "synthetic-access-token" });
  };
  const transport = browserAuthTransport("https://project.supabase.co", "https://www.comeplayers.com", fetcher);

  await transport("https://project.supabase.co/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: "example@test.invalid", password: "synthetic-only" }),
  });
  await transport("https://project.supabase.co/auth/v1/token?grant_type=refresh_token", {
    method: "POST", body: JSON.stringify({ refresh_token: "synthetic-refresh" }),
  });
  await transport("https://project.supabase.co/auth/v1/recover", {
    method: "POST", body: "{}",
  });

  assert.deepEqual(calls.map(call => call.url), [
    "https://www.comeplayers.com/api/auth/mobile/token?grant_type=password",
    "https://www.comeplayers.com/api/auth/mobile/token?grant_type=refresh_token",
    "https://www.comeplayers.com/api/auth/mobile/recover",
  ]);
  assert.deepEqual(calls.map(call => call.method), ["POST", "POST", "POST"]);
  assert.match(calls[0].body || "", /synthetic-only/);
});

test("browser transport preserves Request authorization and does not intercept non-Auth URLs", async () => {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    urls.push(request.url);
    if (request.url.includes("/api/auth/mobile/user")) {
      assert.equal(request.headers.get("authorization"), "Bearer synthetic");
    }
    return Response.json({});
  };
  const transport = browserAuthTransport("https://project.supabase.co", "https://www.comeplayers.com", fetcher);
  await transport(new Request("https://project.supabase.co/auth/v1/user", {
    headers: { authorization: "Bearer synthetic" },
  }));
  await transport("https://project.supabase.co/rest/v1/profiles");
  await transport("https://another.supabase.co/auth/v1/token");
  await transport("https://project.supabase.co/auth/v1/admin/users");

  assert.deepEqual(urls, [
    "https://www.comeplayers.com/api/auth/mobile/user",
    "https://project.supabase.co/rest/v1/profiles",
    "https://another.supabase.co/auth/v1/token",
    "https://project.supabase.co/auth/v1/admin/users",
  ]);
});

test("empty or serialized-object login errors have a human-readable message", () => {
  assert.equal(readableAuthError(new Error("{}")), "Sign-in could not be completed. Please try again.");
  assert.equal(readableAuthError({ message: "{}" }), "Sign-in could not be completed. Please try again.");
  assert.equal(readableAuthError({}), "Sign-in could not be completed. Please try again.");
  assert.equal(readableAuthError({ message: "Invalid login credentials" }), "Invalid login credentials");
  assert.match(readableAuthError(new TypeError("Failed to fetch")), /Could not connect/);
});

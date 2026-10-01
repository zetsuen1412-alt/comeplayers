import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  consumePendingDesktopOAuth,
  DESKTOP_OAUTH_CODE_PATTERN,
  DESKTOP_OAUTH_STATE_PATTERN,
  savePendingDesktopOAuth,
} from "../../lib/auth/desktopOAuth";
import { GET } from "../../app/auth/desktop/route";

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  };
}

test("desktop OAuth state is one use, bounded, and keeps redirects local", () => {
  const storage = memoryStorage();
  const state = "a".repeat(43);
  savePendingDesktopOAuth(storage, state, "https://evil.example/", 1000);
  assert.equal(consumePendingDesktopOAuth(storage, "b".repeat(43), 1100), null);
  assert.equal(consumePendingDesktopOAuth(storage, state, 1100), "/");
  assert.equal(consumePendingDesktopOAuth(storage, state, 1100), null);
  savePendingDesktopOAuth(storage, state, "/cpcommunity?tab=messages", 1000);
  assert.equal(consumePendingDesktopOAuth(storage, state, 1000 + 5 * 60 * 1000 + 1), null);
  assert.equal(DESKTOP_OAUTH_CODE_PATTERN.test("a".repeat(36)), true);
  assert.equal(DESKTOP_OAUTH_CODE_PATTERN.test("a/../".repeat(8)), false);
  assert.equal(DESKTOP_OAUTH_STATE_PATTERN.test("a".repeat(31)), false);
});

test("system-browser callback has no application session client or inline code", async () => {
  const response = GET();
  const html = await response.text();
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.match(response.headers.get("Content-Security-Policy") || "", /script-src 'self'/);
  assert.match(html, /desktop-callback\.js/);
  assert.doesNotMatch(html, /supabase|access_token|refresh_token/i);
});

test("system-browser callback passes only code and state to desktop", () => {
  const script = readFileSync(new URL("../../public/auth/desktop-callback.js", import.meta.url), "utf8");
  const message = { textContent: "" };
  const openApp = { href: "", hidden: true };
  let destination = "";
  let scrubbedPath = "";
  runInNewContext(script, {
    URLSearchParams,
    encodeURIComponent,
    document: { getElementById: (id: string) => id === "message" ? message : openApp },
    window: {
      location: {
        search: `?code=${"c".repeat(36)}&state=${"s".repeat(43)}`,
        assign: (url: string) => { destination = url; },
      },
      history: { replaceState: (_state: unknown, _title: string, path: string) => { scrubbedPath = path; } },
    },
  });
  assert.equal(destination, `comeplayers://auth?code=${"c".repeat(36)}&state=${"s".repeat(43)}`);
  assert.equal(openApp.href, destination);
  assert.equal(openApp.hidden, false);
  assert.equal(scrubbedPath, "/auth/desktop");
  assert.doesNotMatch(destination, /access_token|refresh_token/);
});

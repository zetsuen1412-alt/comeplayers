import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import config from "../next.config";
import { shouldRefreshServerCatalog } from "../lib/live/routeRefresh";

test("personal messages cannot redirect back into Chat Toko", async () => {
  const redirects = await config.redirects?.();
  assert.ok(redirects);
  assert.equal(redirects.some((rule) => rule.source === "/messages" && rule.destination === "/chat"), false);
  const header = readFileSync(new URL("../app/components/MainHeader.tsx", import.meta.url), "utf8");
  assert.match(header, /href="\/cpcommunity\?inbox=1"/);
});

test("global catalog refresh leaves active community tabs and chats alone", () => {
  for (const route of ["/cpcommunity", "/cpcommunity/servers/one/channels/two", "/chat", "/messages", "/comeplayers"]) {
    assert.equal(shouldRefreshServerCatalog(route), false, route);
  }
  assert.equal(shouldRefreshServerCatalog("/marketplace"), true);
});

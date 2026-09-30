import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { shouldAlertNotification, type NotificationRow } from "../lib/notificationPresentation";
import { createNotificationPreferencesReader } from "../lib/notificationPreferencesReader";

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
type Preferences = { settings: { call_notifications?: boolean; message_notifications?: boolean }; mutedRoomIds: string[] };

test("four fifteen-second notification polls reuse one preferences fetch until sixty seconds", async () => {
  let now = 0, reads = 0;
  const reader = createNotificationPreferencesReader(async () => { reads++; return { allowed: true }; }, 60_000, () => now);
  for (const at of [0, 15_000, 30_000, 45_000]) { now = at; assert.deepEqual(await reader.load(), { allowed: true }); }
  assert.equal(reads, 1);
  now = 60_000; await reader.load(); assert.equal(reads, 2);
});

test("concurrent preference loads are coalesced and invalidation during fetch never returns stale settings", async () => {
  const pending: Array<(value: { allowed: boolean }) => void> = [];
  const reader = createNotificationPreferencesReader(() => new Promise<{ allowed: boolean }>(resolve => pending.push(resolve)));
  const first = reader.load(), second = reader.load();
  assert.equal(first, second); assert.equal(pending.length, 1);
  reader.invalidate(); const afterChange = reader.load();
  pending[0]({ allowed: true }); await settle();
  assert.equal(pending.length, 2);
  pending[1]({ allowed: false });
  assert.deepEqual(await Promise.all([first, second, afterChange]), [{ allowed: false }, { allowed: false }, { allowed: false }]);
  assert.equal(pending.length, 2);
});

test("failed preferences reads remain retryable and account readers never share their cache", async () => {
  let reads = 0;
  const alice = createNotificationPreferencesReader(async () => { if (++reads === 1) throw new Error("offline"); return "alice"; });
  const bob = createNotificationPreferencesReader(async () => "bob");
  await assert.rejects(alice.load(), /offline/);
  assert.equal(await bob.load(), "bob"); assert.equal(await alice.load(), "alice");
  alice.invalidate(); assert.equal(await bob.load(), "bob");
  assert.equal(reads, 2);
});

function notificationEffectFixture() {
  const source = readFileSync(new URL("../components/messages/AccountNotificationCenter.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("center.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect = "";
  function walk(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect" && node.arguments[1]?.getText(tree) === "[userId]") effect = node.arguments[0].getText(tree);
    ts.forEachChild(node, walk);
  }
  walk(tree); assert.ok(effect);
  const code = ts.transpileModule(`(${effect});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const pending: Array<{ userId: string; resolve: (value: Preferences) => void }> = [];
  const settings: Array<{ userId: string; value: unknown } | null> = [];
  const events = new Map<string, Set<() => void>>();
  const activeUser = { current: null as string | null };
  let notificationReads = 0, sounds = 0, delayClaims = false;
  const claims: Array<(value: boolean) => void> = [];
  const receivers: Array<(payload: { new: NotificationRow }) => void> = [];
  const start = (userId: string) => {
    const result = runInNewContext(code, {
      userId, activeUser, createNotificationPreferencesReader, Date, setTimeout, clearTimeout, setInterval, clearInterval,
      toastTimer: { current: undefined },
      authenticatedFetchJson: (url: string) => { assert.equal(url, "/api/messages/alert-preferences"); return new Promise<Preferences>(resolve => pending.push({ userId, resolve })); },
      setSettings: (value: { userId: string; value: unknown } | null) => { settings.push(value); },
      setToast: () => {}, shouldAlertNotification, claimAlert: () => delayClaims ? new Promise<boolean>(resolve => claims.push(resolve)) : Promise.resolve(true),
      playMessageSound: () => { sounds++; },
      navigator: { onLine: true }, document: { hidden: false, querySelector: () => null },
      ALERT_PREFERENCES_CHANGED: "preferences-changed",
      ACCOUNT_ALERT_PREFERENCES_CHANGED: "preferences-changed",
      window: {
        addEventListener(name: string, fn: () => void) { const handlers = events.get(name) || new Set(); handlers.add(fn); events.set(name, handlers); },
        removeEventListener(name: string, fn: () => void) { events.get(name)?.delete(fn); },
      },
      supabase: {
        from(name: string) {
          assert.equal(name, "notifications"); notificationReads++;
          const builder = { select() { return builder; }, eq() { return builder; }, gte() { return builder; }, order() { return builder; }, limit: async () => ({ data: [], error: null }) };
          return builder;
        },
        channel() { const channel = { on(_event: string, _filter: unknown, callback: (payload: { new: NotificationRow }) => void) { receivers.push(callback); return channel; }, subscribe() { return channel; } }; return channel; },
        removeChannel: async () => {},
      },
    }) as () => () => void;
    return result();
  };
  return { pending, settings, start, events, receivers, claims, holdClaims() { delayClaims = true; }, sounds: () => sounds, reads: () => notificationReads, fire(name: string) { events.get(name)?.forEach(fn => fn()); } };
}

test("actual notification effect polls messages every fifteen seconds but fetches settings only once per minute", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100_000 });
  const fixture = notificationEffectFixture(), stop = fixture.start("alice");
  fixture.pending[0].resolve({ settings: { call_notifications: true }, mutedRoomIds: [] }); await settle();
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(15_000); await settle(); }
  assert.equal(fixture.reads(), 4); assert.equal(fixture.pending.length, 1);
  assert.equal(fixture.settings.length, 1, "Unchanged cached settings must not cause extra renders");
  t.mock.timers.tick(15_000); await settle(); assert.equal(fixture.pending.length, 2);
  fixture.pending[1].resolve({ settings: { call_notifications: true }, mutedRoomIds: [] }); await settle();
  assert.equal(fixture.settings.length, 1); stop();
});

test("actual notification invalidation refreshes in-flight preferences without applying the superseded response", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100_000 });
  const fixture = notificationEffectFixture(), stop = fixture.start("alice");
  fixture.fire("preferences-changed");
  fixture.pending[0].resolve({ settings: { call_notifications: true }, mutedRoomIds: [] }); await settle();
  assert.equal(fixture.pending.length, 2); assert.equal(fixture.settings.filter(value => value !== null).length, 0);
  fixture.pending[1].resolve({ settings: { call_notifications: false }, mutedRoomIds: ["room"] }); await settle();
  assert.equal(fixture.settings[0], null); assert.equal(fixture.settings.at(-1)?.userId, "alice");
  assert.equal((fixture.settings.at(-1)?.value as Preferences["settings"]).call_notifications, false);
  stop(); assert.equal(fixture.events.get("preferences-changed")?.size, 0);
});

test("unmounted account preferences cannot overwrite the new signed-in account", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100_000 });
  const fixture = notificationEffectFixture(), stopAlice = fixture.start("alice");
  stopAlice(); const stopBob = fixture.start("bob");
  fixture.pending[0].resolve({ settings: { call_notifications: false }, mutedRoomIds: ["alice-room"] }); await settle();
  assert.equal(fixture.settings.length, 0);
  fixture.pending[1].resolve({ settings: { call_notifications: true }, mutedRoomIds: [] }); await settle();
  assert.equal(fixture.settings.length, 1); assert.equal(fixture.settings[0]?.userId, "bob");
  assert.equal(fixture.reads(), 1); stopBob();
});


test("successful preference mutations invalidate cached alerts, while reads and rejected writes do not", async () => {
  const source = readFileSync(new URL("../lib/authenticatedFetch.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const events: string[] = [];
  let status = 200;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports, Headers, FormData, AbortController, Event, setTimeout, clearTimeout,
    fetch: async () => new Response(JSON.stringify(status === 200 ? {} : { error: "synthetic rejection" }), { status }),
    window: { dispatchEvent: (event: Event) => { events.push(event.type); } },
    require(name: string) {
      if (name === "@/lib/supabase") return { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "synthetic-test-token" } }, error: null }) } } };
      if (name === "./notificationPreferencesReader") return { ACCOUNT_ALERT_PREFERENCES_CHANGED: "preferences-changed" };
      throw new Error("Unexpected dependency " + name);
    },
  });
  const fetchAuthenticated = exports.authenticatedFetch as (url: string, init?: RequestInit) => Promise<Response>;
  await fetchAuthenticated("/api/account/preferences", { method: "PATCH", body: "{}" });
  await fetchAuthenticated("/api/messages/preferences?room=synthetic", { method: "post", body: "{}" });
  assert.deepEqual(events, ["preferences-changed", "preferences-changed"]);
  await fetchAuthenticated("/api/account/preferences");
  await fetchAuthenticated("/api/account/preferences", { method: "HEAD" });
  await fetchAuthenticated("/api/messages/rooms/synthetic/messages", { method: "POST", body: "{}" });
  assert.equal(events.length, 2);
  status = 403;
  await assert.rejects(fetchAuthenticated("/api/account/preferences", { method: "PATCH", body: "{}" }), /synthetic rejection/);
  assert.equal(events.length, 2);
});


test("a realtime message cannot sound using old preferences while a saved mute is being reloaded", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100_000 });
  const fixture = notificationEffectFixture(), stop = fixture.start("alice");
  fixture.pending[0].resolve({ settings: { message_notifications: true }, mutedRoomIds: [] }); await settle();
  fixture.fire("preferences-changed");
  assert.equal(fixture.pending.length, 2);
  const row: NotificationRow = { id: 123, user_id: "alice", type: "chat_message", title: "New message", message: "synthetic", link_url: "/cpcommunity?room=test", is_read: false, created_at: new Date().toISOString() };
  fixture.receivers[0]({ new: row }); await settle();
  assert.equal(fixture.sounds(), 0, "An invalidated preference snapshot is not authorization to play an alert");
  fixture.pending[1].resolve({ settings: { message_notifications: false }, mutedRoomIds: [] }); await settle();
  fixture.receivers[0]({ new: { ...row, id: 124 } }); await settle();
  assert.equal(fixture.sounds(), 0); stop();
});


test("saving mute while alert ownership is pending cannot play an already invalidated notification", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100_000 });
  const fixture = notificationEffectFixture(), stop = fixture.start("alice");
  fixture.pending[0].resolve({ settings: { message_notifications: true }, mutedRoomIds: [] }); await settle();
  fixture.holdClaims();
  const row: NotificationRow = { id: 321, user_id: "alice", type: "chat_message", title: "New message", message: "synthetic", link_url: "/cpcommunity?room=test", is_read: false, created_at: new Date().toISOString() };
  fixture.receivers[0]({ new: row }); await settle();
  assert.equal(fixture.claims.length, 1);
  fixture.fire("preferences-changed");
  fixture.claims[0](true); await settle();
  assert.equal(fixture.sounds(), 0, "A setting saved during cross-tab claim must fence the old alert");
  fixture.pending[1].resolve({ settings: { message_notifications: false }, mutedRoomIds: [] }); await settle();
  stop();
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { sameTypingEntries, sameUserIds } from "../lib/chatClientPerformance";

const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
type Options = { userId: string; roomId: string; channelId: string; typingEnabled: boolean };
type HookResult = { onlineUserIds: Set<string>; typingUsers: Record<string, { name: string; at: number }>; signalTyping: (active: boolean) => Promise<void> };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
function events() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener(name: string, listener: () => void) { const set = listeners.get(name) || new Set(); set.add(listener); listeners.set(name, set); },
    removeEventListener(name: string, listener: () => void) { listeners.get(name)?.delete(listener); },
    emit(name: string) { listeners.get(name)?.forEach(listener => listener()); },
    count() { return [...listeners.values()].reduce((total, set) => total + set.size, 0); },
  };
}
function fixture() {
  const slots: Slot[] = [];
  let index = 0, effects: Array<() => void> = [];
  const same = (left: unknown[] | undefined, right: unknown[]) => left?.length === right.length && right.every((value, i) => Object.is(value, left[i]));
  const react = {
    useRef(value: unknown) { const slot = slots[index++] ||= { value: { current: value } }; return slot.value; },
    useState(value: unknown) {
      const slot = slots[index++] ||= { value };
      return [slot.value, (update: unknown) => { slot.value = typeof update === "function" ? update(slot.value) : update; }];
    },
    useCallback(value: unknown, deps: unknown[]) {
      const slot = slots[index++] ||= {};
      if (!same(slot.deps, deps)) { slot.value = value; slot.deps = deps; }
      return slot.value;
    },
    useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
      const slot = slots[index++] ||= {};
      if (!same(slot.deps, deps)) {
        slot.deps = deps;
        effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
      }
    },
  };
  const document = { ...events(), visibilityState: "visible" };
  const window = events(), navigator = { onLine: true };
  const requests: Array<{ url: string; method: string; body?: string; signal?: AbortSignal }> = [];
  let pendingTyping: ((value: unknown) => void) | undefined;
  let holdTyping = false;
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL("../components/messages/useMessagesRedisRealtime.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, {
    exports, document, window, navigator, AbortController, URLSearchParams, Date, setTimeout, clearTimeout,
    require(name: string) {
      if (name === "react") return react;
      if (name === "@/lib/chatClientPerformance") return { sameTypingEntries, sameUserIds };
      if (name === "@/lib/authenticatedFetch") return { authenticatedFetchJson: (url: string, init: { method?: string; signal?: AbortSignal; body?: string } = {}) => {
        requests.push({ url, method: init.method || "GET", signal: init.signal, body: init.body });
        if (holdTyping && url.startsWith("/api/messages/typing?")) return new Promise(resolve => { pendingTyping = resolve; });
        return Promise.resolve({ enabled: true, users: url.includes("presence") ? [{ userId: "peer", name: "Peer", lastSeen: Date.now() }] : [] });
      } };
      throw new Error(name);
    },
  });
  const hook = exports.useMessagesRedisRealtime as (options: Options) => HookResult;
  let options: Options = { userId: "alice", roomId: "room", channelId: "general", typingEnabled: true };
  let value: HookResult;
  const render = (update: Partial<Options> = {}) => {
    options = { ...options, ...update };
    index = 0; effects = [];
    value = hook(options);
    effects.forEach(effect => effect());
    return value;
  };
  return {
    render, requests, document, window,
    hide() { document.visibilityState = "hidden"; document.emit("visibilitychange"); },
    offline() { navigator.onLine = false; window.emit("offline"); },
    show() { document.visibilityState = "visible"; document.emit("visibilitychange"); },
    holdTyping() { holdTyping = true; },
    resolveTyping(value: unknown) { pendingTyping?.(value); },
    stop() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test("hidden text panes retain room presence but schedule no typing reads", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.render({ typingEnabled: false }); await settle();
  assert.equal(f.requests.length, 2);
  for (let tick = 0; tick < 6; tick++) { t.mock.timers.tick(5_000); await settle(); }
  assert.ok(f.requests.every(request => request.url.includes("/presence")));
  const presenceCount = f.requests.length;
  f.render({ typingEnabled: true }); await settle();
  assert.equal(f.requests.length, presenceCount + 1);
  assert.match(f.requests.at(-1)!.url, /typing\?roomId=room&channelId=general/);
  f.stop();
});

test("channel navigation restarts only typing and keeps the room online snapshot", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.render(); await settle();
  assert.equal(f.render().onlineUserIds.has("peer"), true);
  f.render({ channelId: "other" }); await settle();
  assert.equal(f.requests.filter(request => request.url.includes("/presence")).length, 2);
  assert.equal(f.requests.filter(request => request.url.startsWith("/api/messages/typing?")).length, 2);
  assert.equal(f.render().onlineUserIds.has("peer"), true);
  t.mock.timers.tick(25_000); await settle();
  const heartbeat = f.requests.filter(request => request.url === "/api/messages/presence").at(-1)!;
  assert.equal(JSON.parse(heartbeat.body!).channelId, "other");
  f.stop();
});

test("hiding a pane aborts its in-flight typing read and sends one typing stop", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.holdTyping();
  let result = f.render(); await settle();
  const read = f.requests.find(request => request.url.startsWith("/api/messages/typing?"))!;
  await result.signalTyping(true);
  result = f.render({ typingEnabled: false }); await settle();
  assert.equal(read.signal?.aborted, true);
  assert.deepEqual(f.requests.filter(request => request.method === "POST" && request.url.endsWith("/typing")).map(request => JSON.parse(request.body!).active), [true, false]);
  f.resolveTyping({ enabled: true, users: [{ userId: "stale", name: "Stale", at: Date.now() }] }); await settle();
  assert.equal(Object.keys(f.render().typingUsers).length, 0);
  const before = f.requests.filter(request => request.url.includes("/typing")).length;
  t.mock.timers.tick(30_000); await settle();
  assert.equal(f.requests.filter(request => request.url.includes("/typing")).length, before);
  f.stop();
});

test("hidden browser tabs suspend all reads and visible tabs recover immediately", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.render(); await settle();
  f.hide();
  const before = f.requests.length;
  t.mock.timers.tick(60_000); await settle();
  assert.equal(f.requests.length, before);
  f.show(); await settle();
  assert.equal(f.requests.length, before + 3);
  f.stop();
  assert.equal(f.document.count() + f.window.count(), 0);
});

test("a room switch ignores an old typing response even if the transport resolves after abort", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.holdTyping(); f.render(); await settle();
  const old = f.requests.find(request => request.url.startsWith("/api/messages/typing?"))!;
  f.render({ roomId: "new", typingEnabled: false }); await settle();
  assert.equal(old.signal?.aborted, true);
  f.resolveTyping({ enabled: true, users: [{ userId: "old", name: "Old", at: Date.now() }] }); await settle();
  assert.equal(Object.keys(f.render().typingUsers).length, 0);
  f.stop();
});

test("the actual pane visibility hook tracks Home, the mobile inbox, resize, and tab visibility", () => {
  const document = { ...events(), visibilityState: "visible" }, media = { ...events(), matches: false };
  const exports: Record<string, unknown> = {};
  const stops: Array<() => void> = [];
  let updates = 0;
  const code = ts.transpileModule(readFileSync(new URL("../components/messages/useMessagesPaneVisibility.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, {
    exports, document, window: { matchMedia(query: string) { assert.equal(query, "(max-width: 1023px)"); return media; } },
    require: () => ({ useSyncExternalStore(subscribe: (changed: () => void) => () => void, snapshot: () => string, server: () => string) {
      assert.equal(server(), "hidden");
      if (!stops.length) stops.push(subscribe(() => { updates++; }));
      return snapshot();
    } }),
  });
  const visible = exports.useMessagesPaneVisibility as (inbox: boolean, home: boolean) => boolean;
  assert.equal(visible(true, false), true, "Desktop CSS shows the chat beside its inbox");
  assert.equal(visible(false, true), false);
  media.matches = true; media.emit("change");
  assert.equal(visible(true, false), false);
  assert.equal(visible(false, false), true);
  document.visibilityState = "hidden"; document.emit("visibilitychange");
  assert.equal(visible(false, false), false);
  document.visibilityState = "visible"; document.emit("visibilitychange");
  assert.equal(visible(false, false), true);
  assert.equal(updates, 3);
  stops.forEach(stop => stop());
  assert.equal(document.count() + media.count(), 0);
});

test("offline presence clears the online list and aborts polling until connectivity returns", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.render(); await settle();
  assert.equal(f.render().onlineUserIds.has("peer"), true);
  f.offline();
  assert.equal(f.render().onlineUserIds.size, 0);
  const reads = f.requests.length;
  t.mock.timers.tick(60_000); await settle();
  assert.equal(f.requests.length, reads);
  f.stop();
});

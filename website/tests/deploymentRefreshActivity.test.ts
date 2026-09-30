import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const source = readFileSync(new URL("../app/components/DeploymentAutoRefresh.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function fixture(path = "/marketplace") {
  class Element { isContentEditable = false; }
  class Input extends Element {}
  class Textarea extends Element {}
  class Select extends Element {}
  const events = new Map<string, Set<() => void>>();
  const eventTarget = {
    addEventListener(name: string, handler: () => void) { const list = events.get(name) || new Set(); list.add(handler); events.set(name, list); },
    removeEventListener(name: string, handler: () => void) { events.get(name)?.delete(handler); },
  };
  let release = "first", reads = 0, reloads = 0, modal = false, hanging = false;
  let cleanup = () => {};
  let lastSignal: AbortSignal | undefined;
  let resolveRead: ((value: unknown) => void) | undefined;
  const document = { ...eventTarget, visibilityState: "visible", activeElement: null as Element | null, querySelector: () => modal ? {} : null };
  const location = { pathname: path, reload() { reloads++; } };
  const exports: Record<string, () => void> = {};
  runInNewContext(code, {
    exports, document, navigator: { onLine: true }, window: { ...eventTarget, location, setInterval, clearInterval },
    AbortController, setTimeout, clearTimeout, HTMLElement: Element, HTMLInputElement: Input, HTMLTextAreaElement: Textarea, HTMLSelectElement: Select,
    require(name: string) { assert.equal(name, "react"); return { useEffect(effect: () => () => void) { cleanup = effect(); } }; },
    fetch(_url: string, options: { signal: AbortSignal }) {
      reads++; lastSignal = options.signal;
      if (hanging) return new Promise((resolve, reject) => {
        resolveRead = resolve;
        options.signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      });
      return Promise.resolve({ ok: true, json: async () => ({ release }) });
    },
  });
  return {
    document, location, events, Input,
    start() { exports.default(); }, stop() { cleanup(); },
    reads: () => reads, reloads: () => reloads, signal: () => lastSignal,
    setRelease(value: string) { release = value; }, setModal(value: boolean) { modal = value; },
    hang(value: boolean) { hanging = value; }, resolve() { resolveRead?.({ ok: true, json: async () => ({ release }) }); },
    fire(name: string) { events.get(name)?.forEach(handler => handler()); },
  };
}

test("deployment changes never reload a conversation, community or call surface", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  for (const path of ["/cpcommunity", "/cpcommunity/servers/group/channels/general", "/messages", "/chat", "/comeplayers"]) {
    const f = fixture(path); f.start(); await settle();
    f.setRelease("second"); t.mock.timers.tick(120_000); await settle();
    assert.equal(f.reloads(), 0, path);
    f.location.pathname = "/marketplace"; f.fire("focus"); await settle();
    assert.equal(f.reloads(), 1, "update can apply after leaving the conversation"); f.stop();
  }
});

test("hidden tabs send no deployment checks and reconcile once on return", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const f = fixture(); f.start(); await settle();
  f.document.visibilityState = "hidden"; f.setRelease("second");
  for (let i = 0; i < 5; i++) { t.mock.timers.tick(120_000); await settle(); }
  f.fire("focus"); await settle(); assert.equal(f.reads(), 1); assert.equal(f.reloads(), 0);
  f.document.visibilityState = "visible"; f.fire("visibilitychange"); await settle();
  assert.equal(f.reads(), 2); assert.equal(f.reloads(), 1); f.stop();
});

test("payments, drafts and modal dialogs continue to defer deployment reloads", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const f = fixture("/checkout/one"); f.start(); await settle(); f.setRelease("second");
  f.fire("focus"); await settle(); assert.equal(f.reloads(), 0);
  f.location.pathname = "/marketplace"; f.document.activeElement = new f.Input();
  f.fire("focus"); await settle(); assert.equal(f.reloads(), 0);
  f.document.activeElement = null; f.setModal(true);
  f.fire("focus"); await settle(); assert.equal(f.reloads(), 0);
  f.setModal(false); f.fire("focus"); await settle(); assert.equal(f.reloads(), 1); f.stop();
});

test("a stalled version read cannot overlap or block future checks indefinitely", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const f = fixture(); f.start(); await settle(); f.setRelease("second"); f.hang(true);
  f.fire("focus"); f.fire("focus"); assert.equal(f.reads(), 2);
  t.mock.timers.tick(10_000); await settle(); assert.equal(f.signal()?.aborted, true);
  f.hang(false); f.fire("focus"); await settle(); assert.equal(f.reloads(), 1); f.stop();
});

test("unmount aborts a pending check and prevents late reload or retained listeners", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const f = fixture(); f.start(); await settle(); f.setRelease("second"); f.hang(true);
  f.fire("focus"); f.stop(); assert.equal(f.signal()?.aborted, true);
  f.resolve(); await settle(); t.mock.timers.tick(240_000); await settle();
  assert.equal(f.reloads(), 0); assert.equal(f.reads(), 2);
  assert.ok([...f.events.values()].every(handlers => handlers.size === 0));
});

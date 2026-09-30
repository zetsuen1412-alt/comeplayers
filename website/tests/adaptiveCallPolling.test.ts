import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createCallMonitor } from "../lib/callMonitor";
import { accountCallPollInterval } from "../lib/callPolling";

const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
type Snapshot = Array<{ id: string; status: string }>;
type FixtureChannel = {
  filters: Record<string, unknown>[];
  changed(payload: { new: Record<string, unknown> }): void;
  status(value: string): void;
};

function accountFixture(read: (signal: AbortSignal) => Promise<Snapshot>, readiness: () => boolean | undefined = () => true) {
  const source = readFileSync(new URL("../lib/accountCalls.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const channels: FixtureChannel[] = [], removed: unknown[] = [];
  const events = new Map<string, Set<() => void>>();
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports, setTimeout, clearTimeout,
    window: {
      addEventListener(name: string, fn: () => void) { const listeners = events.get(name) || new Set(); listeners.add(fn); events.set(name, listeners); },
      removeEventListener(name: string, fn: () => void) { events.get(name)?.delete(fn); },
    },
    require(name: string) {
      if (name === "./callMonitor") return { createCallMonitor };
      if (name === "./callPolling") return { accountCallPollInterval };
      if (name === "./authenticatedFetch") return { authenticatedFetchJson: async (url: string, init: { signal: AbortSignal }) => {
        assert.equal(url, "/api/messages/calls?active=1");
        const calls = await read(init.signal), callEventsReady = readiness();
        return { calls, ...(callEventsReady === undefined ? {} : { callEventsReady }) };
      } };
      if (name === "./supabase") return { supabase: {
        channel() {
          const fixture: FixtureChannel = { filters: [], changed: () => {}, status: () => {} };
          const channel = {
            on(_event: string, filter: Record<string, unknown>, callback: FixtureChannel["changed"]) { fixture.filters.push(filter); fixture.changed = callback; return channel; },
            subscribe(callback: FixtureChannel["status"]) { fixture.status = callback; return channel; },
          };
          channels.push(fixture); return channel;
        },
        removeChannel(channel: unknown) { removed.push(channel); return Promise.resolve(); },
      } };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return {
    channels, removed, events,
    subscribe: exports.subscribeAccountCalls as (userId: string, listener: (calls: Snapshot) => void) => () => void,
    refresh: exports.refreshAccountCalls as (userId: string) => void,
  };
}

test("healthy idle realtime lowers shared polling to five reads in sixty seconds", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0;
  const monitor = createCallMonitor(async () => { reads++; return []; }, value => accountCallPollInterval(value, true));
  const stopA = monitor.subscribe(() => {}), stopB = monitor.subscribe(() => {});
  await settle();
  for (let i = 0; i < 4; i++) { t.mock.timers.tick(15_000); await settle(); }
  assert.equal(reads, 5);
  stopA(); stopB();
});

test("unready realtime and active calls retain three-second recovery", () => {
  assert.equal(accountCallPollInterval(undefined, true), 3000);
  assert.equal(accountCallPollInterval([], false), 3000);
  assert.equal(accountCallPollInterval([{ status: "ringing" }], true), 3000);
  assert.equal(accountCallPollInterval([{ status: "accepted" }], true), 3000);
  assert.equal(accountCallPollInterval([{ status: "ended" }], true), 15_000);
});

test("account integration shares one account-scoped call revision channel and coalesces event bursts", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0;
  const fixture = accountFixture(async () => { reads++; return []; });
  const stopA = fixture.subscribe("alice", () => {}), stopB = fixture.subscribe("alice", () => {});
  await settle();
  assert.equal(reads, 1); assert.equal(fixture.channels.length, 1);
  assert.deepEqual(fixture.channels[0].filters.map(filter => [filter.table, filter.event, filter.filter]), [["cp_live_revisions", "*", "scope=eq.calls:alice"]]);
  fixture.channels[0].status("SUBSCRIBED"); await settle();
  const readyReads = reads;
  for (let i = 0; i < 4; i++) { t.mock.timers.tick(15_000); await settle(); }
  assert.equal(reads - readyReads, 4, "healthy minute has four scheduled reconciliation reads");
  for (let i = 0; i < 8; i++) fixture.channels[0].changed({ new: { scope: "calls:alice", revision: 2 } });
  t.mock.timers.tick(74); await settle(); assert.equal(reads, readyReads + 4);
  t.mock.timers.tick(1); await settle(); assert.equal(reads, readyReads + 5);
  stopA(); assert.equal(fixture.removed.length, 0);
  stopB(); assert.equal(fixture.removed.length, 1);
  assert.equal(fixture.events.get("focus")?.size, 0);
});

test("failed account channel immediately reschedules fast fallback and active media keeps it fast after recovery", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0, value: Snapshot = [];
  const fixture = accountFixture(async () => { reads++; return value; });
  const stop = fixture.subscribe("alice", () => {}); await settle();
  fixture.channels[0].status("SUBSCRIBED"); await settle();
  const baseline = reads;
  fixture.channels[0].status("CHANNEL_ERROR");
  t.mock.timers.tick(2999); await settle(); assert.equal(reads, baseline);
  t.mock.timers.tick(1); await settle(); assert.equal(reads, baseline + 1);
  value = [{ id: "call", status: "accepted" }];
  fixture.channels[0].status("SUBSCRIBED"); await settle();
  const connected = reads;
  t.mock.timers.tick(3000); await settle(); assert.equal(reads, connected + 1);
  stop();
});

test("last unsubscribe aborts a pending subscription read and cancels delayed call activity", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending: Array<{ signal: AbortSignal; resolve: (value: Snapshot) => void }> = [];
  const fixture = accountFixture(signal => new Promise(resolve => pending.push({ signal, resolve })));
  const seen: Snapshot[] = [];
  const stop = fixture.subscribe("alice", value => seen.push(value));
  fixture.channels[0].status("SUBSCRIBED");
  fixture.channels[0].changed({ new: { scope: "calls:alice", revision: 2 } });
  stop();
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve([{ id: "old-call", status: "ringing" }]); await settle();
  fixture.channels[0].status("SUBSCRIBED");
  t.mock.timers.tick(60_000); await settle();
  assert.deepEqual(seen, []); assert.equal(pending.length, 1);
  assert.equal(fixture.removed.length, 1);
});

test("account mutation fences the in-flight result and account replacement cannot inherit its snapshot", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending: Array<{ signal: AbortSignal; resolve: (value: Snapshot) => void }> = [];
  const fixture = accountFixture(signal => new Promise(resolve => pending.push({ signal, resolve })));
  const alice: Snapshot[] = [], bob: Snapshot[] = [];
  const stopAlice = fixture.subscribe("alice", value => alice.push(value));
  fixture.refresh("alice");
  pending[0].resolve([{ id: "old", status: "ringing" }]); await settle();
  assert.deepEqual(alice, []);
  t.mock.timers.tick(0); await settle(); assert.equal(pending.length, 2);
  stopAlice();
  const stopBob = fixture.subscribe("bob", value => bob.push(value));
  pending[1].resolve([{ id: "alice-call", status: "accepted" }]); await settle();
  pending[2].resolve([{ id: "bob-call", status: "accepted" }]); await settle();
  assert.deepEqual(alice, []);
  assert.deepEqual(bob, [[{ id: "bob-call", status: "accepted" }]]);
  stopBob();
});


test("a connected channel without deployed call revision capability keeps three-second fallback", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const capability of [undefined, false]) {
    let reads = 0;
    const fixture = accountFixture(async () => { reads++; return []; }, () => capability);
    const stop = fixture.subscribe("alice", () => {}); await settle();
    fixture.channels[0].status("SUBSCRIBED"); await settle();
    const baseline = reads;
    t.mock.timers.tick(2999); await settle(); assert.equal(reads, baseline);
    t.mock.timers.tick(1); await settle(); assert.equal(reads, baseline + 1);
    stop();
  }
});

test("server capability rollback restores fast polling and later rollout can restore idle polling", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let capability = true, reads = 0;
  const fixture = accountFixture(async () => { reads++; return []; }, () => capability);
  const stop = fixture.subscribe("alice", () => {}); await settle();
  fixture.channels[0].status("SUBSCRIBED"); await settle();
  let baseline = reads;
  t.mock.timers.tick(3000); await settle(); assert.equal(reads, baseline);
  t.mock.timers.tick(12_000); await settle(); assert.equal(reads, baseline + 1);
  capability = false; fixture.refresh("alice"); await settle(); baseline = reads;
  t.mock.timers.tick(3000); await settle(); assert.equal(reads, baseline + 1);
  capability = true; fixture.refresh("alice"); await settle(); baseline = reads;
  t.mock.timers.tick(3000); await settle(); assert.equal(reads, baseline);
  t.mock.timers.tick(12_000); await settle(); assert.equal(reads, baseline + 1);
  stop();
});

test("an HTTP failure restores fast reconciliation without erasing the last call snapshot", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fail = false, reads = 0;
  const seen: Snapshot[] = [];
  const fixture = accountFixture(async () => {
    reads++;
    if (fail) throw new Error("HTTP 503");
    return [];
  });
  const stop = fixture.subscribe("alice", calls => seen.push(calls)); await settle();
  fixture.channels[0].status("SUBSCRIBED"); await settle();
  const readyReads = reads, readySnapshots = seen.length;
  fail = true;
  t.mock.timers.tick(15_000); await settle(); assert.equal(reads, readyReads + 1);
  assert.equal(seen.length, readySnapshots, "failed reads preserve the previously delivered snapshot");
  t.mock.timers.tick(2999); await settle(); assert.equal(reads, readyReads + 1);
  t.mock.timers.tick(1); await settle(); assert.equal(reads, readyReads + 2);
  fail = false;
  t.mock.timers.tick(3000); await settle(); assert.equal(reads, readyReads + 3);
  t.mock.timers.tick(3000); await settle(); assert.equal(reads, readyReads + 3);
  t.mock.timers.tick(12_000); await settle(); assert.equal(reads, readyReads + 4);
  stop();
});
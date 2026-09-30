import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
function load(file, dependencies, timers) {
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../apps/mobile/src/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  runInNewContext(source, { module: mod, exports: mod.exports, console, AbortController, Date, Error, ...timers,
    require: name => {
      if (!(name in dependencies)) throw new Error('Unexpected import: ' + name);
      return dependencies[name];
    },
  });
  return mod.exports;
}
function clock() {
  let now = 0, nextId = 0;
  const jobs = new Map();
  return {
    timers: {
      setTimeout: (fn, delay) => { const id = ++nextId; jobs.set(id, { at: now + delay, fn }); return id; },
      clearTimeout: id => jobs.delete(id),
    },
    jobs,
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        jobs.delete(next[0]); now = next[1].at; next[1].fn(); await flush();
      }
      now = end;
    },
  };
}
function harness(overrides = {}, capable = true) {
  const scheduler = clock();
  const state = { foreground: true, active: false, reads: 0, values: [], errors: [], signals: [] };
  const { createMobileCallMonitor } = load('mobileCallMonitor.ts', {}, scheduler.timers);
  const monitor = createMobileCallMonitor({
    read: async signal => { state.reads++; state.signals.push(signal); return state.reads; },
    onValue: value => state.values.push(value), onError: error => state.errors.push(error),
    isForeground: () => state.foreground, hasActiveCall: () => state.active, ...overrides,
  });
  if (capable) monitor.setEventCapability(true);
  return { scheduler, state, monitor };
}

test('healthy realtime reduces idle call reads from 30 to 4 per minute after initial load', async () => {
  const { scheduler, state, monitor } = harness();
  monitor.setRealtimeConnected(true); await flush();
  assert.equal(state.reads, 1);
  await scheduler.advance(60000);
  assert.equal(state.reads, 5);
  monitor.dispose();
});
test('unavailable realtime and active calls retain the two-second fallback', async () => {
  for (const active of [false, true]) {
    const { scheduler, state, monitor } = harness();
    state.active = active;
    if (active) monitor.setRealtimeConnected(true); else monitor.refresh();
    await flush(); await scheduler.advance(60000);
    assert.equal(state.reads, 31);
    monitor.dispose();
  }
});
test('push/revision events and subscription loss wake immediately instead of waiting 15 seconds', async () => {
  const { scheduler, state, monitor } = harness();
  monitor.setRealtimeConnected(true); await flush();
  await scheduler.advance(100); monitor.refresh(); await flush();
  assert.equal(state.reads, 2);
  monitor.setRealtimeConnected(false); await flush();
  assert.equal(state.reads, 3);
  await scheduler.advance(2000); assert.equal(state.reads, 4);
  monitor.dispose();
});
test('event bursts do not overlap I/O and obsolete responses cannot revert a local call action', async () => {
  const resolvers = [], values = [];
  let reads = 0;
  const { scheduler, monitor } = harness({
    read: () => { reads++; return new Promise(resolve => resolvers.push(resolve)); },
    onValue: value => values.push(value),
  });
  monitor.setRealtimeConnected(true);
  for (let n = 0; n < 100; n++) monitor.refresh();
  assert.equal(reads, 1);
  resolvers.shift()('before accept'); await flush();
  assert.deepEqual(values, []);
  await scheduler.advance(0); assert.equal(reads, 2);
  resolvers.shift()('accepted'); await flush();
  assert.deepEqual(values, ['accepted']);
  assert.equal(scheduler.jobs.size, 1);
  monitor.dispose();
});
test('background/dispose abort requests and suppress timers and stale UI; resume checks immediately', async () => {
  const resolvers = [], signals = [], values = [];
  const { scheduler, state, monitor } = harness({
    read: signal => { signals.push(signal); return new Promise(resolve => resolvers.push(resolve)); },
    onValue: value => values.push(value),
  });
  monitor.refresh();
  state.foreground = false; monitor.foregroundChanged();
  assert.equal(signals[0].aborted, true);
  resolvers.shift()('background result'); await flush();
  await scheduler.advance(60000);
  assert.equal(signals.length, 1);
  assert.equal(scheduler.jobs.size, 0);
  state.foreground = true; monitor.foregroundChanged();
  assert.equal(signals.length, 2);
  monitor.dispose(); assert.equal(signals[1].aborted, true);
  resolvers.shift()('disposed result'); await flush();
  assert.deepEqual(values, []);
  assert.equal(scheduler.jobs.size, 0);
});
test('transient failures keep previous call state and schedule recovery', async () => {
  let count = 0;
  const { scheduler, state, monitor } = harness({
    read: async () => { if (++count === 2) throw Error('offline'); return 'ringing'; },
  });
  monitor.refresh(); await flush(); await scheduler.advance(2000);
  assert.deepEqual(state.values, ['ringing']);
  assert.equal(state.errors.length, 1);
  await scheduler.advance(2000); assert.deepEqual(state.values, ['ringing', 'ringing']);
  monitor.dispose();
});

test('CallProvider wires participant realtime, push, background and cleanup without trusting event payloads', async () => {
  const scheduler = clock(), handlers = [], channels = [];
  let statusListener, appListener, reads = 0, push = 0, returned = [], callContext;
  const native = Object.fromEntries(['Pressable', 'Text', 'View'].map(name => [name, name]));
  native.StyleSheet = { create: value => value };
  native.Modal = ({ visible, children }) => visible ? React.createElement('Modal', null, children) : null;
  native.AppState = { currentState: 'active', addEventListener: (_, callback) => { appListener = callback; return { remove() { appListener = undefined; } }; } };
  const reportCallActive = () => {};
  const helper = load('mobileCallMonitor.ts', {}, scheduler.timers);
  const module = load('CallProvider.tsx', {
    react: React, 'react/jsx-runtime': JsxRuntime, 'react-native': native,
    './components': { Avatar: 'Avatar', PrimaryButton: 'Button' },
    './messagingApi': { loadCalls: async () => { reads++; return { calls: returned, callEventsReady: true }; }, createCall: async () => ({ call: returned[0] }), changeCall: async () => {} },
    './api': { request: async () => ({}) }, './theme': { colors: {} }, './notificationSounds': { useIncomingRingtone() {} },
    './NotificationProvider': { useNotifications: () => ({ incomingCallSignal: push, setCallActive: reportCallActive }) },
    './runtime': { supabase: {
      channel: name => { const channel = { name, on(event, filter, callback) { handlers.push({ event, filter, callback }); return this; }, subscribe(callback) { statusListener = callback; return this; } }; channels.push(channel); return channel; },
      removeChannel: async channel => { channel.removed = true; },
    } },
    './mobileCallMonitor': helper,
  }, scheduler.timers);
  function Child() { callContext = module.useCalls(); return null; }
  const props = { session: { user: { id: 'me' } }, account: { phoneRequired: false, settings: { call_notifications: true } } };
  let view;
  await act(async () => { view = Renderer.create(React.createElement(module.CallProvider, props, React.createElement(Child))); await flush(); });
  await act(async () => { await scheduler.advance(0); statusListener('SUBSCRIBED'); await flush(); });
  const before = reads;
  assert.equal(handlers.map(item => item.filter.filter).join(','), 'scope=eq.calls:me');
  await act(async () => { handlers[0].callback({ new: { calls: [{ id: 'untrusted', status: 'ringing' }] } }); await flush(); });
  assert.ok(reads > before); assert.equal(callContext.callActive, false, 'revision contents cannot create an unauthenticated incoming call');
  returned = [{ id: 'call-1', room_id: 'room-1', caller_id: 'friend', callee_id: 'me', status: 'ringing', media: 'audio' }];
  await act(async () => { handlers[0].callback({ new: { scope: 'calls:me', revision: 2 } }); await flush(); });
  assert.ok(reads > before); assert.equal(callContext.callActive, true);
  const afterCall = reads;
  push++;
  await act(async () => { view.update(React.createElement(module.CallProvider, props, React.createElement(Child))); await flush(); });
  assert.ok(reads > afterCall, 'native push invalidates without replacing subscription');
  assert.equal(channels.length, 1);
  await act(async () => { native.AppState.currentState = 'background'; appListener('background'); await scheduler.advance(60000); });
  const backgroundReads = reads;
  await act(async () => { native.AppState.currentState = 'active'; appListener('active'); await flush(); });
  assert.ok(reads > backgroundReads);
  await act(async () => { view.unmount(); await flush(); });
  assert.equal(channels[0].removed, true);
  assert.equal(appListener, undefined);
  assert.equal(scheduler.jobs.size, 0);
});

test('a subscribed channel alone never slows polling before server capability is confirmed', async () => {
  for (const advertised of [undefined, false]) {
    const { scheduler, state, monitor } = harness({}, false);
    monitor.setRealtimeConnected(true);
    monitor.setEventCapability(advertised === true);
    await flush(); await scheduler.advance(60000);
    assert.equal(state.reads, 31, 'old/disabled server keeps the fast fallback');
    monitor.setEventCapability(true);
    const before = state.reads;
    await scheduler.advance(15000);
    assert.equal(state.reads, before + 1);
    monitor.setEventCapability(false);
    await scheduler.advance(2000);
    assert.equal(state.reads, before + 2, 'rollback of capability immediately restores the fast fallback');
    monitor.dispose();
  }
});

test('a failed idle read restores fast fallback until a successful capability confirmation', async () => {
  let reads = 0;
  const { scheduler, monitor } = harness({
    read: async () => { if (++reads === 2) throw Error('offline'); return reads; },
  });
  monitor.setRealtimeConnected(true); await flush();
  await scheduler.advance(15000); assert.equal(reads, 2);
  await scheduler.advance(2000); assert.equal(reads, 3);
  monitor.setEventCapability(true);
  await scheduler.advance(14999); assert.equal(reads, 3);
  await scheduler.advance(1); assert.equal(reads, 4);
  monitor.dispose();
});
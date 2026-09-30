import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
function load(file, dependencies = {}, timers = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../apps/mobile/src/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  runInNewContext(source, { module, exports: module.exports, console, AbortController, Error, ...timers,
    require: name => {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return JsxRuntime;
      if (!(name in dependencies)) throw new Error('Unexpected import: ' + name);
      return dependencies[name];
    },
  });
  return module.exports;
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
const call = id => ({ id, room_id: 'room', caller_id: 'me', callee_id: 'friend', status: 'ended', media: 'audio', created_at: '2026-10-01T01:00:00Z', other: { username: id } });
function fixture({ deferred = false, foreground = true, callActive = false } = {}) {
  const scheduler = clock(), listeners = new Set(), reads = [];
  const state = { callActive, userId: 'me', calls: [call('initial')] };
  const native = Object.fromEntries(['FlatList', 'Pressable', 'Text', 'TextInput', 'View'].map(name => [name, name]));
  native.StyleSheet = { create: value => value };
  native.Alert = { alert() {} };
  native.Modal = ({ visible, children }) => visible ? React.createElement('Modal', null, children) : null;
  native.AppState = {
    currentState: foreground ? 'active' : 'background',
    addEventListener: (_, callback) => { listeners.add(callback); return { remove() { listeners.delete(callback); } }; },
  };
  const { CallsScreen } = load('screens/CallsScreen.tsx', {
    'react-native': native, '@expo/vector-icons/Ionicons': 'Icon',
    '../components': { Avatar: 'Avatar', PrimaryButton: 'Button', StateBlock: 'StateBlock' },
    '../CallProvider': { useCalls: () => ({ startCall: async () => {}, callActive: state.callActive }) },
    '../messagingApi': { loadCalls: (activeOnly, currentId, signal) => {
      const request = { activeOnly, currentId, signal };
      reads.push(request);
      return deferred ? new Promise((resolve, reject) => { request.resolve = calls => resolve({ calls }); request.reject = reject; }) : Promise.resolve({ calls: state.calls });
    } },
    '../callActivity': load('callActivity.ts'), '../runtime': { chatClient: {} }, '../theme': { colors: {} },
    './ContactsSheet': { ContactsSheet: 'ContactsSheet' },
    '../visibleScreenRefresh': load('visibleScreenRefresh.ts', {}, scheduler.timers),
  }, scheduler.timers);
  let view;
  const element = () => React.createElement(CallsScreen, { userId: state.userId });
  return {
    scheduler, reads, state, listeners,
    get list() { return view.root.findByType('FlatList').props; },
    get text() { return view.root.findAllByType('Text').flatMap(node => node.children.filter(child => typeof child === 'string')).join(' '); },
    async mount() { await act(async () => { view = Renderer.create(element()); await flush(); }); },
    async update(values) { Object.assign(state, values); await act(async () => { view.update(element()); await flush(); }); },
    async appState(next) { await act(async () => { native.AppState.currentState = next; for (const listener of listeners) listener(next); await flush(); }); },
    async advance(ms) { await act(async () => { await scheduler.advance(ms); }); },
    async resolve(index, calls = []) { await act(async () => { reads[index].resolve(calls); await flush(); }); },
    async reject(index, error) { await act(async () => { reads[index].reject(error); await flush(); }); },
    async refresh() { await act(async () => { view.root.findByType('FlatList').props.onRefresh(); await flush(); }); },
    async unmount() { await act(async () => { view.unmount(); await flush(); }); },
  };
}

test('call history stops all timer work in background and refreshes immediately on return', async () => {
  const f = fixture();
  await f.mount();
  assert.equal(f.reads.length, 1);
  assert.equal(f.reads[0].activeOnly, false, 'history still loads complete call records');
  await f.advance(10000);
  assert.equal(f.reads.length, 2);
  await f.appState('background');
  assert.equal(f.scheduler.jobs.size, 0);
  await f.advance(60000);
  assert.equal(f.reads.length, 2, 'no hidden history requests');
  f.state.calls = [call('returned')];
  await f.appState('active');
  assert.equal(f.reads.length, 3);
  assert.equal(f.list.data[0].id, 'returned');
  await f.unmount();
  assert.equal(f.scheduler.jobs.size, 0);
  assert.equal(f.listeners.size, 0);
});

test('live call overlays pause history polling and ending the call refreshes history immediately', async () => {
  const f = fixture();
  await f.mount();
  await f.update({ callActive: true });
  assert.equal(f.scheduler.jobs.size, 0);
  await f.advance(60000);
  assert.equal(f.reads.length, 1);
  await f.appState('background');
  await f.appState('active');
  assert.equal(f.reads.length, 1, 'foregrounding must not compete with a live call');
  await f.update({ callActive: false, calls: [call('just-ended')] });
  assert.equal(f.reads.length, 2);
  assert.equal(f.list.data[0].id, 'just-ended');
  await f.unmount();
});

test('slow history reads stay serial and manual refresh queues one fresh result', async () => {
  const f = fixture({ deferred: true });
  await f.mount();
  await f.advance(60000);
  assert.equal(f.reads.length, 1, 'slow I/O must not stack ten-second requests');
  for (let n = 0; n < 5; n++) await f.refresh();
  assert.equal(f.reads.length, 1);
  await f.resolve(0, [call('obsolete')]);
  assert.equal(f.reads.length, 2);
  assert.equal(f.list.data.length, 0, 'superseded snapshots stay off screen');
  await f.resolve(1, [call('fresh')]);
  assert.equal(f.list.data[0].id, 'fresh');
  assert.equal(f.list.refreshing, false);
  assert.equal(f.scheduler.jobs.size, 1);
  await f.unmount();
});

test('background and call overlays abort pending reads and reject their late responses', async () => {
  for (const pause of ['background', 'call']) {
    const f = fixture({ deferred: true });
    await f.mount();
    if (pause === 'background') await f.appState('background');
    else await f.update({ callActive: true });
    assert.equal(f.reads[0].signal.aborted, true);
    if (pause === 'background') await f.appState('active');
    else await f.update({ callActive: false });
    assert.equal(f.reads.length, 1, 'wait for aborted transport settlement to avoid overlap');
    await f.resolve(0, [call('late-hidden')]);
    assert.equal(f.reads.length, 2, 'resume runs as soon as the cancelled read settles');
    assert.equal(f.list.data.length, 0);
    await f.resolve(1, [call('current')]);
    assert.equal(f.list.data[0].id, 'current');
    await f.unmount();
  }
});

test('account changes and unmount abort old reads without updating the new account', async () => {
  const f = fixture({ deferred: true });
  await f.mount();
  await f.update({ userId: 'second-account' });
  assert.equal(f.reads[0].signal.aborted, true);
  assert.equal(f.reads.length, 2);
  await f.resolve(1, [call('second-account-call')]);
  await f.resolve(0, [call('first-account-call')]);
  assert.equal(f.list.data[0].id, 'second-account-call');
  await f.advance(10000);
  await f.unmount();
  assert.equal(f.reads[2].signal.aborted, true);
  await f.resolve(2, [call('after-unmount')]);
  assert.equal(f.scheduler.jobs.size, 0);
});

test('hidden initial mounts defer history and transport failures retry without discarding prior calls', async () => {
  const f = fixture({ deferred: true, foreground: false });
  await f.mount();
  await f.advance(60000);
  assert.equal(f.reads.length, 0);
  await f.appState('active');
  await f.resolve(0, [call('saved')]);
  await f.advance(10000);
  await f.reject(1, new Error('temporarily offline'));
  assert.equal(f.list.data[0].id, 'saved');
  assert.match(f.text, /temporarily offline/);
  await f.advance(10000);
  await f.resolve(2, [call('recovered')]);
  assert.equal(f.list.data[0].id, 'recovered');
  assert.doesNotMatch(f.text, /temporarily offline/);
  await f.unmount();
});

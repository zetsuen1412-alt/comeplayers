import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

function fixture({ failure = null, failEnrollment = false, existing = false } = {}) {
  let current, listener, fetches = 0, enrollments = 0, nextTimer = 0, vault = null;
  let snapshot = existing ? { roster: { identity: { userId }, devices: [] }, roster_hash: 'hash', encrypted_backup: {} } : null;
  const timers = new Map();
  const appState = { currentState: 'active', addEventListener: (_event, callback) => {
    listener = callback; return { remove() { listener = null; } };
  } };
  const recovery = { generation: 1, resetAt: '2026-09-16T00:00:00.000Z', requirePasskey: true, allowDeviceSetup: true };
  const dependencies = {
    react: React, 'react/jsx-runtime': JsxRuntime, 'react-native': { AppState: appState },
    './mobileSecureTransport': {
      mobileSecureTransport: async () => { fetches++; if (failure) throw new Error(failure); return { account: snapshot, recovery }; },
      mobileSecureBinaryTransport() {},
    },
    './secureHistorySync': { SecureHistorySync: class {} },
    './secureMessengerV2': { SecureMessengerV2: class { sync = async () => {}; pause = async () => {}; } },
    './verifiedVault': { openVerifiedVault: async () => vault },
    './mediaStore': { cleanPrivatePreviewCache() {} },
    './nativeRecoveryPolicy': { applyNativeRecoveryPolicy: async () => {} },
    './recoveryPolicy': { parseRecoveryPolicy: value => value, assertLocalAccountMatch() {} },
    './crypto': { fingerprint: () => 'root' },
    './multiDevice': { verifyRoster() {}, rosterHash: () => 'hash' },
    '../runtime': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) } } },
    './automaticEnrollment': { ensureAutomaticEnrollment: async () => {
      enrollments++;
      if (failEnrollment) throw new Error('Connection lost after commit');
      if (snapshot) return false;
      snapshot = { roster: { identity: { userId }, devices: [{ id: 'device' }] }, roster_hash: 'hash' };
      vault = { descriptor: { deviceId: 'device' }, get: async () => ({ identity: { userId } }) };
      return true;
    } },
    './driveBackupPreference': { maybeRunAutomaticDriveBackup: async () => {} },
  };
  const mod = { exports: {} };
  const source = readFileSync(new URL('../apps/mobile/src/secure/PrivateProvider.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  runInNewContext(outputText, {
    module: mod, exports: mod.exports, Error, console,
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => 1, clearInterval() {},
    require(name) { if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name); return dependencies[name]; },
  });
  const { PrivateProvider, usePrivateMessenger } = mod.exports;
  function Child() { current = usePrivateMessenger(); return React.createElement('Inbox'); }
  function App() { return React.createElement(PrivateProvider, { userId, enabled: true }, React.createElement(Child)); }
  return {
    App, timers, current: () => current, fetches: () => fetches, enrollments: () => enrollments,
    reconnect() { failure = null; failEnrollment = false; },
    foreground() { appState.currentState = 'active'; listener?.('active'); },
    background() { appState.currentState = 'background'; listener?.('background'); },
    tick() { const next = timers.entries().next().value; assert.ok(next, 'Expected a scheduled retry'); const [id, timer] = next; timers.delete(id); timer.callback(); return timer.delay; },
  };
}

async function mount(t, f) {
  let view;
  await act(async () => { view = Renderer.create(React.createElement(f.App)); await flush(); });
  t.after(async () => { await act(async () => view.unmount()); });
  return view;
}

test('an offline first launch resumes chat automatically when the connection returns', async t => {
  const f = fixture({ failure: 'Network request failed' }); await mount(t, f);
  assert.equal(f.current().messenger, null); assert.equal(f.timers.size, 1);
  f.reconnect();
  await act(async () => { assert.equal(f.tick(), 1000); await flush(); });
  assert.ok(f.current().messenger); assert.equal(f.current().setup, null);
  assert.equal(f.current().error, ''); assert.equal(f.enrollments(), 1); assert.equal(f.timers.size, 0);
});

test('a lost enrollment response retries enrollment instead of leaving a permanent locked state', async t => {
  const f = fixture({ failEnrollment: true }); await mount(t, f);
  assert.equal(f.enrollments(), 1); assert.equal(f.current().messenger, null);
  f.reconnect();
  await act(async () => { f.tick(); await flush(); });
  assert.equal(f.enrollments(), 2); assert.ok(f.current().messenger); assert.equal(f.current().error, '');
});

test('automatic retries have a fixed bound; a later foreground session can resume', async t => {
  const f = fixture({ failure: 'Connection timed out. Please try again.' }); await mount(t, f);
  for (const delay of [1000, 3000, 10000, 30000]) await act(async () => { assert.equal(f.tick(), delay); await flush(); });
  assert.equal(f.fetches(), 5); assert.equal(f.timers.size, 0);
  f.reconnect();
  await act(async () => { f.foreground(); await flush(); });
  assert.ok(f.current().messenger); assert.equal(f.timers.size, 0);
});

test('background retry timers pause, and returning to foreground resumes without a manual setting', async t => {
  const f = fixture({ failure: 'Network request failed' }); await mount(t, f);
  f.background();
  await act(async () => { f.tick(); await flush(); });
  assert.equal(f.fetches(), 1); assert.equal(f.timers.size, 0);
  f.reconnect();
  await act(async () => { f.foreground(); await flush(); });
  assert.ok(f.current().messenger);
});

test('existing-account recovery never starts another automatic retry or creates a replacement identity', async t => {
  const f = fixture({ existing: true }); await mount(t, f);
  assert.equal(f.current().setup.kind, 'recover'); assert.equal(f.timers.size, 0);
  const enrollments = f.enrollments();
  await act(async () => { f.foreground(); await flush(); });
  assert.equal(f.enrollments(), enrollments); assert.equal(f.current().messenger, null); assert.equal(f.timers.size, 0);
});

test('integrity and authentication failures are not retried on a timer or foreground', async t => {
  for (const message of ['The device list failed verification.', 'Sign in to continue.']) {
    const f = fixture({ failure: message }); await mount(t, f);
    assert.equal(f.timers.size, 0);
    await act(async () => { f.foreground(); await flush(); });
    assert.equal(f.fetches(), 1); assert.equal(f.enrollments(), 0); assert.equal(f.current().error, message);
  }
});

test('unmount cancels an offline retry before another account can be opened', async t => {
  const f = fixture({ failure: 'Network request failed' }), view = await mount(t, f);
  assert.equal(f.timers.size, 1);
  await act(async () => view.unmount());
  assert.equal(f.timers.size, 0); assert.equal(f.fetches(), 1);
});

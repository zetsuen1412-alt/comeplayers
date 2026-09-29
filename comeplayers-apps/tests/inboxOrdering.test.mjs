import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(`../apps/mobile/src/${file}`, import.meta.url), 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  assert.equal(diagnostics?.length || 0, 0);
  const mod = { exports: {} };
  runInNewContext(outputText, {
    module: mod, exports: mod.exports, console, Error, Date, Promise, setTimeout, clearTimeout, setInterval, clearInterval, ...globals,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return mod.exports;
}

const ordering = load('inboxOrdering.ts');
const room = (id, activity, created = '2026-09-01T00:00:00.000Z') => ({ id, last_message_at: activity, created_at: created, unread_count: 0 });

test('newest rooms come first within both pinned and regular chats', () => {
  const rooms = [room('old-pinned', '2026-09-20T00:00:00.000Z'), room('new-regular', '2026-09-29T00:00:00.000Z'), room('new-pinned', '2026-09-28T00:00:00.000Z'), room('old-regular', null)];
  assert.deepEqual(ordering.sortVisibleRooms(rooms, new Set(['old-pinned', 'new-pinned'])).map(item => item.id), ['new-pinned', 'old-pinned', 'new-regular', 'old-regular']);
});

test('saved secure rooms retain server activity ordering and local decrypted previews', async () => {
  const messages = new Map([
    ['decrypted', [{ created_at: '2026-09-29T11:59:00.000Z', sender_id: 'friend', message: 'Halo dari Ilham' }]],
    ['local-new', [{ created_at: '2026-09-29T12:15:00.000Z', sender_id: 'me', message: 'Balasan baru' }]],
  ]);
  const rows = new Map();
  const requestedLimits = [];
  let writeTransactions = 0;
  const vault = {
    descriptor: { identity: { userId: 'me' } },
    get: async (kind, id) => rows.get(`${kind}:${id}`) ?? null,
    list: async (kind, id, limit) => { requestedLimits.push(limit); return kind === 'message-v2' ? (messages.get(id) || []).slice(0, limit) : []; },
    encode: (kind, id, value) => ({ kind, id, value }),
    putRows: async values => { writeTransactions++; for (const value of values) rows.set(`${value.kind}:${value.id}`, value.value); },
  };
  const { SecureMessengerV2 } = load('secure/secureMessengerV2.ts', {
    'expo-file-system': { File: class {}, Paths: {} },
    './mediaStore': { MAX_PRIVATE_FILE: 8 * 1024 * 1024 },
    './secureAttachment': { verifySecureAttachment() {} },
    './secureHistorySync': {},
    '../messagingApi': { loadCalls: async () => ({ calls: [] }) },
    '../runtime': { chatClient: {} },
    '../inboxOrdering': ordering,
    './restoreMerge': { mergeRestoredValue: (_kind, _old, value) => value },
  });
  const messenger = new SecureMessengerV2(vault, {});
  const serverRooms = [
    { ...room('decrypted', '2026-09-29T12:00:00.000Z'), last_message: null },
    { ...room('opaque', '2026-09-29T12:10:00.000Z'), last_message: null },
    { ...room('local-new', '2026-09-29T12:05:00.000Z'), last_message: null },
  ];
  const result = await messenger.saveRooms(serverRooms);
  assert.equal(result.map(item => item.id).join(','), 'local-new,opaque,decrypted');
  assert.equal(result.find(item => item.id === 'decrypted').last_message, 'Halo dari Ilham');
  assert.equal(result.find(item => item.id === 'decrypted').last_message_at, '2026-09-29T12:00:00.000Z');
  assert.equal(result.find(item => item.id === 'opaque').last_message, 'Pesan baru');
  assert.equal(result.find(item => item.id === 'local-new').last_message_at, '2026-09-29T12:15:00.000Z');
  assert.ok(requestedLimits.every(limit => limit === 1));
  assert.equal(writeTransactions, serverRooms.length);
  await messenger.saveRooms(serverRooms);
  assert.equal(writeTransactions, serverRooms.length, 'unchanged polling must not rewrite encrypted room records');
});

test('inbox reloads after encrypted messages change', async () => {
  let preview = 'Pesan pertama';
  let activeMessenger = null;
  let notify;
  let snapshot;
  const timers = new Map();
  let nextTimer = 0;
  const messenger = {
    saveRooms: async rooms => rooms.map(item => ({ ...item, last_message: preview })),
    subscribe(listener) { notify = listener; return () => { notify = null; }; },
  };
  const appState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
  const channel = { on() { return this; }, subscribe() { return this; } };
  const { InboxProvider, useInbox } = load('InboxProvider.tsx', {
    react: React,
    'react/jsx-runtime': JsxRuntime,
    'react-native': { AppState: appState },
    './runtime': { chatClient: { listDirectRooms: async () => [room('friend', '2026-09-29T12:00:00.000Z')] }, supabase: { channel: () => channel, removeChannel: async () => {} } },
    './messagingApi': { loadChatPreferences: async () => ({ preferences: [] }) },
    './inboxOrdering': ordering,
    './secure/PrivateProvider': { usePrivateMessenger: () => ({ messenger: activeMessenger }) },
  }, {
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval: () => 1,
    clearInterval() {},
  });
  function Child() { snapshot = useInbox(); return React.createElement('Inbox'); }
  function App({ available }) {
    activeMessenger = available ? messenger : null;
    return React.createElement(InboxProvider, { userId: 'me', enabled: true }, React.createElement(Child));
  }
  let view;
  await act(async () => { view = Renderer.create(React.createElement(App, { available: false })); for (let i = 0; i < 15; i++) await Promise.resolve(); });
  assert.equal(snapshot.rooms.length, 1);
  assert.equal(snapshot.rooms[0].last_message, undefined);
  await act(async () => { view.update(React.createElement(App, { available: true })); for (let i = 0; i < 15; i++) await Promise.resolve(); });
  assert.equal(snapshot.rooms[0].last_message, 'Pesan pertama');
  preview = 'Pesan terbaru';
  await act(async () => { notify(); for (const [id, callback] of timers) { timers.delete(id); callback(); } for (let i = 0; i < 15; i++) await Promise.resolve(); });
  assert.equal(snapshot.rooms[0].last_message, 'Pesan terbaru');
  await act(async () => view.unmount());
});

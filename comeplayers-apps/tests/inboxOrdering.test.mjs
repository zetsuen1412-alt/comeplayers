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

test('newest conversation comes first even when an older chat is pinned', () => {
  const rooms = [room('old-pinned', '2026-09-20T00:00:00.000Z'), room('new-regular', '2026-09-29T00:00:00.000Z'), room('new-pinned', '2026-09-28T00:00:00.000Z'), room('old-regular', null)];
  assert.deepEqual(ordering.sortVisibleRooms(rooms).map(item => item.id), ['new-regular', 'new-pinned', 'old-pinned', 'old-regular']);
});

test('saved secure rooms retain server activity ordering and local decrypted previews', async () => {
  const messages = new Map([
    ['decrypted', [{ created_at: '2026-09-29T11:59:00.000Z', sender_id: 'friend', message: 'Halo dari Ilham' }]],
    ['local-new', [{ created_at: '2026-09-29T12:15:00.000Z', sender_id: 'me', message: 'Balasan baru' }]],
    ['call', [{ created_at: '2026-09-29T12:18:00.000Z', server_created_at: '2026-09-29T12:18:00.000Z', sender_id: 'friend', message: 'Pesan sebelum telepon' }]],
    ['newer-message', [{ created_at: '2026-09-29T12:30:00.000Z', sender_id: 'me', message: 'Pesan sesudah telepon' }]],
    ['synced-message', [{ created_at: '2026-09-29T12:01:00.000Z', server_created_at: '2026-09-29T12:12:00.000Z', sender_id: 'friend', message: 'Pesan sudah tersinkron' }]],
    ['message-after-call', [{ created_at: '2026-09-29T12:01:00.000Z', server_created_at: '2026-09-29T12:12:00.000Z', sender_id: 'friend', message: 'Pesan lama' }]],
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
    { ...room('call', '2026-09-29T12:20:00.000Z'), activity_kind: 'call', activity_preview: 'Panggilan video berakhir', last_message: null },
    { ...room('newer-message', '2026-09-29T12:25:00.000Z'), activity_kind: 'call', activity_preview: 'Panggilan suara berakhir', last_message: null },
    { ...room('synced-message', '2026-09-29T12:12:00.000Z'), activity_kind: 'message', last_message: null },
    { ...room('message-after-call', '2026-09-29T12:13:00.000Z'), activity_kind: 'message', last_message: null },
  ];
  const result = await messenger.saveRooms(serverRooms);
  assert.equal(result.map(item => item.id).join(','), 'newer-message,call,local-new,message-after-call,synced-message,opaque,decrypted');
  assert.equal(result.find(item => item.id === 'decrypted').last_message, 'Halo dari Ilham');
  assert.equal(result.find(item => item.id === 'decrypted').last_message_at, '2026-09-29T12:00:00.000Z');
  assert.equal(result.find(item => item.id === 'opaque').last_message, 'Pesan baru');
  assert.equal(result.find(item => item.id === 'local-new').last_message_at, '2026-09-29T12:15:00.000Z');
  assert.equal(result.find(item => item.id === 'call').last_message, 'Panggilan video berakhir');
  assert.equal(result.find(item => item.id === 'call').activity_kind, 'call');
  assert.equal(result.find(item => item.id === 'newer-message').last_message, 'Pesan sesudah telepon');
  assert.equal(result.find(item => item.id === 'newer-message').activity_kind, 'message');
  assert.equal(result.find(item => item.id === 'synced-message').last_message, 'Pesan sudah tersinkron');
  assert.equal(result.find(item => item.id === 'message-after-call').last_message, 'Pesan baru');
  assert.ok(requestedLimits.every(limit => limit === 1));
  assert.equal(writeTransactions, serverRooms.length);
  await messenger.saveRooms(serverRooms);
  assert.equal(writeTransactions, serverRooms.length, 'unchanged polling must not rewrite encrypted room records');
  messages.set('message-after-call', [{ created_at: '2026-09-29T12:02:00.000Z', server_created_at: '2026-09-29T12:13:00.000Z', sender_id: 'friend', message: 'Pesan yang baru tiba' }]);
  const afterSync = await messenger.saveRooms(serverRooms);
  assert.equal(afterSync.find(item => item.id === 'message-after-call').last_message, 'Pesan yang baru tiba');
});

test('replaying a decrypted event records its server time even when a local copy exists', async () => {
  const roomId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const messageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const rows = new Map([
    [`room:${roomId}`, { id: roomId, buyer_id: 'me', seller_id: 'friend', last_message_at: '2026-09-29T12:00:00.000Z', unread_count: 0 }],
    [`message-v2:${messageId}`, { id: messageId, room_id: roomId, sender_id: 'me', receiver_id: 'friend', created_at: '2026-09-29T11:59:00.000Z', message: 'Pesan lokal', is_read: true, delivery: 'queued' }],
  ]);
  const vault = {
    descriptor: { identity: { userId: 'me' } },
    get: async (kind, id) => rows.get(`${kind}:${id}`) ?? null,
    encode: (kind, id, value) => ({ kind, id, value }),
    putRows: async writes => { for (const row of writes) rows.set(`${row.kind}:${row.id}`, row.value); },
  };
  const { SecureMessengerV2 } = load('secure/secureMessengerV2.ts', {
    'expo-file-system': { File: class {}, Paths: {} },
    './mediaStore': { MAX_PRIVATE_FILE: 8 * 1024 * 1024 },
    './secureAttachment': { verifySecureAttachment() {} },
    './secureHistorySync': {},
    '../messagingApi': { loadCalls: async () => ({ calls: [] }) },
    '../runtime': { chatClient: {} },
    '../inboxOrdering': ordering,
    './restoreMerge': load('secure/restoreMerge.ts'),
  });
  const messenger = new SecureMessengerV2(vault, {});
  await messenger.apply({
    event: { id: messageId, roomId, senderId: 'me', createdAt: '2026-09-29T11:59:00.000Z', blobId: null },
    payload: { v: 2, kind: 'message', text: 'Pesan lokal' },
    serverCreatedAt: '2026-09-29T12:00:00.000Z',
  });
  assert.equal(rows.get(`message-v2:${messageId}`).server_created_at, '2026-09-29T12:00:00.000Z');
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

test('call history uses the most recent state change and explains its direction', () => {
  const activity = load('callActivity.ts');
  const olderStart = { id: 'ended-late', caller_id: 'me', callee_id: 'friend', media: 'video', status: 'ended', created_at: '2026-09-29T11:00:00.000Z', answered_at: '2026-09-29T11:01:00.000Z', ended_at: '2026-09-29T12:00:00.000Z' };
  const missed = { id: 'missed', caller_id: 'friend', callee_id: 'me', media: 'audio', status: 'missed', created_at: '2026-09-29T11:30:00.000Z', ended_at: '2026-09-29T11:31:00.000Z' };
  assert.equal(activity.sortCallsByActivity([missed, olderStart]).map(call => call.id).join(','), 'ended-late,missed');
  assert.equal(activity.callActivityAt(olderStart), '2026-09-29T12:00:00.000Z');
  assert.equal(activity.callActivityPreview(olderStart, 'me'), 'Panggilan video berakhir');
  assert.equal(activity.callActivityPreview(missed, 'me'), 'Panggilan suara tak terjawab');
  assert.equal(activity.callActivityPreview({ ...missed, caller_id: 'me', callee_id: 'friend' }, 'me'), 'Panggilan suara tidak dijawab');
});

test('call activity cannot trigger a message toast from an older unread message', async () => {
  let inboxRooms = [{ ...room('friend', '2026-09-29T12:00:00.000Z'), last_message: 'Halo', unread_count: 1 }];
  const native = { AppState: { currentState: 'active' }, Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value } };
  const { MessageAlerts } = load('MessageAlerts.tsx', {
    react: React,
    'react/jsx-runtime': JsxRuntime,
    'react-native': native,
    '@comeplayers/chat-core': { roomName: () => 'Friend', roomPreview: value => value.last_message || '', roomUnreadCount: value => value.unread_count || 0 },
    './InboxProvider': { useInbox: () => ({ rooms: inboxRooms, preferences: [], loading: false }) },
    './inboxOrdering': ordering,
    './theme': { colors: { yellow: '#ff0', text: '#fff', textMuted: '#aaa', panelStrong: '#222' } },
  });
  const account = { phoneRequired: false, phoneVerified: true, settings: { message_notifications: true } };
  const props = { session: { user: { id: 'me' } }, account, onOpen() {}, onUnread() {} };
  let view;
  await act(async () => { view = Renderer.create(React.createElement(MessageAlerts, props)); });
  inboxRooms = [{ ...room('friend', '2026-09-29T12:01:00.000Z'), activity_kind: 'call', activity_preview: 'Panggilan suara berakhir', unread_count: 1 }];
  await act(async () => view.update(React.createElement(MessageAlerts, props)));
  assert.equal(view.root.findAllByType('Pressable').length, 0);
  inboxRooms = [{ ...room('friend', '2026-09-29T12:02:00.000Z'), last_message: 'Pesan baru', unread_count: 2 }];
  await act(async () => view.update(React.createElement(MessageAlerts, props)));
  assert.ok(view.root.findAllByType('Pressable').length > 0);
  await act(async () => view.unmount());
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(path, dependencies = {}, extra = {}) {
  const module = { exports: {} };
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  runInNewContext(outputText, { module, exports: module.exports, require: name => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return { jsx: React.createElement, jsxs: React.createElement };
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected import ${name}`);
  }, setTimeout, clearTimeout, Date, Error, AbortController, ...extra });
  return module.exports;
}
const policy = load('../apps/mobile/src/notificationPolicy.ts');
const roomId = '9c338118-f18e-4429-b9f2-1655c34608fb';
const callId = '12345678-abcd-4567-abcd-123456789012';

test('push navigation accepts only known payloads for this account, never arbitrary URLs', () => {
  assert.equal(policy.notificationTarget({ type: 'chat_message', roomId, userId: 'other' }, 'me'), null);
  assert.equal(policy.notificationTarget({ type: 'chat_message', roomId: 'https://untrusted.example' }, 'me'), null);
  assert.equal(policy.notificationTarget({ type: 'incoming_call', roomId, callId: 'bad' }, 'me'), null);
  assert.equal(policy.notificationTarget({ type: 'marketing', roomId }, 'me'), null);
  assert.equal(policy.notificationTarget({ type: 'incoming_call', roomId, callId, userId: 'me' }, 'me').callId, callId);
  assert.equal(policy.notificationTarget({ type: 'chat_message', roomId }, 'me').roomId, roomId);
});

test('restored history, duplicate events and backward timestamps do not replay message sounds', () => {
  const current = new Date().toISOString();
  assert.equal(policy.freshMessageActivity(current, current), false);
  assert.equal(policy.freshMessageActivity(undefined, new Date(Date.now() - 120_000).toISOString()), false);
  assert.equal(policy.freshMessageActivity(current, new Date(Date.now() - 10_000).toISOString()), false);
  assert.equal(policy.freshMessageActivity(undefined, current), true);
});

test('expired call alerts open history quietly while current call alerts refresh server call status', () => {
  const expired = policy.notificationTarget({ type: 'incoming_call', roomId, callId, expiresAt: Date.now() - 1 }, 'me');
  assert.equal(policy.freshIncomingCall(expired), false);
  const recent = policy.notificationTarget({ type: 'incoming_call', roomId, callId, expiresAt: new Date(Date.now() + 30_000).toISOString() }, 'me');
  assert.equal(policy.freshIncomingCall(recent), true);
});

test('community notifications keep history, outgoing message and read receipt in the selected channel', async () => {
  const requests = [];
  const api = load('../packages/chat-core/src/client.ts', {}, { URLSearchParams, Headers, FormData });
  const client = api.createChatClient({ baseUrl: 'https://www.comeplayers.com', getAccessToken: async () => 'token', fetchImpl: async (url, init) => { requests.push({ url, init }); return { ok: true, json: async () => ({ room: { id: roomId }, messages: [] }) }; } });
  await client.getConversation(roomId, 40, { channelId: callId });
  await client.sendMessage(roomId, 'Reply in the correct channel', undefined, undefined, callId);
  await client.markRead(roomId, callId, 'message-id');
  assert.equal(new URL(requests[0].url).searchParams.get('channel'), callId);
  assert.equal(JSON.parse(requests[1].init.body).channelId, callId);
  assert.equal(JSON.parse(requests[2].init.body).channelId, callId);
  assert.equal(JSON.parse(requests[2].init.body).lastReadMessageId, 'message-id');
});

function fixture({ granted = true, tokenPromise } = {}) {
  const listeners = {}, requests = [], opened = [], lookup = [], store = new Map();
  let permissions = { granted, canAskAgain: true };
  let prompts = 0, receivedHandler, value;
  const notifications = {
    AndroidImportance: { HIGH: 6, MAX: 7 }, AndroidNotificationVisibility: { PRIVATE: 2 },
    AndroidAudioUsage: { NOTIFICATION_RINGTONE: 6 }, AndroidAudioContentType: { SONIFICATION: 4 },
    DEFAULT_ACTION_IDENTIFIER: 'tap',
    setNotificationHandler: value => { receivedHandler = value; },
    setNotificationChannelAsync: async () => undefined,
    getPermissionsAsync: async () => permissions,
    requestPermissionsAsync: async () => { prompts++; permissions = { granted: true, canAskAgain: true }; return permissions; },
    getExpoPushTokenAsync: async () => typeof tokenPromise === 'function' ? tokenPromise() : tokenPromise ? tokenPromise : { data: 'ExpoPushToken[test-device]' },
    addNotificationReceivedListener: fn => { listeners.received = fn; return { remove() {} }; },
    addNotificationResponseReceivedListener: fn => { listeners.tapped = fn; return { remove() {} }; },
    addPushTokenListener: fn => { listeners.token = fn; return { remove() {} }; },
    getLastNotificationResponseAsync: async () => null, clearLastNotificationResponseAsync: async () => undefined,
    dismissNotificationAsync: async () => undefined, dismissAllNotificationsAsync: async () => undefined,
    setBadgeCountAsync: async () => undefined,
  };
  const api = load('../apps/mobile/src/NotificationProvider.tsx', {
    'react-native': { AppState: { currentState: 'active', addEventListener: (_name, fn) => { listeners.state = fn; return { remove() {} }; } }, Linking: { openSettings: async () => undefined }, Platform: { OS: 'android' } },
    '@react-native-async-storage/async-storage': { getItem: async key => store.get(key) || null, setItem: async (key, item) => store.set(key, item) },
    'expo-constants': { easConfig: { projectId: 'project' } }, 'expo-notifications': notifications,
    './runtime': { apiUrl: 'https://www.comeplayers.com', chatClient: { getConversation: async id => { lookup.push(id); return { room: { id } }; } } },
    './notificationPolicy': policy, './InboxProvider': { useInbox: () => ({ reload: async () => undefined }) },
  }, { fetch: async (_url, options) => { requests.push(options); return { ok: true }; } });
  function Observe() { value = api.useNotifications(); return null; }
  const render = (userId, options = {}) => React.createElement(api.NotificationProvider, { session: { user: { id: userId }, access_token: `${userId}-token` }, enabled: true, unread: 2, ...options, onOpen: room => opened.push(room.id) }, React.createElement(Observe));
  return { api, requests, listeners, opened, lookup, render, get value() { return value; }, get prompts() { return prompts; }, get receivedHandler() { return receivedHandler; } };
}
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

test('notification permission is optional; receiving never changes chat and tapping opens only the verified room', async () => {
  const f = fixture({ granted: false });
  let renderer;
  await act(async () => { renderer = TestRenderer.create(f.render('me')); await flush(); });
  assert.equal(f.prompts, 0);
  assert.equal(f.value.showPrompt, true);
  await act(async () => { await f.value.enable(); });
  assert.equal(f.prompts, 1);
  assert.equal(f.value.status, 'ready');
  assert.equal(f.requests[0].method, 'POST');
  const notification = { request: { identifier: 'one', content: { data: { type: 'chat_message', roomId, userId: 'me' } } } };
  await act(async () => { f.listeners.received(notification); await flush(); });
  assert.equal(f.opened.length, 0);
  assert.equal((await f.receivedHandler.handleNotification(notification)).shouldPlaySound, false);
  const community = { request: { content: { data: { type: 'chat_message', roomId, channelId: callId, userId: 'me' } } } };
  assert.equal((await f.receivedHandler.handleNotification(community)).shouldShowBanner, true);
  await act(async () => { f.value.setCallActive(true); });
  assert.equal((await f.receivedHandler.handleNotification(community)).shouldPlaySound, false);
  await act(async () => { f.listeners.tapped({ actionIdentifier: 'tap', notification }); await flush(); });
  assert.equal(f.opened[0], roomId);
  assert.equal(f.lookup[0], roomId);
  await act(async () => { f.listeners.tapped({ actionIdentifier: 'tap', notification }); await flush(); });
  assert.equal(f.opened.length, 1);
  await act(async () => { renderer.unmount(); await flush(); });
});

test('account switch removes the previous token with the previous session and ignores stale-account taps', async () => {
  const f = fixture();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(f.render('first')); await flush(); });
  await act(async () => { renderer.update(f.render('second')); await flush(); });
  const removal = f.requests.find(request => request.method === 'DELETE');
  assert.equal(removal.headers.Authorization, 'Bearer first-token');
  assert.equal(f.requests.at(-1).headers.Authorization, 'Bearer second-token');
  await act(async () => { f.listeners.tapped({ actionIdentifier: 'tap', notification: { request: { identifier: 'old', content: { data: { type: 'chat_message', roomId, userId: 'first' } } } } }); await flush(); });
  assert.equal(f.opened.length, 0);
  await act(async () => { renderer.unmount(); await flush(); });
});

test('token resolution after unmount cannot register a signed-out account', async () => {
  let resolve;
  const tokenPromise = new Promise(done => { resolve = done; });
  const f = fixture({ tokenPromise });
  let renderer;
  await act(async () => { renderer = TestRenderer.create(f.render('me')); await flush(); });
  await act(async () => { renderer.unmount(); });
  await act(async () => { resolve({ data: 'ExpoPushToken[late]' }); await flush(); });
  assert.equal(f.requests.length, 0);
});

test('foreground ringtone loops only while ringing and stops on background, answer and unmount', async () => {
  let listener;
  const events = [];
  const state = { currentState: 'active', addEventListener: (_name, fn) => { listener = fn; return { remove() {} }; } };
  const player = { loop: false, play() { events.push('play'); }, pause() { events.push('stop'); }, async seekTo() {} };
  const sounds = load('../apps/mobile/src/notificationSounds.ts', {
    'react-native': { AppState: state, Vibration: { vibrate() { events.push('vibrate'); }, cancel() { events.push('cancel-vibration'); } } },
    'expo-audio': { setAudioModeAsync: async mode => { assert.equal(mode.playsInSilentMode, false); }, useAudioPlayer: () => player },
    '../assets/sounds/comeplayers_message.wav': 1, '../assets/sounds/comeplayers_call.wav': 2,
  });
  function Ringtone({ ringing }) { sounds.useIncomingRingtone(ringing); return null; }
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Ringtone, { ringing: true })); await flush(); });
  assert.equal(player.loop, true);
  assert.ok(events.includes('play'));
  await act(async () => { state.currentState = 'background'; listener(); await flush(); });
  assert.deepEqual(events.slice(-2), ['stop', 'cancel-vibration']);
  await act(async () => { state.currentState = 'active'; listener(); await flush(); });
  assert.deepEqual(events.slice(-2), ['play', 'vibrate']);
  await act(async () => { renderer.update(React.createElement(Ringtone, { ringing: false })); await flush(); });
  assert.deepEqual(events.slice(-2), ['stop', 'cancel-vibration']);
  await act(async () => { renderer.unmount(); });
  assert.deepEqual(events.slice(-2), ['stop', 'cancel-vibration']);
});

test('foreground banners distinguish channels inside the same community', async () => {
  const f = fixture();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(f.render('me', { activeRoom: roomId, activeChannel: callId })); await flush(); });
  const notification = channelId => ({ request: { content: { data: { type: 'chat_message', roomId, channelId, userId: 'me' } } } });
  assert.equal((await f.receivedHandler.handleNotification(notification(callId))).shouldShowBanner, false);
  const otherChannel = '11111111-abcd-4567-abcd-123456789012';
  assert.equal((await f.receivedHandler.handleNotification(notification(otherChannel))).shouldShowBanner, true);
  assert.equal((await f.receivedHandler.handleNotification(notification(otherChannel))).shouldPlaySound, true);
  await act(async () => { renderer.unmount(); await flush(); });
});

test('a native token refresh during registration queues another sync and retires the old token', async () => {
  let release;
  let reads = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  const f = fixture({ tokenPromise: () => ++reads === 1 ? waiting : Promise.resolve({ data: 'ExpoPushToken[new-device-token]' }) });
  let renderer;
  await act(async () => { renderer = TestRenderer.create(f.render('me')); await flush(); });
  await act(async () => { f.listeners.token(); await flush(); });
  assert.equal(f.requests.length, 0, 'registration is still waiting for the first token');
  await act(async () => { release({ data: 'ExpoPushToken[old-device-token]' }); await flush(); });
  assert.equal(reads, 2);
  assert.deepEqual(f.requests.filter(request => request.method === 'POST').map(request => JSON.parse(request.body).expoPushToken), ['ExpoPushToken[old-device-token]', 'ExpoPushToken[new-device-token]']);
  assert.equal(JSON.parse(f.requests.find(request => request.method === 'DELETE').body).expoPushToken, 'ExpoPushToken[old-device-token]');
  assert.equal(f.value.status, 'ready');
  await act(async () => { renderer.unmount(); await flush(); });
});

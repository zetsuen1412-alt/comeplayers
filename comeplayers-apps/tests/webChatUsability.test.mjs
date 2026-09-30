import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function loadExports(file, dependencies = {}, globals = {}) {
  const mod = { exports: {} };
  const source = readFileSync(new URL('../../website/' + file, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { fileName: file, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  runInNewContext(outputText, { module: mod, exports: mod.exports, console, Error, URL, URLSearchParams,
    requestAnimationFrame: () => 1, setTimeout: () => 1, clearTimeout() {},
    window: { setInterval: () => 1, clearInterval() {} }, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    navigator: { onLine: true },
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return JsxRuntime;
      if (name === 'react-icons/fa') return new Proxy({}, { get: (_target, key) => String(key) });
      if (!(name in dependencies)) throw new Error('Unexpected test dependency: ' + name);
      return dependencies[name];
    }, ...globals,
  }, { filename: file, timeout: 2000 });
  return mod.exports;
}
const load = (file, dependencies, globals) => loadExports(file, dependencies, globals).default;
function fakeRealtime() {
  const channel = { on() { return this; }, subscribe() { return this; }, send: async () => {} };
  return { channel: () => channel, removeChannel: async () => {} };
}
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
async function render(t, Component, props) {
  let view;
  await act(async () => { view = Renderer.create(React.createElement(Component, props)); await flush(); });
  t.after(async () => { await act(async () => view.unmount()); });
  return view;
}
const room = { id: 'friend', buyer_id: 'me', seller_id: 'peer', other: { id: 'peer', full_name: 'Ibu Siti' }, unread_count: 1, product: null, order: null };
const makeMessenger = extra => ({ messages: async () => [], sync: async () => {}, saveRoom: async () => {}, markRead: async () => {}, securityCode: async () => '1111-2222', ...extra });
function conversation(api) {
  return load('components/messages/SecureConversationView.tsx', {
    '@/lib/authenticatedFetch': { authenticatedFetchJson: api }, './AccountDirectCall': 'Calls',
    './BrowserPasswordBackupSettings': 'OptionalBackupSettings',
    '@/lib/chatClientPerformance': loadExports('lib/chatClientPerformance.ts'),
    '@/lib/supabase': { supabase: fakeRealtime() },
  });
}
const button = (view, label) => view.root.findAllByType('button').find(node => node.props['aria-label'] === label || node.children.includes(label));

test('ordinary web chat sends without opening privacy or backup; failed send preserves draft', async t => {
  let lookups = 0, fail = true, sent = 0;
  const messenger = makeMessenger({ send: async () => { if (fail) throw Error('network failure'); sent++; } });
  const view = await render(t, conversation(async () => { lookups++; return { account: null }; }), { userId: 'me', room, messenger });
  assert.equal(lookups, 0);
  assert.equal(view.root.findAllByProps({ id: 'chat-details' }).length, 0);
  await act(async () => view.root.findByType('textarea').props.onChange({ target: { value: 'Halo, Bu' } }));
  await act(async () => { button(view, 'Kirim pesan').props.onClick(); await flush(); });
  assert.equal(view.root.findByType('textarea').props.value, 'Halo, Bu');
  assert.equal(sent, 0);
  fail = false;
  await act(async () => { button(view, 'Kirim pesan').props.onClick(); await flush(); });
  assert.equal(sent, 1);
  assert.equal(view.root.findByType('textarea').props.value, '');
  assert.equal(lookups, 0);
});

test('optional account export is offered only when a portable password or passkey wrapper exists', async t => {
  for (const method of [null, 'password', 'passkey']) {
    let lookups = 0;
    const api = async () => { lookups++; return { account: { encrypted_backup: method ? { [method]: {} } : {} } }; };
    const view = await render(t, conversation(api), { userId: 'me', room, messenger: makeMessenger() });
    assert.equal(lookups, 0);
    await act(async () => { button(view, 'Info percakapan').props.onClick(); await flush(); });
    assert.equal(lookups, 1);
    assert.equal(Boolean(button(view, 'Unduh cadangan akun')), Boolean(method));
    assert.equal(view.root.findByType('textarea').props.disabled, false);
  }
});

test('optional identity lookup is deferred and its failure cannot block the composer', async t => {
  let checks = 0;
  const messenger = makeMessenger({ securityCode: async () => { checks++; throw Error('Peer identity unavailable'); } });
  const view = await render(t, conversation(async () => ({ account: null })), { userId: 'me', room, messenger });
  assert.equal(checks, 0);
  assert.equal(view.root.findByType('textarea').props.disabled, false);
  await act(async () => { button(view, 'Info percakapan').props.onClick(); await flush(); });
  assert.equal(checks, 0);
  await act(async () => { button(view, 'Periksa identitas kontak (opsional)').props.onClick(); await flush(); });
  assert.equal(checks, 1);
  assert.equal(view.root.findByType('textarea').props.disabled, false);
  assert.equal(view.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.match(JSON.stringify(view.toJSON()), /Peer identity unavailable/);
});

test('sidebar keeps order and product context while withholding server message previews', async t => {
  const order = { ...room, id: 'order', order_id: 1402, other: { id: 'seller', full_name: 'Raka' }, product: { id: 12, title: 'Headset' }, order: { id: 1402, product_title: 'Headset' } };
  const group = { ...room, id: 'group', room_type: 'group' };
  const allRooms = [room, order, group].map(value => ({ ...value, last_message: 'PRIVATE_SERVER_SENTINEL' }));
  const Chat = load('app/chat/ChatClient.tsx', {
    'next/link': 'a', 'next/dynamic': () => 'Conversation',
    '@/components/messages/SecureIncomingCallAlert': 'IncomingCalls', '@/components/auth/AuthModal': 'Auth',
    '@/lib/authenticatedFetch': { authenticatedFetchJson: async () => ({ rooms: allRooms }) },
    '@/lib/chatInboxPresentation': loadExports('lib/chatInboxPresentation.ts'),
    '@/lib/chatRoomScope': loadExports('lib/chatRoomScope.ts'),
    '@/lib/live/refresh-queue': loadExports('lib/live/refresh-queue.ts'),
    '@/lib/supabase': { supabase: { ...fakeRealtime(), auth: { getUser: async () => ({ data: { user: { id: 'me' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } },
    './chat.module.css': new Proxy({}, { get: (_target, key) => String(key) }),
  }, { window: { location: { search: '?room=order', href: 'https://example.invalid/chat?room=order' }, matchMedia: () => ({ matches: false }), history: { replaceState() {} }, setInterval: () => 1, clearInterval() {} } });
  const view = await render(t, Chat, {});
  const sidebar = view.root.findByType('aside');
  assert.doesNotMatch(JSON.stringify(sidebar.toJSON?.() || sidebar.findAllByType('span').flatMap(n => n.children.filter(c => typeof c === 'string'))), /PRIVATE_SERVER_SENTINEL/);
  assert.equal(view.root.findByType('Conversation').props.room.id, 'order');
  const rows = sidebar.findAllByType('button').filter(node => typeof node.props['aria-pressed'] === 'boolean');
  assert.equal(rows.length, 1);
  await act(async () => view.root.findByType('input').props.onChange({ target: { value: '#1402' } }));
  assert.equal(sidebar.findAllByType('button').filter(node => typeof node.props['aria-pressed'] === 'boolean').length, 1);
  assert.match(JSON.stringify(view.toJSON()), /Pesanan #1402 · Headset/);
});

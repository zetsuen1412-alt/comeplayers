import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function load(path, dependencies = {}, extra = {}) {
  const module = { exports: {} };
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  runInNewContext(outputText, { module, exports: module.exports, Date, Error, console, require: name => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return JsxRuntime;
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected import ${name}`);
  }, ...extra });
  return module.exports;
}
const core = load('../packages/chat-core/src/types.ts');
const cpNumber = '0081234567890';
const native = Object.fromEntries(['View', 'Text', 'Pressable', 'Modal', 'ScrollView', 'TextInput', 'ActivityIndicator', 'Switch'].map(name => [name, name]).concat([['StyleSheet', { create: value => value }]]));
function text(node) { return typeof node === 'string' ? node : node.children.map(text).join(''); }
async function mount(t, Component, props = {}) {
  let view;
  await act(async () => { view = Renderer.create(React.createElement(Component, props)); await flush(); });
  t.after(async () => { await act(async () => view.unmount()); });
  return view;
}
async function press(node) { assert.ok(node); await act(async () => { node.props.onPress(); await flush(); }); }

test('CP identity preserves leading zeros and never substitutes a private phone or malformed identifier', () => {
  assert.equal(core.profileCpNumber({ cp_number: cpNumber }), cpNumber);
  for (const invalid of [null, undefined, '', '0081234', 'cp_number0081234567890', '+0081234567890', 81234567890, '1081234567890']) {
    assert.equal(core.profileCpNumber({ cp_number: invalid }), null);
  }
  const profile = { id: 'friend', cp_number: cpNumber, username: 'oldname', phone: '+628111111111' };
  assert.equal(core.profileContactLabel(profile), `CP ${cpNumber}`);
  assert.equal(core.profileContactLabel({ ...profile, username: 'newname' }), `CP ${cpNumber}`);
  assert.equal(core.profileContactLabel({ id: 'friend', phone: '+628111111111' }), 'Kontak ComePlayers');
});

test('existing chat search finds CP numbers and names, without searching private recovery phone data', () => {
  const rooms = [{ id: 'direct', other: { id: 'friend', cp_number: cpNumber, username: 'myfriend', phone: '+628111111111' } }, { id: 'group', room_type: 'group', title: 'My group' }];
  assert.equal(core.filterRooms(rooms, { query: cpNumber })[0]?.id, 'direct');
  assert.equal(core.filterRooms(rooms, { query: 'MYFRIEND' })[0]?.id, 'direct');
  assert.equal(core.filterRooms(rooms, { query: '+628111111111' }).length, 0);
  assert.equal(core.filterRooms(rooms, { query: cpNumber, bucket: 'group' }).length, 0);
});

function cardFixture({ failCopy = false } = {}) {
  const copies = [];
  const { CpNumberCard } = load('../apps/mobile/src/CpNumberCard.tsx', {
    'react-native': native, '@comeplayers/chat-core': core, './theme': { colors: {} },
    'expo-clipboard': { setStringAsync: async value => { copies.push(value); if (failCopy) throw new Error('Unavailable'); } },
  });
  return { CpNumberCard, copies };
}
test('CP card is read-only and copies the exact server-assigned number only after a tap', async t => {
  const f = cardFixture(), view = await mount(t, f.CpNumberCard, { value: cpNumber });
  assert.equal(view.root.findAllByType('TextInput').length, 0);
  assert.deepEqual(f.copies, []);
  const displayed = view.root.findByProps({ accessibilityLabel: `Nomor CP ${cpNumber.split('').join(' ')}` });
  assert.equal(displayed.props.selectable, true); assert.equal(text(displayed), cpNumber);
  await press(view.root.findByProps({ accessibilityLabel: 'Salin nomor CP' }));
  assert.deepEqual(f.copies, [cpNumber]);
  assert.match(view.root.findByProps({ accessibilityLiveRegion: 'polite' }).props.children, /tersalin/);
});

test('missing CP offers profile reload and never invents or copies an identifier', async t => {
  const f = cardFixture(); let reloads = 0;
  const view = await mount(t, f.CpNumberCard, { value: null, onReload: () => { reloads++; } });
  assert.equal(view.root.findAllByProps({ accessibilityLabel: 'Salin nomor CP' }).length, 0);
  assert.equal(reloads, 0); assert.deepEqual(f.copies, []);
  await press(view.root.findAllByType('Pressable').find(node => text(node) === 'Muat ulang profil'));
  assert.equal(reloads, 1); assert.deepEqual(f.copies, []);
  await act(async () => view.update(React.createElement(f.CpNumberCard, { value: cpNumber })));
  assert.equal(text(view.root.findByProps({ selectable: true })), cpNumber);
});

test('clipboard failure keeps a selectable CP number and gives a manual copy action', async t => {
  const f = cardFixture({ failCopy: true }), view = await mount(t, f.CpNumberCard, { value: cpNumber });
  await press(view.root.findByProps({ accessibilityLabel: 'Salin nomor CP' }));
  assert.match(text(view.root), /Tekan lama nomor CP/);
  assert.equal(text(view.root.findByProps({ selectable: true })), cpNumber);
});

test('contact search sends the CP query and opens the returned contact by server user ID only on tap', async t => {
  const timers = new Set(), searches = [], opened = [], navigated = [], closed = [];
  const friend = { id: 'server-user-id', username: 'friend', cp_number: cpNumber };
  const { ContactsSheet } = load('../apps/mobile/src/screens/ContactsSheet.tsx', {
    'react-native': native, '@comeplayers/chat-core': core, '../theme': { colors: {} },
    '../components': { Avatar: 'Avatar', PrimaryButton: 'Button', StateBlock: 'StateBlock' },
    '../runtime': { chatClient: { searchContacts: async query => { searches.push(query); return query === cpNumber ? [friend] : []; }, openContact: async id => { opened.push(id); return { id: 'direct-room', other: friend }; } } },
  }, { setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn) });
  const view = await mount(t, ContactsSheet, { visible: true, onClose: () => closed.push(true), onOpenRoom: room => navigated.push(room.id) });
  await act(async () => { view.root.findByType('TextInput').props.onChangeText(cpNumber); await flush(); });
  await act(async () => { for (const fn of [...timers]) { timers.delete(fn); fn(); } await flush(); });
  assert.deepEqual(searches, [cpNumber]); assert.deepEqual(opened, []); assert.deepEqual(navigated, []);
  assert.match(text(view.root), new RegExp(`CP ${cpNumber}`));
  await press(view.root.findAllByType('Pressable').find(node => text(node).includes(`CP ${cpNumber}`)));
  assert.deepEqual(opened, ['server-user-id']); assert.deepEqual(navigated, ['direct-room']); assert.equal(closed.length, 1);
});

test('account editing keeps CP immutable and recovery phone private until expanded', async t => {
  const updates = [], requests = [];
  const account = { profile: { id: 'me', username: 'me', full_name: 'My name', bio: '', cp_number: cpNumber }, settings: { phone_country: 'ID' }, phone: '+628111111111', phoneVerified: true, freeUsernameChangesRemaining: 1 };
  const { AccountSettings } = load('../apps/mobile/src/screens/AccountSettings.tsx', {
    'react-native': { ...native, Alert: { alert() {} }, Linking: {} }, '../theme': { colors: {} },
    '../components': { PrimaryButton: 'Button', StateBlock: 'StateBlock' }, '../CpNumberCard': { CpNumberCard: 'CpNumberCard' },
    '../NotificationProvider': { useNotifications: () => ({ status: 'ready' }) },
    '../messagingApi': { loadPreferences: async () => account, updateAccount: async update => { updates.push(update); } },
    '../api': { request: async (url, options) => { requests.push({ url, options }); return { countries: [], channels: [] }; } },
    '../runtime': { apiUrl: 'https://www.comeplayers.com', supabase: { auth: { getUser: async () => ({ data: { user: { email: 'me@example.invalid' } } }), mfa: { listFactors: async () => ({ data: { totp: [] } }) } } } },
  });
  const view = await mount(t, AccountSettings, { section: 'account', onClose() {}, onUpdated() {} });
  assert.equal(view.root.findByType('CpNumberCard').props.value, cpNumber);
  assert.equal(view.root.findAllByType('TextInput').some(node => node.props.value === cpNumber), false);
  assert.equal(view.root.findAllByProps({ accessibilityLabel: 'Phone number' }).length, 0);
  await press(view.root.findAllByType('Button').find(node => node.props.label === 'Save profile'));
  assert.deepEqual(JSON.parse(JSON.stringify(updates)), [{ action: 'profile', fullName: 'My name', bio: '' }]);
  await press(view.root.findAllByType('Button').find(node => node.props.label === 'Nomor pemulihan (opsional)'));
  assert.equal(view.root.findByProps({ accessibilityLabel: 'Phone number' }).props.value, '+628111111111');
  assert.equal(requests.filter(request => request.options?.method === 'POST').length, 0);
});

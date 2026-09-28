import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, dependencies) {
  const mod = { exports: {} };
  const { outputText, diagnostics } = ts.transpileModule(readFileSync(new URL('../apps/mobile/src/' + file, import.meta.url), 'utf8'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  assert.equal(diagnostics?.length || 0, 0);
  runInNewContext(outputText, { module: mod, exports: mod.exports, Error, setTimeout, clearTimeout, console,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return JsxRuntime;
      if (!(name in dependencies)) throw Error('Unexpected dependency: ' + name);
      return dependencies[name];
    },
  }, { filename: file, timeout: 2000 });
  return mod.exports;
}
const native = Object.fromEntries(['ActivityIndicator', 'Image', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name]));
native.StyleSheet = { create: value => value };
native.Platform = { OS: 'android' };
native.Alert = { alert() {} };
native.Modal = ({ visible, children }) => visible ? React.createElement('Modal', null, children) : null;
native.FlatList = ({ data, renderItem, ListEmptyComponent, ListFooterComponent }) => React.createElement('List', null,
  data.length ? data.map((item) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item }))) : ListEmptyComponent, ListFooterComponent);
const theme = { colors: {} };
const { ChatProblemNotice } = load('screens/ChatProblemNotice.tsx', { 'react-native': native, '../theme': theme });
const userId = 'person-1';
const room = { id: 'room-1', other: { id: 'person-2', username: 'teman' } };
const session = { user: { id: userId } };
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 5)); };
async function render(t, component, props) {
  let view;
  await act(async () => { view = Renderer.create(React.createElement(component, props)); await flush(); });
  await act(flush);
  t.after(async () => { await act(async () => view.unmount()); });
  return view;
}
function screen(provider, overrides = {}) {
  return load('screens/PrivateConversationScreen.tsx', {
    'react-native': native, '@expo/vector-icons/Ionicons': 'Icon', '@comeplayers/chat-core': { roomName: () => 'Teman' },
    'expo-image-picker': {}, 'expo-document-picker': {}, 'expo-sharing': {}, 'expo-image-manipulator': {}, 'expo-video': {},
    '../components': { Avatar: 'Avatar' }, '../CallProvider': { useCalls: () => ({ startCall: async () => {} }) },
    '../secure/PrivateProvider': { usePrivateMessenger: () => provider }, '../secure/SecureDeviceSetup': { SecureDeviceSetup: 'Recovery' },
    '../secure/mediaStore': {}, './ChatMedia': { AudioPlayback: 'Audio', VoiceRecorder: 'Recorder' }, '../theme': theme,
    '../InboxProvider': { useInbox: () => ({ preferences: [], reload: async () => {} }) }, '../runtime': { chatClient: {} },
    '../messagingApi': { loadPreferences: async () => ({ settings: { read_receipts: false } }), updateChatPreference: async () => {} },
    './ChatProblemNotice': { ChatProblemNotice }, ...overrides,
  }).PrivateConversationScreen;
}
function messenger(overrides = {}) {
  return { ready: true, vault: { search: async () => [] }, subscribe: () => () => {}, markRead: async () => {}, send: async () => {}, sync: async () => {}, ...overrides };
}
const props = { session, room, onBack() {}, onRead() {}, onNavigate() {} };

test('recovery cannot expose a composer or enabled call before a messenger exists', async t => {
  let reopened = 0;
  const setup = { kind: 'recover', snapshot: { root_public_key: 'old-account' } };
  const view = await render(t, screen({ messenger: null, setup, error: '', reopen: () => reopened++ }), props);
  assert.equal(view.root.findAllByType('TextInput').length, 0);
  assert.equal(view.root.findAllByType('Recovery').length, 1);
  assert.equal(view.root.findByType('Recovery').props.setup, setup);
  for (const button of view.root.findAllByType('Pressable').filter(n => /Panggilan/.test(n.props.accessibilityLabel || ''))) assert.equal(button.props.disabled, true);
  await act(async () => view.root.findByType('Recovery').props.onRetry());
  assert.equal(reopened, 1);
});

test('ready empty chat has a direct composer and sends without opening setup or a security dialog', async t => {
  const sends = [];
  const view = await render(t, screen({ messenger: messenger({ send: async (...args) => sends.push(args) }), setup: null, error: '', reopen() {} }), props);
  assert.equal(view.root.findAllByType('Recovery').length, 0);
  assert.equal(view.root.findAllByType('Modal').length, 0);
  assert.equal(view.root.findAllByType('TextInput').length, 1);
  await act(async () => view.root.findByType('TextInput').props.onChangeText('Halo, apa kabar?'));
  await act(async () => { await view.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === 'Kirim pesan').props.onPress(); await flush(); });
  assert.equal(sends.length, 1);
  assert.equal(sends[0][0], room);
  assert.equal(sends[0][1], 'Halo, apa kabar?');
  assert.equal(view.root.findByType('TextInput').props.value, '');
  assert.equal(view.root.findAllByType('Modal').length, 0);
});

test('failed send retains draft; retry synchronizes once and original error remains available', async t => {
  let syncs = 0;
  const technical = 'Network request failed: E_CONN_RESET';
  const view = await render(t, screen({ messenger: messenger({ send: async () => { throw Error(technical); }, sync: async () => syncs++ }), setup: null, error: '', reopen() {} }), props);
  await act(async () => view.root.findByType('TextInput').props.onChangeText('Pesan saya'));
  await act(async () => { await view.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === 'Kirim pesan').props.onPress(); await flush(); });
  assert.equal(view.root.findByType('TextInput').props.value, 'Pesan saya');
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /E_CONN_RESET/);
  const notice = view.root.findByType(ChatProblemNotice);
  await act(async () => notice.findAllByType('Pressable').find(n => n.props.accessibilityState).props.onPress());
  assert.match(JSON.stringify(view.toJSON()), /E_CONN_RESET/);
  await act(async () => { notice.findAllByType('Pressable').find(n => !n.props.accessibilityState).props.onPress(); await flush(); });
  assert.equal(syncs, 1);
  assert.equal(view.root.findByType('TextInput').props.value, 'Pesan saya');
  assert.equal(view.root.findAllByType(ChatProblemNotice).length, 0);
});

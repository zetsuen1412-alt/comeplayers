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
  runInNewContext(outputText, { module: mod, exports: mod.exports, Error, setTimeout, clearTimeout, setInterval, clearInterval, console,
    requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
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
native.Keyboard = { metrics: () => undefined, addListener: () => ({ remove() {} }), scheduleLayoutAnimation() {} };
native.Alert = { alert() {} };
native.AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
native.Modal = ({ visible, children }) => visible ? React.createElement('Modal', null, children) : null;
native.FlatList = ({ data, renderItem, ListEmptyComponent, ListFooterComponent }) => React.createElement('List', null,
  data.length ? data.map((item) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item }))) : ListEmptyComponent, ListFooterComponent);
const theme = { colors: {} };
const { ChatProblemNotice } = load('screens/ChatProblemNotice.tsx', { 'react-native': native, '../theme': theme });
const chatKeyboardLayout = load('screens/ChatKeyboardLayout.tsx', { 'react-native': native });
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
    '../InboxProvider': { useInbox: () => ({ preferences: [], reload: async () => {} }) }, '../runtime': { chatClient: {}, supabase: {
      channel: () => ({ on() { return this; }, subscribe() { return this; }, send: async () => {} }),
      removeChannel: async () => {},
    } },
    '../messagingApi': { loadPreferences: async () => ({ settings: { read_receipts: false } }), updateChatPreference: async () => {} },
    './ChatProblemNotice': { ChatProblemNotice }, './ChatKeyboardLayout': chatKeyboardLayout, ...overrides,
  }).PrivateConversationScreen;
}
function messenger(overrides = {}) {
  return { ready: true, vault: { list: async () => [], search: async () => [] }, subscribe: () => () => {}, markRead: async () => {}, send: async () => {}, sync: async () => {}, ...overrides };
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

test('typing while a private message sends keeps the composer and the new draft', async t => {
  let completeSend;
  const view = await render(t, screen({ messenger: messenger({ send: () => new Promise(resolve => { completeSend = resolve; }) }), setup: null, error: '', reopen() {} }), props);
  await act(async () => view.root.findByType('TextInput').props.onChangeText('Pesan pertama'));
  const input = view.root.findByType('TextInput');
  await act(async () => view.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === 'Kirim pesan').props.onPress());
  assert.equal(view.root.findByType('TextInput'), input);
  assert.equal(input.props.editable, true);
  await act(async () => input.props.onChangeText('Pesan berikutnya'));
  await act(async () => { completeSend(); await flush(); });
  assert.equal(view.root.findByType('TextInput'), input);
  assert.equal(input.props.value, 'Pesan berikutnya');
  assert.equal(view.root.findAllByType('Modal').length, 0);
});

test('typing while a group message sends retains focus and does not erase the next draft', async t => {
  const group = { id: 'group-focus', room_type: 'group', server: { name: 'Keluarga' } };
  let completeSend;
  const { ConversationScreen } = load('screens/ConversationScreen.tsx', {
    'react-native': native, '@expo/vector-icons/Ionicons': 'Icon', '@comeplayers/chat-core': { roomName: () => 'Keluarga' },
    'expo-image-picker': {}, 'expo-document-picker': {}, 'expo-image-manipulator': {},
    './ContactsSheet': { ContactsSheet: 'Contacts' }, './ChatProblemNotice': { ChatProblemNotice }, './ChatKeyboardLayout': chatKeyboardLayout,
    '../components': { Avatar: 'Avatar', GroupAvatar: 'GroupAvatar' }, '../CallProvider': { useCalls: () => ({ startCall: async () => {} }) },
    './ChatMedia': { AudioPlayback: 'Audio', VoiceRecorder: 'Recorder', ChatMedia: 'Media' }, '../theme': { ...theme, radius: {} },
    '../runtime': { chatClient: {
      getConversation: async () => ({ messages: [], room: group }),
      sendMessage: () => new Promise(resolve => { completeSend = () => resolve({ message: { id: 'sent', message: 'Pesan pertama', sender_id: userId, created_at: new Date().toISOString() } }); }),
    }, supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: async () => {} } },
    '../messagingApi': { loadChatPreferences: async () => ({ preferences: [], starred: [] }) }, '../chatAttachmentUpload': {},
  });
  const view = await render(t, ConversationScreen, { ...props, room: group });
  await act(async () => view.root.findByType('TextInput').props.onChangeText('Pesan pertama'));
  const input = view.root.findByType('TextInput');
  await act(async () => view.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === 'Kirim pesan').props.onPress());
  assert.equal(input.props.editable, true);
  assert.equal(view.root.findByType('TextInput'), input);
  await act(async () => input.props.onChangeText('Pesan berikutnya'));
  await act(async () => { completeSend(); await flush(); });
  assert.equal(view.root.findByType('TextInput'), input);
  assert.equal(input.props.value, 'Pesan berikutnya');
});

test('private chat broadcasts a metadata-only invalidation and refreshes on an incoming event', async t => {
  let incoming, syncs = 0;
  const sent = [];
  const channel = { on(type, filter, callback) { if (type === 'broadcast' && filter.event === 'secure-message') incoming = callback; return this; }, subscribe() { return this; }, send: async event => { sent.push(event); } };
  const view = await render(t, screen({ messenger: messenger({ sync: async () => { syncs++; } }), setup: null, error: '', reopen() {} }, {
    '../runtime': { chatClient: {}, supabase: { channel: () => channel, removeChannel: async () => {} } },
  }), props);
  await act(async () => view.root.findByType('TextInput').props.onChangeText('Halo'));
  await act(async () => { view.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === 'Kirim pesan').props.onPress(); await flush(); });
  assert.equal(JSON.stringify(sent), JSON.stringify([{ type: 'broadcast', event: 'secure-message', payload: { roomId: room.id } }]));
  await act(async () => { incoming(); await new Promise(resolve => setTimeout(resolve, 125)); });
  assert.equal(syncs, 1);
});

test('recent encrypted photos become inline previews without an extra tap', async t => {
  const photos = Array.from({ length: 5 }, (_, i) => ({ id: `photo-${i}`, sender_id: 'person-2', created_at: new Date(Date.now() - i * 1000).toISOString(), message: '', secureAttachment: { name: `photo-${i}.jpg`, mime: 'image/jpeg', size: 1000 } }));
  const downloaded = [];
  await render(t, screen({ messenger: messenger({ vault: { list: async () => photos, search: async () => photos }, downloadMedia: async message => { downloaded.push(message.id); } }), setup: null, error: '', reopen() {} }), props);
  assert.deepEqual(downloaded, photos.slice(0, 4).map(photo => photo.id));
});


test('opening a private chat does not download or decrypt video/audio/documents before a tap', async t => {
  const at = new Date().toISOString();
  const files = [
    { id: 'remote-video', secureAttachment: { name: 'video.mp4', mime: 'video/mp4', size: 1000 } },
    { id: 'local-video', localMedia: { id: 'video', name: 'video.mp4', mime: 'video/mp4', size: 1000 } },
    { id: 'local-audio', localMedia: { id: 'audio', name: 'voice.m4a', mime: 'audio/mp4', size: 1000 } },
    { id: 'local-document', localMedia: { id: 'pdf', name: 'document.pdf', mime: 'application/pdf', size: 1000 } },
  ].map(file => ({ ...file, message: '', created_at: at, sender_id: userId }));
  const materialized = [], downloads = [];
  let cleaned = 0;
  const view = await render(t, screen({ messenger: messenger({ vault: { list: async () => files }, downloadMedia: async item => downloads.push(item.id) }), setup: null, error: '', reopen() {} }, {
    '../secure/mediaStore': { materializeMedia: async (_vault, id) => { materialized.push(id); return { uri: `cache:${id}`, exists: true, delete() { cleaned++; } }; } },
    'expo-video': { VideoView: 'Video', useVideoPlayer: uri => ({ uri }) },
  }), props);
  assert.equal(materialized.length, 0, 'mounted non-image bubbles must not read/decrypt full attachments');
  assert.equal(downloads.length, 0, 'video download does not compete with chat or a call');
  await act(async () => { view.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === 'Putar video').props.onPress(); await flush(); });
  assert.deepEqual(materialized, ['video']);
  assert.equal(view.root.findAllByType('Video').length, 1, 'video plays inline after the first tap');
  await act(async () => view.unmount());
  assert.equal(cleaned, 1, 'decrypted preview file is deleted when leaving chat');
});

test('typing does not rerender40 group media bubbles and a refresh renders only the changed message', async t => {
  const group = { id: 'group-performance', room_type: 'group', server: { name: 'Keluarga' } };
  let revision = 0, changed, rendered = 0;
  const data = () => Array.from({ length: 40 }, (_, index) => ({
    id: `message-${index}`, room_id: group.id, sender_id: userId,
    message: index === 39 && revision ? 'Diperbarui' : `Pesan ${index}`,
    created_at: new Date(1700000000000 + index * 1000).toISOString(),
    attachment: { id: index + 1, mime_type: 'image/jpeg', file_name: 'foto.jpg', size_bytes: 1000 },
  }));
  function Media() { rendered++; return React.createElement('Media'); }
  const { ConversationScreen } = load('screens/ConversationScreen.tsx', {
    'react-native': native, '@expo/vector-icons/Ionicons': 'Icon', '@comeplayers/chat-core': { roomName: () => 'Keluarga' },
    'expo-image-picker': {}, 'expo-document-picker': {}, 'expo-image-manipulator': {},
    './ContactsSheet': { ContactsSheet: 'Contacts' }, './ChatProblemNotice': { ChatProblemNotice }, './ChatKeyboardLayout': chatKeyboardLayout,
    '../components': { Avatar: 'Avatar', GroupAvatar: 'GroupAvatar' }, '../CallProvider': { useCalls: () => ({ startCall: async () => {} }) },
    './ChatMedia': { AudioPlayback: 'Audio', VoiceRecorder: 'Recorder', ChatMedia: Media }, '../theme': { ...theme, radius: {} },
    '../runtime': { chatClient: { getConversation: async () => ({ messages: data(), room: group }) },
      supabase: { channel: () => ({ on(_type, _filter, callback) { changed = callback; return this; }, subscribe() { return this; } }), removeChannel: async () => {} } },
    '../messagingApi': { loadChatPreferences: async () => ({ preferences: [], starred: [] }) }, '../chatAttachmentUpload': {},
  });
  const view = await render(t, ConversationScreen, { ...props, room: group });
  assert.equal(rendered, 40);
  for (let n = 1; n <= 10; n++) await act(async () => view.root.findByType('TextInput').props.onChangeText('a'.repeat(n)));
  assert.equal(rendered, 40, 'ten composer edits do no extra work in40 existing message bubbles');
  revision = 1;
  await act(async () => { changed(); await new Promise(resolve => setTimeout(resolve, 300)); });
  assert.equal(rendered, 41, 'a40-message server snapshot reuses39 unchanged rows');
  assert.equal(view.root.findByType('TextInput').props.value, 'a'.repeat(10));
});

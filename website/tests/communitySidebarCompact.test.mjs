import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

// Use the existing workspace renderer to exercise the real sidebar's hooks and handlers.
const requireApps = createRequire(new URL('../../comeplayers-apps/package.json', import.meta.url));
const React = requireApps('react');
const Renderer = requireApps('react-test-renderer');
const { act } = Renderer;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(new URL('../components/messages/CommunityChannelSidebar.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const channel = (id, name, category_id, extra = {}) => ({ id, name, category_id, community_id: 'community', channel_type: 'text', position: 10, is_default: false, is_private: false, is_read_only: false, ...extra });
const bundle = owner => ({
  community: { id: 'community', room_id: 'room', name: 'ComePlayers' },
  categories: [{ id: 'info', name: 'INFORMATION', position: 10 }, { id: 'text', name: 'Text Channels', position: 20 }, { id: 'voice', name: 'VOICE CHANNELS', position: 30 }, { id: 'custom', name: 'Teman kampung', position: 40 }],
  channels: [channel('rules', 'panduan', 'info'), channel('general', 'general', 'text', { unread_count: 3, is_default: true }), channel('voice', 'Mabar', 'voice', { channel_type: 'voice' }), channel('custom', 'kabar', 'custom')],
  currentUser: { isOwner: owner, isAdmin: false, permissions: owner ? ['manage_channels'] : ['view_channels'] },
});
function Sidebar(data) {
  const mod = { exports: {} };
  const dependencies = {
    '@/lib/authenticatedFetch': { authenticatedFetchJson: async () => data },
    '@/lib/supabase': { supabase: { channel() { return { on() { return this; }, subscribe(callback) { callback('SUBSCRIBED'); return this; } }; }, removeChannel: async () => {} } },
    '@/lib/live/refresh-queue': { createRefreshQueue: () => ({ request() {}, dispose() {} }) },
    './CommunityChannelEditor': { default: props => React.createElement('Editor', props), __esModule: true },
  };
  runInNewContext(code, {
    module: mod, exports: mod.exports, console, Error, AbortController,
    navigator: { onLine: true }, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    window: { setTimeout(fn) { queueMicrotask(fn); return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return requireApps(name);
      if (name === 'react-icons/fa') return new Proxy({}, { get: (_target, key) => String(key) });
      if (!(name in dependencies)) throw Error('Unexpected dependency ' + name);
      return dependencies[name];
    },
  });
  return mod.exports.default;
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const button = (view, label) => view.root.findAllByType('button').find(node => node.props['aria-label'] === label || text(node) === label);
async function render(t, owner = true) {
  const data = bundle(owner), selections = [];
  let view;
  await act(async () => { view = Renderer.create(React.createElement(Sidebar(data), { roomId: 'room', selectedChannelId: 'general', onSelectChannel: (...args) => selections.push(args) })); await flush(); });
  t.after(async () => { await act(async () => view.unmount()); });
  return { view, data, selections };
}

test('compact sidebar keeps channels visible, toggles unread, and preserves selection and category data', async t => {
  const { view, data, selections } = await render(t);
  assert.equal(view.root.findAll(node => node.props['data-community-channel'] === true).length, 4);
  assert.equal(button(view, 'Tambah ruang'), undefined);
  assert.equal(button(view, 'Pengaturan ruang general'), undefined);
  const labels = view.root.findAllByType('button').map(text);
  for (const label of ['Info1', 'Ruang chat1', 'Ruang suara1', 'Teman kampung1']) assert.ok(labels.includes(label));
  assert.equal(data.categories[0].name, 'INFORMATION');
  await act(async () => button(view, 'Belum dibaca').props.onClick());
  assert.equal(view.root.findAll(node => node.props['data-community-channel'] === true).length, 1);
  assert.equal(button(view, 'Belum dibaca').props['aria-pressed'], true);
  await act(async () => button(view, 'Belum dibaca').props.onClick());
  await act(async () => view.root.findByProps({ type: 'search' }).props.onChange({ target: { value: 'Mabar' } }));
  const result = view.root.findAll(node => node.props['data-community-channel'] === true);
  assert.equal(result.length, 1);
  await act(async () => result[0].props.onClick());
  assert.equal(selections.at(-1)[0], data.channels[2]);
  assert.equal(selections.at(-1)[1], 'user');
});

test('admin tools stay behind options and preserve original editor targets; members get no admin tools', async t => {
  const { view, data } = await render(t);
  await act(async () => button(view, 'Pilihan daftar ruang').props.onClick());
  await act(async () => button(view, 'Tambah ruang').props.onClick());
  assert.equal(view.root.findByType('Editor').props.target.kind, 'channel');
  await act(async () => view.root.findByType('Editor').props.onClose());
  await act(async () => button(view, 'Pilihan daftar ruang').props.onClick());
  const manageLabel = view.root.findAllByType('label').find(node => text(node).includes('Tampilkan pengaturan ruang'));
  await act(async () => manageLabel.findByType('input').props.onChange({ target: { checked: true } }));
  assert.equal(button(view, 'Pilihan daftar ruang').props['aria-expanded'], false);
  await act(async () => button(view, 'Pengaturan ruang general').props.onClick());
  assert.equal(view.root.findByType('Editor').props.target.channel, data.channels[1]);
  const member = (await render(t, false)).view;
  await act(async () => button(member, 'Pilihan daftar ruang').props.onClick());
  assert.equal(button(member, 'Tambah ruang'), undefined);
  assert.equal(button(member, 'Tambah kategori'), undefined);
  assert.equal(button(member, 'Pengaturan ruang general'), undefined);
  assert.equal(member.root.findAllByType('input').filter(node => node.props.type === 'checkbox').length, 1);
});

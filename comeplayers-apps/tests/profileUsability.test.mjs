import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function load(file, dependencies = {}) {
  const mod = { exports: {} };
  const source = readFileSync(new URL('../apps/mobile/src/' + file, import.meta.url), 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  assert.equal(diagnostics?.length || 0, 0);
  runInNewContext(outputText, {
    module: mod, exports: mod.exports, Error, URL, Request, console,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return JsxRuntime;
      if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
      return dependencies[name];
    },
  });
  return mod.exports;
}
const transportModule = load('authTransport.ts');
function fixture({ authError = null, googleError = null, googleCancelled = false, backendConfigured = true, preferences = {} } = {}) {
  const calls = [];
  const auth = Object.fromEntries(['signInWithPassword', 'signInWithIdToken', 'resetPasswordForEmail', 'signUp', 'signOut'].map(name => [name, async (...args) => {
    calls.push({ name, args }); return { data: { session: null }, error: authError };
  }]));
  const ProfileScreen = load('screens/ProfileScreen.tsx', {
    'react-native': Object.fromEntries(['Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name]).concat([
      ['StyleSheet', { create: value => value }], ['Linking', { openURL: async url => { calls.push({ name: 'openURL', args: [url] }); } }],
    ])),
    'expo-image-picker': { launchImageLibraryAsync: async () => { calls.push({ name: 'photo' }); return { canceled: true }; } },
    'expo-constants': { expoConfig: { version: '0.16.0' } },
    'expo-image-manipulator': { SaveFormat: { JPEG: 'jpeg' }, manipulateAsync() { throw new Error('Unexpected image mutation'); } },
    '../googleAuth': { googleWebClientId: 'test-google-client', GoogleSignin: {
      hasPlayServices: async options => { calls.push({ name: 'hasPlayServices', args: [options] }); },
      signIn: async () => { calls.push({ name: 'googleSignIn' }); if (googleError) throw googleError; return googleCancelled ? { type: 'cancelled' } : { type: 'success', data: { idToken: 'test-id-token' } }; },
      signOut: async () => { calls.push({ name: 'googleSignOut' }); },
    } },
    '../components': { Avatar: 'Avatar', BrandMark: 'BrandMark', Panel: 'Panel', PrimaryButton: 'Button' },
    '../api': { loadAccountProfile: async () => { calls.push({ name: 'profile' }); return {}; }, uploadAvatar() { throw new Error('Unexpected profile mutation'); } },
    '../runtime': { apiUrl: 'https://www.comeplayers.com', backendConfigured, supabase: { auth } },
    '../theme': { colors: {}, radius: {} }, './AccountSettings': { AccountSettings: 'AccountSettings' },
    '../messagingApi': { loadPreferences: async () => { calls.push({ name: 'preferences' }); return preferences; } },
    './ProfileCommerce': { ProfileCommerce: 'ProfileCommerce' },
    '../authTransport': transportModule, './PrivateBackupSettings': { PrivateBackupSettings: 'PrivateBackupSettings' },
    '../CpNumberCard': { CpNumberCard: 'CpNumberCard' },
    '../NotificationProvider': { unregisterDeviceNotifications: async () => undefined },
  }).ProfileScreen;
  return { ProfileScreen, calls, clearError: () => { authError = null; } };
}

async function mount(t, f, props = {}) {
  let view;
  await act(async () => { view = Renderer.create(React.createElement(f.ProfileScreen, { session: null, ...props })); await flush(); });
  t.after(async () => { await act(async () => view.unmount()); });
  return view;
}
function text(node) { return typeof node === 'string' ? node : node.children.map(text).join(''); }
function button(view, label) { return view.root.findAllByType('Button').find(node => node.props.label === label); }
function link(view, label) { return view.root.findAllByType('Pressable').find(node => text(node) === label); }
function input(view, label) { return view.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === label); }
async function press(node) {
  assert.ok(node, 'Expected a reachable action'); assert.notEqual(node.props.disabled, true);
  await act(async () => { node.props.onPress(); await flush(); });
}
async function typeInto(node, value) { assert.ok(node); await act(async () => { node.props.onChangeText(value); await flush(); }); }
function alert(view) { return view.root.findAllByType('Text').filter(node => node.props.accessibilityRole === 'alert').map(text).join(' '); }

test('the initial sign-in screen has a primary Google action, collapsed email fields, and no automatic prompts', async t => {
  const f = fixture(), view = await mount(t, f);
  const google = view.root.findByProps({ accessibilityLabel: 'Masuk dengan Google' });
  assert.equal(google.props.disabled, false); assert.equal(google.props.accessibilityRole, 'button');
  assert.equal(view.root.findAllByType('TextInput').length, 0);
  assert.ok(button(view, 'Gunakan email')); assert.ok(link(view, 'Belum punya akun? Daftar'));
  assert.equal(view.root.findAllByType('PrivateBackupSettings').length, 0);
  assert.deepEqual(f.calls, []);
});

test('the main profile displays the server CP identity without showing recovery email or phone', async t => {
  const cpNumber = '0081234567890';
  const f = fixture({ preferences: { profile: { id: 'me', full_name: 'My name', cp_number: cpNumber }, phone: '+628111111111' } });
  const view = await mount(t, f, { session: { user: { id: 'me', email: 'private@example.invalid', user_metadata: {} } } });
  assert.equal(view.root.findByType('CpNumberCard').props.value, cpNumber);
  assert.equal(text(view.root).includes('private@example.invalid'), false);
  assert.equal(text(view.root).includes('+628111111111'), false);
  assert.deepEqual(f.calls.map(call => call.name), ['preferences']);
});

test('Google sign-in runs only after a tap and passes its ID token to the existing account authentication', async t => {
  const f = fixture(), view = await mount(t, f);
  await press(view.root.findByProps({ accessibilityLabel: 'Masuk dengan Google' }));
  assert.deepEqual(f.calls.map(call => call.name), ['hasPlayServices', 'googleSignIn', 'signInWithIdToken']);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[2].args[0])), { provider: 'google', token: 'test-id-token' });
  assert.equal(view.root.findAllByType('TextInput').length, 0); assert.equal(alert(view), '');
});

test('email reveal allows an existing account password and submits only when the user requests it', async t => {
  const f = fixture(), view = await mount(t, f);
  await press(button(view, 'Gunakan email'));
  assert.equal(view.root.findAllByType('TextInput').length, 2); assert.deepEqual(f.calls, []);
  assert.equal(button(view, 'Masuk').props.disabled, true);
  await typeInto(input(view, 'Email'), ' player@example.com ');
  await typeInto(input(view, 'Sandi'), 'old-pass');
  assert.deepEqual(f.calls, []);
  await press(button(view, 'Masuk'));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].name, 'signInWithPassword');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].args[0])), { email: 'player@example.com', password: 'old-pass' });
});

test('failed email login uses a friendly error and waits for an explicit retry', async t => {
  const f = fixture({ authError: new Error('Invalid login credentials') }), view = await mount(t, f);
  await press(button(view, 'Gunakan email'));
  await typeInto(input(view, 'Email'), 'player@example.com'); await typeInto(input(view, 'Sandi'), 'incorrect');
  await press(button(view, 'Masuk'));
  assert.equal(alert(view), 'Email atau sandi belum cocok. Periksa kembali atau pilih Lupa sandi.');
  assert.equal(f.calls.length, 1); assert.equal(button(view, 'Masuk').props.loading, false);
  f.clearError(); await press(button(view, 'Masuk'));
  assert.equal(f.calls.length, 2); assert.equal(alert(view), '');
});

test('forgot-password stays reachable, requests no password, and sends email only after submission', async t => {
  const f = fixture(), view = await mount(t, f);
  await press(button(view, 'Gunakan email')); await press(link(view, 'Lupa sandi?'));
  assert.equal(view.root.findAllByType('TextInput').length, 1); assert.ok(input(view, 'Email'));
  assert.equal(view.root.findAllByProps({ accessibilityLabel: 'Masuk dengan Google' }).length, 0);
  assert.deepEqual(f.calls, []); assert.equal(button(view, 'Kirim tautan').props.disabled, true);
  await typeInto(input(view, 'Email'), ' player@example.com '); await press(button(view, 'Kirim tautan'));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].name, 'resetPasswordForEmail');
  assert.equal(f.calls[0].args[0], 'player@example.com');
  assert.equal(f.calls[0].args[1].redirectTo, 'https://www.comeplayers.com/auth/callback?next=%2Freset-password');
  assert.ok(alert(view).includes('Jika email ini terdaftar'));
  await press(link(view, 'Kembali ke halaman masuk'));
  assert.ok(button(view, 'Masuk')); assert.ok(link(view, 'Belum punya akun? Daftar'));
});

test('sign-up is reachable from the initial screen and validates confirmation before creating an account', async t => {
  const f = fixture(), view = await mount(t, f);
  await press(link(view, 'Belum punya akun? Daftar'));
  assert.equal(view.root.findAllByType('TextInput').length, 3); assert.deepEqual(f.calls, []);
  await typeInto(input(view, 'Email'), 'new@example.com');
  await typeInto(input(view, 'Sandi'), 'long-new-password');
  await typeInto(input(view, 'Ulangi sandi'), 'different-password');
  assert.equal(button(view, 'Buat akun').props.disabled, true); assert.deepEqual(f.calls, []);
  await typeInto(input(view, 'Ulangi sandi'), 'long-new-password'); await press(button(view, 'Buat akun'));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].name, 'signUp');
  assert.equal(f.calls[0].args[0].email, 'new@example.com');
  assert.ok(alert(view).includes('Buka email Anda untuk mengonfirmasi'));
  await press(link(view, 'Kembali ke halaman masuk'));
  assert.equal(input(view, 'Sandi').props.value, ''); assert.equal(alert(view), '');
});

test('Google configuration and network errors remain understandable, and cancellation does not display an error', async t => {
  for (const [error, expected] of [
    [new Error('DEVELOPER_ERROR'), 'Google belum bisa digunakan di versi ini. Perbarui dari Google Play atau pilih Gunakan email.'],
    [new Error('Network request failed'), 'Belum tersambung ke ComePlayers. Periksa internet, lalu coba lagi.'],
  ]) {
    const f = fixture({ googleError: error }), view = await mount(t, f);
    await press(view.root.findByProps({ accessibilityLabel: 'Masuk dengan Google' }));
    assert.equal(alert(view), expected); assert.ok(button(view, 'Gunakan email'));
    assert.equal(f.calls.some(call => call.name === 'signInWithIdToken'), false);
  }
  const f = fixture({ googleCancelled: true }), view = await mount(t, f);
  await press(view.root.findByProps({ accessibilityLabel: 'Masuk dengan Google' }));
  assert.equal(alert(view), ''); assert.equal(f.calls.some(call => call.name === 'signInWithIdToken'), false);
});

test('missing backend configuration disables account mutations while email navigation still works', async t => {
  const f = fixture({ backendConfigured: false }), view = await mount(t, f);
  assert.equal(view.root.findByProps({ accessibilityLabel: 'Masuk dengan Google' }).props.disabled, true);
  await press(button(view, 'Gunakan email')); await typeInto(input(view, 'Email'), 'player@example.com'); await typeInto(input(view, 'Sandi'), 'valid-password');
  assert.equal(button(view, 'Masuk').props.disabled, true); assert.deepEqual(f.calls, []);
});

test('auth transport relays only this project authentication and preserves request bodies, headers and cancellation', async () => {
  const calls = [], signal = new AbortController().signal;
  const relay = transportModule.authTransport('https://example.supabase.co', 'https://www.comeplayers.com', async (...args) => { calls.push(args); return new Response('{}'); });
  const init = { method: 'POST', body: '{"email":"test@example.invalid"}', headers: { Authorization: 'Bearer synthetic-test' }, signal };
  await relay('https://example.supabase.co/auth/v1/token?grant_type=password', init);
  assert.equal(calls[0][0], 'https://www.comeplayers.com/api/auth/mobile/token?grant_type=password'); assert.equal(calls[0][1], init);
  const original = new Request('https://example.supabase.co/auth/v1/signup', init);
  await relay(original);
  assert.equal(calls[1][0].url, 'https://www.comeplayers.com/api/auth/mobile/signup');
  assert.equal(calls[1][0].method, 'POST'); assert.equal(calls[1][0].headers.get('Authorization'), 'Bearer synthetic-test');
  assert.equal(await calls[1][0].text(), init.body);
  await relay('https://example.supabase.co/rest/v1/profiles', init);
  await relay('https://other.supabase.co/auth/v1/token', init);
  assert.equal(calls[2][0], 'https://example.supabase.co/rest/v1/profiles');
  assert.equal(calls[3][0], 'https://other.supabase.co/auth/v1/token');
});

test('auth transport refuses to send login credentials through an insecure relay', async () => {
  let calls = 0;
  const relay = transportModule.authTransport('https://example.supabase.co', 'http://www.comeplayers.com', async () => { calls++; });
  await assert.rejects(relay('https://example.supabase.co/auth/v1/token'), /Secure sign-in connection required/);
  assert.equal(calls, 0);
});

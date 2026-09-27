import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomBytes, createHash } from 'node:crypto';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Exercise actual hooks/components with native/network doubles. No user account,
// password manager, database or live endpoint is touched by these tests.
function load(file, dependencies = {}, globals = {}) {
  const mod = { exports: {} };
  const { outputText, diagnostics } = ts.transpileModule(readFileSync(new URL('../apps/mobile/src/' + file, import.meta.url), 'utf8'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  assert.equal(diagnostics?.length || 0, 0);
  runInNewContext(outputText, { module: mod, exports: mod.exports, Error, Uint8Array, TextEncoder, btoa, atob,
    setInterval: () => 1, clearInterval() {}, console,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return JsxRuntime;
      if (!(name in dependencies)) throw new Error('Unexpected test dependency: ' + name);
      return dependencies[name];
    }, ...globals,
  }, { filename: file, timeout: 2000 });
  return mod.exports;
}
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const policy = load('secure/recoveryPolicy.ts');
const feedback = load('secure/setupFeedback.ts');
const fresh = () => ({ kind: 'new', plan: { session: { device: { id: 'device-1' } }, backup: {}, recoveryIdentity: { userId } } });
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setupUI(activate) {
  return load('secure/SecureDeviceSetup.tsx', {
    'react-native': Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, name]).concat([['StyleSheet', { create: value => value }], ['Linking', { openURL: async () => {} }]])),
    '@expo/vector-icons/Ionicons': 'Icon', '../components': { PrimaryButton: 'Button' }, '../theme': { colors: {} },
    './secureSetup': { activatePasskeySetup: activate }, './setupFeedback': feedback,
  }).SecureDeviceSetup;
}
async function render(t, component, props) {
  let view;
  await act(async () => { view = Renderer.create(React.createElement(component, props)); await flush(); });
  t.after(async () => { await act(async () => view.unmount()); });
  return view;
}

test('setup is contextual: one primary action, no automatic prompt; cancellation allows an explicit retry', async t => {
  let prompts = 0, completed = 0;
  const UI = setupUI(async () => { prompts++; if (prompts === 1) throw { error: 'UserCancelled' }; });
  const view = await render(t, UI, { userId, setup: fresh(), error: '', onActivated: () => completed++, onRetry() {} });
  assert.equal(prompts, 0); assert.equal(view.root.findAllByType('Modal').length, 0);
  assert.equal(view.root.findAllByType('Button').length, 1);
  await act(async () => { view.root.findByType('Button').props.onPress(); await flush(); });
  assert.equal(prompts, 1); assert.equal(completed, 0);
  assert.match(JSON.stringify(view.toJSON()), /Belum dilanjutkan/);
  await act(flush); assert.equal(prompts, 1);
  await act(async () => { view.root.findByType('Button').props.onPress(); await flush(); });
  assert.equal(prompts, 2); assert.equal(completed, 1);
});

test('double taps cannot duplicate activation and completion refreshes the provider after navigating back', async t => {
  const pending = deferred(); let prompts = 0, completed = 0;
  const view = await render(t, setupUI(() => { prompts++; return pending.promise; }), { userId, setup: fresh(), error: '', onActivated: () => completed++, onRetry() {} });
  const click = view.root.findByType('Button').props.onPress;
  await act(async () => { click(); click(); });
  assert.equal(prompts, 1); assert.equal(view.root.findByType('Button').props.disabled, true);
  await act(async () => view.unmount());
  await act(async () => { pending.resolve(); await flush(); });
  assert.equal(completed, 1);
});

test('eight-device recovery requires explicit replacement and account changes refresh instead of prompting again', async t => {
  let removed, retried = 0;
  const setup = { kind: 'recover', snapshot: { roster_hash: 'one', encrypted_backup: { passkey: {} }, roster: { devices: Array.from({ length: 8 }, (_, i) => ({ id: 'old-' + i, createdAt: '2026-09-01' })) } } };
  const UI = setupUI(async (_user, _setup, ids) => { removed = [...ids]; throw new Error('The device list changed.'); });
  const view = await render(t, UI, { userId, setup, error: '', onActivated() {}, onRetry: () => retried++ });
  assert.equal(view.root.findByType('Button').props.disabled, true);
  await act(async () => view.root.findAllByType('Pressable').find(n => n.props.accessibilityRole === 'checkbox').props.onPress());
  assert.equal(view.root.findByType('Button').props.disabled, false);
  await act(async () => { view.root.findByType('Button').props.onPress(); await flush(); });
  assert.deepEqual(removed, ['old-0']);
  await act(async () => view.root.findByType('Button').props.onPress());
  assert.equal(retried, 1);
});

function providerUI({ snapshot = null, vault = null } = {}) {
  let prepared = 0, current;
  const dependencies = {
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    './accountRecovery': { prepareFirstDevice: () => { prepared++; return fresh(); } },
    './mobileSecureTransport': { mobileSecureTransport: async () => ({ account: snapshot }), mobileSecureBinaryTransport() {} },
    './secureHistorySync': { SecureHistorySync: class {} },
    './secureMessengerV2': { SecureMessengerV2: class { sync = async () => {}; pause = async () => {}; } },
    './verifiedVault': { openVerifiedVault: async () => vault }, './mediaStore': { cleanPrivatePreviewCache() {} },
    './nativeRecoveryPolicy': { applyNativeRecoveryPolicy: async () => {} }, './recoveryPolicy': policy,
    './crypto': { fingerprint: () => 'root' }, './multiDevice': { verifyRoster() {}, rosterHash: () => 'hash' },
    '../runtime': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) } } },
    './driveBackupPreference': { maybeRunAutomaticDriveBackup: async () => {} },
  };
  const { PrivateProvider, usePrivateMessenger } = load('secure/PrivateProvider.tsx', dependencies);
  function Child() { current = usePrivateMessenger(); return React.createElement('Inbox'); }
  function App() { return React.createElement(PrivateProvider, { userId, enabled: true }, React.createElement(Child)); }
  return { App, current: () => current, prepared: () => prepared };
}

test('a new account lands in the inbox without any setup overlay', async t => {
  const f = providerUI(), view = await render(t, f.App);
  assert.equal(view.root.findAllByType('Inbox').length, 1);
  assert.equal(view.root.findAllByType('Modal').length, 0);
  assert.equal(f.current().setup.kind, 'new'); assert.equal(f.prepared(), 1);
});

test('an existing encrypted account always stays in recovery; no replacement identity is created', async t => {
  const f = providerUI({ snapshot: { roster: { identity: { userId }, devices: [] }, roster_hash: 'hash', encrypted_backup: {} } });
  await render(t, f.App);
  assert.equal(f.current().setup.kind, 'recover'); assert.equal(f.prepared(), 0);
});

test('a verified local device opens messages without another setup prompt', async t => {
  const f = providerUI({ snapshot: { roster: { identity: { userId }, devices: [{ id: 'device-1' }] }, roster_hash: 'hash' }, vault: { descriptor: { deviceId: 'device-1' }, get: async () => ({ identity: { userId } }) } });
  await render(t, f.App);
  assert.ok(f.current().messenger); assert.equal(f.current().setup, null); assert.equal(f.prepared(), 0);
});

function activationFixture() {
  let prompts = 0, saved = 0, posts = 0, signedIn = userId, failPost = false;
  const prompt = deferred();
  const api = load('secure/secureSetup.ts', {
    './accountRecovery': { activateVerifiedDevice: async (plan, _transport, persist) => { posts++; if (failPost) throw new Error('Network disconnected'); await persist(plan.session, plan.recoveryIdentity); } },
    './mobileSecureTransport': { mobileSecureTransport: async () => ({ account: null }) },
    './verifiedVault': { persistVerifiedSession: async () => { saved++; } },
    './nativePasskey': { createNativePasskeyRecovery: async (_root, label) => { assert.equal(label.email, 'player@example.com'); prompts++; await prompt.promise; return { signature: 'passkey-proof' }; } },
    './crypto': { fingerprint: () => 'root' }, './multiDevice': { verifyRoster() {}, rosterHash: () => 'hash' },
    '../runtime': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: signedIn, email: 'player@example.com' } } } }) } } },
    './recoveryPolicy': policy,
  });
  return { ...api, prompt, prompts: () => prompts, saved: () => saved, posts: () => posts, switchAccount: () => { signedIn = 'another'; }, failPost: value => { failPost = value; } };
}

test('remounted screens share an in-flight activation; a failed POST retries the same passkey', async () => {
  const f = activationFixture(), setup = fresh(); f.failPost(true);
  const first = f.activatePasskeySetup(userId, setup), second = f.activatePasskeySetup(userId, setup);
  assert.equal(first, second); await flush(); assert.equal(f.prompts(), 1);
  f.prompt.resolve(); await assert.rejects(first, /Network/); assert.equal(f.saved(), 0);
  f.failPost(false); await f.activatePasskeySetup(userId, setup);
  assert.equal(f.prompts(), 1); assert.equal(f.posts(), 2); assert.equal(f.saved(), 1);
});

test('account switching during the system prompt cannot activate or persist the old device', async () => {
  const f = activationFixture(), pending = f.activatePasskeySetup(userId, fresh());
  await flush(); f.switchAccount(); f.prompt.resolve();
  await assert.rejects(pending, /signed-in account changed/); assert.equal(f.saved(), 0); assert.equal(f.posts(), 0);
});

test('password manager labels use the account email while the cryptographic user handle is preserved', () => {
  const provider = load('secure/passkeyProvider.ts', {
    '@noble/hashes/sha2.js': { sha256: input => createHash('sha256').update(input).digest() },
    './crypto': { random: () => randomBytes(32), utf8: value => new TextEncoder().encode(value), hex: value => Buffer.from(value).toString('hex') },
    './passkeyRecovery': { RECOVERY_RP_ID: 'www.comeplayers.com' },
  });
  const options = provider.recoveryCreateOptions(userId, new Uint8Array(32), { email: 'player@example.com' });
  assert.equal(atob(options.user.id), userId); assert.equal(options.user.name, 'player@example.com');
  assert.equal(options.user.displayName, 'player@example.com'); assert.equal(options.authenticatorSelection.userVerification, 'required');
  const fallback = provider.recoveryCreateOptions(userId, new Uint8Array(32));
  assert.equal(fallback.user.name, 'Akun ComePlayers'); assert.ok(!fallback.user.displayName.includes(userId));
  const sanitized = provider.recoveryCreateOptions(userId, new Uint8Array(32), { email: ' \u202Eplayer@example.com\n ' });
  assert.equal(sanitized.user.name, 'player@example.com');
});

test('cancelling verification after saving a passkey retries the saved credential without registering another', async () => {
  let created = 0, verified = 0; const prf = new Uint8Array(32).fill(7);
  const native = load('secure/nativePasskey.ts', {
    'react-native-passkey': { Passkey: { isSupported: () => true, create: async () => { created++; return { id: 'saved-credential' }; }, get: async () => { verified++; if (verified === 1) throw { error: 'UserCancelled' }; return { id: 'saved-credential', clientExtensionResults: { prf: { results: { first: 'fixture-prf' } } }, response: { authenticatorData: 'fixture-auth' } }; } } },
    './crypto': { random: () => new Uint8Array(32), hex: value => Buffer.from(value).toString('hex'), unhex: value => new Uint8Array(Buffer.from(value, 'hex')) },
    './passkeyRecovery': { sealPasskeyRecovery: (_root, value) => { assert.equal(value[0], 7); return { signature: 'encrypted-recovery' }; } },
    './passkeyProvider': { recoveryCreateOptions: () => ({}), recoveryGetOptions: () => ({}), fromBase64: () => new Uint8Array(32), validateRecoveryAssertion: () => prf },
  });
  const root = { userId };
  await assert.rejects(native.createNativePasskeyRecovery(root), reason => reason.error === 'UserCancelled');
  const result = await native.createNativePasskeyRecovery(root);
  assert.equal(result.signature, 'encrypted-recovery'); assert.equal(created, 1); assert.equal(verified, 2);
  assert.ok(prf.every(value => value === 0), 'PRF bytes are wiped after sealing');
});

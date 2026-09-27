import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual reset adapters with storage doubles, not real user stores.
// These tests do not claim to exercise native SQLite or a physical browser.
function load(source, dependencies = {}, globals = {}) {
  const testModule = { exports: {} };
  const { outputText, diagnostics } = ts.transpileModule(readFileSync(source, 'utf8'), {
    fileName: source.pathname,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  assert.equal(diagnostics?.length || 0, 0);
  runInNewContext(outputText, {
    module: testModule, exports: testModule.exports,
    require(name) { if (!(name in dependencies)) throw new Error(`Unexpected test dependency: ${name}`); return dependencies[name]; },
    ...globals,
  }, { filename: source.pathname, timeout: 2000 });
  return testModule.exports;
}
const policy = load(new URL('../lib/e2ee/recoveryPolicy.ts', import.meta.url));
const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const reset = { generation: 1, resetAt: '2026-09-15T00:00:00.000Z', requirePasskey: true };
const aDb = `cp-private-${a}.db`, bDb = `cp-private-${b}.db`;
const legacyDb = 'cp-private-cccccccc-cccc-cccc-cccc-cccccccccccc.db';
const v2 = id => `cp.secure.v2.${id}`, v1 = id => `cp.private.v1.${id}`;

function nativeFixture() {
  const storage = new Map([
    [v2(a), JSON.stringify({ root: { userId: a }, database: aDb })],
    [v1(a), JSON.stringify({ identity: { userId: a }, database: legacyDb })],
    [v2(b), JSON.stringify({ root: { userId: b }, database: bDb })],
    ['auth-session', 'untouched'],
  ]);
  const databases = new Set([aDb, legacyDb, bDb]), deleted = [], closed = [];
  let failure = false;
  const api = load(new URL('../../comeplayers-apps/apps/mobile/src/secure/nativeRecoveryPolicy.ts', import.meta.url), {
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'fixture',
      getItemAsync: async key => storage.get(key) ?? null,
      setItemAsync: async (key, value) => { storage.set(key, value); },
      deleteItemAsync: async key => { storage.delete(key); },
    },
    'expo-sqlite': {
      defaultDatabaseDirectory: 'fixture://sqlite',
      deleteDatabaseAsync: async name => { if (failure) throw new Error('database busy'); assert.ok(databases.has(name)); databases.delete(name); deleted.push(name); },
    },
    'expo-file-system': { File: class { constructor(_directory, name) { this.name = name; } get exists() { return databases.has(this.name); } } },
    './verifiedVault': { closeVerifiedVault: async id => { closed.push(id); }, verifiedDescriptorKey: v2 },
    './vault': { descriptorKey: v1 },
    './recoveryPolicy': policy,
  });
  return { ...api, storage, databases, deleted, closed, fail: value => { failure = value; } };
}

test('native cleanup removes only this account private stores and preserves Auth/other accounts', async () => {
  const f = nativeFixture();
  assert.equal(await f.applyNativeRecoveryPolicy(a, reset), true);
  assert.deepEqual(new Set(f.deleted), new Set([aDb, legacyDb]));
  assert.equal(f.storage.get('auth-session'), 'untouched');
  assert.ok(f.storage.has(v2(b))); assert.ok(f.databases.has(bDb));
  assert.ok(!f.storage.has(v2(a))); assert.ok(!f.storage.has(v1(a)));
  assert.equal(f.storage.get(policy.recoveryGenerationKey(a)), '1');
});
test('concurrent native reset requests are serialized and applied once', async () => {
  const f = nativeFixture();
  const values = await Promise.all([f.applyNativeRecoveryPolicy(a, reset), f.applyNativeRecoveryPolicy(a, reset)]);
  assert.deepEqual(values, [true, false]); assert.equal(f.closed.length, 1); assert.equal(f.deleted.length, 2);
});
test('interrupted native cleanup skips already deleted files on retry', async () => {
  const f = nativeFixture();
  f.storage.set(`${policy.recoveryGenerationKey(a)}.cleanup`, JSON.stringify([aDb, legacyDb]));
  f.databases.delete(aDb);
  assert.equal(await f.applyNativeRecoveryPolicy(a, reset), true);
  assert.deepEqual(f.deleted, [legacyDb]);
  assert.equal(f.storage.get(policy.recoveryGenerationKey(a)), '1');
});
test('failed native deletion does not advance the reset checkpoint', async () => {
  const f = nativeFixture(); f.fail(true);
  await assert.rejects(f.applyNativeRecoveryPolicy(a, reset), /database busy/);
  assert.ok(f.storage.has(v2(a))); assert.ok(!f.storage.has(policy.recoveryGenerationKey(a)));
  f.fail(false); assert.equal(await f.applyNativeRecoveryPolicy(a, reset), true);
});
test('a foreign native descriptor is never deleted', async () => {
  const f = nativeFixture();
  f.storage.set(v2(a), JSON.stringify({ root: { userId: b }, database: bDb }));
  await assert.rejects(f.applyNativeRecoveryPolicy(a, reset), /another account/);
  assert.equal(f.deleted.length, 0); assert.ok(f.databases.has(bDb));
  assert.ok(!f.storage.has(policy.recoveryGenerationKey(a)));
});

function browserFixture() {
  const storage = new Map([['auth-session', 'untouched']]);
  const databases = new Set([`cp-e2ee-v2-${a}`, `cp-e2ee-v2-${b}`]), deleted = [], closed = [];
  let blocked = false;
  const api = load(new URL('../lib/e2ee/browserRecoveryPolicy.ts', import.meta.url), {
    './browserVault': { closeBrowserVault: async id => { closed.push(id); } }, './recoveryPolicy': policy,
  }, {
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } },
    indexedDB: { deleteDatabase(name) {
      const request = {};
      queueMicrotask(() => { if (blocked) request.onblocked?.(); else { databases.delete(name); deleted.push(name); request.onsuccess?.(); } });
      return request;
    } },
  });
  return { ...api, storage, databases, deleted, closed, block: value => { blocked = value; } };
}
test('browser reset targets only the account database and serializes duplicates', async () => {
  const f = browserFixture();
  assert.deepEqual(await Promise.all([f.applyBrowserRecoveryPolicy(a, reset), f.applyBrowserRecoveryPolicy(a, reset)]), [true, false]);
  assert.deepEqual(f.deleted, [`cp-e2ee-v2-${a}`]); assert.equal(f.closed.length, 1);
  assert.ok(f.databases.has(`cp-e2ee-v2-${b}`)); assert.equal(f.storage.get('auth-session'), 'untouched');
});
test('a blocked browser deletion preserves the checkpoint for a safe retry', async () => {
  const f = browserFixture(); f.block(true);
  await assert.rejects(f.applyBrowserRecoveryPolicy(a, reset), /other ComePlayers tabs/);
  assert.ok(!f.storage.has(policy.recoveryGenerationKey(a))); assert.ok(f.databases.has(`cp-e2ee-v2-${a}`));
  f.block(false); assert.equal(await f.applyBrowserRecoveryPolicy(a, reset), true);
});
test('browser rollback or missing new policy cannot silently wipe local history', async () => {
  const f = browserFixture(); f.storage.set(policy.recoveryGenerationKey(a), '1');
  await assert.rejects(f.applyBrowserRecoveryPolicy(a, policy.parseRecoveryPolicy(undefined)), /backwards/);
  assert.equal(f.deleted.length, 0); assert.equal(f.storage.get('auth-session'), 'untouched');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute production backup orchestration with synthetic storage/archive adapters.
// Real archive cryptography is covered by the private protocol tests, not these doubles.
function load(name, dependencies = {}) {
  const file = new URL(`../../comeplayers-apps/apps/mobile/src/secure/${name}.ts`, import.meta.url);
  const module = { exports: {} };
  const { outputText, diagnostics } = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file.pathname, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  assert.equal(diagnostics?.length || 0, 0);
  runInNewContext(outputText, {
    module, exports: module.exports, TextDecoder, setTimeout,
    require(id) { if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`); return dependencies[id]; },
  }, { filename: file.pathname, timeout: 2000 });
  return module.exports;
}

const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const root = { userId, fingerprint: 'root-a' };
const deviceId = 'device-a';
const policy = load('recoveryPolicy');

function fixture({ generation = 0, duringTransfer = () => {}, afterFinalRead = () => {} } = {}) {
  let reads = 0, commits = 0, rollbacks = 0, failRead = false;
  const requests = [], keys = [], files = [];
  const remote = {
    account: { roster: { identity: { ...root }, devices: [{ id: deviceId }], valid: true }, roster_hash: 'valid-roster', encrypted_backup: {} },
    recovery: { generation, resetAt: generation ? '2026-09-16T00:00:00Z' : null, requirePasskey: generation > 0 },
  };
  const crypto = {
    fingerprint: value => value.fingerprint, publicIdentity: value => value, newId: () => 'fixture',
    unhex: () => { const key = new Uint8Array(32).fill(1); keys.push(key); return key; },
    utf8: value => new TextEncoder().encode(value),
  };
  const protocol = {
    verifyRoster: (roster, expected) => {
      if (!roster.valid || roster.identity.fingerprint !== expected.fingerprint) throw new Error('Invalid signed roster');
    },
    rosterHash: () => 'valid-roster',
  };
  const transport = async (...args) => {
    requests.push(args); reads++;
    if (failRead) throw new Error('offline');
    if (reads > 1) afterFinalRead();
    return structuredClone(remote);
  };
  const guard = load('backupRecoveryGuard', { './crypto': crypto, './multiDevice': protocol, './recoveryPolicy': policy });
  let records = new Map([['existing', { value: 'preserved' }]]);
  const vault = {
    descriptor: { deviceId }, get: async () => ({ identity: root, devices: [{ id: deviceId }], valid: true }),
    encode: (kind, id, value, room, sort) => ({ kind, id, value, room, sort }), decode: row => row.value,
    transaction: async callback => {
      const draft = new Map(records);
      try {
        await callback({
          getEachAsync: async function* () { yield { kind: 'message-v2', id: 'existing', value: 'preserved' }; },
          getFirstAsync: async () => null,
          runAsync: async (_sql, _kind, id, _room, _sort, value) => { draft.set(id, { value }); },
        });
        records = draft; commits++;
      } catch (error) { rollbacks++; throw error; }
    },
  };
  class File {
    constructor(...parts) { this.uri = parts.join('/'); this.exists = false; files.push(this); }
    create() { this.exists = true; }
    delete() { this.exists = false; }
    open() { return { offset: 0, writeBytes() {}, close() {} }; }
  }
  const api = load('verifiedBackup', {
    'expo-file-system': { File, Paths: { cache: 'fixture://cache' } },
    './backupFormat': {
      encodeBackup: async function* () { yield 'encrypted fixture\n'; duringTransfer(remote); },
      decodeBackup: async function* () {
        yield { format: 'fixture-header' };
        yield { kind: 'message-v2', id: 'imported', value: 'incoming', room: '', sort: '' };
        duringTransfer(remote);
      },
    },
    './crypto': crypto, './backupRecoveryGuard': guard,
    './nativeRecoveryPolicy': { readNativeRecoveryGeneration: async () => generation },
    './multiDevice': protocol, './passkeyRecovery': { openAccountBackup: () => root },
    './mobileSecureTransport': { mobileSecureTransport: transport },
    './verifiedVault': { openVerifiedVault: async () => vault },
    './verifiedBackupRecords': {
      BACKUP_CONTENT_KINDS: new Set(['message-v2']), historyBackupRecord: value => value,
      mergeHistoryBackupRecord: (_saved, incoming) => incoming.value,
      verifyHistoryBackupIdentity: value => { assert.equal(value.format, 'fixture-header'); },
    },
    './backupCancellation': load('backupCancellation'),
  });
  return {
    ...api, remote, requests, keys, files, failRead: () => { failRead = true; },
    get records() { return records; }, get commits() { return commits; }, get rollbacks() { return rollbacks; },
    restore: signal => api.restoreVerifiedBackup(userId, 'fixture://input', 'a'.repeat(64), signal),
    export: signal => api.exportVerifiedBackup(userId, 'a'.repeat(64), signal),
  };
}

for (const generation of [0, 1]) test(`authorized generation ${generation} restores history and preserves existing records`, async () => {
  const f = fixture({ generation }); await f.restore();
  assert.equal(f.commits, 1); assert.equal(f.rollbacks, 0);
  assert.equal(f.records.get('existing').value, 'preserved'); assert.equal(f.records.get('imported').value, 'incoming');
  assert.equal(f.requests.length, 2);
  for (const args of f.requests) assert.deepEqual(args, ['/api/messages/secure/account']);
  assert.ok(f.keys.every(key => key.every(byte => byte === 0)));
});

const failures = [
  ['reset', remote => { remote.recovery = { generation: 1, resetAt: '2026-09-16T01:00:00Z', requirePasskey: true }; }, /recovery changed/],
  ['device revocation', remote => { remote.account.roster.devices = []; }, /no longer authorized/],
  ['account switch', remote => { remote.account.roster.identity.userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; }, /account changed/],
  ['missing account', remote => { remote.account = null; }, /account changed/],
  ['changed root', remote => { remote.account.roster.identity.fingerprint = 'other-root'; }, /Invalid signed roster/],
];
for (const [name, mutate, pattern] of failures) test(`${name} during restore rolls back imported records`, async () => {
  const f = fixture({ duringTransfer: mutate }); await assert.rejects(f.restore(), pattern);
  assert.equal(f.commits, 0); assert.equal(f.rollbacks, 1);
  assert.equal(f.records.size, 1); assert.equal(f.records.get('existing').value, 'preserved');
  assert.ok(f.keys.every(key => key.every(byte => byte === 0)));
});

test('failed final policy request rolls back the restore', async () => {
  const f = fixture({ duringTransfer: () => f.failRead() });
  await assert.rejects(f.restore(), /offline/); assert.equal(f.rollbacks, 1); assert.equal(f.records.size, 1);
});
test('reset before starting a restore never opens a write transaction', async () => {
  const f = fixture(); f.remote.recovery = { generation: 1, resetAt: '2026-09-16T01:00:00Z', requirePasskey: true };
  await assert.rejects(f.restore(), /recovery changed/); assert.equal(f.commits + f.rollbacks, 0);
});
test('a stale deployment without policy cannot restore a generation-one vault', async () => {
  const f = fixture({ generation: 1 }); delete f.remote.recovery;
  await assert.rejects(f.restore(), /recovery changed/); assert.equal(f.commits + f.rollbacks, 0);
});
test('a tampered roster hash is rejected before importing', async () => {
  const f = fixture(); f.remote.account.roster_hash = 'tampered';
  await assert.rejects(f.restore(), /verification/); assert.equal(f.commits + f.rollbacks, 0);
});
test('cancellation during the final account request still rolls back', async () => {
  const abort = new AbortController();
  const f = fixture({ afterFinalRead: () => abort.abort() });
  await assert.rejects(f.restore(abort.signal), /cancel/i); assert.equal(f.rollbacks, 1); assert.equal(f.records.size, 1);
});
test('adding another device during restore keeps this authorized device usable', async () => {
  const f = fixture({ duringTransfer: remote => { remote.account.roster.devices.push({ id: 'device-b' }); } });
  await f.restore(); assert.equal(f.commits, 1);
});
test('a reset during export removes the temporary archive and clears its key', async () => {
  const f = fixture({ duringTransfer: failures[0][1] });
  await assert.rejects(f.export(), /recovery changed/);
  assert.equal(f.files.length, 1); assert.equal(f.files[0].exists, false);
  assert.ok(f.keys.every(key => key.every(byte => byte === 0)));
});

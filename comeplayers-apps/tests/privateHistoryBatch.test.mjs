import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

function load(file, dependencies) {
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../apps/mobile/src/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  runInNewContext(source, { module: mod, exports: mod.exports, console, Error, Date, Promise,
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Map, Set, setTimeout, clearTimeout,
    require: name => {
      if (!(name in dependencies)) throw new Error('Unexpected import: ' + name);
      return dependencies[name];
    },
  });
  return mod.exports;
}
const crypto = load('secure/crypto.ts', {
  hpke: await import('hpke'), '@panva/hpke-noble': await import('@panva/hpke-noble'),
  '@noble/curves/ed25519.js': await import('@noble/curves/ed25519.js'),
  '@noble/ciphers/chacha.js': await import('@noble/ciphers/chacha.js'),
  '@noble/hashes/sha2.js': await import('@noble/hashes/sha2.js'),
  '@noble/hashes/utils.js': await import('@noble/hashes/utils.js'),
});
const multi = load('secure/multiDevice.ts', { './crypto': crypto, '@noble/curves/ed25519.js': await import('@noble/curves/ed25519.js') });
const recovery = load('secure/accountRecovery.ts', { './crypto': crypto, './multiDevice': multi });
const attachments = load('secure/secureAttachment.ts', { './crypto': crypto });
const { Vault } = load('secure/vault.ts', { './crypto': crypto, 'expo-secure-store': {}, 'expo-sqlite': {} });
const { SecureHistorySync } = load('secure/secureHistorySync.ts', {
  './crypto': crypto, './multiDevice': multi, './secureAttachment': attachments, './boundedDownload': {},
});
const { SecureMessengerV2 } = load('secure/secureMessengerV2.ts', {
  'expo-file-system': {}, './mediaStore': {}, './secureAttachment': attachments, './secureHistorySync': { SecureHistorySync },
  '../messagingApi': {}, '../runtime': {}, '../inboxOrdering': load('inboxOrdering.ts', {}),
  './restoreMerge': load('secure/restoreMerge.ts', {}),
});

function database(identity) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,room TEXT NOT NULL,sort TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE INDEX records_room ON records(kind,room,sort DESC,id DESC);');
  const metrics = { commits: 0, rollbacks: 0, operations: 0, failAt: 0 };
  const api = {
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) || null,
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
    async withExclusiveTransactionAsync(work) {
      db.exec('BEGIN');
      try {
        await work({ runAsync: async (sql, ...args) => {
          if (++metrics.operations === metrics.failAt) throw new Error('simulated disk failure');
          return db.prepare(sql).run(...args);
        } });
        db.exec('COMMIT'); metrics.commits++;
      } catch (error) { db.exec('ROLLBACK'); metrics.rollbacks++; throw error; }
    },
  };
  const descriptor = { identity: identity.device.identity, deviceId: identity.device.id, localKey: crypto.hex(crypto.random()), database: 'test', version: 1 };
  const vault = new Vault(descriptor, api);
  return { db, vault, metrics, reset() { metrics.commits = 0; metrics.operations = 0; metrics.failAt = 0; metrics.rollbacks = 0; } };
}
async function fixture(count) {
  const alice = recovery.prepareFirstDevice(crypto.newId()).plan.session;
  const bob = recovery.prepareFirstDevice(crypto.newId()).plan.session;
  const roomId = crypto.newId();
  const { epoch, key } = await multi.createEpoch(alice.device, roomId, [{ roster: alice.roster, admin: true }, { roster: bob.roster, admin: true }], new Map([[alice.root.userId, alice.root], [bob.root.userId, bob.root]]));
  const events = [];
  for (let n = 0; n < count; n++) {
    const event = multi.encryptHistory(alice.device, epoch, key, { v: 2, kind: 'message', text: 'secret-message-' + n });
    events.push({ sequence: n + 1, event, blob_id: null, server_created_at: new Date(Date.UTC(2026, 8, 29, 12, 0, n)).toISOString() });
  }
  return { alice, bob, roomId, epoch, key, events };
}
function historyFor(vault, fixture, intercept = () => {}) {
  const history = new SecureHistorySync(vault, async () => { throw Error('Unexpected transport'); });
  history.contexts.set(fixture.roomId, { epochs: [fixture.epoch], keys: new Map([[fixture.epoch.id, fixture.key]]) });
  history.api = async path => {
    const after = Number(new URL('https://example.invalid' + path).searchParams.get('after'));
    await intercept(after);
    const events = fixture.events.filter(entry => entry.sequence > after).slice(0, 50);
    return { events, next: events.at(-1)?.sequence ?? after, hasMore: events.length === 50 };
  };
  return history;
}
async function seedRoom(vault, fixture) {
  await vault.put('room', fixture.roomId, { id: fixture.roomId, buyer_id: fixture.alice.root.userId, seller_id: fixture.bob.root.userId, unread_count: 0 });
  await vault.put('legacy-complete-v2', fixture.roomId, true);
}

test('500 verified encrypted events use ten history transactions; empty polling writes nothing', async () => {
  const data = await fixture(500), sql = database(data.bob);
  try {
    const history = historyFor(sql.vault, data);
    const entries = await history.sync();
    assert.equal(entries.length, 500);
    assert.equal(sql.metrics.commits, 10, 'one history page commit replaces three per event plus cursor');
    assert.equal(await sql.vault.get('meta', 'secure-history-cursor'), 500);
    assert.equal((await sql.vault.list('history-apply-v2', undefined, 1000)).length, 500);
    const rows = sql.db.prepare('SELECT value FROM records').all();
    assert.ok(rows.every(row => !row.value.includes('secret-message-')), 'history, projection journal and cursor use actual authenticated encryption');
    assert.deepEqual(Array.from(entries, row => row.payload.text), data.events.map((_, n) => 'secret-message-' + n));
    assert.equal((await history.sync()).length, 0);
    assert.equal(sql.metrics.commits, 10, 'unchanged cursor does not create another SQLite transaction');
  } finally { sql.db.close(); }
});

test('disk failure rolls back events, cursor, journal and outbox cleanup together; retry is idempotent', async () => {
  const data = await fixture(5), sql = database(data.bob);
  try {
    for (const entry of data.events) {
      await sql.vault.put('history-outbox-v2', entry.event.id, { pending: true });
      await sql.vault.put('history-pending-v2', entry.event.id, { pending: true });
    }
    sql.reset(); sql.metrics.failAt = 14; // after history+cursor writes and part of delete cleanup
    const history = historyFor(sql.vault, data);
    await assert.rejects(history.sync(), /disk failure/);
    assert.equal(sql.metrics.rollbacks, 1);
    assert.equal(await sql.vault.get('meta', 'secure-history-cursor'), null);
    assert.equal((await sql.vault.list('history-event-v2')).length, 0);
    assert.equal((await sql.vault.list('history-apply-v2')).length, 0);
    assert.equal((await sql.vault.list('history-outbox-v2')).length, 5);
    assert.equal((await sql.vault.list('history-pending-v2')).length, 5);
    sql.metrics.failAt = 0;
    assert.equal((await history.sync()).length, 5);
    assert.equal((await sql.vault.list('history-outbox-v2')).length, 0);
    assert.equal((await sql.vault.list('history-pending-v2')).length, 0);
    assert.equal((await history.sync()).length, 0);
    assert.equal((await sql.vault.list('history-event-v2')).length, 5);
  } finally { sql.db.close(); }
});

test('a tampered last event cannot partially commit an otherwise valid page', async () => {
  const data = await fixture(5), sql = database(data.bob);
  try {
    const last = data.events.at(-1).event;
    last.ciphertext = (last.ciphertext[0] === '0' ? '1' : '0') + last.ciphertext.slice(1);
    await assert.rejects(historyFor(sql.vault, data).sync());
    assert.equal(sql.metrics.commits, 0);
    assert.equal((await sql.vault.list('history-event-v2')).length, 0);
    assert.equal(await sql.vault.get('meta', 'secure-history-cursor'), null);
  } finally { sql.db.close(); }
});

test('first-page messages are visible before a slow second page and replay after restart does not duplicate unread counts', async () => {
  const data = await fixture(65), sql = database(data.bob);
  try {
    await seedRoom(sql.vault, data);
    let projected = 0;
    const first = historyFor(sql.vault, data);
    const messenger = new SecureMessengerV2(sql.vault, first);
    await assert.rejects(first.sync(undefined, async entries => {
      for (const entry of entries) { await messenger.apply(entry); if (++projected === 25) throw Error('process stopped'); }
    }), /process stopped/);
    assert.equal(await sql.vault.get('meta', 'secure-history-cursor'), 50, 'durable cursor and apply journal committed together');
    assert.equal((await sql.vault.list('history-apply-v2')).length, 50);
    assert.equal(await sql.vault.get('room-unread-v2', data.roomId), 25);
    let checkedNextPage = false;
    const restarted = historyFor(sql.vault, data, async after => {
      if (after === 50) {
        assert.equal((await sql.vault.list('message-v2', data.roomId, 100)).length, 50);
        assert.equal(await sql.vault.get('room-unread-v2', data.roomId), 50);
        checkedNextPage = true;
      }
    });
    const resumed = new SecureMessengerV2(sql.vault, restarted);
    let notifications = 0; resumed.subscribe(() => notifications++);
    await resumed.sync();
    assert.equal(checkedNextPage, true);
    assert.ok(notifications >= 2, 'each replayed/new page is visible separately');
    assert.equal((await sql.vault.list('message-v2', data.roomId, 100)).length, 65);
    assert.equal(await sql.vault.get('room-unread-v2', data.roomId), 65);
    assert.equal((await sql.vault.list('history-apply-v2')).length, 0);
    assert.equal(await sql.vault.get('meta', 'secure-history-cursor'), 65);
    await resumed.sync();
    assert.equal(await sql.vault.get('room-unread-v2', data.roomId), 65);
  } finally { sql.db.close(); }
});

test('500-event catch-up including conversation projection uses 520 commits rather than 2010', async () => {
  const data = await fixture(500), sql = database(data.bob);
  try {
    await seedRoom(sql.vault, data); sql.reset();
    const messenger = new SecureMessengerV2(sql.vault, historyFor(sql.vault, data));
    let notifications = 0; messenger.subscribe(() => notifications++);
    await messenger.sync();
    assert.equal(sql.metrics.commits, 520);
    assert.equal(notifications, 10);
    assert.equal(await sql.vault.get('room-unread-v2', data.roomId), 500);
    assert.equal((await sql.vault.list('message-v2', data.roomId, 1000)).length, 500);
    assert.equal((await sql.vault.list('history-apply-v2')).length, 0);
  } finally { sql.db.close(); }
});

test('replaying a partially projected page preserves edits, deletion, read receipts and local stars', async () => {
  const data = await fixture(0), sql = database(data.bob);
  try {
    const outgoingId = crypto.newId(), incomingId = crypto.newId();
    const inputs = [
      [data.bob.device, { v: 2, kind: 'message', text: 'sent message' }, outgoingId],
      [data.alice.device, { v: 2, kind: 'message', text: 'initial incoming' }, incomingId],
      [data.alice.device, { v: 2, kind: 'edit', id: incomingId, text: 'edited incoming' }],
      [data.alice.device, { v: 2, kind: 'receipt', ids: [outgoingId], read: true }],
      [data.alice.device, { v: 2, kind: 'delete', id: incomingId }],
    ];
    for (const [device, payload, id] of inputs) {
      await new Promise(resolve => setTimeout(resolve, 2));
      const event = multi.encryptHistory(device, data.epoch, data.key, payload, id);
      data.events.push({ sequence: data.events.length + 1, event, blob_id: null, server_created_at: event.createdAt });
    }
    await seedRoom(sql.vault, data);
    const first = historyFor(sql.vault, data);
    const messenger = new SecureMessengerV2(sql.vault, first);
    let projected = 0;
    await assert.rejects(first.sync(undefined, async entries => {
      for (const entry of entries) { await messenger.apply(entry); if (++projected === 4) throw Error('interrupted after receipt'); }
    }), /interrupted after receipt/);
    const incoming = await sql.vault.get('message-v2', incomingId);
    assert.equal(incoming.message, 'edited incoming');
    await sql.vault.put('message-v2', incomingId, { ...incoming, starred: true, local_updated_at: new Date(Date.now() + 1000).toISOString() }, data.roomId, incoming.created_at);
    const resumed = new SecureMessengerV2(sql.vault, historyFor(sql.vault, data));
    await resumed.sync();
    assert.equal((await sql.vault.get('message-v2', outgoingId)).delivery, 'read');
    const deleted = await sql.vault.get('message-v2', incomingId);
    assert.ok(deleted.deleted_at);
    assert.equal(deleted.message, null);
    assert.equal(deleted.starred, true);
    assert.equal(await sql.vault.get('room-unread-v2', data.roomId), 1);
    assert.equal((await sql.vault.list('message-v2', data.roomId)).length, 2);
    assert.equal((await sql.vault.list('history-apply-v2')).length, 0);
  } finally { sql.db.close(); }
});

test('a later network failure leaves the first page usable and retry resumes from its committed cursor', async () => {
  const data = await fixture(65), sql = database(data.bob);
  try {
    await seedRoom(sql.vault, data);
    const history = historyFor(sql.vault, data, after => { if (after === 50) throw Error('second page offline'); });
    const messenger = new SecureMessengerV2(sql.vault, history);
    const visibleCounts = [];
    messenger.subscribe(() => visibleCounts.push(sql.db.prepare("SELECT count(*) AS total FROM records WHERE kind='message-v2'").get().total));
    await assert.rejects(messenger.sync(), /second page offline/);
    assert.ok(visibleCounts.includes(50), 'first-page notification is not gated by the remaining network requests');
    assert.equal(await sql.vault.get('meta', 'secure-history-cursor'), 50);
    assert.equal((await sql.vault.list('history-apply-v2')).length, 0);
    const resumed = new SecureMessengerV2(sql.vault, historyFor(sql.vault, data));
    await resumed.sync();
    assert.equal(await sql.vault.get('room-unread-v2', data.roomId), 65);
    assert.equal((await sql.vault.list('message-v2', data.roomId, 100)).length, 65);
  } finally { sql.db.close(); }
});

test('overlapping call-key catch-up and message projection serialize their shared durable cursor', async () => {
  const data = await fixture(65), sql = database(data.bob);
  let release;
  try {
    await seedRoom(sql.vault, data);
    const requested = [];
    const history = historyFor(sql.vault, data, after => requested.push(after));
    const messenger = new SecureMessengerV2(sql.vault, history);
    let signalStarted;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    let projected = 0;
    const first = history.sync(undefined, async entries => {
      if (!projected) { signalStarted(); await held; }
      for (const entry of entries) { await messenger.apply(entry); projected++; }
    });
    await started;
    const second = history.sync();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(requested, [0], 'the second reader cannot advance the cursor while a page is being projected');
    release();
    const [firstEntries, secondEntries] = await Promise.all([first, second]);
    assert.equal(firstEntries.length, 65); assert.equal(secondEntries.length, 0);
    assert.deepEqual(requested, [0, 50, 65]);
    assert.equal(await sql.vault.get('meta', 'secure-history-cursor'), 65);
    assert.equal(await sql.vault.get('room-unread-v2', data.roomId), 65);
    assert.equal((await sql.vault.list('history-apply-v2')).length, 0);
  } finally { release?.(); sql.db.close(); }
});
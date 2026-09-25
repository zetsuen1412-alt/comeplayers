import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRefreshQueue, RevisionTracker } from '../lib/live/refresh-queue';
import { publishLiveChanges, subscribeLiveChanges } from '../lib/live/events';

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('many changes in one burst issue one refresh, including a trailing change during a read', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, release!: () => void;
  const queue = createRefreshQueue(() => { calls++; return new Promise<void>(resolve => { release = resolve; }); });
  t.after(() => queue.dispose());
  for (let i = 0; i < 30; i++) queue.request();
  t.mock.timers.tick(350); assert.equal(calls, 1);
  queue.request(); t.mock.timers.tick(350); assert.equal(calls, 1);
  release(); await settle(); t.mock.timers.tick(350); assert.equal(calls, 2);
  release(); await settle();
});

test('hidden/offline/disabled readers retain updates and catch up once ready', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let ready = false, calls = 0;
  const queue = createRefreshQueue(() => { calls++; }, () => ready);
  t.after(() => queue.dispose());
  queue.request(); t.mock.timers.tick(350); assert.equal(calls, 0);
  queue.request(); ready = true; t.mock.timers.tick(1000); await settle();
  assert.equal(calls, 1);
});

test('a pending local save defers a remote read without dropping the change', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let saving = true, reads = 0;
  const queue = createRefreshQueue(() => { if (saving) return false; reads++; });
  t.after(() => queue.dispose());
  queue.request(); t.mock.timers.tick(350); await settle(); assert.equal(reads, 0);
  saving = false; t.mock.timers.tick(1000); await settle(); assert.equal(reads, 1);
});

test('failed reads retry with backoff; disposing a page cancels the retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const queue = createRefreshQueue(() => { calls++; throw new Error('Offline'); });
  queue.request(); t.mock.timers.tick(350); await settle(); assert.equal(calls, 1);
  t.mock.timers.tick(14_999); assert.equal(calls, 1);
  t.mock.timers.tick(1); await settle(); assert.equal(calls, 2);
  queue.dispose(); t.mock.timers.tick(30_000); assert.equal(calls, 2);
});

test('revision reconciliation deduplicates unchanged rows and rejects delayed snapshots', () => {
  const tracker = new RevisionTracker();
  assert.deepEqual(tracker.accept([{ scope: 'payroll', revision: 10 }]), ['payroll']);
  assert.deepEqual(tracker.accept([{ scope: 'payroll', revision: 10 }]), []);
  assert.deepEqual(tracker.accept([{ scope: 'payroll', revision: 9 }]), []);
  assert.deepEqual(tracker.accept([{ scope: 'payroll', revision: 12 }]), ['payroll']);
});

test('scoped revisions map to local topics without exposing user identifiers to listeners', () => {
  const tracker = new RevisionTracker();
  assert.deepEqual(tracker.accept([
    { scope: 'user:11111111-1111-4111-8111-111111111111', revision: '9007199254740993' },
    { scope: 'catalog', revision: 2 },
    { scope: 'not-a-valid-topic', revision: 1 },
  ]), ['account', 'catalog']);
  assert.deepEqual(tracker.accept([{ scope: 'catalog', revision: 'NaN' }]), []);
});

test('listeners are unsubscribed after navigation and empty change sets are ignored', () => {
  let calls = 0;
  const unsubscribe = subscribeLiveChanges(topics => { calls++; assert.ok(topics.has('payroll')); });
  publishLiveChanges([]); assert.equal(calls, 0);
  publishLiveChanges(['payroll']); assert.equal(calls, 1);
  unsubscribe(); publishLiveChanges(['payroll']); assert.equal(calls, 1);
});

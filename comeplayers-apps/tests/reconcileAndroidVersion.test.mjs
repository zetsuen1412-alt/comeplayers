import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileAndroidVersion } from '../scripts/reconcile-android-version.mjs';

test('reconciles the observed counter to the distributed version and verifies the result', async () => {
  const values = ['3', '3', '15'], writes = [];
  assert.deepEqual(await reconcileAndroidVersion(async () => values.shift(), async n => writes.push(n)),
    { before: 3, after: 15, changed: true });
  assert.deepEqual(writes, [15]);
});
for (const counter of [15, 16, 100]) test('preserves remote counter ' + counter, async () => {
  assert.deepEqual(await reconcileAndroidVersion(async () => counter, async () => assert.fail('must not write')),
    { before: counter, after: counter, changed: false });
});
test('refuses an unreviewed intermediate counter', async () => {
  await assert.rejects(reconcileAndroidVersion(async () => 4, async () => assert.fail('must not write')));
});
for (const counter of [4, 16]) test('refuses concurrent version change to ' + counter, async () => {
  const values = [3, counter];
  await assert.rejects(reconcileAndroidVersion(async () => values.shift(), async () => assert.fail('must not write')));
});
test('rejects invalid counters without mutation', async () => {
  for (const counter of [null, undefined, '', 0, -1, '3.5', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(reconcileAndroidVersion(async () => counter, async () => assert.fail('must not write')));
  }
});
test('does not retry an uncertain write', async () => {
  let attempts = 0;
  await assert.rejects(reconcileAndroidVersion(async () => 3, async () => { attempts++; throw new Error('connection lost'); }));
  assert.equal(attempts, 1);
});
test('does not report an unverified write as successful', async () => {
  await assert.rejects(reconcileAndroidVersion(async () => 3, async () => {}));
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const group = 'https://www.facebook.com/groups/example/';
const target = `${group}posts/123/`;
const job = () => ({ id: 'reviewed-job', lease: 'lease', kind: 'group_comment', target, text: '',
  expiresAt: Date.now() + 120000, payload: { adminSelected: true } });

// Deterministic worker-routing tests. Chrome transport/storage and short waits
// are simulated here; unpacked-extension.py separately tests the native APIs.
function harness({ url = group, pendingUrl, probe = async () => ({ ready: true }), cancelWhenTargetRead = false } = {}) {
  const data = { facebookTab: 1, cancelled: false, stopLatched: false };
  const events = [];
  const tab = { id: 1, url, status: 'complete', pendingUrl };
  let listener;
  const chrome = {
    storage: { local: {
      get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])),
      set: async value => Object.assign(data, value),
      remove: async key => { delete data[key]; },
    } },
    tabs: {
      get: async () => { events.push({ type: 'read-tab', url: tab.url, pendingUrl: tab.pendingUrl }); if (cancelWhenTargetRead && tab.url === target) data.cancelled = true; return { ...tab }; },
      update: async (_id, change) => { events.push({ type: change.url ? 'navigate' : 'activate', ...change }); Object.assign(tab, change, { pendingUrl: undefined }); },
      sendMessage: async (_id, message) => {
        events.push({ type: message.type, job: message.job });
        if (message.type === 'CP_LOKER_PROBE_FEED') return probe();
        // Sending and fresh-document proof have their own tests. This routing
        // fixture deliberately returns an inconclusive content result.
        if (message.type === 'CP_LOKER_RUN') return { status: 'uncertain' };
        return { stopped: true };
      },
      query: async () => [],
    },
    scripting: { executeScript: async () => { events.push({ type: 'inject' }); } },
    runtime: { id: 'extension', getManifest: () => ({ version: '1.3.6' }),
      onMessage: { addListener: callback => { listener = callback; } },
      onStartup: { addListener() {} },
    },
  };
  vm.runInNewContext(source, { chrome, URL, Date, setTimeout: callback => queueMicrotask(callback) });
  const command = (command, value) => new Promise(resolve => listener({ type: 'CP_LOKER', command, data: value },
    { id: 'extension', url: 'http://localhost:3000/admin/lowongan', tab: { id: 2 } }, resolve));
  return { command, events, data };
}

test('positive feed probe runs approved target without navigation', async () => {
  const h = harness();
  assert.equal((await h.command('run', job())).status, 'uncertain');
  assert.equal(h.events.some(e => e.type === 'navigate'), false);
  assert.equal(h.events.filter(e => e.type === 'CP_LOKER_PROBE_FEED').length, 1);
  assert.equal(h.events.find(e => e.type === 'CP_LOKER_RUN').job.useExistingFeed, true);
  assert.equal(h.data.active, undefined);
});

for (const [name, options] of [
  ['negative probe', { probe: async () => ({ ready: false }) }],
  ['probe transport failure', { probe: async () => { throw new Error('context closed'); } }],
  ['different group', { url: 'https://www.facebook.com/groups/other/' }],
  ['pending document', { pendingUrl: target }],
]) {
  test(`${name} falls back to the exact approved canonical post`, async () => {
    const h = harness(options);
    assert.equal((await h.command('run', job())).status, 'uncertain');
    assert.deepEqual(h.events.filter(e => e.type === 'navigate').map(e => e.url), [target]);
    assert.equal(Object.hasOwn(h.events.find(e => e.type === 'navigate'), 'active'), false);
    const activation = h.events.findIndex(e => e.type === 'activate' && e.active === true);
    const navigation = h.events.findIndex(e => e.type === 'navigate');
    const readyReads = h.events.slice(navigation + 1, activation).filter(e => e.type === 'read-tab' && e.url === target && !e.pendingUrl);
    assert.equal(readyReads.length >= 2, true, 'activate only after both target readiness reads');
    assert.equal(activation < h.events.findIndex(e => e.type === 'CP_LOKER_RUN'), true);
    assert.equal(h.events.find(e => e.type === 'CP_LOKER_RUN').job.useExistingFeed, false);
    if (name === 'different group' || name === 'pending document') {
      assert.equal(h.events.some(e => e.type === 'CP_LOKER_PROBE_FEED'), false);
    }
  });
}

test('read-only scan navigates the attached Facebook tab without taking focus from Admin', async () => {
  const h = harness();
  const result = await h.command('scan', { groups: [group] });
  assert.equal(result.groupsScanned, 1);
  assert.deepEqual(h.events.filter(e => e.type === 'navigate').map(e => e.url), [group]);
  assert.equal(h.events.some(e => e.type === 'navigate' && Object.hasOwn(e, 'active')), false);
  assert.equal(h.events.filter(e => e.type === 'CP_LOKER_SCAN_ALL').length, 1);
  assert.equal(h.events.some(e => e.type === 'CP_LOKER_RUN' || e.type === 'CP_LOKER_PROBE_FEED'), false);
  assert.equal(h.events.some(e => e.type === 'activate'), false);
});

test('STOP during target loading prevents foreground activation and comment dispatch', async () => {
  const h = harness({ probe: async () => ({ ready: false }), cancelWhenTargetRead: true });
  const result = await h.command('run', job());
  assert.equal(result.status, 'cancelled');
  assert.equal(result.dispatched, false);
  assert.deepEqual(h.events.filter(e => e.type === 'navigate').map(e => e.url), [target]);
  assert.equal(h.events.some(e => e.type === 'activate' || e.type === 'CP_LOKER_RUN'), false);
  assert.equal(h.data.active, undefined);
});

test('STOP while read-only probe awaits response prevents run and navigation', async () => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness({ probe: () => { entered(); return pending; } });
  const running = h.command('run', job());
  await started;
  await h.command('stop');
  release({ ready: true });
  const result = await running;
  assert.equal(result.status, 'cancelled');
  assert.equal(result.dispatched, false);
  assert.equal(h.events.some(e => e.type === 'navigate' || e.type === 'CP_LOKER_RUN'), false);
  assert.equal(h.data.stopLatched, true);
  assert.equal(h.data.active, undefined);
});

test('persistent STOP rejects next job before any feed probe or injection', async () => {
  const h = harness();
  await h.command('stop');
  const result = await h.command('run', job());
  assert.equal(result.status, 'cancelled');
  assert.equal(h.events.some(e => e.type === 'inject' || e.type === 'CP_LOKER_PROBE_FEED' || e.type === 'CP_LOKER_RUN'), false);
});

test('unreviewed job never gains existing-feed permission', async () => {
  const h = harness();
  const unreviewed = job();
  delete unreviewed.payload;
  await h.command('run', unreviewed);
  assert.equal(h.events.some(e => e.type === 'CP_LOKER_PROBE_FEED'), false);
  assert.equal(h.events.find(e => e.type === 'CP_LOKER_RUN').job.useExistingFeed, false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const module = { exports: {} };
const source = readFileSync(new URL('../apps/mobile/src/mobileUpdates.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
runInNewContext(outputText, { module, exports: module.exports, setTimeout, clearTimeout, Error });
const { createMobileUpdateController } = module.exports;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(overrides = {}, options = {}) {
  const states = [], errors = [], calls = { checks: 0, downloads: 0, reloads: 0 };
  const driver = {
    isEnabled: true,
    async checkForUpdateAsync() { calls.checks++; return { isAvailable: true }; },
    async fetchUpdateAsync() { calls.downloads++; return { isNew: true }; },
    async reloadAsync() { calls.reloads++; },
    ...overrides,
  };
  const controller = createMobileUpdateController(driver, state => states.push(state), { onError: error => errors.push(error), ...options });
  return { controller, driver, states, errors, calls };
}

test('background download stays pending until the user applies it; later checks do not hide it', async () => {
  const f = fixture();
  await f.controller.check();
  assert.equal(f.states.at(-1).status, 'ready');
  assert.equal(f.calls.reloads, 0);
  await f.controller.check();
  assert.equal(f.calls.checks, 1);
  assert.equal(f.states.at(-1).status, 'ready');
  await f.controller.apply();
  assert.equal(f.calls.reloads, 1);
  assert.equal(f.states.at(-1).status, 'applying');
});

test('an update downloaded by the native startup check offers the same explicit apply path', async () => {
  const f = fixture();
  f.controller.markPending();
  await f.controller.check();
  assert.equal(f.calls.checks, 0);
  assert.equal(f.calls.reloads, 0);
  await f.controller.apply();
  assert.equal(f.calls.reloads, 1);
});

test('concurrent foreground events share one check/download and never restart the app', async () => {
  const checking = deferred();
  const f = fixture({ checkForUpdateAsync: () => { f.calls.checks++; return checking.promise; } });
  const first = f.controller.check();
  await f.controller.check();
  assert.equal(f.calls.checks, 1);
  checking.resolve({ isAvailable: true });
  await first;
  assert.equal(f.calls.downloads, 1);
  assert.equal(f.calls.reloads, 0);
});

test('no available update or an unsuccessful fetch cannot create a restart action', async () => {
  const unavailable = fixture({ checkForUpdateAsync: async () => ({ isAvailable: false }) });
  await unavailable.controller.check();
  await unavailable.controller.apply();
  assert.equal(unavailable.calls.downloads, 0);
  assert.equal(unavailable.calls.reloads, 0);
  assert.equal(unavailable.states.length, 0);
  const unsuccessful = fixture({ fetchUpdateAsync: async () => ({ isNew: false }) });
  await unsuccessful.controller.check();
  await unsuccessful.controller.apply();
  assert.equal(unsuccessful.states.length, 0);
  assert.equal(unsuccessful.calls.reloads, 0);
});

test('native rollback instructions are downloaded but also wait for user apply', async () => {
  const f = fixture({
    checkForUpdateAsync: async () => ({ isAvailable: false, isRollBackToEmbedded: true }),
    fetchUpdateAsync: async () => ({ isNew: false, isRollBackToEmbedded: true }),
  });
  await f.controller.check();
  assert.equal(f.states.at(-1).status, 'ready');
  assert.equal(f.calls.reloads, 0);
});

test('double taps deduplicate reload and a failed reload leaves a retryable update', async () => {
  const reloading = deferred();
  const f = fixture({ reloadAsync: () => { f.calls.reloads++; return reloading.promise; } });
  f.controller.markPending();
  const applying = f.controller.apply();
  await f.controller.apply();
  assert.equal(f.calls.reloads, 1);
  reloading.reject(new Error('native reload failed'));
  await applying;
  assert.equal(f.states.at(-1).status, 'ready');
  assert.match(f.states.at(-1).error, /Coba lagi/);
  f.driver.reloadAsync = async () => { f.calls.reloads++; };
  await f.controller.apply();
  assert.equal(f.calls.reloads, 2);
});

test('a timed out background check does not block a later foreground retry', async () => {
  const hanging = deferred();
  const f = fixture({ checkForUpdateAsync: () => hanging.promise }, { checkTimeoutMs: 5 });
  await f.controller.check();
  assert.equal(f.errors.length, 1);
  assert.equal(f.states.length, 0);
  f.driver.checkForUpdateAsync = async () => ({ isAvailable: true });
  await f.controller.check();
  assert.equal(f.states.at(-1).status, 'ready');
  assert.equal(f.calls.reloads, 0);
  hanging.resolve({ isAvailable: true });
});

test('a native pending signal survives a download timeout', async () => {
  const hanging = deferred();
  const f = fixture({ fetchUpdateAsync: () => hanging.promise }, { downloadTimeoutMs: 5 });
  await f.controller.check();
  assert.equal(f.errors.length, 1);
  hanging.resolve({ isNew: true });
  f.controller.markPending();
  assert.equal(f.states.at(-1).status, 'ready');
  await f.controller.apply();
  assert.equal(f.calls.reloads, 1);
});

test('disabled updates and disposed controllers cannot download or reload', async () => {
  const disabled = fixture({ isEnabled: false });
  disabled.controller.markPending();
  await disabled.controller.check();
  await disabled.controller.apply();
  assert.equal(disabled.states.length, 0);
  assert.equal(disabled.calls.checks, 0);
  assert.equal(disabled.calls.reloads, 0);
  const pending = deferred();
  const disposed = fixture({ checkForUpdateAsync: () => pending.promise });
  const checking = disposed.controller.check();
  disposed.controller.dispose();
  pending.resolve({ isAvailable: true });
  await checking;
  disposed.controller.markPending();
  await disposed.controller.apply();
  assert.equal(disposed.calls.downloads, 0);
  assert.equal(disposed.calls.reloads, 0);
  assert.equal(disposed.states.length, 0);
});

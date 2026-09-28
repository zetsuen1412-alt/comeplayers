import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx'))('esbuild');
const website = fileURLToPath(new URL('..', import.meta.url));
const origin = 'https://www.comeplayers.com';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const policy = { generation: 0, resetAt: null, requirePasskey: false, allowDeviceSetup: true };
let browser, bundle;

before(async () => {
  const compiled = await build({
    stdin: { contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import Gate from './components/messages/SecureDirectConversation';
      import {rosterHash} from './lib/e2ee/protocol';
      export * from './lib/e2ee/crypto'; export * from './lib/e2ee/protocol';
      export * from './lib/e2ee/account'; export * from './lib/e2ee/browserVault';
      export * from './lib/e2ee/browserEnrollment'; export * from './lib/e2ee/passwordRecovery';
      export async function transport(path, init = {}) {
        const body = init.body ? JSON.parse(init.body) : null;
        const response = await window.server({path, init, hash: body?.roster ? rosterHash(body.roster) : null});
        if (response.error) throw Object.assign(new Error(response.error), {status: response.status});
        return response;
      }
      window.fixtureTransport = transport;
      export function mount(count = 1) {
        window.fixtureRoot = createRoot(document.getElementById('root'));
        window.fixtureRoot.render(React.createElement(React.Fragment, null, ...Array.from({length: count}, (_, i) => React.createElement(Gate, {key: i, userId: window.fixtureUser, room: {id: 'test-room-' + i, type: 'direct'}}))));
      }
    `, resolveDir: website, sourcefile: 'enrollment-fixture.tsx', loader: 'tsx' },
    plugins: [{name: 'isolated-auth-and-view', setup(b) {
      b.onResolve({filter: /^@\/lib\/(supabase|authenticatedFetch)$/}, args => ({path: args.path, namespace: 'fixture'}));
      b.onResolve({filter: /^\.\/(SecureConversationView|GoogleDriveAutoBackupAgent)$/}, args => ({path: args.path, namespace: 'fixture'}));
      b.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({contents:
        args.path.endsWith('supabase') ? `export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:window.fixtureUser,email:'synthetic@example.test'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};` :
        args.path.endsWith('authenticatedFetch') ? `export const authenticatedFetchJson=(...args)=>window.fixtureTransport(...args);` :
        args.path.endsWith('SecureConversationView') ? `import React from 'react'; export default function View(){return React.createElement('div',{'data-testid':'chat-ready'},'Chat siap');}` :
        `export default function Agent(){return null;}`,
        loader: 'js', resolveDir: website,
      }));
    }}],
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'Fixture',
    target: 'chrome130', logLevel: 'silent', tsconfig: `${website}/tsconfig.json`,
    define: {'process.env': '{}'},
  });
  bundle = compiled.outputFiles[0].text;
  browser = await chromium.launch({headless: true});
});
after(async () => { await browser?.close(); });

async function fixture(t, options = {}) {
  const context = await browser.newContext({serviceWorkers: 'block'});
  t.after(() => context.close());
  const state = {account: null, posts: [], gets: 0, ...options};
  await context.exposeFunction('server', async request => {
    if (request.init.method === 'POST') {
      const body = JSON.parse(request.init.body);
      state.posts.push(body);
      if (state.beforePost) await state.beforePost(state, request);
      if (state.account && state.account.roster_hash !== request.hash) return {error: 'The encryption identity cannot change.', status: 409};
      state.account = {roster: body.roster, roster_hash: request.hash, encrypted_backup: body.backup, updated_at: new Date().toISOString()};
      if (state.loseResponse) { state.loseResponse = false; return {error: 'Network connection lost'}; }
      return {revision: body.roster.revision, rosterHash: request.hash};
    }
    state.gets++;
    if (state.getError) return {error: state.getError, status: state.getStatus};
    return {account: state.account, recovery: policy};
  });
  await context.addInitScript(({userId}) => {
    window.fixtureUser = userId; window.credentialsRequested = 0;
    for (const method of ['create', 'get']) Object.defineProperty(navigator.credentials, method, {value: () => { window.credentialsRequested++; throw new Error('Unsolicited credential prompt'); }});
  }, {userId});
  const unexpected = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === origin + '/fixture') return route.fulfill({contentType: 'text/html', body: '<!doctype html><div id="root"></div><script src="/fixture.js"></script>'});
    if (url === origin + '/fixture.js') return route.fulfill({contentType: 'application/javascript', body: bundle});
    if (url === origin + '/favicon.ico') return route.fulfill({status: 204});
    unexpected.push(url); return route.abort();
  });
  t.after(() => assert.deepEqual(unexpected, [], 'No real service may be contacted'));
  const page = await context.newPage();
  const scriptErrors = []; page.on('pageerror', error => scriptErrors.push(error.message));
  await page.goto(origin + '/fixture');
  assert.deepEqual(scriptErrors, [], 'The actual component bundle must initialize');
  assert.equal(await page.evaluate(() => typeof Fixture?.ensureAutomaticBrowserEnrollment), 'function');
  return {page, context, state};
}
const enroll = page => page.evaluate(policy => Fixture.ensureAutomaticBrowserEnrollment(window.fixtureUser, policy, Fixture.transport, async () => {}), policy);
const session = page => page.evaluate(async () => {
  const vault = await Fixture.openBrowserVault(window.fixtureUser);
  if (!vault) return null;
  const value = await vault.session();
  return {root: vault.checkpoint.rootFingerprint, device: value.device.id, localKeySaved: !!await vault.get('local-recovery-key-v1', window.fixtureUser)};
});

test('two mounted real setup gates open chat automatically without a credential prompt', async t => {
  const {page, state} = await fixture(t);
  await page.evaluate(() => Fixture.mount(2));
  await page.getByTestId('chat-ready').nth(1).waitFor();
  assert.equal(state.posts.length, 1);
  assert.equal(await page.evaluate(() => window.credentialsRequested), 0);
  assert.equal(await page.getByRole('button').count(), 0);
  const saved = await session(page); assert.equal(saved.localKeySaved, true);
  await page.reload(); await page.evaluate(() => Fixture.mount());
  await page.getByTestId('chat-ready').waitFor();
  assert.deepEqual(await session(page), saved); assert.equal(state.posts.length, 1);
});

test('independent tabs select one durable enrollment identity and share the vault key', async t => {
  const {page, context, state} = await fixture(t);
  const second = await context.newPage(); await second.goto(origin + '/fixture');
  assert.deepEqual(await Promise.all([enroll(page), enroll(second)]), [true, true]);
  const a = await session(page), b = await session(second);
  assert.deepEqual(a, b);
  assert.ok(state.posts.length >= 1 && state.posts.length <= 2);
  assert.ok(state.posts.every(post => post.roster.devices[0].id === a.device));
  await page.evaluate(async () => (await Fixture.openBrowserVault(window.fixtureUser)).put('synthetic-history', 'one', {text: 'Retained chat'}));
  assert.equal(await second.evaluate(async () => (await Fixture.openBrowserVault(window.fixtureUser)).get('synthetic-history', 'one').then(row => row.text)), 'Retained chat');
});

test('lost POST response resumes after a full reload with the same root and device', async t => {
  const {page, state} = await fixture(t, {loseResponse: true});
  await assert.rejects(enroll(page), /connection lost/);
  assert.equal(await session(page), null); assert.equal(state.posts.length, 1);
  const journal = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('cp-e2ee-enrollment-v1-' + window.fixtureUser); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const row = await new Promise(resolve => { const r = db.transaction('state').objectStore('state').get('pending'); r.onsuccess = () => resolve(r.result); }); db.close();
    return {fields: Object.keys(row).sort(), extractable: row.master.extractable, encrypted: row.ciphertext.byteLength > 100};
  });
  assert.deepEqual(journal, {fields: ['ciphertext', 'iv', 'key', 'master'], extractable: false, encrypted: true});
  await page.reload(); assert.equal(await enroll(page), true);
  assert.equal((await session(page)).device, state.account.roster.devices[0].id);
  assert.equal(state.posts.length, 1);
});

test('failed durable journal storage prevents a server enrollment', async t => {
  const {page, state} = await fixture(t);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...rest) { if (this.name === 'state') { this.transaction.abort(); return original.call(this, value, ...rest); } return original.call(this, value, ...rest); };
  });
  await assert.rejects(enroll(page)); assert.equal(state.posts.length, 0);
});

test('an interrupted vault activation never leaves a partial checkpoint and can resume', async t => {
  const {page, state} = await fixture(t);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...rest) { if (value.kind === 'root-recovery-v2') throw new Error('Simulated disk full'); return original.call(this, value, ...rest); };
  });
  await assert.rejects(enroll(page), /disk full/);
  assert.equal(state.posts.length, 1); assert.equal(await session(page), null);
  await page.reload(); assert.equal(await enroll(page), true);
  assert.equal(state.posts.length, 1); assert.equal((await session(page)).localKeySaved, true);
});

test('concurrent mobile registration retains the existing account instead of replacing its root', async t => {
  const {page, state} = await fixture(t);
  const original = await page.evaluate(() => {
    const {plan} = Fixture.prepareFirstDevice(window.fixtureUser);
    return {roster: plan.session.roster, roster_hash: Fixture.rosterHash(plan.session.roster), encrypted_backup: plan.backup, updated_at: new Date().toISOString()};
  });
  state.beforePost = state => { state.account = original; };
  assert.equal(await enroll(page), false);
  assert.deepEqual(state.account, original); assert.equal(await session(page), null);
  await page.reload(); await page.evaluate(() => Fixture.mount());
  await page.getByRole('heading', {name: 'Buka chat Anda'}).waitFor();
  assert.match(await page.locator('body').innerText(), /perangkat lama/);
  assert.equal(await page.evaluate(() => window.credentialsRequested), 0);
  assert.equal(state.posts.length, 1);
});

test('network failure shows retry and reconnects when the browser returns online', async t => {
  const {page, state} = await fixture(t, {getError: 'Failed to fetch'});
  await page.evaluate(() => Fixture.mount());
  await page.getByRole('button', {name: 'Coba lagi'}).waitFor();
  assert.equal(await page.getByRole('heading', {name: 'Chat belum terhubung'}).count(), 1);
  state.getError = null;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByTestId('chat-ready').waitFor();
  assert.equal(state.posts.length, 1);
});

test('integrity errors never auto-retry or silently replace account data', async t => {
  const {page, state} = await fixture(t, {getError: 'The device list failed verification.'});
  await page.evaluate(() => Fixture.mount());
  await page.getByRole('button', {name: 'Coba lagi'}).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1200);
  assert.equal(state.gets, 1); assert.equal(state.posts.length, 0);
});

test('transient retries stop after the bounded retry budget and leave a usable action', async t => {
  const {page, state} = await fixture(t, {getError: 'Failed to fetch'});
  await page.clock.install();
  await page.evaluate(() => Fixture.mount());
  await page.getByRole('button', {name: 'Coba lagi'}).waitFor();
  for (const delay of [1000, 3000, 10000, 30000]) {
    const before = state.gets;
    await page.clock.runFor(delay);
    await page.waitForFunction(() => document.querySelector('section')?.getAttribute('aria-busy') === 'false');
    assert.equal(state.gets, before + 1);
  }
  await page.clock.runFor(60000);
  assert.equal(state.gets, 5); assert.equal(state.posts.length, 0);
  assert.equal(await page.getByRole('button', {name: 'Coba lagi'}).count(), 1);
});

test('existing password recovery opens the same account without invoking passkeys', async t => {
  const {page, state} = await fixture(t);
  state.account = await page.evaluate(async () => {
    const {plan} = Fixture.prepareFirstDevice(window.fixtureUser);
    const {recovery} = await Fixture.sealPasswordRecovery(plan.recoveryIdentity, 'synthetic backup password');
    return {roster: plan.session.roster, roster_hash: Fixture.rosterHash(plan.session.roster), encrypted_backup: {...plan.backup, password: recovery}, updated_at: new Date().toISOString()};
  });
  const originalRoot = state.account.roster.identity;
  // This fixture only accepts an existing root and its next valid roster revision.
  state.beforePost = (current, request) => {
    const body = JSON.parse(request.init.body);
    assert.deepEqual(body.roster.identity, originalRoot);
    assert.equal(body.roster.revision, 2);
    current.account = null;
  };
  await page.evaluate(() => Fixture.mount());
  await page.getByLabel('Sandi cadangan chat').fill('synthetic wrong password');
  await page.getByRole('button', {name: 'Buka chat', exact: true}).click();
  await page.getByRole('alert').filter({hasText: 'Sandi cadangan tidak cocok'}).waitFor();
  assert.equal(state.posts.length, 0);
  await page.getByLabel('Sandi cadangan chat').fill('synthetic backup password');
  await page.getByRole('button', {name: 'Buka chat', exact: true}).click();
  await page.getByTestId('chat-ready').waitFor();
  assert.equal(state.posts.length, 1);
  assert.equal(await page.evaluate(() => window.credentialsRequested), 0);
  assert.deepEqual(state.account.roster.identity, originalRoot);
});

test('an already open vault cannot bypass a changed server identity', async t => {
  const {page, state} = await fixture(t);
  await enroll(page);
  const original = await session(page);
  state.account = await page.evaluate(() => {
    const {plan} = Fixture.prepareFirstDevice(window.fixtureUser);
    return {roster: plan.session.roster, roster_hash: Fixture.rosterHash(plan.session.roster), encrypted_backup: plan.backup, updated_at: new Date().toISOString()};
  });
  await assert.rejects(enroll(page), /identity changed/);
  assert.deepEqual(await session(page), original);
  assert.equal(state.posts.length, 1);
});

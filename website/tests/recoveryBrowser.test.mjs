import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Uses Chromium's real WebAuthn PRF and IndexedDB with a virtual authenticator.
// Every HTTPS request is intercepted before navigation. No real account, Auth
// token, message, credential, or production service is contacted by this test.
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx'))('esbuild');
const website = fileURLToPath(new URL('..', import.meta.url));
const origin = 'https://www.comeplayers.com';
let browser, bundle;
before(async () => {
  const compiled = await build({
    stdin: {
      contents: `
        export * from './lib/e2ee/crypto';
        export * from './lib/e2ee/protocol';
        export * from './lib/e2ee/account';
        export * from './lib/e2ee/browserPasskey';
        export * from './lib/e2ee/browserVault';
        export * from './lib/e2ee/browserRecoveryPolicy';
      `,
      resolveDir: website, sourcefile: 'recovery-browser-fixture.ts', loader: 'ts',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    globalName: 'RecoveryFixture', target: 'chrome130', logLevel: 'silent',
  });
  bundle = compiled.outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); });

async function fixture(t, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  const unexpected = [];
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url === origin + '/recovery-fixture') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Isolated recovery test</title><main>ComePlayers synthetic recovery fixture</main><script src="/fixture.js"></script>' });
    }
    if (url === origin + '/fixture.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: bundle });
    if (url === origin + '/favicon.ico') return route.fulfill({ status: 204 });
    unexpected.push(url); return route.abort();
  });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, hasPrf: true,
    isUserVerified: true, automaticPresenceSimulation: true,
    defaultBackupEligibility: true, defaultBackupState: true, ...options,
  } });
  await page.goto(origin + '/recovery-fixture');
  t.after(() => assert.deepEqual(unexpected, [], 'A test attempted an unexpected network request'));
  return { page, cdp, authenticatorId };
}

async function createPasskey(page) {
  return page.evaluate(async () => {
    const cp = RecoveryFixture;
    const root = cp.createIdentity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const passkey = await cp.createBrowserPasskeyRecovery(root);
    // Return only the signed encrypted backup and public identity.
    return { passkey, root: cp.publicIdentity(root) };
  });
}

test('real browser PRF restores encrypted history after a complete page reload without a recovery-code input', { timeout: 45000 }, async t => {
  const { page } = await fixture(t);
  const retained = await page.evaluate(async () => {
    const cp = RecoveryFixture, a = cp.prepareFirstDevice(cp.newId()), b = cp.prepareFirstDevice(cp.newId());
    const passkey = await cp.createBrowserPasskeyRecovery(a.plan.recoveryIdentity);
    const plan = { ...a.plan, backup: { ...a.plan.backup, passkey } };
    let sent;
    await cp.activateVerifiedDevice(plan, async (_path, options) => {
      sent = options.body;
      return { revision: plan.session.roster.revision, rosterHash: cp.rosterHash(plan.session.roster), passkeySignature: passkey.signature };
    }, cp.persistVerifiedBrowserSession);
    const secrets = [a.recoveryKey, plan.recoveryIdentity.encryptionSecret, plan.recoveryIdentity.signingSecret, plan.session.device.identity.encryptionSecret, plan.session.device.identity.signingSecret];
    if (secrets.some(secret => sent.includes(secret))) throw new Error('Private material leaked into an enrollment payload');
    const roots = new Map([[plan.session.root.userId, plan.session.root], [b.plan.session.root.userId, b.plan.session.root]]);
    const { epoch, key } = await cp.createEpoch(plan.session.device, cp.newId(), [{ roster: plan.session.roster, admin: true }, { roster: b.plan.session.roster, admin: true }], roots);
    const event = cp.encryptHistory(b.plan.session.device, epoch, key, { text: 'Synthetic retained private history' });
    const vault = await cp.openBrowserVault(plan.session.root.userId);
    await vault.put('synthetic-message', 'one', { text: 'Synthetic retained private history' });
    if (JSON.stringify(event).includes('Synthetic retained private history')) throw new Error('History was not encrypted');
    await cp.closeBrowserVault(plan.session.root.userId);
    await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase('cp-e2ee-v2-' + plan.session.root.userId); r.onsuccess = resolve; r.onerror = () => reject(r.error); });
    return { account: { roster: plan.session.roster, roster_hash: cp.rosterHash(plan.session.roster), encrypted_backup: plan.backup, updated_at: new Date().toISOString() }, event, epoch, deviceId: plan.session.device.id };
  });
  await page.reload();
  const result = await page.evaluate(async retained => {
    const cp = RecoveryFixture, { account } = retained, userId = account.roster.identity.userId;
    if (await cp.openBrowserVault(userId)) throw new Error('The old local identity still exists');
    const passkey = account.encrypted_backup.passkey;
    const derived = await cp.unlockBrowserPasskeyRecovery(passkey, account.roster.identity);
    const plan = cp.prepareRecoveredDevice(userId, { ...account, encrypted_backup: passkey.backup }, derived, { pinnedRoot: account.roster.identity });
    const key = await cp.openEpochKey(retained.epoch, plan.recoveryIdentity);
    const message = cp.decryptHistory(retained.event, retained.epoch, key);
    await cp.activateVerifiedDevice(plan, async () => ({ revision: plan.session.roster.revision, rosterHash: cp.rosterHash(plan.session.roster) }), cp.persistVerifiedBrowserSession);
    const vault = await cp.openBrowserVault(userId);
    await vault.put('synthetic-message', 'restored', message);
    return { text: (await vault.get('synthetic-message', 'restored')).text, rootMatches: cp.fingerprint(plan.recoveryIdentity) === cp.fingerprint(account.roster.identity), newDevice: plan.session.device.id !== retained.deviceId };
  }, retained);
  assert.deepEqual(result, { text: 'Synthetic retained private history', rootMatches: true, newDevice: true });
  assert.equal(await page.locator('input,textarea').count(), 0);
});

for (const [name, bit] of [['user verification', 'isBadUV'], ['user presence', 'isBadUP']]) {
  test(`real passkey recovery rejects an assertion missing ${name}`, { timeout: 30000 }, async t => {
    const { page, cdp, authenticatorId } = await fixture(t), saved = await createPasskey(page);
    await cdp.send('WebAuthn.setResponseOverrideBits', { authenticatorId, [bit]: true });
    const rejected = await page.evaluate(async saved => {
      try { await RecoveryFixture.unlockBrowserPasskeyRecovery(saved.passkey, saved.root); return false; } catch { return true; }
    }, saved);
    assert.equal(rejected, true);
  });
}

test('a passkey without a synced backup flag is rejected before enrollment', { timeout: 30000 }, async t => {
  const { page } = await fixture(t, { defaultBackupState: false });
  await assert.rejects(createPasskey(page));
});

test('a provider without PRF cannot silently downgrade account encryption', { timeout: 30000 }, async t => {
  const { page } = await fixture(t, { hasPrf: false });
  await assert.rejects(createPasskey(page));
});

test('a modified encrypted passkey backup fails instead of replacing the account root', { timeout: 30000 }, async t => {
  const { page } = await fixture(t), saved = await createPasskey(page);
  const rejected = await page.evaluate(async saved => {
    saved.passkey.backup.ciphertext = '00' + saved.passkey.backup.ciphertext.slice(2);
    saved.passkey.signature = '00'.repeat(64);
    try { await RecoveryFixture.unlockBrowserPasskeyRecovery(saved.passkey, saved.root); return false; } catch { return true; }
  }, saved);
  assert.equal(rejected, true);
});

test('real IndexedDB reset preserves the other account and login storage and applies only once', { timeout: 30000 }, async t => {
  const { page } = await fixture(t);
  const result = await page.evaluate(async () => {
    const cp = RecoveryFixture, a = cp.prepareFirstDevice(cp.newId()), b = cp.prepareFirstDevice(cp.newId());
    await cp.persistVerifiedBrowserSession(a.plan.session, a.plan.recoveryIdentity);
    await cp.persistVerifiedBrowserSession(b.plan.session, b.plan.recoveryIdentity);
    const bob = await cp.openBrowserVault(b.plan.session.root.userId);
    await bob.put('synthetic-message', 'keep', { value: 'other-account' });
    localStorage.setItem('synthetic-auth-session', 'preserve-login');
    const policy = { generation: 1, resetAt: '2026-09-15T00:00:00.000Z', requirePasskey: true };
    const applied = await cp.applyBrowserRecoveryPolicy(a.plan.session.root.userId, policy);
    const again = await cp.applyBrowserRecoveryPolicy(a.plan.session.root.userId, policy);
    return { applied, again, empty: await cp.openBrowserVault(a.plan.session.root.userId) === null, other: (await bob.get('synthetic-message', 'keep')).value, login: localStorage.getItem('synthetic-auth-session') };
  });
  assert.deepEqual(result, { applied: true, again: false, empty: true, other: 'other-account', login: 'preserve-login' });
});

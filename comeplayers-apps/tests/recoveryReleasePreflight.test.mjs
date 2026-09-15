import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'cp-preflight-test-'));
  t.after(() => { assert.equal(dirname(temp), tmpdir()); rmSync(temp, { recursive: true, force: true }); });
  const mobile = join(temp, 'comeplayers-apps/apps/mobile');
  const script = join(temp, 'comeplayers-apps/scripts/recovery-release-preflight.mjs');
  const cli = join(temp, 'fixture-cli/bin/run');
  const observed = join(mobile, 'invocation.json');
  for (const path of [mobile, dirname(script), dirname(cli), join(temp, 'website/public/.well-known')]) mkdirSync(path, { recursive: true });
  for (const name of ['app.json', 'eas.json']) writeFileSync(join(mobile, name), readFileSync(new URL(`../apps/mobile/${name}`, import.meta.url)));
  writeFileSync(script, readFileSync(new URL('../scripts/recovery-release-preflight.mjs', import.meta.url)));
  writeFileSync(join(temp, 'website/public/.well-known/assetlinks.json'), readFileSync(new URL('../../website/public/.well-known/assetlinks.json', import.meta.url)));
  writeFileSync(join(temp, 'fixture-cli/package.json'), JSON.stringify({ name: 'eas-cli', version: '24.5.0' }));
  writeFileSync(cli, `const fs = require('node:fs'); fs.writeFileSync('invocation.json', JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify([{ id: 'fixture-build', status: 'FINISHED', appVersion: '0.13.0', secret: 'must-not-print' }]));`);
  const env = { ...process.env, COMEPLAYERS_EAS_CLI_PATH: cli };
  delete env.EXPO_TOKEN; delete env.GITHUB_ACTIONS; delete env.GITHUB_STEP_SUMMARY;
  return {
    cli, observed, env,
    editApp(change) { const app = JSON.parse(readFileSync(join(mobile, 'app.json'), 'utf8')); change(app.expo); writeFileSync(join(mobile, 'app.json'), JSON.stringify(app)); },
    run(mode = 'static') {
      const result = spawnSync(process.execPath, [script, mode], { env, encoding: 'utf8', timeout: 15000 });
      assert.ifError(result.error);
      return { ...result, report: JSON.parse(result.stdout) };
    },
  };
}

test('static checks cannot claim a signed, versioned replacement artifact', t => {
  const f = fixture(t), result = f.run(); assert.equal(result.status, 0);
  assert.equal(result.report.remoteSigningVerified, false);
  assert.equal(result.report.replacementArtifactVerified, false);
  assert.equal(result.report.remoteVersionVerified, false);
  assert.equal(existsSync(f.observed), false);
});
for (const runtime of ['', '0.12.0', '0.11.9', 'invalid', { policy: 'appVersion' }]) test(`unreviewable or old runtime ${JSON.stringify(runtime)} is blocked`, t => {
  const f = fixture(t); f.editApp(app => { app.android.runtimeVersion = runtime; });
  const result = f.run(); assert.equal(result.status, 1); assert.equal(result.report.code, 'OLD_NATIVE_RUNTIME');
});
test('a replacement Expo owner is blocked', t => {
  const f = fixture(t); f.editApp(app => { app.owner = 'replacement'; });
  assert.equal(f.run().report.code, 'PROJECT_MISMATCH');
});
test('an old source versionCode is blocked', t => {
  const f = fixture(t); f.editApp(app => { app.android.versionCode = 14; });
  assert.equal(f.run().report.code, 'INVALID_VERSION_CODE');
});
test('Actions access requires its secret before running any CLI', t => {
  const f = fixture(t), result = f.run('access');
  assert.equal(result.status, 2); assert.equal(result.report.code, 'EXPO_TOKEN_MISSING');
  assert.equal(existsSync(f.observed), false);
});
test('local access attempts the prepared CLI without requiring an Actions token', t => {
  const f = fixture(t), result = f.run('local-access'); assert.equal(result.status, 0);
  assert.equal(result.report.status, 'read-access-confirmed'); assert.equal(result.report.buildRequested, false);
  assert.deepEqual(JSON.parse(readFileSync(f.observed, 'utf8')), ['build:list', '--platform', 'android', '--limit', '5', '--json', '--non-interactive']);
  assert.ok(!result.stdout.includes('must-not-print'));
});
test('local mode cannot bypass the Actions secret prerequisite', t => {
  const f = fixture(t); f.env.GITHUB_ACTIONS = 'true';
  assert.equal(f.run('local-access').report.code, 'EXPO_TOKEN_MISSING');
  assert.equal(existsSync(f.observed), false);
});
test('access never downloads an unprepared CLI', t => {
  const f = fixture(t); delete f.env.COMEPLAYERS_EAS_CLI_PATH;
  assert.equal(f.run('local-access').report.code, 'EAS_CLI_NOT_PREPARED');
});
test('an unpinned CLI is blocked', t => {
  const f = fixture(t); writeFileSync(join(dirname(f.cli), '../package.json'), JSON.stringify({ name: 'eas-cli', version: '0.0.0' }));
  assert.equal(f.run('local-access').report.code, 'EAS_CLI_NOT_PREPARED');
});
test('CLI diagnostics never expose raw account output', t => {
  const f = fixture(t); writeFileSync(f.cli, `console.error('must-not-print'); process.exit(1);`);
  const result = f.run('local-access'); assert.equal(result.report.code, 'EAS_READ_ACCESS_FAILED');
  assert.ok(!`${result.stdout}${result.stderr}`.includes('must-not-print'));
});
test('a Windows profile failure is distinguished from an authentication result', t => {
  const f = fixture(t); writeFileSync(f.cli, `console.error('uv_os_get_passwd returned ENOMEM'); process.exit(1);`);
  assert.equal(f.run('local-access').report.code, 'EAS_CLI_HOST_FAILED');
});

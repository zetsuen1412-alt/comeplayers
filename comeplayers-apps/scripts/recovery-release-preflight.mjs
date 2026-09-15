import { readFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Read-only release preflight. Never creates a build, provisions credentials,
// publishes an update, touches Auth, changes channels, or resets E2EE data.
const mode = process.argv[2] ?? 'static';
if (!['static', 'access'].includes(mode)) throw new Error('Use static or access mode.');
const mobile = fileURLToPath(new URL('../apps/mobile/', import.meta.url));
const app = JSON.parse(readFileSync(new URL('../apps/mobile/app.json', import.meta.url), 'utf8')).expo;
const eas = JSON.parse(readFileSync(new URL('../apps/mobile/eas.json', import.meta.url), 'utf8'));
const associations = JSON.parse(readFileSync(new URL('../../website/public/.well-known/assetlinks.json', import.meta.url), 'utf8'));
const projectId = 'a663aa70-99b7-4c8f-93ea-5f8637baa2df';
const packageName = 'com.comeplayers.app';
const expectedCertificate = '0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2';
const runtime = app.android?.runtimeVersion;
function fail(code, message, status = 1) {
  const report = { status: 'blocked', code, message, buildRequested: false, productionChanged: false };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Android recovery release — blocked\n\n${message}\n\nNo build was requested and no production data was changed.\n`);
  process.exit(status);
}
if (app.android?.package !== packageName || app.extra?.eas?.projectId !== projectId || app.updates?.url !== `https://u.expo.dev/${projectId}`) fail('PROJECT_MISMATCH', 'Unexpected EAS project or Android package. Do not initialize or replace the existing project.');
if (typeof runtime !== 'string' || /^0\.12\./.test(runtime)) fail('OLD_NATIVE_RUNTIME', 'Recovery must not be published to the old 0.12 Android native runtime.');
const association = associations.find(entry => entry.target?.package_name === packageName && entry.relation?.includes('delegate_permission/common.get_login_creds'));
const certificates = association?.target?.sha256_cert_fingerprints ?? [];
if (!certificates.some(value => value.replaceAll(':', '').toLowerCase() === expectedCertificate)) fail('SIGNING_ASSOCIATION_MISMATCH', 'The passkey association does not contain the original Android release certificate.');
if (eas.build?.preview?.android?.buildType !== 'apk' || eas.build?.preview?.distribution !== 'internal') fail('PREVIEW_PROFILE_MISMATCH', 'Use an internal signed APK preview, not an automatic public release.');

const publicConfig = { projectId, packageName, version: app.version, versionCode: app.android.versionCode, runtime, originalCertificateSha256: expectedCertificate };
if (mode === 'static') {
  console.log(JSON.stringify({ status: 'configuration-checked', ...publicConfig, remoteSigningVerified: false, buildRequested: false, productionChanged: false }, null, 2));
} else {
  // GitHub-hosted jobs have no local Expo login. Check a single explicitly named
  // secret, never enumerate or print environment variables or credential files.
  if (!process.env.EXPO_TOKEN?.trim()) fail('EXPO_TOKEN_MISSING', 'EXPO_TOKEN is not available to this GitHub Actions job. Add it as an Actions secret, not in chat or source control. An existing Expo login on your own PC may still be used separately.', 2);
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['--yes', 'eas-cli@24.5.0', 'build:list', '--platform', 'android', '--limit', '5', '--json', '--non-interactive'], {
    cwd: mobile, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 180000,
    shell: process.platform === 'win32', env: { ...process.env, CI: '1' },
  });
  // Do not forward CLI output: it can contain account/environment information.
  if (result.error || result.status !== 0) fail('EAS_READ_ACCESS_FAILED', 'EAS could not list builds for this project with the configured token. Check token validity and ComePlayers project access. No signing credentials were created or changed.', 3);
  let builds;
  try { builds = JSON.parse(result.stdout); } catch { fail('INVALID_EAS_RESPONSE', 'EAS returned an unexpected build-list response. No build was requested.'); }
  if (!Array.isArray(builds)) fail('INVALID_EAS_RESPONSE', 'Expected an EAS build-list array.');
  const summary = builds.slice(0, 5).map(item => ({ id: typeof item.id === 'string' ? item.id : null, status: typeof item.status === 'string' ? item.status : null, appVersion: typeof item.appVersion === 'string' ? item.appVersion : null }));
  console.log(JSON.stringify({ status: 'read-access-confirmed', ...publicConfig, recentBuilds: summary, remoteSigningVerified: false, buildRequested: false, productionChanged: false }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Android recovery release preflight\n\nEAS project read access confirmed. Signing identity and the next APK still require verification. No build or publication was requested.\n');
}

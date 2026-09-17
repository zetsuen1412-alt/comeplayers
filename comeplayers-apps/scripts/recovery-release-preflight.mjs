import { readFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';

// Read-only release preflight. Never creates a build, provisions credentials,
// publishes an update, touches Auth, changes channels, or resets E2EE data.
const mode = process.argv[2] ?? 'static';
if (!['static', 'access', 'local-access'].includes(mode)) throw new Error('Use static, access, or local-access mode.');
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
if (app.owner !== 'comeplayers' || app.android?.package !== packageName || app.extra?.eas?.projectId !== projectId || app.updates?.url !== `https://u.expo.dev/${projectId}`) fail('PROJECT_MISMATCH', 'Unexpected EAS owner, project or Android package. Do not initialize or replace the existing project.');
if (typeof runtime !== 'string' || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(runtime) || (Number(runtime.split('.')[0]) === 0 && Number(runtime.split('.')[1]) < 13)) fail('OLD_NATIVE_RUNTIME', 'Recovery requires a reviewed Android native runtime at least 0.13.0; never publish it to runtime 0.12.');
if (!Number.isSafeInteger(app.android.versionCode) || app.android.versionCode < 15) fail('INVALID_VERSION_CODE', 'The source versionCode is invalid or older than the existing release. Verify the next unused remote version before building.');
const association = associations.find(entry => entry.target?.package_name === packageName && entry.relation?.includes('delegate_permission/common.get_login_creds'));
const certificates = association?.target?.sha256_cert_fingerprints ?? [];
if (!certificates.some(value => value.replaceAll(':', '').toLowerCase() === expectedCertificate)) fail('SIGNING_ASSOCIATION_MISMATCH', 'The passkey association does not contain the original Android release certificate.');
if (eas.build?.preview?.android?.buildType !== 'apk' || eas.build?.preview?.distribution !== 'internal') fail('PREVIEW_PROFILE_MISMATCH', 'Use an internal signed APK preview, not an automatic public release.');

const publicConfig = { projectId, packageName, version: app.version, versionCode: app.android.versionCode, runtime, originalCertificateSha256: expectedCertificate };
if (mode === 'static') {
  console.log(JSON.stringify({ status: 'configuration-checked', ...publicConfig, remoteSigningVerified: false, replacementArtifactVerified: false, remoteVersionVerified: false, buildRequested: false, productionChanged: false }, null, 2));
} else {
  // GitHub-hosted jobs have no local Expo login. Check a single explicitly named
  // secret, never enumerate or print environment variables or credential files.
  if ((mode === 'access' || process.env.GITHUB_ACTIONS === 'true') && !process.env.EXPO_TOKEN?.trim()) fail('EXPO_TOKEN_MISSING', 'EXPO_TOKEN is not available to this GitHub Actions job. Add it as an Actions secret, not in chat or source control. Use local-access separately to check an existing Expo login on your PC.', 2);
  // Install the pinned CLI separately, before providing any release secrets.
  // Direct Node execution also avoids a Windows command shell and npx downloads.
  const cli = process.env.COMEPLAYERS_EAS_CLI_PATH;
  let metadata;
  try { if (cli && isAbsolute(cli)) metadata = JSON.parse(readFileSync(resolve(dirname(cli), '../package.json'), 'utf8')); } catch { /* Report only a public diagnostic. */ }
  if (!cli || !metadata || metadata.name !== 'eas-cli' || metadata.version !== '24.5.0') fail('EAS_CLI_NOT_PREPARED', 'Install EAS CLI 24.5.0 without release secrets, then set COMEPLAYERS_EAS_CLI_PATH to its absolute bin/run path. This preflight does not install tools.', 2);
  const result = spawnSync(process.execPath, [cli, 'build:list', '--platform', 'android', '--limit', '5', '--json', '--non-interactive'], {
    cwd: mobile, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 180000,
    shell: false, env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
  });
  // Do not forward CLI output: it can contain account/environment information.
  if (/uv_os_get_passwd|ERR_SYSTEM_ERROR/.test(result.stderr ?? '')) fail('EAS_CLI_HOST_FAILED', 'EAS CLI could not read the local operating-system profile. Authentication was not verified. Use a functioning authorized host or the existing secure Actions preflight.', 3);
  if (result.error || result.status !== 0) fail('EAS_READ_ACCESS_FAILED', 'EAS could not list builds for this project. Check the existing local Expo session or configured token and ComePlayers project access. No signing credentials were created or changed.', 3);
  let builds;
  try { builds = JSON.parse(result.stdout); } catch { fail('INVALID_EAS_RESPONSE', 'EAS returned an unexpected build-list response. No build was requested.'); }
  if (!Array.isArray(builds)) fail('INVALID_EAS_RESPONSE', 'Expected an EAS build-list array.');
  const summary = builds.slice(0, 5).map(item => ({ id: typeof item.id === 'string' ? item.id : null, status: typeof item.status === 'string' ? item.status : null, appVersion: typeof item.appVersion === 'string' ? item.appVersion : null }));
  console.log(JSON.stringify({ status: 'read-access-confirmed', ...publicConfig, recentBuilds: summary, remoteSigningVerified: false, replacementArtifactVerified: false, remoteVersionVerified: false, buildRequested: false, productionChanged: false }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Android recovery release preflight\n\nEAS project read access confirmed. Signing identity and the next APK still require verification. No build or publication was requested.\n');
}

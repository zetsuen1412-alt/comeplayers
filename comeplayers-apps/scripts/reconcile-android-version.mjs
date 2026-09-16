import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectId = 'a663aa70-99b7-4c8f-93ea-5f8637baa2df';
const packageName = 'com.comeplayers.app';
const distributedVersion = 15;
const inspectedRemoteVersion = 3;

function version(value) {
  if (!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new Error('Invalid remote version.');
  }
  return Number(value);
}

// One-time reconciliation of the independently observed EAS counter and the
// already distributed APK. Never increment by guessing or lower a newer value.
export async function reconcileAndroidVersion(read, write) {
  const before = version(await read());
  if (before >= distributedVersion) return { before, after: before, changed: false };
  if (before !== inspectedRemoteVersion) throw new Error('Remote version changed; inspect it again.');
  if (version(await read()) !== before) throw new Error('Concurrent remote version change.');
  await write(distributedVersion);
  const after = version(await read());
  if (after < distributedVersion) throw new Error('Remote version update could not be verified.');
  return { before, after, changed: true };
}

async function main() {
  const mobile = fileURLToPath(new URL('../apps/mobile/', import.meta.url));
  const app = JSON.parse(readFileSync(resolve(mobile, 'app.json'), 'utf8')).expo;
  const eas = JSON.parse(readFileSync(resolve(mobile, 'eas.json'), 'utf8'));
  if (process.env.EAS_BUILD_PROJECT_ID !== projectId || app.owner !== 'comeplayers' ||
      app.extra?.eas?.projectId !== projectId || app.android?.package !== packageName ||
      app.android?.versionCode !== distributedVersion || eas.cli?.appVersionSource !== 'remote' ||
      !process.env.EXPO_TOKEN) throw new Error('Unexpected release environment.');
  const cli = '/tmp/comeplayers-release-tools/node_modules/eas-cli';
  const metadata = JSON.parse(readFileSync(resolve(cli, 'package.json'), 'utf8'));
  if (metadata.name !== 'eas-cli' || metadata.version !== '24.5.0') throw new Error('Unexpected EAS CLI.');
  const require = createRequire(resolve(cli, 'package.json'));
  const { createGraphqlClient } = require('./build/commandUtils/context/contextUtils/createGraphqlClient.js');
  const { AppVersionQuery } = require('./build/graphql/queries/AppVersionQuery.js');
  const { AppVersionMutation } = require('./build/graphql/mutations/AppVersionMutation.js');
  const { toAppPlatform } = require('./build/graphql/types/AppPlatform.js');
  const { getExpoApiBaseUrl } = require('./build/api.js');
  if (getExpoApiBaseUrl() !== 'https://api.expo.dev') throw new Error('Unexpected Expo API host.');
  // Use the same operations as the pinned CLI's build:version:get/set commands.
  // The worker's existing token stays on EAS and is never printed or exported.
  const client = () => createGraphqlClient({ accessToken: process.env.EXPO_TOKEN, sessionSecret: null });
  const writeClient = () => {
    const current = client();
    return { mutation: (query, variables) => current.mutation(query, variables, { noRetry: true }) };
  };
  const platform = toAppPlatform('android');
  const result = await reconcileAndroidVersion(
    async () => (await AppVersionQuery.latestVersionAsync(client(), projectId, platform, packageName))?.buildVersion,
    async value => AppVersionMutation.createAppVersionAsync(writeClient(), {
      appId: projectId, platform, applicationIdentifier: packageName,
      storeVersion: app.version, buildVersion: String(value), runtimeVersion: app.android.runtimeVersion,
    }),
  );
  for (const [key, value] of Object.entries(result)) {
    const output = spawnSync('set-output', [key, String(value)], { stdio: 'ignore' });
    if (output.error || output.status !== 0) throw new Error('Could not record the version result.');
  }
  console.log(JSON.stringify({ status: 'version-reconciled', projectId, packageName, ...result,
    buildRequested: false, signingChanged: false, productionDataChanged: false }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Version reconciliation failed. Re-read the remote counter before retrying. Raw account output is suppressed.');
    process.exitCode = 1;
  });
}

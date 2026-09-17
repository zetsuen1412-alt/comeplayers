const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test, after } = require("node:test");

const root = path.resolve(__dirname, "..");
const pluginDir = path.join(root, "apps/mobile/plugins");
const pluginSource = fs.readFileSync(path.join(pluginDir, "withAndroidReleaseSigning.js"), "utf8");
const guard = fs.readFileSync(path.join(pluginDir, "original-release-signing.gradle"), "utf8").trim();
const originalFingerprint = "0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2";
const expoTemplate = path.join(root, "node_modules/expo/template.tgz");
const template = execFileSync("tar", ["-xOf", expoTemplate, "package/android/app/build.gradle"], { encoding: "utf8" });
function applyPlugin(contents, language = "groovy") {
  const sandbox = {
    __dirname: pluginDir,
    module: { exports: {} },
    require: (name) => name === "expo/config-plugins"
      ? { withAppBuildGradle: (config, apply) => apply(config) }
      : require(name),
  };
  vm.runInNewContext(pluginSource, sandbox);
  return sandbox.module.exports({ modResults: { contents, language } }).modResults.contents;
}

test("guard follows the actual locked Expo template and retains debug configuration", () => {
  const output = applyPlugin(template);
  assert.ok(output.startsWith(template.trimEnd()));
  assert.ok(output.endsWith(guard + "\n"));
  assert.match(guard, /signingConfig signingConfigs\.release/);
  assert.doesNotMatch(guard, /signingConfigs\.debug/);
  const assetLinks = JSON.parse(fs.readFileSync(path.join(root, "../website/public/.well-known/assetlinks.json"), "utf8"));
  const android = assetLinks.find((entry) => entry.target.package_name === "com.comeplayers.app");
  assert.ok(android.target.sha256_cert_fingerprints.some((value) => value.replaceAll(":", "").toLowerCase() === originalFingerprint));
  assert.ok(guard.includes(`def expected = "${originalFingerprint}"`));
});
test("plugin is idempotent including an EAS script appended after prebuild", () => {
  const output = applyPlugin(template) + '\napply from: "./eas-build.gradle"\n';
  assert.equal(applyPlugin(output), output);
});
test("Windows line endings and changed template indentation still install the guard", () => {
  const output = applyPlugin(template.replaceAll("    ", "  ").replaceAll("\n", "\r\n"));
  assert.ok(output.endsWith(guard + "\n"));
});
test("unknown Gradle language fails instead of silently losing release protection", () => {
  assert.throws(() => applyPlugin(template, "kotlin"), /reviewed Groovy/);
});
test("outdated generated guard requires native regeneration", () => {
  assert.throws(() => applyPlugin(applyPlugin(template).replace(originalFingerprint, "bad")), /Regenerate/);
});

// These tests execute the real guard callback in Gradle/JVM using a small model
// of the final Android signing DSL. They are not an Android build or EAS proof.
// The only keystore fixture is Expo's already-public debug.keystore. No key is
// generated, and the production certificate constant is never configurable.
const wrapper = process.env.COMEPLAYERS_TEST_GRADLE;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "comeplayers-signing-test-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const runtimeGuard = guard.slice(guard.indexOf("gradle.taskGraph.whenReady"));
function runGradle(name, { task = "assembleRelease", signing = "null", setup = "", fixtureTrust = false, flags = [] } = {}) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "settings.gradle"), "rootProject.name = 'isolated-signing-guard'\n");
  fs.writeFileSync(path.join(dir, "debug.keystore"), execFileSync("tar", ["-xOf", expoTemplate, "package/android/app/debug.keystore"]));
  // A test-only expected fingerprint validates the success path with a public
  // fixture. The unchanged production guard must reject that same certificate.
  const trust = fixtureTrust ? `
def fixtureStore = java.security.KeyStore.getInstance(file('debug.keystore'), 'android'.toCharArray())
def fixtureFingerprint = java.security.MessageDigest.getInstance('SHA-256')
    .digest(fixtureStore.getCertificate('androiddebugkey').encoded).encodeHex().toString()
` : "";
  const callback = fixtureTrust
    ? runtimeGuard.replace(`def expected = "${originalFingerprint}"`, "def expected = fixtureFingerprint")
    : runtimeGuard;
  fs.writeFileSync(path.join(dir, "build.gradle"), `
ext.android = [buildTypes: [release: [signingConfig: ${signing}]]]
${trust}
${callback}
${setup}
tasks.register('assembleDebug') { doLast { println 'FIXTURE_TASK_RAN' } }
tasks.register('assembleRelease') { doLast { println 'FIXTURE_TASK_RAN' } }
tasks.register('bundleRelease') { doLast { println 'FIXTURE_TASK_RAN' } }
`);
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(EXPO_TOKEN|COMEPLAYERS_ANDROID_)/.test(key)) delete env[key];
  }
  const result = spawnSync("bash", [wrapper, "-p", dir, "--console=plain", "--no-configuration-cache", ...flags, task], {
    env, encoding: "utf8", timeout: 240000, maxBuffer: 2 * 1024 * 1024,
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}
const signing = "[name: 'release', storeFile: file('debug.keystore'), storePassword: 'android', keyAlias: 'androiddebugkey', keyPassword: 'android']";
const cases = [
  ["missing credentials", {}, /credentials are missing/],
  ["debug signing configuration", { signing: signing.replace("'release'", "'debug'") }, /credentials are missing/],
  ["different certificate", { signing }, /does not match/],
  ["missing keystore file", { signing: signing.replace("file('debug.keystore')", "file('absent.jks')") }, /credentials are missing/],
  ["incorrect keystore password", { signing: signing.replace("storePassword: 'android'", "storePassword: 'fixture-secret-never-log'") }, /could not be verified/],
  ["missing signing alias", { signing: signing.replace("'androiddebugkey'", "'absent'") }, /could not be verified/],
  ["missing key password", { signing: signing.replace("keyPassword: 'android'", "keyPassword: null") }, /credentials are missing/],
  ["release configuration cache", { signing, flags: ["--configuration-cache"] }, /requires --no-configuration-cache/],
];
for (const [name, options, expected] of cases) {
  test(`Gradle rejects ${name}`, { skip: !wrapper && "Set COMEPLAYERS_TEST_GRADLE to run JVM guard checks (required in CI)." }, () => {
    const result = runGradle(name.replaceAll(" ", "-"), options);
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.output, expected);
    assert.doesNotMatch(result.output, /FIXTURE_TASK_RAN|fixture-secret-never-log/);
  });
}
test("Gradle debug task remains available without release credentials", { skip: !wrapper }, () => {
  const result = runGradle("debug", { task: "assembleDebug" });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /FIXTURE_TASK_RAN/);
});
test("Gradle accepts the matching fixture certificate after late EAS-style credential injection", { skip: !wrapper }, () => {
  const result = runGradle("late-injection", {
    fixtureTrust: true,
    task: "bundleRelease",
    setup: `tasks.whenTaskAdded { android.buildTypes.release.signingConfig = ${signing} }`,
  });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /FIXTURE_TASK_RAN/);
});

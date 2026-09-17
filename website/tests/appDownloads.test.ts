import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getAppRelease } from "../lib/appReleases";

const root = path.resolve(__dirname, "..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Windows release manifest points at the signed 0.5.3 installer", () => {
  const release = getAppRelease("windows");
  assert.equal(release.available, true);
  assert.equal(release.version, "0.5.3");
  assert.equal(release.sizeBytes, 4_165_396);
  assert.match(release.fileName, /ComePlayers_0\.5\.3_x64-setup\.exe/);
  assert.match(release.downloadPath, /^\/api\/downloads\/windows\//);
});

test("Android release manifest points at the signed 0.14.0 build 20 APK", () => {
  const release = getAppRelease("android");
  assert.equal(release.available, true);
  assert.equal(release.version, "0.14.0 (20)");
  assert.equal(release.sizeBytes, 138_803_610);
  assert.equal(release.sha256, "E40AB1DA352F8A25D8BE74A2BAC05B7B5FA77C2E5CFFB610C71C4B1E21E4C396");
  assert.match(release.fileName, /ComePlayers_0\.14\.0_20_android\.apk/);
  assert.match(release.downloadPath, /^\/api\/downloads\/android\//);
});

test("download route validates object size and returns a short signed redirect", () => {
  const source = read("app/api/downloads/[platform]/[fileName]/route.ts");
  assert.match(source, /inspectR2Object\(release\.objectKey\)/);
  assert.match(source, /object\.contentLength !== release\.sizeBytes/);
  assert.match(source, /disposition: "attachment"/);
  assert.match(source, /expiresIn: 300/);
  assert.match(source, /status: 307/);
});

test("home download buttons start the official installers directly", () => {
  const source = read("app/HomeClient.tsx");
  assert.match(
    source,
    /\/api\/downloads\/windows\/ComePlayers_0\.5\.3_x64-setup\.exe/
  );
  assert.match(
    source,
    /\/api\/downloads\/android\/ComePlayers_0\.14\.0_20_android\.apk/
  );
  assert.match(source, /href=\{WINDOWS_URL\}[\s\S]*?download/);
  assert.match(source, /href=\{ANDROID_URL\}[\s\S]*?download/);
});

test("intermediate desktop and Android download pages are removed", () => {
  assert.equal(fs.existsSync(path.join(root, "app/downloads/desktop/page.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "app/downloads/android/page.tsx")), false);
});

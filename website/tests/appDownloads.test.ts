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

test("Android release manifest points at the signed 0.13.0 build 19 APK", () => {
  const release = getAppRelease("android");
  assert.equal(release.available, true);
  assert.equal(release.version, "0.13.0 (19)");
  assert.equal(release.sizeBytes, 138_750_410);
  assert.equal(release.sha256, "B9F1A31F63A51D0D95512C5668FD7A2492A9C85DD94FF5AF30208B3FA066FB9D");
  assert.match(release.fileName, /ComePlayers_0\.13\.0_19_android\.apk/);
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
    /\/api\/downloads\/android\/ComePlayers_0\.13\.0_19_android\.apk/
  );
  assert.match(source, /href=\{WINDOWS_URL\}[\s\S]*?download/);
  assert.match(source, /href=\{ANDROID_URL\}[\s\S]*?download/);
});

test("intermediate desktop and Android download pages are removed", () => {
  assert.equal(fs.existsSync(path.join(root, "app/downloads/desktop/page.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "app/downloads/android/page.tsx")), false);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const websiteRoot = process.cwd();
const appsRoot = path.resolve(websiteRoot, "..", "comeplayers-apps");

function readWebsite(relativePath: string) {
  return fs.readFileSync(path.join(websiteRoot, relativePath), "utf8");
}

function readApps(relativePath: string) {
  return fs.readFileSync(path.join(appsRoot, relativePath), "utf8");
}

test("website exposes a no-cache deployment version and reloads safe pages", () => {
  const route = readWebsite("app/api/app-version/route.ts");
  const refresher = readWebsite("app/components/DeploymentAutoRefresh.tsx");
  const layout = readWebsite("app/layout.tsx");

  assert.match(route, /VERCEL_DEPLOYMENT_ID/);
  assert.match(route, /no-store/);
  assert.match(refresher, /window\.location\.reload\(\)/);
  assert.match(refresher, /\/checkout/);
  assert.match(layout, /<DeploymentAutoRefresh\s*\/>/);
});

test("mobile configuration supports Android, iOS, and cross-platform OTA updates", () => {
  const appConfig = JSON.parse(readApps("apps/mobile/app.json"));
  const easConfig = JSON.parse(readApps("apps/mobile/eas.json"));
  const mobileSource = readApps("apps/mobile/App.tsx");
  const updateScript = readApps("scripts/publish-android-ota.ps1");

  assert.equal(appConfig.expo.android.package, "com.comeplayers.app");
  assert.equal(appConfig.expo.ios.bundleIdentifier, "com.comeplayers.app");
  assert.equal(easConfig.build.production.channel, "production");
  assert.match(mobileSource, /Platform\.OS === "ios"/);
  assert.doesNotMatch(mobileSource, /ALLOWED_APP_PATHS/);
  assert.match(updateScript, /@\("android", "ios"\)/);
  assert.doesNotMatch(updateScript, /--platform all/);
});

test("iPhone users can install the auto-updating ComePlayers PWA", () => {
  const manifest = readWebsite("app/manifest.ts");
  const layout = readWebsite("app/layout.tsx");
  const home = readWebsite("app/HomeClient.tsx");

  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /start_url: "\/?\?source=ios-pwa"/);
  assert.match(layout, /appleWebApp/);
  assert.match(home, /Add to Home Screen/);
  assert.match(home, /Install ComePlayers on iPhone/);
  assert.match(home, /Download ComePlayers APK for Android/);
  assert.match(home, /comeplayers-mobile-home-raw-v3\.png/);
  const menuIndex = home.indexOf('aria-label="Choose your destination"');
  const artworkIndex = home.indexOf("styles.mobileArtFocus");
  const downloadsIndex = home.indexOf('data-testid="mobile-app-downloads"');
  assert.ok(
    menuIndex < artworkIndex && artworkIndex < downloadsIndex,
    "mobile navigation must appear before the raw artwork focus and downloads must stay at the bottom"
  );
});

test("desktop shell opens the full website and retains the native updater", () => {
  const desktopSource = readApps("apps/desktop/src/App.tsx");
  const tauriConfig = JSON.parse(
    readApps("apps/desktop/src-tauri/tauri.conf.json")
  );

  assert.match(desktopSource, /createAppUrl/);
  assert.doesNotMatch(desktopSource, /\/messages/);
  assert.match(desktopSource, /plugin-updater/);
  assert.equal(tauriConfig.app.windows[0].minWidth, 360);
});

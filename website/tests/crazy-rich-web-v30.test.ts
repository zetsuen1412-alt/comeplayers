import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");
const page = read("app/games/crazy-rich-world-tour/page.tsx");
const shell = read("app/games/crazy-rich-world-tour/CrazyRichGameShell.tsx");
const launcher = read("public/games/crazy-rich-world-tour/client/PLAY-Crazy-Rich-World-Tour-Launcher.html");
const online = read("public/games/crazy-rich-world-tour/client/online-game.html");
const manifest = JSON.parse(read("public/crazy-rich-world-tour/manifest.webmanifest"));
const serviceWorker = read("public/games/crazy-rich-world-tour/sw.js");

test("Crazy Rich route uses the PWA-scoped browser runtime", () => {
  assert.match(shell, /\/games\/crazy-rich-world-tour\/client\/PLAY-Crazy-Rich-World-Tour-Launcher\.html/);
  assert.match(page, /manifest\.webmanifest/);
  assert.match(page, /install\.js/);
  assert.match(page, /CrazyRichGameShell/);
  assert.match(shell, /beforeinstallprompt/);
  assert.match(shell, /PASANG APP/);
  assert.match(launcher, /Web 30\.0 Anime World/);
  assert.match(launcher, /frame\.src='online-game\.html\?v=30'/);
  assert.match(launcher, /frame\.src='game\.html\?v=30'/);
});

test("online renderer accepts authoritative Starwheel values 0 through 6", () => {
  assert.match(online, /lr\.d1>=0&&lr\.d1<=6/);
  assert.match(online, /lr\.d2>=0&&lr\.d2<=6/);
  assert.match(online, /lr\.zero_roll===\(lr\.d1===0&&lr\.d2===0\)/);
  assert.match(online, /this\.dice\.result=\[d1\?\?0,d2\?\?0\]/);
  assert.match(online, /const faces=\['0','⚀','⚁','⚂','⚃','⚄','⚅'\]/);
  assert.match(online, /ZERO ROLL! Tetap di tempat!/);
});

test("roll identity uses roll_id and rolling preview is presentation-only", () => {
  assert.match(online, /if\(a\.roll_id&&b\.roll_id\)return a\.roll_id===b\.roll_id/);
  const start = online.indexOf("function beginDiceRoll()");
  const end = online.indexOf("function finishDiceRoll", start);
  assert.ok(start >= 0 && end > start);
  const preview = online.slice(start, end);
  assert.doesNotMatch(preview, /Math\.random/);
  assert.match(preview, /tick%faces\.length/);
  assert.match(online, /crwt_v18_roll/);
  assert.match(online, /crwt_v18_timeout_tick/);
});

test("PWA is installable for Android and desktop browsers", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "landscape");
  assert.equal(manifest.scope, "/games/crazy-rich-world-tour");
  assert.match(serviceWorker, /\/games\/crazy-rich-world-tour\/client\/online-game\.html/);
  assert.match(serviceWorker, /caches\.open\(CACHE\)/);
});

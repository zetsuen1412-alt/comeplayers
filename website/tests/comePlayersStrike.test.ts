import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const websiteRoot = resolve(import.meta.dirname, "..");

function source(path: string) {
  return readFileSync(resolve(websiteRoot, path), "utf8");
}

test("ComePlayers Strike exposes a public landing page and isolated playable route", () => {
  const landing = source("app/games/comeplayers-strike/page.tsx");
  const play = source("app/play/comeplayers-strike/page.tsx");

  assert.match(landing, /COMEPLAYERS/);
  assert.match(landing, /href="\/play\/comeplayers-strike"/);
  assert.match(play, /<ComePlayersStrike \/>/);
  assert.match(play, /index: false/);
});

test("ComePlayers Strike V04 ships five Three.js modes and Black Core systems", () => {
  const game = source("components/strike/StrikeGame.ts");
  const component = source("components/strike/ComePlayersStrike.tsx");
  const requiredAssets = [
    "strike-ui-home.png",
    "strike-ui-loadout.png",
    "strike-ui-lobby.png",
    "strike-ui-modes.png",
    "mode-bomb.png",
    "mode-ffa.png",
    "mode-tdm.png",
    "mode-zombie.png",
    "mode-adventure.png",
  ];

  assert.match(game, /import \* as THREE from "three"/);
  assert.match(game, /const MAX_BOTS = 22/);
  assert.match(game, /const SURVIVAL_WAVES = 8/);
  assert.match(game, /"bomb-defusal"/);
  assert.match(game, /"free-for-all"/);
  assert.match(game, /"zombie"/);
  assert.match(game, /"zombie-adventure"/);
  assert.match(game, /"walker" \| "runner" \| "crawler" \| "brute" \| "spitter" \| "screamer" \| "boss"/);
  assert.match(game, /private reviveTokens = 1/);
  assert.match(game, /private combo = 0/);
  assert.match(game, /private bossPhase = 0/);
  assert.match(game, /private explodeBarrel/);
  assert.match(game, /private async toggleFullscreen/);
  assert.match(game, /this\.container\.requestFullscreen/);
  assert.match(component, /TEAM DEATHMATCH/);
  assert.match(component, /BOMB DEFUSAL/);
  assert.match(component, /FREE FOR ALL/);
  assert.match(component, /ZOMBIE SURVIVAL/);
  assert.match(component, /ZOMBIE ADVENTURE/);
  assert.match(component, /Outbreak Colossus/);
  assert.match(component, /Seven objective-based chapters/);
  assert.match(component, /Three-phase boss battle/);
  assert.match(component, /OVERDRIVE/);
  assert.ok(existsSync(resolve(websiteRoot, "THIRD_PARTY_NOTICES_STRIKE.md")));
  assert.ok(existsSync(resolve(websiteRoot, "COMEPLAYERS_STRIKE_V04_BLACK_CORE_UPDATE.md")));

  for (const asset of requiredAssets) {
    const path = resolve(websiteRoot, "public/strike", asset);
    assert.ok(existsSync(path), `${asset} should exist`);
    assert.ok(statSync(path).size > 100_000, `${asset} should contain a full artwork asset`);
  }
});

test("ComePlayers Strike is discoverable without replacing the existing Arcade sitemap route", () => {
  const browse = source("app/games/BrowseGamesClient.tsx");
  const sitemap = source("app/sitemap.ts");

  assert.match(browse, /COMEPLAYERS STRIKE/);
  assert.match(browse, /\/play\/comeplayers-strike/);
  assert.match(sitemap, /absoluteUrl\("\/arcade"\)/);
  assert.match(sitemap, /absoluteUrl\("\/games\/comeplayers-strike"\)/);
});

test("ComePlayers Strike V04 does not claim unsupported online multiplayer", () => {
  const landing = source("app/games/comeplayers-strike/page.tsx");
  const component = source("components/strike/ComePlayersStrike.tsx");

  assert.match(landing, /Bot Prototype/);
  assert.match(component, /1 \+ 6 bots/);
  assert.doesNotMatch(`${landing}\n${component}`, /online multiplayer|5v5 online/i);
});

test("ComePlayers Strike is playable inside Messages and the desktop webview", () => {
  const arcade = source("components/arcade/ArcadeWindow.tsx");
  const embeddedGame = source(
    "components/arcade/ComePlayersStrikeArcadeGame.tsx",
  );
  const messages = source("app/messages/page.tsx");

  assert.match(arcade, /id: "comeplayers-strike"/);
  assert.match(arcade, /title: "ComePlayers Strike"/);
  assert.match(arcade, /component: ComePlayersStrikeArcadeGame/);
  assert.match(arcade, /activeGameId === "comeplayers-strike"/);
  assert.match(embeddedGame, /src="\/play\/comeplayers-strike\?embed=messages"/);
  assert.match(embeddedGame, /LOADING STRIKE BLACK CORE 0\.4/);
  assert.match(embeddedGame, /allowFullScreen/);
  assert.match(embeddedGame, /allow="autoplay; fullscreen; gamepad"/);
  assert.match(messages, /ARCADE_WINDOW_GAMES\.find/);
});

test("Messages Arcade keeps the complete six-game ComePlayers library", () => {
  const arcade = source("components/arcade/ArcadeWindow.tsx");
  for (const id of [
    "comeplayers-strike",
    "cp-frontline",
    "empires-allies",
    "comeplayers-snake",
    "comeplayers-monopoly",
    "comeplayers-chess",
  ]) {
    assert.match(arcade, new RegExp(`id: "${id}"`));
  }
});

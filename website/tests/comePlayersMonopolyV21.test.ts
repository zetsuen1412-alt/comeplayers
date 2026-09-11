import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const websiteRoot = resolve(import.meta.dirname, "..");

function source(path: string) {
  return readFileSync(resolve(websiteRoot, path), "utf8");
}

test("CP Monopoly V22 exposes its Marble World route and full board game", () => {
  const page = source("app/games/monopoly/page.tsx");
  const game = source("app/games/monopoly/ComePlayersMarbleGame.tsx");

  assert.match(page, /ComePlayersMarbleGame/);
  assert.match(page, /searchParams: Promise/);
  assert.match(page, /embedded=\{embed === "messages"\}/);
  assert.match(game, /const tiles: Tile\[\] = \[/);
  assert.match(game, /const MAX_ROUNDS = 12/);
  assert.match(game, /const initialPlayers: Player\[\] = \[/);
  assert.match(game, /const buildLevels = \[/);
  assert.match(game, /const \[showIntro, setShowIntro\]/);
  assert.match(game, /const \[turnSeconds, setTurnSeconds\]/);
  assert.match(game, /const animateMove = useCallback/);
  assert.match(game, /const ownsCompleteGroup = useCallback/);
  assert.match(game, /dialog\.type === "travel"/);
  assert.match(game, /Alexia/);
  assert.match(game, /name: "Nova"/);
  assert.match(game, /name: "Rex"/);
  assert.match(game, /name: "Miko"/);
  assert.match(game, /ROLL DICE/);

  for (const avatar of ["alexia", "nova", "rex", "miko"]) {
    const path = resolve(websiteRoot, `public/games/monopoly/${avatar}-avatar.png`);
    assert.ok(existsSync(path), `${avatar} avatar should exist`);
    assert.ok(statSync(path).size > 50_000, `${avatar} avatar should contain full artwork`);
  }
});

test("CP Monopoly V22 replaces the previous Monopoly inside Messages Arcade", () => {
  const arcade = source("components/arcade/ArcadeWindow.tsx");
  const embeddedGame = source(
    "components/arcade/ComePlayersMonopolyV21ArcadeGame.tsx",
  );

  assert.match(arcade, /component: ComePlayersMonopolyV21ArcadeGame/);
  assert.match(arcade, /activeGameId === "comeplayers-monopoly"/);
  assert.match(embeddedGame, /src="\/games\/monopoly\?embed=messages"/);
  assert.match(embeddedGame, /LOADING CP MONOPOLY V22/);
  assert.match(embeddedGame, /title="CP Monopoly V22"/);
  assert.match(embeddedGame, /allowFullScreen/);
  assert.match(embeddedGame, /allow="autoplay; fullscreen; gamepad"/);
});

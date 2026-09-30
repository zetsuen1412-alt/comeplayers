import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const websiteRoot = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(websiteRoot, file), "utf8");

test("community no longer mounts an arcade window, offers a game selector, or launches old game links", () => {
  const page = read("app/messages/page.tsx");
  assert.doesNotMatch(page, /ArcadeWindow|ARCADE_WINDOW_GAMES|showPlayMenu|arcadeWindowOpen|requestedArcadeGame/);
  // Chat, community rooms, contacts and calls must remain available.
  for (const component of ["SecureDirectConversation", "CommunityChannelSidebar", "FriendsWorkspace", "CommunityVoicePanel"]) assert.ok(page.includes(component), component);
  // Crazy Rich is a separate Unity project; do not invent a replacement web game.
  assert.doesNotMatch(page, /game=crazy-rich|src=["']\/games\/crazy-rich/);
});

test("removed embedded game engines, routes, and discovery entries are absent", () => {
  for (const file of [
    "components/arcade/ArcadeWindow.tsx", "components/arcade/ArcadeGameTypes.ts",
    "components/arcade/ComePlayersChessGame.tsx", "components/arcade/ComePlayersSnakeGame.tsx",
    "components/arcade/CPFrontlineGame.tsx", "components/arcade/cpFrontlineEngine.ts",
    "components/arcade/EmpiresAlliesGame.tsx", "components/arcade/ComePlayersStrikeArcadeGame.tsx",
    "components/arcade/ComePlayersMonopolyGame.tsx", "components/arcade/ComePlayersMonopolyV21ArcadeGame.tsx",
    "components/arcade/ComePlayersMatchGame.tsx", "components/messages/ComePlayersArcade.tsx",
    "components/messages/useAlexiaDashCharacterRedesign.ts",
    "components/strike/ComePlayersStrike.tsx", "components/strike/StrikeGame.ts",
    "components/strike/AlexiaFirstPersonLibrary.ts", "components/strike/EnemyModelLibrary.ts",
    "app/games/comeplayers-strike/page.tsx", "app/play/comeplayers-strike/page.tsx",
    "app/games/monopoly/page.tsx", "app/games/monopoly/ComePlayersMarbleGame.tsx",
    "app/games/comeplayers-match/page.tsx", "app/games/comeplayers-match/ComePlayersMatchPageClient.tsx",
  ]) assert.equal(existsSync(path.join(websiteRoot, file)), false, file);
  assert.doesNotMatch(read("app/sitemap.ts"), /["']\/(?:games|play)\/(?:comeplayers-strike|comeplayers-match|monopoly)["']/);
  for (const file of ["package.json", "package-lock.json"]) {
    const manifest = JSON.parse(read(file));
    const packages = manifest.packages ?? {};
    for (const dependency of ["pixi.js", "three", "@types/three"]) {
      for (const section of [manifest.dependencies, manifest.devDependencies, packages[""]?.dependencies, packages[""]?.devDependencies]) {
        assert.equal(section?.[dependency], undefined, `${file}: ${dependency}`);
      }
      assert.equal(packages[`node_modules/${dependency}`], undefined, `${file}: installed ${dependency}`);
    }
  }
});

test("marketplace routes and the shared Alexia assistant asset are preserved", () => {
  for (const file of ["app/games/page.tsx", "app/games/[slug]/page.tsx", "app/games/[slug]/offers/page.tsx", "app/admin/games/page.tsx", "public/arcade/monopoly/alexia-avatar.webp"]) {
    assert.equal(existsSync(path.join(websiteRoot, file)), true, file);
  }
});

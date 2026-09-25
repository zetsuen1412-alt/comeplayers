import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// @ts-expect-error Node's type-stripping test runner requires the explicit source extension.
import * as frontline from "../lib/cpFrontline.ts";

const {
  applyFrontlineBattleResult,
  createDefaultFrontlineProgress,
  frontlinePower,
  FRONTLINE_MISSIONS,
  sanitizeFrontlineProgress,
} = frontline;

const websiteRoot = resolve(process.cwd());

function source(path: string) {
  return readFileSync(resolve(websiteRoot, path), "utf8");
}

test("CP Frontline ships as an original full-frame Arcade game", () => {
  const arcade = source("components/arcade/ArcadeWindow.tsx");
  assert.match(arcade, /id: "cp-frontline"/);
  assert.match(arcade, /CP Frontline: World Dominion/);
  assert.match(arcade, /activeGameId === "cp-frontline"/);
  assert.ok(
    existsSync(resolve(websiteRoot, "components/arcade/CPFrontlineGame.tsx")),
  );
  assert.ok(
    existsSync(
      resolve(
        websiteRoot,
        "public/arcade/cp-frontline/frontline-key-art.png",
      ),
    ),
  );
});

test("Frontline content includes six missions, six units, tech and tactical abilities", () => {
  const component = source("components/arcade/CPFrontlineGame.tsx");
  const engine = source("components/arcade/cpFrontlineEngine.ts");
  assert.equal(FRONTLINE_MISSIONS.length, 6);
  assert.match(component, /Weapons Systems/);
  assert.match(component, /Composite Armor/);
  assert.match(component, /Friend attack targets/);
  assert.match(engine, /type FrontlineAbility = "airstrike" \| "repair" \| "overdrive"/);
  assert.match(engine, /drawStatic/);
  assert.match(engine, /spawnEnemyWave/);
  assert.match(engine, /Titan Siege Walker|kind === "titan"/);
});

test("Frontline progress is bounded and advances only the active campaign mission", () => {
  const progress = sanitizeFrontlineProgress({
    ...createDefaultFrontlineProgress(),
    campaignMission: 2,
    resources: { credits: -50, alloy: 80, intel: 20 },
  });
  assert.equal(progress.resources.credits, 0);
  assert.ok(frontlinePower(progress) >= 900);

  const replayResult = applyFrontlineBattleResult(
    progress,
    {
      result: "victory",
      score: 1200,
      stars: 3,
      kills: 10,
      unitsDeployed: 6,
      missionCode: FRONTLINE_MISSIONS[0].code,
      durationSeconds: 80,
    },
    FRONTLINE_MISSIONS[0].reward,
  );
  assert.equal(replayResult.campaignMission, 2);

  const activeResult = applyFrontlineBattleResult(
    progress,
    {
      result: "victory",
      score: 2400,
      stars: 2,
      kills: 18,
      unitsDeployed: 9,
      missionCode: FRONTLINE_MISSIONS[1].code,
      durationSeconds: 120,
    },
    FRONTLINE_MISSIONS[1].reward,
  );
  assert.equal(activeResult.campaignMission, 3);
  assert.ok(activeResult.unlockedUnits.includes("drone"));
});

test("Frontline online storage is server-managed with RLS and indexed battles", () => {
  const migrations = resolve(websiteRoot, "supabase/migrations");
  const migrationName = readdirSync(migrations)
    .find((name: string) => name.includes("arcade_cp_frontline_world_dominion"));
  assert.ok(migrationName);
  const migration = source(`supabase/migrations/${migrationName}`);
  assert.match(migration, /arcade_frontline_profiles enable row level security/i);
  assert.match(migration, /arcade_frontline_battles enable row level security/i);
  assert.match(migration, /revoke all on public\.arcade_frontline_profiles from public, anon, authenticated/i);
  assert.match(migration, /arcade_frontline_battles_attacker_v59_idx/i);
  assert.match(migration, /arcade_frontline_battles_defender_v59_idx/i);
  assert.match(migration, /unique \(\s*attacker_id,\s*client_event_id\s*\)/i);
});

test("friend attacks require accepted friendships and create bell notifications", () => {
  const route = source("app/api/games/cp-frontline/route.ts");
  const messages = source("app/messages/page.tsx");
  assert.match(route, /requireAuthenticatedUser\(request\)/);
  assert.match(route, /chat_friendships/);
  assert.match(route, /status", "accepted"/);
  assert.match(route, /type: "frontline_attack"/);
  assert.match(route, /Your CP Frontline base was attacked!/);
  assert.match(route, /link_url: `\/cpcommunity\?game=cp-frontline&battle=/);
  assert.match(messages, /ARCADE_WINDOW_GAMES\.find/);
  assert.match(messages, /game\.id === requestedGame/);
});

test("autosave works locally and synchronizes online when authenticated", () => {
  const component = source("components/arcade/CPFrontlineGame.tsx");
  const route = source("app/api/games/cp-frontline/route.ts");
  assert.match(component, /window\.localStorage\.setItem/);
  assert.match(component, /method: "PUT"/);
  assert.match(component, /Autosaving/);
  assert.match(route, /arcade_frontline_profiles/);
  assert.match(route, /onConflict: "user_id"/);
});

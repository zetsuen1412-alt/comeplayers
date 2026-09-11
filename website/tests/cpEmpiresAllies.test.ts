import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const websiteRoot = resolve(process.cwd());
const workspaceRoot = resolve(websiteRoot, "..");

function websiteFile(path: string) {
  return readFileSync(resolve(websiteRoot, path), "utf8");
}

function workspaceFile(path: string) {
  return readFileSync(resolve(workspaceRoot, path), "utf8");
}

test("CP Empires & Allies is the public arcade name", () => {
  const arcade = websiteFile("components/arcade/ArcadeWindow.tsx");
  const game = websiteFile("components/arcade/EmpiresAlliesGame.tsx");
  const playPage = workspaceFile(
    "game-services/empires-allies/templates/comeplayers_play.html",
  );

  assert.match(arcade, /title: "CP Empires & Allies"/);
  assert.match(game, /CP Empires &amp; Allies/);
  assert.match(playPage, /<title>CP Empires &amp; Allies<\/title>/);
  assert.match(playPage, /String\.fromCharCode\(122, 121, 110, 103, 97\)/);
});

test("removed arcade games are no longer shipped", () => {
  const arcade = websiteFile("components/arcade/ArcadeWindow.tsx");

  assert.doesNotMatch(arcade, /CP Strike: Neon Frontline/);
  assert.doesNotMatch(arcade, /CP Realms: Shardfall|comeplayers-realms/);
  assert.equal(
    existsSync(resolve(websiteRoot, "components/arcade/ComePlayersStrikeGame.tsx")),
    false,
  );
  assert.equal(
    existsSync(resolve(websiteRoot, "components/arcade/ComePlayersRealmsGame.tsx")),
    false,
  );
});

test("loader shows Alexia with animated downloading progress", () => {
  const playPage = workspaceFile(
    "game-services/empires-allies/templates/comeplayers_play.html",
  );
  const legacyServer = workspaceFile(
    "game-services/empires-allies/empires-server.py",
  );
  const onlineServer = workspaceFile(
    "game-services/empires-allies/comeplayers_server.py",
  );
  const alexia = resolve(
    workspaceRoot,
    "game-services/empires-allies/templates/img/alexia-command-loader.png",
  );

  assert.match(playPage, />Downloading</);
  assert.match(playPage, /id="progress-value">1%/);
  assert.match(playPage, /setProgress\(100,/);
  assert.match(playPage, /alexia-command-loader\.png/);
  assert.match(playPage, /allowScriptAccess: true/);
  assert.match(playPage, /is_staging=false/);
  assert.match(playPage, /cp:gateway-ready/);
  assert.match(legacyServer, /def browser_ready_flash_file/);
  assert.match(legacyServer, /def normalize_amf_object/);
  assert.match(legacyServer, /def detach_amf_references/);
  assert.match(onlineServer, /\/flashservices\/gateway\.php/);
  assert.equal(existsSync(alexia), true);
});

test("game stage and arcade shell fill the available viewport without cropping", () => {
  const arcade = websiteFile("components/arcade/ArcadeWindow.tsx");
  const game = websiteFile("components/arcade/EmpiresAlliesGame.tsx");
  const playPage = workspaceFile(
    "game-services/empires-allies/templates/comeplayers_play.html",
  );

  assert.match(arcade, /fullFrameGame \? "overflow-y-hidden"/);
  assert.match(arcade, /"h-full min-h-0 max-w-none p-0"/);
  assert.match(game, /flex h-full min-h-0 w-full flex-col/);
  assert.match(game, /\[&:fullscreen\]:h-\[100dvh\]/);
  assert.match(playPage, /width: min\(100vw,133\.333333vh\)/);
  assert.match(playPage, /height: min\(100vh,75vw\)/);
  assert.match(playPage, /#ruffle, ruffle-player \{ width: 100% !important; height: 100% !important/);
  assert.doesNotMatch(playPage, /stage\.style\.transform/);
});

test("online game mutations force autosave and friend attacks notify ComePlayers", () => {
  const onlineServer = workspaceFile(
    "game-services/empires-allies/comeplayers_server.py",
  );
  const dockerfile = workspaceFile(
    "game-services/empires-allies/Dockerfile",
  );
  const eventRoute = websiteFile(
    "app/api/games/empires-allies/events/route.ts",
  );
  const ticketRoute = websiteFile(
    "app/api/games/empires-allies/ticket/route.ts",
  );
  const game = websiteFile("components/arcade/EmpiresAlliesGame.tsx");
  const messagesPage = websiteFile("app/messages/page.tsx");

  assert.match(onlineServer, /session\["comeplayers_last_autosave_at"\]/);
  assert.match(onlineServer, /session\.modified = True/);
  assert.match(onlineServer, /X-ComePlayers-Autosave/);
  assert.match(onlineServer, /legacy\.occupation_place_response = comeplayers_occupation_place_response/);
  assert.match(onlineServer, /"event": "friend_attack"/);
  assert.match(dockerfile, /COMEPLAYERS_EVENT_WEBHOOK_URL=https:\/\/www\.comeplayers\.com\/api\/games\/empires-allies\/events/);

  assert.match(eventRoute, /timingSafeEqual/);
  assert.match(eventRoute, /\.eq\("status", "accepted"\)/);
  assert.match(eventRoute, /type: "game_attack"/);
  assert.match(eventRoute, /Your CP empire is under attack!/);
  assert.match(ticketRoute, /friendIds: friends\.map/);
  assert.match(game, /acceptedFriendKey === launchedFriendKey/);
  assert.match(game, /requestAnimationFrame\(\(\) => void requestLaunch\(\)\)/);
  assert.match(messagesPage, /ARCADE_WINDOW_GAMES\.find/);
  assert.match(messagesPage, /game\.id === requestedGame/);
  assert.match(websiteFile("components/arcade/ArcadeWindow.tsx"), /id: "empires-allies"/);
  assert.match(messagesPage, /setArcadeWindowOpen\(true\)/);
});

test("production launch requires shared PostgreSQL game storage", () => {
  const ticket = websiteFile(
    "app/api/games/empires-allies/ticket/route.ts",
  );
  const service = workspaceFile(
    "game-services/empires-allies/comeplayers_server.py",
  );

  assert.match(ticket, /payload\.onlineMode/);
  assert.match(ticket, /payload\.storage !== "postgresql"/);
  assert.match(service, /COMEPLAYERS_REQUIRE_ONLINE_STORAGE/);
  assert.match(service, /200 if payload\["ok"\] else 503/);
});

test("online social tables remain server-only", () => {
  const migration = websiteFile(
    "supabase/migrations/20260715223000_empires_allies_online_social_v58.sql",
  );

  assert.match(
    migration,
    /REVOKE ALL ON public\.empires_allies_presence FROM anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT ALL ON public\.empires_allies_invites TO service_role/,
  );
});

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

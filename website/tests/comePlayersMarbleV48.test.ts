import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const websiteRoot = resolve(import.meta.dirname, "..");
const source = (path: string) => readFileSync(resolve(websiteRoot, path), "utf8");

test("ComePlayers Marble V48 exposes ready checks and reconnect controls", () => {
  const game = source("components/arcade/ComePlayersMonopolyGame.tsx");

  assert.match(game, /ready_player_ids/);
  assert.match(game, /loadReconnectRoom/);
  assert.match(game, /toggleOnlineReady/);
  assert.match(game, /updateOnlineLobbySettings/);
  assert.match(game, /kickOnlinePlayer/);
  assert.match(game, /Online Lobby V48/);
  assert.match(game, /Every player must confirm Ready/);
  assert.match(game, /Reconnect/);
});

test("ComePlayers Marble V48 includes its Supabase lobby migration", () => {
  const migration = source("supabase/migrations/20260719143000_arcade_marble_v48_multiplayer_lobby.sql");

  assert.match(migration, /add column if not exists ready_player_ids/);
  assert.match(migration, /arcade_monopoly_set_ready/);
  assert.match(migration, /arcade_monopoly_update_lobby/);
  assert.match(migration, /arcade_monopoly_kick_player/);
  assert.match(migration, /Every joined player must confirm Ready/);
});

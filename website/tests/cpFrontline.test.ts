import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const websiteRoot = resolve(process.cwd());
function source(path: string) {
  return readFileSync(resolve(websiteRoot, path), "utf8");
}

// The retired game's persisted data keeps its original access restrictions.
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

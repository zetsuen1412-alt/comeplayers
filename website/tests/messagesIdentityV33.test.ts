import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("V33 lets authenticated members create groups and open squad listings", () => {
  const groups = read("app/api/messages/groups/route.ts");
  const matchmaking = read("app/api/messages/matchmaking/route.ts");

  assert.match(groups, /requireAuthenticatedUser/);
  assert.equal(groups.includes("requireAdminUser"), false);
  assert.match(groups, /member_role: "owner"/);
  assert.match(groups, /party_open: openParty/);
  assert.match(matchmaking, /cp_join_open_party_v33/);
  assert.match(matchmaking, /Only a party leader can update Squad Finder/);
});

test("V33 creator and leader hierarchy controls invite kick and leader assignment", () => {
  const members = read("app/api/messages/rooms/[id]/members/route.ts");
  const page = read("app/messages/page.tsx");

  assert.match(members, /group_owner/);
  assert.match(members, /group_moderator/);
  assert.match(members, /Only the group creator can appoint or remove leaders/);
  assert.match(members, /Only the group owner can remove another leader/);
  assert.match(page, /Appoint Leader/);
  assert.match(page, /Squad Finder/);
  assert.equal(page.includes("Admin community controls"), false);
});

test("V33 migration serializes party joins and keeps R2 attachment integrity checks", () => {
  const migration = read(
    "supabase/migrations/20260710190000_messages_identity_squad_leaders_v33.sql",
  );
  const attachment = read("app/api/messages/attachments/[id]/route.ts");

  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.cp_join_open_party_v33/);
  assert.match(migration, /ARRAY\['start_stream'\]/);
  assert.match(attachment, /inspectR2Object/);
  assert.match(attachment, /attachmentSignatureMatches/);
  assert.match(attachment, /supabase-legacy/);
});

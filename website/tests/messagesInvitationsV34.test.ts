import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("V34 stores direct and matchmaking invitations as pending until consent", () => {
  const members = read("app/api/messages/rooms/[id]/members/route.ts");
  const groups = read("app/api/messages/groups/route.ts");
  const matchmaking = read("app/api/messages/matchmaking/route.ts");

  assert.match(members, /chat_party_invitations/);
  assert.match(members, /status: "pending"/);
  assert.match(groups, /source: "group_create"/);
  assert.match(matchmaking, /action === "auto-invite"/);
  assert.match(matchmaking, /source: "matchmaking"/);
  assert.match(matchmaking, /randomInt/);
});

test("V34 accepts or declines invitations through one transactional RPC", () => {
  const invitations = read("app/api/messages/invitations/route.ts");
  const migration = read(
    "supabase/migrations/20260711183000_messages_invite_accept_matchmaking_v34.sql",
  );

  assert.match(invitations, /export async function GET/);
  assert.match(invitations, /export async function PATCH/);
  assert.match(invitations, /cp_respond_party_invite_v34/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /status = 'accepted'/);
  assert.match(migration, /status = 'declined'/);
  assert.match(migration, /ON CONFLICT \(room_id, user_id\)/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.cp_respond_party_invite_v34/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.cp_respond_party_invite_v34[\s\S]*service_role/,
  );
});

test("V34 messages UI exposes invitation consent and random squad matching", () => {
  const page = read("app/messages/page.tsx");

  assert.match(page, /respondToInvitation/);
  assert.match(page, /Accept/);
  assert.match(page, /Decline/);
  assert.match(page, /autoInviteRandomPlayers/);
  assert.match(page, /Invite 1 Random/);
  assert.match(page, /Fill Open Slots/);
});

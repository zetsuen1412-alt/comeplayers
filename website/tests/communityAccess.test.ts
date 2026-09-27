import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCommunityPermissionsGrantable, bootstrapCommunityForRoom, hasCommunityPermission, requireCommunityAccess, requireCommunityChannel } from "../lib/communityServer";

type Result = { data: unknown; error: { message: string } | null };
function database(overrides: Record<string, Partial<Result>> = {}, canSend: Result = { data: true, error: null }) {
  const tables: Record<string, Result> = {
    chat_communities: { data: { id: "community", room_id: "room", owner_id: "owner", status: "active" }, error: null },
    profiles: { data: { role: "user" }, error: null },
    chat_rooms: { data: { id: "room", room_type: "group", created_by: "owner" }, error: null },
    chat_room_members: { data: { member_role: "member", status: "active" }, error: null },
    chat_community_bans: { data: null, error: null },
    chat_community_member_roles: { data: [{ role_id: "member-role", chat_community_roles: { permissions: ["view_channels", "send_messages"] } }], error: null },
    chat_channels: { data: { id: "channel", community_id: "community", channel_type: "text", is_private: false, is_read_only: false }, error: null },
    chat_channel_permission_overrides: { data: [], error: null },
  };
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const db = {
    from(table: string) {
      const result = { ...tables[table], ...overrides[table] };
      const builder: unknown = new Proxy({}, { get(_target, method: string) {
        if (method === "then") return Promise.resolve(result).then.bind(Promise.resolve(result));
        return (...args: unknown[]) => { calls.push({ table, method, args }); return builder; };
      } });
      return builder;
    },
    rpc(name: string, args: unknown) { calls.push({ table: name, method: "rpc", args: [args] }); return Promise.resolve(canSend); },
  } as unknown as SupabaseClient;
  return { db, calls };
}
const input = (db: SupabaseClient) => ({ supabaseAdmin: db, userId: "member", roomId: "room", channelId: "channel" });

test("an explicitly empty role never regains legacy moderator or member permissions", async () => {
  const { db } = database({ chat_room_members: { data: { member_role: "moderator", status: "active" } }, chat_community_member_roles: { data: [{ role_id: "restricted", chat_community_roles: { permissions: [] } }] } });
  const access = await requireCommunityAccess(input(db));
  assert.equal(hasCommunityPermission(access, "send_messages"), false);
  assert.equal(hasCommunityPermission(access, "manage_roles"), false);
  assert.equal(hasCommunityPermission(access, "start_stream"), false);
});

test("missing role assignments do not restore revoked permissions", async () => {
  const { db } = database({ chat_community_member_roles: { data: [] } });
  await assert.rejects(requireCommunityAccess({ ...input(db), permission: "send_messages" }), { status: 403 });
});

test("unavailable ban and role tables fail closed", async () => {
  for (const table of ["chat_community_bans", "chat_community_member_roles", "chat_room_members"]) {
    const { db } = database({ [table]: { data: null, error: { message: "relation does not exist" } } });
    await assert.rejects(requireCommunityAccess(input(db)), /does not exist/);
  }
});

test("active bans and inactive memberships block channel access", async () => {
  const scenarios: Record<string, Partial<Result>>[] = [
    { chat_community_bans: { data: { user_id: "member", expires_at: null } } },
    { chat_room_members: { data: { status: "removed" } } },
  ];
  for (const overrides of scenarios) {
    const { db } = database(overrides);
    await assert.rejects(requireCommunityChannel(input(db)), { status: 403 });
  }
});

test("the database channel deny blocks API sending even when the role allows sending", async () => {
  const { db, calls } = database({}, { data: false, error: null });
  await assert.rejects(requireCommunityChannel({ ...input(db), send: true }), { status: 403 });
  assert.deepEqual(calls.find(call => call.method === "rpc")?.args, [{ p_channel_id: "channel", p_user_id: "member" }]);
});

test("an explicit database channel allow grants sending to an otherwise restricted role", async () => {
  const { db } = database({ chat_community_member_roles: { data: [] } });
  const result = await requireCommunityChannel({ ...input(db), send: true });
  assert.equal(result.channel.id, "channel");
});

test("permission lookup failures cannot grant sending", async () => {
  const { db } = database({}, { data: null, error: { message: "permission lookup unavailable" } });
  await assert.rejects(requireCommunityChannel({ ...input(db), send: true }), /permission lookup unavailable/);
});

test("private channel deny overrides a matching allow", async () => {
  const { db } = database({
    chat_channels: { data: { id: "channel", is_private: true, channel_type: "text" } },
    chat_channel_permission_overrides: { data: [
      { user_id: "member", allow_permissions: ["view_channel"], deny_permissions: [] },
      { role_id: "member-role", allow_permissions: [], deny_permissions: ["view_channel"] },
    ] },
  });
  await assert.rejects(requireCommunityChannel(input(db)), { status: 403 });
});

test("a delegated role manager cannot grant a permission they do not hold", async () => {
  const { db } = database({ chat_community_member_roles: { data: [{ role_id: "manager", chat_community_roles: { permissions: ["manage_roles", "send_messages"] } }] } });
  const access = await requireCommunityAccess(input(db));
  assert.throws(() => assertCommunityPermissionsGrantable(access, ["manage_members"]), { status: 403 });
  assert.doesNotThrow(() => assertCommunityPermissionsGrantable(access, ["send_messages"]));
  assert.doesNotThrow(() => assertCommunityPermissionsGrantable({ ...access, isOwner: true }, ["manage_members"]));
});

test("an outsider cannot bootstrap a community or write default roles", async () => {
  const { db, calls } = database({ chat_room_members: { data: null } });
  await assert.rejects(bootstrapCommunityForRoom({ supabaseAdmin: db, roomId: "room", actorId: "outsider" }), { status: 403 });
  assert.equal(calls.some(call => ["insert", "update", "upsert"].includes(call.method)), false);
});

test("joining an existing community assigns only the new member and preserves revoked roles", async () => {
  const { db, calls } = database({
    chat_room_members: { data: [{ user_id: "restricted", member_role: "member" }, { user_id: "new-member", member_role: "member" }] },
    chat_channel_categories: { data: ["INFORMATION", "TEXT CHANNELS", "VOICE CHANNELS"].map(name => ({ id: name, name })) },
    chat_channels: { data: ["announcements", "general", "marketplace", "Lounge"].map(name => ({ id: name, name, is_default: name === "general" })) },
    chat_community_roles: { data: ["Owner", "Admin", "Moderator", "Member"].map(name => ({ id: name, name })) },
  });
  await bootstrapCommunityForRoom({ supabaseAdmin: db, roomId: "room", newMemberId: "new-member" });
  const assignments = calls.find(call => call.table === "chat_community_member_roles" && call.method === "upsert")?.args[0] as Array<{ user_id: string }>;
  assert.deepEqual(assignments.map(row => row.user_id), ["new-member"]);
  assert.equal(calls.some(call => call.table === "chat_communities" && call.method === "upsert"), false);
});

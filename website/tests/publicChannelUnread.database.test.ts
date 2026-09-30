import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const actor = "aaaaaaaa-0000-4000-8000-000000000001";
const other = "aaaaaaaa-0000-4000-8000-000000000002";
const room = "bbbbbbbb-0000-4000-8000-000000000001";
const foreignRoom = "bbbbbbbb-0000-4000-8000-000000000002";
const community = "cccccccc-0000-4000-8000-000000000001";
const foreignCommunity = "cccccccc-0000-4000-8000-000000000002";
const channels = Array.from({length: 4}, (_, n) => `dddddddd-0000-4000-8000-00000000000${n + 1}`);
const migration = readFileSync("../supabase/migrations/20260930180309_public_channel_unread_aggregation.sql", "utf8");

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table chat_communities(id uuid primary key, room_id uuid not null);
    create table chat_channels(id uuid primary key, community_id uuid not null, is_private boolean);
    create table chat_room_members(room_id uuid, user_id uuid, status text, primary key(room_id,user_id));
    create table chat_channel_read_states(channel_id uuid, user_id uuid, last_read_at timestamptz, primary key(channel_id,user_id));
    create table chat_messages(id bigserial primary key, channel_id uuid, sender_id uuid, created_at timestamptz, deleted_at timestamptz);
    -- Same index already installed by discord_community_foundation_v27.
    create index chat_messages_channel_created_v27_idx on chat_messages(channel_id,created_at) where channel_id is not null;
    grant select on all tables in schema public to service_role;
  `);
  await db.query("insert into chat_communities values($1,$2),($3,$4)", [community, room, foreignCommunity, foreignRoom]);
  await db.query("insert into chat_channels values($1,$5,false),($2,$5,false),($3,$5,true),($4,$6,false)", [...channels, community, foreignCommunity]);
  await db.query("insert into chat_room_members values($1,$2,'active'),($3,$4,'active')", [room, actor, foreignRoom, other]);
  await db.query("insert into chat_channel_read_states values($1,$2,'2026-01-01'::timestamptz + interval '5000 seconds')", [channels[0], actor]);
  for (const channel of channels) await db.query("insert into chat_messages(channel_id,sender_id,created_at) select $1,$2,'2026-01-01'::timestamptz + n * interval '1 second' from generate_series(1,6001) n", [channel, other]);
  await db.query("insert into chat_messages(channel_id,sender_id,created_at,deleted_at) values($1,$2,'2026-02-01',null),($1,$3,'2026-02-01','2026-02-01')", [channels[0], actor, other]);
  await db.exec(migration);
  await db.exec("analyze");
});
after(async () => { await db.close(); });

test("SQL aggregation exceeds 5000 accurately and excludes read/self/deleted/private/nonmember messages", async () => {
  await db.exec("set role service_role");
  try {
    const result = await db.query<{counts: Array<{channel_id: string; unread_count: number}>}>("select public.cp_public_channel_unread_counts($1,$2::uuid[]) counts", [actor, channels]);
    assert.deepEqual(new Map(result.rows[0].counts.map(row => [row.channel_id, row.unread_count])), new Map([[channels[0], 1001], [channels[1], 6001]]));
  } finally { await db.exec("reset role"); }
});

test("client roles cannot call the aggregate and function does not bypass caller privileges", async () => {
  const result = await db.query<{allowed: boolean; definer: boolean}>("select has_function_privilege('authenticated','public.cp_public_channel_unread_counts(uuid,uuid[])','execute') or has_function_privilege('anon','public.cp_public_channel_unread_counts(uuid,uuid[])','execute') allowed, prosecdef definer from pg_proc where proname='cp_public_channel_unread_counts'");
  assert.deepEqual(result.rows, [{allowed: false, definer: false}]);
  await db.exec("set role authenticated");
  try { await assert.rejects(db.query("select public.cp_public_channel_unread_counts($1,$2::uuid[])", [actor, channels]), /permission denied/); }
  finally { await db.exec("reset role"); }
});

test("removing membership immediately removes counts without stale authorization cache", async () => {
  await db.query("update chat_room_members set status='removed' where user_id=$1", [actor]);
  try {
    const result = await db.query<{counts: unknown[]}>("select public.cp_public_channel_unread_counts($1,$2::uuid[]) counts", [actor, channels]);
    assert.deepEqual(result.rows[0].counts, []);
  } finally { await db.query("update chat_room_members set status='active' where user_id=$1", [actor]); }
});

test("existing channel/date index bounds the aggregate message scan to requested unread range", async () => {
  const sql = migration.split("$function$")[1].replaceAll("p_user_id", "$1::uuid").replaceAll("p_channel_ids", "$2::uuid[]");
  const result = await db.query<{"QUERY PLAN": Array<{Plan: Record<string, unknown>}>}>(`explain (analyze,format json) ${sql}`, [actor, [channels[0]]]);
  const nodes: Array<Record<string, unknown>> = [];
  const walk = (node: Record<string, unknown>) => { nodes.push(node); for (const child of (node.Plans || []) as Array<Record<string, unknown>>) walk(child); };
  walk(result.rows[0]["QUERY PLAN"][0].Plan);
  const scan = nodes.find(node => node["Relation Name"] === "chat_messages");
  assert.ok(scan, "plan includes message access");
  assert.notEqual(scan["Node Type"], "Seq Scan", "indexed channel/date range avoids a global history scan");
  const index = nodes.find(node => node["Index Name"] === "chat_messages_channel_created_v27_idx");
  assert.ok(index, JSON.stringify(nodes));
  assert.ok(String(index["Index Cond"]).includes("created_at"), JSON.stringify(nodes));
  assert.equal(scan["Actual Rows"], 1001);
});

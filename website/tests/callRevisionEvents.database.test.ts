import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const alice = "aaaaaaaa-0000-4000-8000-000000000001";
const bob = "aaaaaaaa-0000-4000-8000-000000000002";
const carol = "aaaaaaaa-0000-4000-8000-000000000003";
const room = "bbbbbbbb-0000-4000-8000-000000000001";
const call = "cccccccc-0000-4000-8000-000000000001";
const migration = readFileSync("../supabase/migrations/20260930182225_atomic_call_revision_events.sql", "utf8");

async function revision(userId: string) {
  const result = await db.query<{revision: number}>("select revision::int from cp_live_revisions where scope=$1", [`calls:${userId}`]);
  return result.rows[0]?.revision || 0;
}
async function insert(id = call, from = alice, to = bob) {
  await db.query("insert into cp_calls(id,room_id,caller_id,callee_id,media,status,created_at) values($1,$2,$3,$4,'audio','ringing',now())", [id,room,from,to]);
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth to anon,authenticated,service_role;
    create table profiles(id uuid primary key,role text);
    create table cp_payroll_access(user_id uuid,active boolean);
    create table chat_rooms(id uuid primary key,last_message_at timestamptz);
    create table cp_calls(id uuid primary key,room_id uuid,caller_id uuid,callee_id uuid,media text,status text,created_at timestamptz,scheduled_at timestamptz,answered_at timestamptz,ended_at timestamptz,encryption_envelope jsonb);
    alter table cp_calls enable row level security;
    grant all on cp_calls to service_role;
    create policy service_calls on cp_calls for all to service_role using(true) with check(true);
    create publication supabase_realtime;
  `);
  // Reproduce actual existing revision permissions/triggers, not a simplified RLS model.
  await db.exec(readFileSync("supabase/migrations/20260925041028_site_live_revisions.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260925044339_site_live_read_policy.sql", "utf8"));
  const priorRights=await db.query<{allowed:boolean}>("select has_schema_privilege('service_role','cp_live_private','usage') as allowed");
  assert.equal(priorRights.rows[0].allowed,false,"matches production before this migration");
  await db.exec(migration);
  await db.query("insert into chat_rooms values($1,now()+interval '1 day')", [room]);
  await db.query("insert into profiles values($1,'user'),($2,'user'),($3,'admin')", [alice,bob,carol]);
});
after(async () => { await db.close(); });

test("call insert atomically notifies both participants even when a newer message defeats the inbox marker", async () => {
  await insert();
  assert.equal(await revision(alice),1); assert.equal(await revision(bob),1); assert.equal(await revision(carol),0);
  const tables = await db.query<{tablename: string}>("select tablename from pg_publication_tables where pubname='supabase_realtime'");
  assert.deepEqual(tables.rows.map(row => row.tablename), ["cp_live_revisions"], "private calls never enter publication");
});

test("state changes and deletes notify, while no-op and private envelope updates do not", async () => {
  const prior = await revision(alice);
  await db.query("update cp_calls set status='accepted',answered_at=now() where id=$1", [call]);
  assert.equal(await revision(alice), prior+1); assert.equal(await revision(bob), prior+1);
  await db.query("update cp_calls set status='accepted',encryption_envelope='{}' where id=$1", [call]);
  assert.equal(await revision(alice), prior+1);
  await db.query("delete from cp_calls where id=$1", [call]);
  assert.equal(await revision(alice), prior+2); assert.equal(await revision(bob), prior+2);
});

test("rolled-back call transactions cannot leave phantom call revisions", async () => {
  const priorA=await revision(alice),priorB=await revision(bob);
  await db.exec("begin");
  try { await insert(); assert.equal(await revision(alice),priorA+1); }
  finally { await db.exec("rollback"); }
  assert.equal(await revision(alice),priorA); assert.equal(await revision(bob),priorB);
  assert.equal((await db.query("select id from cp_calls where id=$1",[call])).rows.length,0);
});

test("reassignment invalidates previous and new participants exactly once", async () => {
  await insert();
  const priorA=await revision(alice),priorB=await revision(bob),priorC=await revision(carol);
  await db.query("update cp_calls set callee_id=$1 where id=$2", [carol,call]);
  assert.equal(await revision(alice),priorA+1); assert.equal(await revision(bob),priorB+1); assert.equal(await revision(carol),priorC+1);
  await db.query("delete from cp_calls where id=$1",[call]);
});

test("authenticated readers only see their own call revision and cannot write revisions or read calls", async () => {
  for (const actor of [alice,carol]) {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
    try {
      const rows=await db.query<{scope:string}>("select scope from cp_live_revisions where scope like 'calls:%'");
      assert.deepEqual(rows.rows,[{scope:`calls:${actor}`}]);
      await assert.rejects(db.query("update cp_live_revisions set revision=100 where scope=$1",[`calls:${actor}`]),/permission denied/);
      await assert.rejects(db.query("select * from cp_calls"),/permission denied/);
    } finally { await db.exec("reset role"); }
  }
  await db.exec("set role anon");
  try { assert.equal((await db.query("select scope from cp_live_revisions where scope like 'calls:%'")).rows.length,0); }
  finally { await db.exec("reset role"); }
});

test("trigger stored OID remains safe even without service schema USAGE", async () => {
  const prior=await revision(alice);
  await db.exec("begin; revoke usage on schema cp_live_private from service_role");
  try {
    const rights=await db.query<{allowed:boolean}>("select has_schema_privilege('service_role','cp_live_private','usage') as allowed");
    assert.equal(rights.rows[0].allowed,false);
    await db.exec("set local role service_role");
    await insert("cccccccc-0000-4000-8000-000000000009");
    await db.exec("reset role");
    assert.equal(await revision(alice),prior+1);
  } finally { await db.exec("reset role; rollback"); }
  assert.equal(await revision(alice),prior);
});

test("explicit server schema USAGE keeps function EXECUTE denied and carries only metadata", async () => {
  const serviceRights=await db.query<{schema_usage:boolean;function_execute:boolean;table_write:boolean}>("select has_schema_privilege('service_role','cp_live_private','usage') as schema_usage,has_function_privilege('service_role','cp_live_private.notify_call_change()','execute') as function_execute,has_table_privilege('service_role','public.cp_live_revisions','insert,update') as table_write");
  assert.deepEqual(serviceRights.rows,[{schema_usage:true,function_execute:false,table_write:true}], "narrow schema USAGE grants no function execution or new table access");
  await db.exec("set role service_role");
  try { await insert(); }
  finally { await db.exec("reset role"); }
  const columns=await db.query<{column_name:string}>("select column_name from information_schema.columns where table_schema='public' and table_name='cp_live_revisions' order by ordinal_position");
  assert.deepEqual(columns.rows.map(row=>row.column_name),["scope","revision","changed_at"]);
  const access=await db.query<{definer:boolean;allowed:boolean}>("select prosecdef as definer,has_function_privilege('authenticated',oid,'execute') or has_function_privilege('anon',oid,'execute') as allowed from pg_proc where proname='notify_call_change'");
  assert.deepEqual(access.rows,[{definer:false,allowed:false}]);
});

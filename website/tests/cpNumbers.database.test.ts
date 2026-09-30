import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const first = "aaaaaaaa-0000-4000-8000-000000000001";
const second = "aaaaaaaa-0000-4000-8000-000000000002";
const migration=fs.readFileSync("../supabase/migrations/20260930020736_permanent_cp_account_numbers.sql","utf8");
const reservationMigration=fs.readFileSync("../supabase/migrations/20260930021543_reserve_admin_cp_numbers.sql","utf8");
const reservedNumbers = Array.from({ length: 10 }, (_, digit) => `008${String(digit).repeat(10)}`);
async function cp(id:string) {
 const result=await db.query<{cp_number:string}>("select cp_number from profiles where id=$1",[id]);
 return result.rows[0]?.cp_number;
}
before(async()=>{
 db=new PGlite();
 await db.exec([
 "create role anon; create role authenticated; create role service_role;",
 "create schema auth; create schema cp_private; create schema extensions;",
 // PGlite fixture only. Production uses pgcrypto's gen_random_bytes.
 "create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as 'select substring(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()) from 1 for n)';",
 "create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';",
 "create table auth.users(id uuid primary key);",
 "create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,username text);",
 "create function public.new_profile() returns trigger language plpgsql security definer set search_path='' as 'begin insert into public.profiles(id,username) values(new.id,''new_user''); return new; end';",
 "create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.new_profile();",
 "alter table profiles enable row level security; grant usage on schema auth,cp_private to authenticated; grant select,insert,update on profiles to authenticated;",
 "create policy own_profile on profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());"
 ].join("\n"));
 await db.query("insert into auth.users values($1),($2)",[first,second]);
 await db.exec(migration);
 await db.exec(reservationMigration);
});
after(async()=>{await db.close();});
test("backfill assigns existing accounts unique thirteen-digit CP numbers",async()=>{
 const a=await cp(first),b=await cp(second);
 assert.match(a,/^008[0-9]{10}$/); assert.match(b,/^008[0-9]{10}$/); assert.notEqual(a,b);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from cp_private.account_numbers")).rows[0].n,2);
});
test("future signup returns the permanent CP number on its profile",async()=>{
 const id="aaaaaaaa-0000-4000-8000-000000000003";
 await db.query("insert into auth.users values($1)",[id]);
 assert.match(await cp(id),/^008[0-9]{10}$/);
 assert.equal((await db.query<{cp_number:string}>("select cp_private.cp_number_for_user($1) cp_number",[id])).rows[0].cp_number,await cp(id));
});
test("cannot change, clear or swap identity; ordinary profile updates still work",async()=>{
 const value=await cp(first);
 await assert.rejects(db.query("update profiles set cp_number='0080000000000' where id=$1",[first]),/permanent/);
 await assert.rejects(db.query("update profiles set cp_number=null where id=$1",[first]),/permanent/);
 await assert.rejects(db.query("update profiles set id=gen_random_uuid() where id=$1",[first]),/identity cannot/);
 await db.query("update profiles set username='edited' where id=$1",[first]); assert.equal(await cp(first),value);
});
test("profile deletion, recreation and upsert preserve number and reject spoofing",async()=>{
 const value=await cp(first);
 await db.query("delete from profiles where id=$1",[first]);
 await assert.rejects(db.query("insert into profiles(id,cp_number) values($1,$2)",[first,await cp(second)]),/automatically/);
 await db.query("insert into profiles(id,username) values($1,'restored')",[first]);
 assert.equal(await cp(first),value);
 await db.query("insert into profiles(id,username) values($1,'edited') on conflict(id) do update set username=excluded.username",[first]);
 assert.equal(await cp(first),value);
});
test("reservations survive account deletion and ledger rejects mutation",async()=>{
 const id="aaaaaaaa-0000-4000-8000-000000000003",value=await cp(id);
 await db.query("delete from auth.users where id=$1",[id]);
 assert.equal((await db.query<{cp_number:string}>("select cp_number from cp_private.account_numbers where user_id=$1",[id])).rows[0].cp_number,value);
 await assert.rejects(db.query("delete from cp_private.account_numbers where user_id=$1",[id]),/permanent/);
 await assert.rejects(db.query("update cp_private.account_numbers set cp_number='0080000000000' where user_id=$1",[id]),/permanent/);
});
test("client roles cannot use allocator/ledger; own-profile RLS is preserved",async()=>{
 const access=await db.query<{allowed:boolean}>("select has_function_privilege('authenticated','cp_private.cp_number_for_user(uuid)','execute') or has_function_privilege('anon','cp_private.assign_profile_cp_number()','execute') or has_table_privilege('service_role','cp_private.account_numbers','select') as allowed");
 assert.equal(access.rows[0].allowed,false);
 await db.exec("set role authenticated");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[first]);
 try {
  assert.equal((await db.query("select * from profiles")).rows.length,1);
  await assert.rejects(db.query("select * from cp_private.account_numbers"),/permission denied/);
  await assert.rejects(db.query("select cp_private.cp_number_for_user($1)",[first]),/permission denied/);
  await assert.rejects(db.query("update profiles set cp_number='0080000000000' where id=$1",[first]),/permanent/);
 } finally {await db.exec("reset role");}
});
test("collisions retry instead of assigning a duplicate",async()=>{
 const taken=await cp(second);
 await db.exec("begin");
 try {
  await db.exec("create sequence cp_collision; create or replace function cp_private.random_cp_number() returns text language sql volatile set search_path='' as 'select case when nextval(''public.cp_collision'') <= 2 then ''"+taken+"'' else ''0089876543210'' end'");
  const id="aaaaaaaa-0000-4000-8000-000000000004";
  await db.query("insert into auth.users values($1)",[id]);
  assert.equal(await cp(id),"0089876543210");
  assert.equal((await db.query<{n:number}>("select last_value::int n from cp_collision")).rows[0].n,3);
 } finally {await db.exec("rollback");}
});
test("sampling preserves leading zeroes and skips biased bytes250 through255",async()=>{
 await db.exec("begin");
 try {
  await db.exec("create or replace function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as 'select decode(''fa00010203040506070809fafbfcfdfeff'',''hex'')'");
  assert.equal((await db.query<{cp_number:string}>("select cp_private.random_cp_number() cp_number")).rows[0].cp_number,"0080123456789");
 } finally {await db.exec("rollback");}
});

test("ten repeated-suffix numbers are reserved and none is assigned to an account", async () => {
 const reserved = await db.query<{cp_number:string}>("select cp_number from cp_private.reserved_cp_numbers order by cp_number");
 assert.deepEqual(reserved.rows.map(row => row.cp_number), reservedNumbers);
 const assigned = await db.query("select a.cp_number from cp_private.account_numbers a join cp_private.reserved_cp_numbers r using(cp_number)");
 assert.equal(assigned.rows.length, 0);
});

for (const reservedNumber of reservedNumbers) {
 test(`allocator skips reserved ${reservedNumber} and retries before signup completes`, async () => {
  await db.exec("begin");
  try {
   await db.exec("create sequence cp_reserved_candidate; create or replace function cp_private.random_cp_number() returns text language sql volatile set search_path='' as 'select case when nextval(''public.cp_reserved_candidate'') = 1 then ''" + reservedNumber + "'' else ''0089876543210'' end'");
   const id="aaaaaaaa-0000-4000-8000-000000000005";
   await db.query("insert into auth.users values($1)", [id]);
   assert.equal(await cp(id), "0089876543210");
   assert.equal((await db.query<{n:number}>("select last_value::int n from cp_reserved_candidate")).rows[0].n, 2);
   assert.equal((await db.query("select user_id from cp_private.account_numbers where cp_number=$1", [reservedNumber])).rows.length, 0);
  } finally { await db.exec("rollback"); }
 });
}

test("admin reservations reject edits and deletion; all client roles lack access", async () => {
 await assert.rejects(db.exec("update cp_private.reserved_cp_numbers set cp_number='0089876543210' where cp_number='0080000000000'"), /permanent|reserved|cannot/i);
 await assert.rejects(db.exec("delete from cp_private.reserved_cp_numbers where cp_number='0080000000000'"), /permanent|reserved|cannot/i);
 for (const role of ["anon", "authenticated", "service_role"]) {
  const access = await db.query<{allowed:boolean}>("select has_table_privilege($1,'cp_private.reserved_cp_numbers','select,insert,update,delete,truncate') as allowed", [role]);
  assert.equal(access.rows[0].allowed, false, role);
 }
 await db.exec("set role authenticated");
 try { await assert.rejects(db.exec("select * from cp_private.reserved_cp_numbers"), /permission denied/); }
 finally { await db.exec("reset role"); }
 // If table SELECT is accidentally granted later, deny-all RLS still prevents discovery.
 await db.exec("begin; grant select on cp_private.reserved_cp_numbers to authenticated; set local role authenticated");
 try { assert.equal((await db.query("select * from cp_private.reserved_cp_numbers")).rows.length, 0); }
 finally { await db.exec("rollback"); }
});


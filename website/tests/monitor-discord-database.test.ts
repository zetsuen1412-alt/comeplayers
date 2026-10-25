import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
test("Discord buyer alert migration adds only isolated RLS metadata tables",async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create table profiles(id uuid primary key,role text);
    create table cp_fh3_telegram_manual_orders(order_ref text primary key);
    create table cp_payroll_workspace(id integer primary key,payload jsonb not null);
    insert into cp_payroll_workspace values(1,'{"salaries":[{"amount":999}],"closing":[{"id":"old"}]}');
    insert into profiles values('e120c2e4-99bb-42b0-9d08-a8e71ebef76a','admin');
    insert into cp_fh3_telegram_manual_orders values('X4759');
  `);
  const original=(await db.query<{payload:unknown}>("select payload from cp_payroll_workspace where id=1")).rows[0].payload;
  await db.exec(readFileSync(new URL("../supabase/migrations/20261025160001_fh3_discord_buyer_alerts.sql",import.meta.url),"utf8"));
  const owner="e120c2e4-99bb-42b0-9d08-a8e71ebef76a";
  await db.query("insert into cp_fh3_discord_order_bindings(order_ref,guild_id,channel_id,buyer_user_id,updated_by) values('X4759','1451111111111111111','1452222222222222222','1453333333333333333',$1)",[owner]);
  await db.query("insert into cp_fh3_discord_alert_events(message_id,order_ref,guild_id,channel_id) values('1461111111111111111','X4759','1451111111111111111','1452222222222222222')");
  await assert.rejects(db.query("insert into cp_fh3_discord_alert_events(message_id,order_ref,guild_id,channel_id) values('1461111111111111111','X4759','1451111111111111111','1452222222222222222')"),/duplicate key/);
  const privileges=await db.query<{role:string;canRead:boolean;canWrite:boolean}>(`
    select role,has_table_privilege(role,'public.cp_fh3_discord_alert_events','SELECT') canRead,
      has_table_privilege(role,'public.cp_fh3_discord_alert_events','INSERT') canWrite
    from (values('anon'),('authenticated'),('service_role')) x(role)`);
  assert.deepEqual(privileges.rows.map(x=>[x.role,x.canRead,x.canWrite]),[
   ["anon",false,false],["authenticated",false,false],["service_role",true,true]]);
  const current=(await db.query<{payload:unknown}>("select payload from cp_payroll_workspace where id=1")).rows[0].payload;
  assert.deepEqual(current,original,"Payroll salaries and Closing unchanged");
 }finally{await db.close();}
});

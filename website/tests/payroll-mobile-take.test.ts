import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const files = [
  "20260926030000_payroll_telegram_operations.sql",
  "20260926030001_payroll_telegram_durable_workflow.sql",
  "20260926030002_payroll_telegram_leader_dispatch.sql",
  "20260926035622_payroll_telegram_item_workflow.sql",
  "20260926041704_payroll_telegram_strict_division_routing.sql",
  "20261006060224_payroll_website_archive_telegram_guard.sql",
  "20261018090000_payroll_telegram_buyer_snapshot.sql",
  "20261019220000_cp_boost_monitor_mobile_assignment.sql",
  "20261019220001_cp_boost_monitor_direct_fh3_routing.sql",
  "20261019220002_cp_boost_monitor_mobile_telegram_proof.sql",
  "20261020140000_fh3_take_before_photo_start.sql",
];
const actor = "e120c2e4-99bb-42b0-9d08-a8e71ebef76a";
test("TAKE must be sent before START and captions come from Payroll roster", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(`create table public.cp_payroll_workspace(
      id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now());
      insert into cp_payroll_workspace(id,payload) values(1,'{}'::jsonb);`);
    for (const file of files) {
      try {
        await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
      } catch (error) {
        throw new Error("Migration failed: " + file + ": " + String(error), { cause: error });
      }
    }
    const payload = {
      "cp-ofs-demo-user-orders-v3": [{
        id: "manual:X4671",externalReference: "X4671",team:"FH3",
        orderType:"boosting",operationalStatus:"assignment_pending",quantity:1,
        workerAssignments:[],financeStatus:"pending",game:"AION",
      }],
      "cp-ofs-demo-employees-v2": [{
        id:"id1",code:"F001",name:"Mulyana",team:"FH3",workforceStatus:"SHIFT",
      }],
      "cp-ofs-demo-closing-v1": [],
    };
    await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1",
      [JSON.stringify(payload)]);
    await db.exec("insert into cp_payroll_telegram_divisions(division,chat_id,chat_title) values('FH3',-123456,'EVO Ilham FH3')");
    await db.query("select cp_mobile_assign_fh3('X4671','F001',$1::uuid)",[actor]);
    await assert.rejects(db.query(
      "select cp_mobile_proof_begin('X4671','F001','start',$1::uuid)",[actor]), /TAKE/i);
    const take = (await db.query<{event:{eventId:string;caption:string;alreadySent:boolean}}>(
      "select cp_mobile_take_begin('X4671','F001',$1::uuid) event",[actor])).rows[0].event;
    assert.equal(take.caption,"x4671/mulyana/take");
    assert.equal(take.alreadySent,false);
    await assert.rejects(db.query(
      "select cp_mobile_proof_begin('X4671','F001','start',$1::uuid)",[actor]), /TAKE/i);
    await db.query("select cp_mobile_take_finish($1::uuid,$2::uuid,501)",[take.eventId,actor]);
    const repeat = (await db.query<{event:{alreadySent:boolean}}>(
      "select cp_mobile_take_begin('X4671','F001',$1::uuid) event",[actor])).rows[0].event;
    assert.equal(repeat.alreadySent,true,"repeat MUST NOT send another message");
    const start = (await db.query<{event:{caption:string;replyToMessageId:number;eventId:string}}>(
      "select cp_mobile_proof_begin('X4671','F001','start',$1::uuid) event",[actor])).rows[0].event;
    assert.equal(start.caption,"x4671/mulyana/start");
    assert.equal(Number(start.replyToMessageId),501,"START replies to TAKE message");
    await db.query("select cp_mobile_proof_finish($1::uuid,$2::uuid,502,'photo1')",[start.eventId,actor]);
    const done = (await db.query<{event:{caption:string;replyToMessageId:number}}>(
      "select cp_mobile_proof_begin('X4671','F001','done',$1::uuid) event",[actor])).rows[0].event;
    assert.equal(done.caption,"x4671/mulyana/done");
    assert.equal(Number(done.replyToMessageId),502,"DONE replies to START");
  } finally { await db.close(); }
});

test("TAKE migration locks ambiguous delivery and does not enable Telegram new-order cards", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261020140000_fh3_take_before_photo_start.sql",import.meta.url),"utf8");
  assert.match(sql,/status in \('sending','sent','failed','unknown'\)/);
  assert.match(sql,/unique/);
  assert.match(sql,/Kirim TAKE ke Telegram terlebih dahulu sebelum START/);
  assert.doesNotMatch(sql,/insert into public\.cp_payroll_telegram_outbox/i);
});

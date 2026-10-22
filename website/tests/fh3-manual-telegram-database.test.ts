import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrations = [
  "20260926030000_payroll_telegram_operations.sql", "20260926030001_payroll_telegram_durable_workflow.sql",
  "20260926030002_payroll_telegram_leader_dispatch.sql", "20260926035622_payroll_telegram_item_workflow.sql",
  "20260926041704_payroll_telegram_strict_division_routing.sql", "20261006060224_payroll_website_archive_telegram_guard.sql",
  "20261018090000_payroll_telegram_buyer_snapshot.sql", "20261019220000_cp_boost_monitor_mobile_assignment.sql",
  "20261019220001_cp_boost_monitor_direct_fh3_routing.sql", "20261019220002_cp_boost_monitor_mobile_telegram_proof.sql",
  "20261020140000_fh3_take_before_photo_start.sql", "20261022002214_fh3_monitor_source_guards.sql",
  "20261022070000_fh3_manual_telegram_intake.sql",
];
const actor = "e120c2e4-99bb-42b0-9d08-a8e71ebef76a";

test("FH3 receipts, cancellation and transaction guards preserve Payroll and reject stale/foreign sources", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.cp_payroll_workspace(id int primary key,payload jsonb,revision bigint default 0,
        updated_at timestamptz default now()); insert into cp_payroll_workspace values(1,'{}',0,now());`);
    // Match Linux CI while payroll-mobile-take.test.ts also covers native CRLF.
    for (const file of migrations) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8").replace(/\r\n/g,"\n"));
    await db.exec("insert into cp_payroll_telegram_divisions(division,chat_id,chat_title) values ('FH3',-100123,'EVO Ilham FH3')");
    const payload = {
      "cp-ofs-demo-user-orders-v3": ["X4519","X4759"].map(externalReference => ({
        id: `manual:${externalReference}`,externalReference,team:"FH3",orderType:"boosting",
        operationalStatus:"assignment_pending",quantity:1,workerAssignments:[],financeStatus:"pending",
      })),
      "cp-ofs-demo-employees-v2": [{id:"e1",code:"F001",name:"Mulyana",team:"FH3",workforceStatus:"SHIFT"}],
      "cp-ofs-demo-closing-v1": [{id:"closing",salaryMinor:120000}],
    };
    await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1", [JSON.stringify(payload)]);
    const snapshot = async () => (await db.query("select payload,revision from cp_payroll_workspace")).rows;
    const before = await snapshot();
    const save = async (ref: string | null, message: number, update: number, task: string, active = true, chat = -100123, sender = 22, username = "evogamings") =>
      (await db.query<{saved:boolean}>(`select public.cp_fh3_telegram_save_manual(
        $1,$2::bigint,$3::bigint,$7::bigint,'aion2','Triniel','8hours',$4,
        '2026-10-21T04:00:00Z'::timestamptz,'2026-10-21T04:00:00Z'::timestamptz + $5::int*interval '1 second',
        $5::bigint,$6::boolean,$8::text) saved`, [ref,chat,message,task,update,active,sender,username])).rows[0].saved;
    const assign = (ref: string) => db.query("select cp_mobile_assign_fh3($1,'F001',$2::uuid)", [ref,actor]);

    await assert.rejects(save("X4519",42,9,"Impersonated display name",true,-100123,23,"another_admin"), /belum terverifikasi/);
    assert.equal(await save("X4519",42,10,"First task"),true);
    assert.equal(Number((await db.query<{fh3_order_sender_id:number}>(
      "select fh3_order_sender_id from cp_payroll_telegram_divisions where division='FH3'")).rows[0].fh3_order_sender_id),22);
    await assert.rejects(save("X4759",50,11,"Other admin",true,-100123,23,"evogamings"), /bukan akun Adm EVO Gaming/);
    assert.equal(await save("X4519",42,12,"Edited task"),true);
    assert.equal(await save("X4519",42,11,"Stale edit"),false);
    assert.equal(await save("X4519",41,13,"Stale message"),false);
    assert.equal(await save("X4519",42,12,"Duplicate"),false);
    await db.exec("set role service_role");
    assert.equal(await save("X4519",42,14,"Service role writes receipt"),true);
    await db.exec("reset role");
    assert.deepEqual(await snapshot(), before, "intake must not create or change Payroll/Closing/staff");
    await assert.rejects(save("X4759",50,14,"Wrong group",true,-100999), /bukan dari grup FH3/);
    await assert.rejects(assign("X4759"), /pesan admin aktif/);
    assert.deepEqual(await snapshot(),before);

    assert.equal(await save(null,42,15,"",false),true,"removing TASK hides the old receipt");
    await assert.rejects(assign("X4519"), /pesan admin aktif/);
    assert.equal(await save("X4519",42,16,"Restored task"),true);
    assert.equal(await save("X4520",42,17,"Corrected reference"),true);
    await assert.rejects(assign("X4519"), /pesan admin aktif/);
    await assert.rejects(assign("X4520"), /Order tidak ditemukan/);
    assert.deepEqual(await snapshot(),before,"Telegram-only receipt never creates a Payroll sale");
    assert.equal(await save("X4519",43,18,"Repost"),true);
    assert.equal(await save("X4519",44,19,"",false),true,"admin cancellation tombstone");
    assert.equal(await save("X4519",43,20,"Delayed edit"),false);
    assert.equal(await save("X4519",45,21,"New approved repost"),true);
    const duplicate = structuredClone(payload);
    duplicate["cp-ofs-demo-user-orders-v3"].push({...duplicate["cp-ofs-demo-user-orders-v3"][0],id:"duplicate"});
    await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1",[JSON.stringify(duplicate)]);
    await assert.rejects(assign("X4519"), /Payroll ambigu/);
    await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1",[JSON.stringify(payload)]);
    await assign("X4519");
    assert.equal(await save("X4519",46,22,"",false),true);
    await assert.rejects(db.query("select cp_mobile_take_begin('X4519','F001',$1::uuid)",[actor]), /pesan admin aktif/);
    await assert.rejects(db.query("select cp_mobile_proof_begin('X4519','F001','start',$1::uuid)",[actor]), /pesan admin aktif/);
    const after = (await db.query<{payload: typeof payload}>("select payload from cp_payroll_workspace")).rows[0].payload;
    assert.deepEqual(after["cp-ofs-demo-closing-v1"],payload["cp-ofs-demo-closing-v1"]);
    assert.deepEqual(after["cp-ofs-demo-employees-v2"],payload["cp-ofs-demo-employees-v2"]);
    assert.deepEqual(after["cp-ofs-demo-user-orders-v3"][1],payload["cp-ofs-demo-user-orders-v3"][1]);

    await db.exec("update cp_payroll_telegram_divisions set chat_id=-100999 where division='FH3'");
    assert.equal(await save("X4519",5,23,"New bound group",true,-100999),true);
    const take=(await db.query<{event:{eventId:string}}>(
      "select cp_mobile_take_begin('X4519','F001',$1::uuid) event",[actor])).rows[0].event;
    await db.query("select cp_mobile_take_finish($1::uuid,$2::uuid,501)",[take.eventId,actor]);
    const start=(await db.query<{event:{eventId:string;replyToMessageId:number}}>(
      "select cp_mobile_proof_begin('X4519','F001','start',$1::uuid) event",[actor])).rows[0].event;
    assert.equal(Number(start.replyToMessageId),501,"Linux LF START replies to TAKE too");
    await db.query("select cp_mobile_proof_finish($1::uuid,$2::uuid,502,'fixture-photo')",[start.eventId,actor]);
    const done=(await db.query<{event:{replyToMessageId:number}}>(
      "select cp_mobile_proof_begin('X4519','F001','done',$1::uuid) event",[actor])).rows[0].event;
    assert.equal(Number(done.replyToMessageId),502,"Linux LF DONE replies to START");
    for (const role of ["anon","authenticated"]) {
      assert.equal((await db.query<{allowed:boolean}>(
        "select has_table_privilege($1,'public.cp_fh3_telegram_manual_orders','SELECT') allowed",[role])).rows[0].allowed,false);
    }
    assert.equal((await db.query<{allowed:boolean}>(`select has_function_privilege('service_role',
      'public.cp_mobile_assign_fh3_payroll_source(text,text,uuid)','EXECUTE') allowed`)).rows[0].allowed,false);
  } finally { await db.close(); }
});

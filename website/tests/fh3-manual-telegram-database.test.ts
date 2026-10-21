import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("manual FH3 Telegram receipt migration is private, group-scoped and idempotent", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(`create table public.cp_payroll_telegram_divisions(
      division text primary key, chat_id bigint not null, active boolean not null
    );
    insert into public.cp_payroll_telegram_divisions values ('FH3',-100123,true);
    `);
    const sql = readFileSync(new URL(
      "../supabase/migrations/20261022070000_fh3_manual_telegram_intake.sql", import.meta.url), "utf8");
    await db.exec(sql);

    const save = async (ref: string, chatId: number, messageId: number, task: string) =>
      (await db.query<{ saved: boolean }>(`select public.cp_fh3_telegram_save_manual(
        $1::text,$2::bigint,$3::bigint,22::bigint,'aion2','Triniel','8hours',$4::text,
        '2026-10-21T04:00:00Z'::timestamptz) as saved`,
        [ref, chatId, messageId, task])).rows[0].saved;

    assert.equal(await save("X4519", -100123, 42, "First task"), true);
    assert.equal(await save("X4519", -100123, 42, "Edited task"), true);
    assert.equal(await save("X4519", -100123, 41, "Stale task"), false);
    const stored = await db.query<{ task: string }>(
      "select task from public.cp_fh3_telegram_manual_orders where order_ref='X4519'");
    assert.equal(stored.rows[0].task, "Edited task");
    await assert.rejects(save("X4759", -100999, 50, "Wrong group"), /bukan dari grup FH3/i);
    const acl = await db.query<{ allowed: boolean }>(
      "select has_table_privilege('anon','public.cp_fh3_telegram_manual_orders','SELECT') allowed");
    assert.equal(acl.rows[0].allowed, false);
  } finally {
    await db.close();
  }
});

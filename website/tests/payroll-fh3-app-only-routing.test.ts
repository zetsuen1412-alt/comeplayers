import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL(
  "../supabase/migrations/20261020110000_fh3_app_only_no_telegram_new_orders.sql",
  import.meta.url), "utf8");

test("FH3 order notification guard covers all order types", () => {
  assert.match(sql, /'boosting','item','gold'/);
  assert.match(sql, /cp_telegram_prepare_order/);
  assert.match(sql, /cp_telegram_block_fh3_new_order_dispatch/);
  assert.match(sql, /new\.event_key like 'dispatch:%'/);
  assert.match(sql, /o\.division='FH3'/);
});

test("other division routing and screenshot proof routines are retained", () => {
  assert.match(sql, /o\.state in \('waiting','assigned'\)/);
  assert.match(sql, /b\.status in \('pending','uncertain'\)/);
  assert.doesNotMatch(sql, /drop\s+function/i);
  assert.doesNotMatch(sql, /cp_mobile_proof_(begin|finish|mark)/);
});

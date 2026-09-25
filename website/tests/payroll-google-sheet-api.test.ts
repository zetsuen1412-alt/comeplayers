import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sync from "../features/payroll/lib/google-sheet-sync";
import * as workspace from "../features/payroll/lib/workspace-model";
import { timingSafeEqual } from "node:crypto";
import type { Order } from "../features/payroll/types/domain";

const source = readFileSync(new URL("../app/api/integrations/payroll-sheet/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const secret = "a".repeat(30);
const payload: sync.GoogleSheetSyncPayload = {
  version: 1, syncMode: "incremental", spreadsheetId: "test", sheetName: "MUTASI FH",
  headers: ["TANGGAL", "KODE"], sentAt: "2026-09-25T00:00:00Z", actor: { email: "admin@example.com" },
  rows: [{ rowNumber: 3, values: ["25/09/2026 00:24", "CODE-1", "G2G", "Buyer", "ORDER", "", "2", "", "RO", "F2F", 20, 1000, 20000] }],
};

function harness(conflict?: "manual" | "verified" | "locked" | "always") {
  let state: workspace.WorkspaceState = { [workspace.workspaceKeys.orders]: [] };
  let revision = 1;
  let saves = 0;
  let reads = 0;
  let audits = 0;
  const client = {
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, ilike: () => query,
        maybeSingle: async () => ({ data: { id: "admin", role: "admin", email: "admin@example.com" } }),
        single: async () => { assert.equal(table, "cp_payroll_workspace"); reads++; return { data: { payload: structuredClone(state), revision } }; },
      };
      return query;
    },
    rpc: async (name: string, args: { p_revision: number; p_payload: workspace.WorkspaceState; p_action: string }) => {
      saves++;
      assert.equal(name, "cp_save_payroll_workspace");
      assert.equal(args.p_action, "save"); // Never Closing/payment.
      assert.equal(args.p_revision, revision);
      if (conflict && (saves === 1 || conflict === "always")) {
        state = sync.mergeGoogleSheetPayroll(state, payload).state;
        const order = (state[workspace.workspaceKeys.orders] as Order[])[0];
        if (conflict === "manual") { order.id = "manual"; order.orderName = "Manually saved"; }
        if (conflict === "verified") { order.operationalStatus = "verified"; order.verifiedAt = "2026-09-25T01:00:00Z"; }
        if (conflict === "locked") order.sheetSyncLocked = true;
        if (conflict === "always") order.buyerName = `Concurrent edit ${saves}`;
        revision++;
        return { error: { code: "40001", message: "Revision changed" } };
      }
      state = args.p_payload;
      return { data: { revision: ++revision } };
    },
  };
  const exports: { POST?: (request: Request) => Promise<Response> } = {};
  runInNewContext(compiled, { exports, Buffer, Response, Request, process: { env: { PAYROLL_SHEETS_SYNC_SECRET: secret } },
    require: (name: string) => {
      if (name === "node:crypto") return { timingSafeEqual };
      if (name.endsWith("adminSecurity")) return { recordAdminAudit: async () => { audits++; } };
      if (name.endsWith("serverSupabase")) return { createSupabaseAdmin: () => client };
      if (name.endsWith("google-sheet-sync")) return sync;
      if (name.endsWith("workspace-model")) return workspace;
      if (name.endsWith("payrollTelegram")) return { dispatchAddedSheetOrders: async () => ({ sent: 0 }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    post: (body: unknown = payload, auth = secret) => exports.POST!(new Request("https://example.com/api/integrations/payroll-sheet", {
      method: "POST", headers: { authorization: `Bearer ${auth}` }, body: JSON.stringify(body),
    })),
    get saves() { return saves; }, get reads() { return reads; }, get audits() { return audits; },
  };
}

test("API returns mode, all six counters and per-row acknowledgements on save and no-op", async () => {
  const h = harness();
  const first = await (await h.post()).json();
  assert.equal(first.syncMode, "incremental");
  assert.equal(first.added, 1);
  for (const key of ["updated", "unchanged", "skippedProtected", "skippedConflicts", "skippedInvalid"]) assert.equal(first[key], 0);
  assert.deepEqual(first.rowResults, [{ rowNumber: 3, status: "added" }]);
  const second = await (await h.post({ ...payload, syncMode: "reconcile" })).json();
  assert.equal(second.syncMode, "reconcile");
  assert.equal(second.unchanged, 1);
  assert.equal(second.saved, false);
  assert.equal(h.saves, 1);
  assert.equal(h.audits, 1);
});

test("API rereads after a concurrent save and protects newly manual/verified orders", async () => {
  for (const conflict of ["manual", "verified", "locked"] as const) {
    const h = harness(conflict);
    const response = await h.post();
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result[conflict === "manual" ? "skippedConflicts" : "skippedProtected"], 1);
    assert.equal(h.reads, 2);
    assert.equal(h.saves, 1);
    assert.equal(h.audits, 0);
  }
});

test("API persists an archive-only reconciliation and restores without duplicating or Closing", async () => {
  const h = harness(); await h.post();
  const result = await (await h.post({ ...payload, syncMode: "reconcile", rows: [], presence: { complete: true, startRow: 3, references: [] } })).json();
  assert.equal(result.archived, 1); assert.equal(result.saved, true); assert.equal(h.saves, 2);
  const restored = await (await h.post()).json();
  assert.equal(restored.restored, 1); assert.equal(restored.added, 0); assert.equal(h.saves, 3);
});

test("API rejects invalid syncMode and unauthenticated calls before reading payroll", async () => {
  const h = harness();
  assert.equal((await h.post({ ...payload, syncMode: "delete" })).status, 400);
  assert.equal((await h.post(payload, "wrong")).status, 401);
  assert.equal(h.reads, 0);
});

test("API returns 409 after three concurrent revision conflicts without Closing or audit", async () => {
  const h = harness("always");
  assert.equal((await h.post()).status, 409);
  assert.equal(h.reads, 3);
  assert.equal(h.saves, 3);
  assert.equal(h.audits, 0);
});

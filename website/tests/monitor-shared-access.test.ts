import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { requireOwnEmployee } from "../lib/monitorAccess";
import { monitorBody, monitorError, monitorReply } from "../lib/monitorHttp";

function load(path: string, mocks: Record<string, unknown>) {
 const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
 runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText, { exports, Request, Response, URL, Buffer, require: (name: string) => { assert.ok(name in mocks, name); return mocks[name]; } });
 return exports;
}

test("shared Monitor sessions coexist while admin/personal sessions retain website rules and MFA", async () => {
 let scope = "shared", active = true, claims = 0, websiteChecks = 0, identityChecks = 0, validIdentity = true, authSessionActive = true;
 const roster = [
  { id: "e1", code: "F001", team: "FH3", workforceStatus: "FULL" },
  { id: "e2", code: "F002", team: "FH3", workforceStatus: "SHIFT" },
  { id: "other", code: "F003", team: "FH1", workforceStatus: "FULL" },
  { id: "resigned", code: "F004", team: "FH3", workforceStatus: "RESIGN" },
  { id: "dup", code: "F005", team: "FH3", workforceStatus: "FULL" },
  { id: "dup", code: "F006", team: "FH3", workforceStatus: "FULL" },
 ];
 const api = load("lib/monitorAccess.ts", {
  "@/lib/serverSupabase": {
   requireAccountIdentity: async () => { identityChecks++; if (!validIdentity) throw new Error("MFA_REQUIRED"); return { id: "shared", user_metadata: { role: "admin", access_scope: "shared" } }; },
   requireAuthenticatedUser: async () => { websiteChecks++; return { id: "shared" }; },
   getBearerToken: (request: Request) => request.headers.get("authorization")?.replace("Bearer ", ""),
   createSupabaseUserClient: () => ({ rpc: async () => { claims++; return { data: { active: true } }; } }),
   createSupabaseAdmin: () => ({ rpc: async (name:string) => { assert.equal(name,"cp_monitor_shared_session_active"); return {data:authSessionActive}; }, from: (table: string) => {
    const data = table === "profiles" ? { id: "shared", role: scope === "admin" ? "admin" : "buyer" } : table === "cp_fh3_monitor_accounts"
     ? { access_scope: scope, active, employee_id: scope === "shared" ? null : "e1", employee_code: scope === "shared" ? null : "F001" }
     : { payload: { employees: roster } };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data }), single: async () => ({ data }) }; return q;
   } }),
  },
  "@/lib/auth/accountSessionConfig": { singleDeviceSessionsEnabled: () => true },
  "@/features/payroll/lib/workspace-model": { workspaceKeys: { employees: "employees" } },
 });
 const context = async (device = "PC-A") => await api.requireMonitorAccess(new Request("https://test/monitor", { headers: { Authorization: `Bearer header.${Buffer.from(JSON.stringify({session_id:"00000000-0000-4000-8000-000000000001",device})).toString("base64url")}.fixture` } }), { activateSession: true }) as {
  actor: { isAdmin: boolean }; employeeCode: string; canOperateAll: boolean; operableEmployeeCodes: string[]; accessScope: string;
 };
 for (const token of ["PC-A", "PC-B", "ANDROID-A", "PC-A"]) {
  const shared = await context(token);
  assert.equal(shared.actor.isAdmin, false); assert.equal(shared.accessScope, "shared");
  assert.deepEqual(Array.from(shared.operableEmployeeCodes), ["F001", "F002"]);
  requireOwnEmployee(shared, "F001"); requireOwnEmployee(shared, "F002");
  assert.throws(() => requireOwnEmployee(shared, "F003"), /miliknya/);
 }
 assert.equal(claims, 0); assert.equal(websiteChecks, 0); assert.equal(identityChecks, 4);
 active = false; await assert.rejects(context(), /dinonaktifkan/); active = true;
 authSessionActive = false; await assert.rejects(context(), /berakhir/); authSessionActive = true;
 scope = "employee"; const personal = await context();
 assert.equal(personal.canOperateAll, false); assert.throws(() => requireOwnEmployee(personal, "F002"), /miliknya/);
 assert.equal(claims, 1); assert.equal(websiteChecks, 1);
 scope = "admin"; assert.equal((await context()).actor.isAdmin, true);
 assert.equal(claims, 2); assert.equal(websiteChecks, 2);
 validIdentity = false; await assert.rejects(context(), /MFA_REQUIRED/);
});

test("only an admin can explicitly grant shared scope, and old account requests default to personal", async () => {
 let calls = 0, args: Record<string, unknown> = {};
 const route = load("app/api/admin/payroll/mobile/accounts/route.ts", {
  "@/lib/monitorAccess": { requireMonitorAccess: async () => ({ actor: { id: "owner", isAdmin: true }, supabaseAdmin: {
   from: () => { const q = { select: () => q, ilike: () => q, maybeSingle: async () => ({ data: { id: "staff", role: "buyer" } }) }; return q; },
   rpc: async (name: string, input: Record<string, unknown>) => { calls++; assert.equal(name, "cp_monitor_set_account_scope"); args = input; return { data: { ok: true } }; },
  } }) },
  "@/lib/monitorHttp": { monitorBody, monitorError, monitorReply },
  "@/features/payroll/lib/workspace-model": { workspaceKeys: {} },
 });
 const post = (body: unknown) => route.POST(new Request("https://test/accounts", { method: "POST", body: JSON.stringify(body) })) as Promise<Response>;
 assert.equal((await post({ username: "fh3-shared", active: true, accessScope: "shared" })).status, 200);
 assert.equal(args.p_scope, "shared"); assert.equal(args.p_code, null);
 assert.equal((await post({ username: "adit", active: true, employeeCode: "F001" })).status, 200);
 assert.equal(args.p_scope, "employee"); assert.equal(args.p_code, "F001");
 for (const body of [{ accessScope: "admin" }, { accessScope: "shared", employeeCode: "F001" }])
  assert.equal((await post({ username: "fh3-shared", active: true, ...body })).status, 400);
 assert.equal(calls, 2);
});

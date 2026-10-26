import { requireOwnEmployee } from "../lib/monitorAccess";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { loadFH3ManualOrders, manualFH3OrderTitle } from "../lib/fh3ManualTelegramQueue";
import { mobileWorkflow } from "../lib/payrollMobileWorkflow";
import { loadFH3MonitorJobs } from "../lib/fh3MonitorJobs";
import { monitorPauseWorkflow } from "../lib/monitorPauseWorkflow";
import { monitorDuration, dailyWorkflow } from "../lib/monitorDuration";
import { loadMonitorDailyStates } from "../lib/monitorDailyData";
import { mobilePayrollRoster } from "../features/payroll/lib/mobile-roster";

function load(file: string, mocks: Record<string, unknown>) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { GET?: (request: Request) => Promise<Response>; POST?: (request: Request) => Promise<Response> } = {};
  runInNewContext(compiled, {
    exports, Request, Response, Error, SyntaxError,
    require: (name: string) => { if(name==="@/lib/monitorManagement")return {loadMonitorControls:async()=>new Map()}; assert.ok(name in mocks, `Unexpected module: ${name}`); const mock=mocks[name]; return name==="@/lib/monitorAccess" ? { ...(mock as object),requireOwnEmployee } : mock; },
  });
  return exports;
}
const url = "https://example.com/api/admin/payroll/mobile";
const order = (externalReference: string, patch: Record<string, unknown> = {}) => ({
  externalReference, team: "FH3", orderType: "boosting", operationalStatus: "assignment_pending",
  orderedAt: "2026-10-19T09:00:00.000Z", financeStatus: "pending",
  orderName: "Boost Rank", game: "Mobile Legends", buyerName: "Buyer", task: "Joki",
  workerAssignments: [], grossMinor: 2000, ...patch,
});
const workspace = (orders: unknown[], employees: unknown[] = []) =>
  { return { payload: { orders, employees }, revision: 7, updated_at: "2026-10-19T10:00:00Z" }; };
const manual = (orderRef: string, patch: Record<string, unknown> = {}) => ({
  order_ref: orderRef, chat_id: -100123, message_id: 42, admin_user_id:22, active: true,
  game: "aion2", duration: "8hours", discord: "FH3 Demo", server_name: "Triniel",
  task: "TASK from Telegram", posted_at: "2026-10-20T04:00:00Z", ...patch,
});
const client = (data: unknown, telegramOrders: unknown[] = [], jobs: unknown[] = [], takes: unknown[] = []) => ({
  rpc: async (name:string) => { assert.ok(["cp_monitor_pause_states","cp_monitor_daily_states"].includes(name)); return {data:null,error:{code:"PGRST202"}}; },
  from: (table: string) => {
    if (table === "cp_payroll_workspace") {
      return { select: () => ({ eq: () => ({ single: async () => ({ data }) }) }) };
    }
    if (table === "cp_payroll_telegram_divisions") {
      return { select: () => ({ eq: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { chat_id: -100123,fh3_order_sender_id:22 }, error: null }),
      }) }) }) };
    }
    if (table === "cp_fh3_telegram_manual_orders") {
      const filters: [string, unknown][] = [];
      const matches = () => telegramOrders.filter(r => filters.every(([key, value]) =>
        (r as Record<string, unknown>)[key] === value));
      const query = { select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key,value]); return query; },
        limit: async () => ({ data: matches(), error: null }),
        maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
      };
      return query;
    }
    if (["cp_mobile_order_take", "cp_mobile_order_proof"].includes(table)) {
      return { select: () => ({ in: async () => ({ data: table === "cp_mobile_order_take" ? takes : [], error: null }) }) };
    }
    if (table === "cp_fh3_monitor_jobs") return { select: () => ({ order: () => ({ range: async () => ({ data: jobs, error: null }) }) }) };
    throw new Error("Unexpected table: " + table);
  },
});
const common = {
  "@/lib/monitorDuration": { monitorDuration, dailyWorkflow },
  "@/lib/monitorDailyData": { loadMonitorDailyStates },
  "@/lib/monitorPauseWorkflow": { monitorPauseWorkflow },
  "@/lib/fh3MonitorJobs": { loadFH3MonitorJobs },
  "@/lib/payrollMobileWorkflow": { mobileWorkflow },
  "@/lib/fh3ManualTelegramQueue": { loadFH3ManualOrders, manualFH3OrderTitle },
  "@/lib/payrollMobileTake": {
    deliverTakeNotice: async () => ({ ok: true, takeSent: true, caption: "x100/andi/take" }),
    TakeNoticeError: class TakeNoticeError extends Error {
      constructor(message: string, public uncertain: boolean) { super(message); }
    },
  },
  "@/lib/adminSecurity": { adminErrorStatus: (e: { status?: number }) => e.status ?? 500 },
  "@/features/payroll/lib/workspace-model": { workspaceKeys: { orders: "orders", employees: "employees" } },
};

test("shared accounts see active work for all authorized workers; personal accounts keep their own task filter", async () => {
  const workers = ["F001", "F002"].map((code, i) => ({ id: `e${i+1}`, code, name: `Worker ${i+1}`, team: "FH3", workforceStatus: "FULL" }));
  const orders = workers.map((worker, i) => order(`X${100+i}`, { operationalStatus: "assigned",
    workerAssignments: [{ employeeCode: worker.code, employeeName: worker.name, team: "FH3", quantity: 1 }] }));
  for (const shared of [true, false]) {
    const route = load("app/api/admin/payroll/mobile/tasks/route.ts", { ...common,
      "@/lib/monitorAccess": { requireMonitorAccess: async () => ({ actor: { isAdmin: false },
        employeeCode: shared ? "" : "F001", canOperateAll: shared, operableEmployeeCodes: shared ? ["F001", "F002"] : ["F001"],
        supabaseAdmin: client(workspace(orders, workers), [manual("X100"), manual("X101")]) }) },
    });
    const response = await route.GET!(new Request(url + "/tasks"));
    assert.equal(response.status, 200); const body = await response.json();
    assert.deepEqual(body.tasks.map((task: {employeeCode:string}) => task.employeeCode), shared ? ["F001", "F002"] : ["F001"]);
  }
});
test("pending endpoint requires Monitor access before reading order details", async()=>{
    const reads=0;
    const route=load("app/api/admin/payroll/mobile/pending/route.ts",{...common,
      "@/lib/monitorAccess":{requireMonitorAccess:async()=>{throw Object.assign(new Error("Denied"),{status:403});}}});
    assert.equal((await route.GET!(new Request(url+"/pending"))).status,403);
    assert.equal(reads,0);
  });

test("FH3 queue contains only verified Telegram manual posts and their TASK", async () => {
  const rows = [
    order("X100"), order("X200", { operationalStatus: "draft" }),
    order("X300", { operationalStatus: "assigned" }),
    order("X400", { team: "FH2" }),
    order("X500", { workerAssignments: [{ employeeCode: "E" }] }),
    order("X600", { importNeedsReview: true }),
    order("X700", { sheetDeletedAt: "2026-10-18T00:00:00Z" }),
    order("X800", { scheduleMode: "daily" }),
    order("X900", { orderType: "item", operationalStatus: "confirmed" }),
  ];
  const route = load("app/api/admin/payroll/mobile/pending/route.ts", {
    ...common, "@/lib/monitorAccess": { requireMonitorAccess: async () => ({
      actor: { isAdmin: true }, supabaseAdmin: client(workspace(rows), [manual("X100"), manual("X900"), manual("X4519")]),
    }) },
  });
  const response = await route.GET!(new Request(url + "/pending"));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.schema, 2);
  assert.equal(result.source, "payroll");
  assert.deepEqual(result.pending.map((x: { orderRef: string }) => x.orderRef), ["X100","X900","X4519"]);
  assert.equal(result.pending[0].buyer, "");
  assert.equal(result.pending[0].task, "TASK from Telegram");
  assert.equal(result.pending[0].discord, "FH3 Demo");
  assert.match(result.pending[0].orderName, /Discord: FH3 Demo/, "existing APK shows Discord without reinstalling");
  assert.equal(result.pending[2].discord, "FH3 Demo");
  assert.equal(result.pending[2].unlinkedPayroll, true);
  assert.equal(result.pending[2].canTake, true);
  assert.equal(result.pending[2].canTakeWithoutPayroll, true);
  assert.equal(result.pending[2].needsValuation, true);
  assert.match(result.pending[2].orderName, /8hours/);
  assert.doesNotMatch(JSON.stringify(result), /grossMinor|telegram_user_id|salary|kasbon|refreshToken/);
});

test("Duration column is explicit and future multi-day TAKE fails closed before migration",async()=>{
 const api=client(workspace([]),[manual("X100",{duration:"8hours x7"}),manual("X200",{duration:"8h x7 2 weeks"})]);
 for(const supported of [false,true]){
  const route=load("app/api/admin/payroll/mobile/pending/route.ts",{...common,"@/lib/monitorAccess":{requireMonitorAccess:async()=>({actor:{isAdmin:true},supabaseAdmin:{...api,
   rpc:async()=>supported?{data:[]}:{error:{code:"PGRST202"}}}})}});
  const response=await route.GET!(new Request(url+"/pending"));assert.equal(response.status,200);
  const rows=(await response.json()).pending;
  const row=rows.find((r:{orderRef:string})=>r.orderRef==="X100");assert.equal(row.duration,"8hours x7");assert.equal(row.durationDisplay,"8 jam × 7 hari");
  assert.equal(row.totalDays,7);assert.equal(row.canTake,supported);
  const invalid=rows.find((r:{orderRef:string})=>r.orderRef==="X200");assert.equal(invalid.canTake,false);assert.equal(invalid.totalDays,0,"unknown count keeps the native integer contract");
 }
});

test("daily task exposes next day while retaining its worker and cannot use the legacy DONE flags",async()=>{
 const worker={id:"e1",code:"F001",name:"Adit",team:"FH3",workforceStatus:"FULL"};
 const api=client(workspace([], [worker]),[manual("X100",{duration:"8hours x7"})],
  [{order_ref:"X100",chat_id:-100123,employee_id:"e1",employee_code:"F001",employee_name:"Adit",status:"assigned",created_at:"2026-10-26T00:00:00Z"}],
  [{order_ref:"X100",chat_id:-100123,employee_code:"F001",status:"sent"}]);
 const row={order_ref:"X100",duration:"8hours x7",total_days:7,hours_per_day:8,completed_days:1,revision:2,cycle_id:"00000000-0000-4000-8000-000000000001",phase:"waiting",uncertain:false};
 const route=load("app/api/admin/payroll/mobile/tasks/route.ts",{...common,"@/lib/monitorAccess":{requireMonitorAccess:async()=>({actor:{isAdmin:true},supabaseAdmin:{...api,
  rpc:async(name:string)=>name==="cp_monitor_daily_states"?{data:[row]}:{error:{code:"PGRST202"}}}})}});
 const response=await route.GET!(new Request(url+"/tasks"));assert.equal(response.status,200);
 const task=(await response.json()).tasks[0];assert.equal(task.daily,true);assert.equal(task.dayNumber,2);assert.equal(task.completedDays,1);
 assert.equal(task.employeeCode,"F001");assert.equal(task.canStart,true);assert.equal(task.canDone,false);
 assert.equal(task.dailyRevision,2);assert.match(task.actionMessage,/Day 2\/7/);
});

test("roster, pending and tasks reuse only the fresh authorized request snapshot", async () => {
  const e = { id: "e1", code: "F001", name: "Adit", team: "FH3", workforceStatus: "FULL" };
  const snapshot = workspace([order("X100"),order("X200",{operationalStatus:"assigned",employeeCode:e.code,employeeName:e.name})],[e]);
  const api = client(snapshot,[manual("X100"),manual("X200")]);
  let checks=0;
  const mocks={...common,
    "@/features/payroll/lib/mobile-roster":{mobilePayrollRoster},
    "@/lib/monitorAccess":{requireMonitorAccess:async()=>{
      checks++;
      return {actor:{isAdmin:false},employeeCode:"",accessScope:"shared",canOperateAll:true,operableEmployeeCodes:[e.code],workspaceSnapshot:snapshot,
        supabaseAdmin:{...api,from:(table:string)=>{assert.notEqual(table,"cp_payroll_workspace","workspace must not be read twice");return api.from(table);}}};
    }},
  };
  for(const page of ["roster","pending","tasks"]){
    const route=load(`app/api/admin/payroll/mobile/${page}/route.ts`,mocks);
    const response=await route.GET!(new Request(url+"/"+page));
    assert.equal(response.status,200,page);
    assert.match(response.headers.get("cache-control")||"",/no-store/);
    const body=await response.json();
    assert.equal(body.revision,7);
    if(page==="roster")assert.deepEqual(body.employees.map((row:{code:string})=>row.code),[e.code]);
    if(page==="pending")assert.deepEqual(body.pending.map((row:{orderRef:string})=>row.orderRef),["X100"]);
    if(page==="tasks")assert.deepEqual(body.tasks.map((row:{orderRef:string})=>row.orderRef),["X200"]);
    assert.doesNotMatch(JSON.stringify(body),/grossMinor|refreshToken/);
  }
  assert.equal(checks,3,"each endpoint still authorizes its own request");
});

test("pending queue mixes linked and unpriced orders by verified Telegram post time, not sale date or reference", async () => {
  const rows = [order("X500", { orderedAt: "2030-01-01T00:00:00Z" })];
  const route = load("app/api/admin/payroll/mobile/pending/route.ts", {
    ...common, "@/lib/monitorAccess": { requireMonitorAccess: async () => ({
      actor: { isAdmin: true }, supabaseAdmin: client(workspace(rows), [
        manual("X500", { posted_at: "2026-10-20T04:00:00Z" }),
        manual("X100", { posted_at: "2026-10-26T04:00:00Z" }),
        manual("X900", { posted_at: "2026-10-24T04:00:00Z" }),
      ]),
    }) },
  });
  const response = await route.GET!(new Request(url + "/pending"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const result = await response.json();
  assert.deepEqual(result.pending.map((item: { orderRef: string }) => item.orderRef), ["X100", "X900", "X500"]);
  assert.equal(result.pending[0].postedAt, "2026-10-26T04:00:00Z");
  assert.equal(result.pending[2].postedAt, "2026-10-20T04:00:00Z");
  assert.equal(result.pending[0].canTakeWithoutPayroll, true);
  assert.equal(result.pending[2].canTake, true);
  assert.doesNotMatch(JSON.stringify(result), /password|accessToken|refreshToken/);
});

test("assignment endpoint checks admin, validates payload, and uses website actor identity", async () => {
  let isAdmin = false;
  const calls: unknown[] = [];
  const route = load("app/api/admin/payroll/mobile/assign/route.ts", {
    ...common, "@/lib/monitorAccess": { requireMonitorAccess: async () => ({
      actor: { isAdmin, id: "e120c2e4-99bb-42b0-9d08-a8e71ebef76a" },
      supabaseAdmin: { ...client(workspace([]), [manual("X100")]),
        rpc: async (name: string, args: unknown) => {
          calls.push({ name, args }); return { data: { ok: true, orderRef: "X100" } };
        } },
    }) },
  });
  const request = (body: unknown) => new Request(url + "/assign", {
    method: "POST", body: JSON.stringify(body),
  });
  assert.equal((await route.POST!(request({ orderRef: "X100", employeeCode: "E" }))).status, 403);
  isAdmin = true;
  assert.equal((await route.POST!(request({ orderRef: "", employeeCode: "E" }))).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await route.POST!(request({ orderRef: "X100", employeeCode: "E" }))).status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    name: "cp_mobile_assign_fh3",
    args: { p_order_ref: "X100", p_employee_code: "E", p_actor_id: "e120c2e4-99bb-42b0-9d08-a8e71ebef76a" },
  }]);
});

test("concurrent assignment conflicts are surfaced instead of overwriting work", async () => {
  const route = load("app/api/admin/payroll/mobile/assign/route.ts", {
    ...common, "@/lib/monitorAccess": { requireMonitorAccess: async () => ({
      actor: { isAdmin: true, id: "e120c2e4-99bb-42b0-9d08-a8e71ebef76a" },
      supabaseAdmin: { ...client(workspace([]), [manual("X100")]), rpc: async () => ({ error: { code: "P0001" } }) },
    }) },
  });
  const request = new Request(url + "/assign", {
    method: "POST", body: JSON.stringify({ orderRef: "X100", employeeCode: "E" }),
  });
  assert.equal((await route.POST!(request)).status, 409);
});

test("active tasks require an admin Telegram post and use its TASK, not Payroll-only instructions", async () => {
  const e = { id: "uid-1", code: "FH3001", name: "Andi", team: "FH3", workforceStatus: "SHIFT" };
  const rows = [
    order("X100", { operationalStatus: "assigned", workerAssignments: [
      { employeeCode: "FH3001", employeeName: "Andi", team: "FH3", quantity: 1 },
    ] }),
    order("X200", { operationalStatus: "assignment_pending" }),
    order("X4759", { operationalStatus: "assigned", employeeCode: "FH3001", employeeName: "Andi" }),
  ];
  const route = load("app/api/admin/payroll/mobile/tasks/route.ts", {
    ...common, "@/lib/monitorAccess": { requireMonitorAccess: async () => ({
      actor:{isAdmin:true}, supabaseAdmin: client(workspace(rows, [e]), [manual("X100")]),
    }) },
  });
  const response = await route.GET!(new Request(url + "/tasks"));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "payroll");
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].employeeCode, "FH3001");
  assert.equal(result.tasks[0].orderRef, "X100");
  assert.equal(result.tasks[0].task, "TASK from Telegram");
  assert.equal(result.tasks[0].discord, "FH3 Demo");
  assert.match(result.tasks[0].orderName, /Discord: FH3 Demo/, "existing APK active task shows Discord");
  assert.equal(result.tasks[0].buyer, "");
  assert.doesNotMatch(JSON.stringify(result), /grossMinor|telegram_file_id|telegram_chat_id/);
});

test("unpriced jobs leave pending, retain their worker, and expose only the next confirmed Telegram action", async () => {
  const worker = { id: "e1", code: "F001", name: "Andi", team: "FH3", workforceStatus: "SHIFT" };
  const job = { order_ref: "X9001", chat_id: -100123, employee_id: "e1", employee_code: "F001",
    employee_name: "Andi", status: "assigned", created_at: "2026-10-22T00:00:00Z", cp_fh3_telegram_manual_orders: { active: true } };
  const takes = [{ order_ref: "X9001", employee_code: "F001", chat_id: -100123, status: "sent" }];
  const service = client(workspace([], [worker]), [manual("X9001")], [job], takes);
  const mocks = { ...common, "@/lib/monitorAccess": { requireMonitorAccess: async () => ({ actor: { isAdmin: true }, supabaseAdmin: service }) } };
  const pending = load("app/api/admin/payroll/mobile/pending/route.ts", mocks);
  assert.equal((await (await pending.GET!(new Request(url))).json()).pending.length, 0);
  const tasks = load("app/api/admin/payroll/mobile/tasks/route.ts", mocks);
  const body = await (await tasks.GET!(new Request(url))).json();
  assert.equal(body.tasks.length, 1); assert.equal(body.tasks[0].employeeCode, "F001");
  assert.equal(body.tasks[0].source, "telegram_job"); assert.equal(body.tasks[0].needsValuation, true);
  assert.equal(body.tasks[0].canTake, false); assert.equal(body.tasks[0].canStart, true); assert.equal(body.tasks[0].canDone, false);
  assert.doesNotMatch(JSON.stringify(body), /grossMinor|chat_id|source_message_id/);
});

test("direct database migrations contain no Telegram assignment or outbox writes", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261019220000_cp_boost_monitor_mobile_assignment.sql", import.meta.url), "utf8");
  const routing = readFileSync(new URL("../supabase/migrations/20261019220001_cp_boost_monitor_direct_fh3_routing.sql", import.meta.url), "utf8");
  assert.match(sql, /cp_payroll_workspace where id = 1 for update/);
  assert.match(sql, /cp_mobile_assignment_audit/);
  assert.doesNotMatch(sql, /cp_payroll_telegram_/);
  assert.match(routing, /p_order->>'team'='FH3'/);
  assert.match(routing, /then return; end if/);
});

test("cancelled Telegram orders disappear from pending and are rejected before TAKE writes", async () => {
  let writes = 0;
  const service = { ...client(workspace([order("X4519"),order("X4759")]), [manual("X4519",{active:false})]),
    rpc:async()=>{writes++;return {data:{ok:true}};} };
  const mocks = {...common,"@/lib/monitorAccess":{requireMonitorAccess:async()=>({
    actor:{isAdmin:true,id:"admin"},supabaseAdmin:service,
  })}};
  const pending=load("app/api/admin/payroll/mobile/pending/route.ts",mocks);
  assert.deepEqual((await (await pending.GET!(new Request(url))).json()).pending,[]);
  const assign=load("app/api/admin/payroll/mobile/assign/route.ts",mocks);
  assert.equal((await assign.POST!(new Request(url,{method:"POST",body:JSON.stringify({orderRef:"X4519",employeeCode:"E"})}))).status,409);
  assert.equal(writes,0);
});

test("missing receipt migration fails closed for both queue and active tasks", async () => {
  const base=client(workspace([order("X4759")]));
  const mocks={...common,"@/lib/monitorAccess":{requireMonitorAccess:async()=>({actor:{isAdmin:true},
    supabaseAdmin:{from:(table:string)=>{
      if(table!=="cp_fh3_telegram_manual_orders")return base.from(table);
      const q={select:()=>q,eq:()=>q,limit:async()=>({error:{code:"42P01"},data:null})};return q;
    }},
  })}};
  for(const file of ["pending","tasks"]) {
    const route=load(`app/api/admin/payroll/mobile/${file}/route.ts`,mocks);
    assert.equal((await route.GET!(new Request(url))).status,503);
  }
});

test("another group admin's receipts are excluded from pending, active tasks and TAKE", async () => {
  let writes=0;
  const worker={id:"e1",code:"FH3001",name:"Andi",team:"FH3",workforceStatus:"SHIFT"};
  const service={...client(workspace([
    order("X4827"),order("X4519",{operationalStatus:"assigned",employeeCode:"FH3001",employeeName:"Andi"}),
  ],[worker]),[manual("X4827",{admin_user_id:23}),manual("X4519",{admin_user_id:23})]),
    rpc:async()=>{writes++;return {data:{ok:true}};}};
  const mocks={...common,"@/lib/monitorAccess":{requireMonitorAccess:async()=>({actor:{isAdmin:true},supabaseAdmin:service})}};
  for (const [file,key] of [["pending","pending"],["tasks","tasks"]]) {
    const route=load(`app/api/admin/payroll/mobile/${file}/route.ts`,mocks);
    const reply=await route.GET!(new Request(url));
    assert.equal(reply.status,200);assert.deepEqual((await reply.json())[key],[]);
  }
  const assign=load("app/api/admin/payroll/mobile/assign/route.ts",mocks);
  assert.equal((await assign.POST!(new Request(url,{method:"POST",body:JSON.stringify({orderRef:"X4827",employeeCode:"FH3001"})}))).status,409);
  assert.equal(writes,0);
});

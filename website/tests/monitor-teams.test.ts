import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { allocateMonitorWage, loadMonitorTeams, parseMonitorTeamInput, readMonitorTeam } from '../lib/monitorTeams';

const team = (count = 2) => ({ orderRef: 'X4801', teamVersion: 2, primaryEmployeeCode: 'E1',
  participants: Array.from({ length: count }, (_, index) => ({ employeeId: `e${index + 1}`, employeeCode: `E${index + 1}`,
    employeeName: `Worker ${index + 1}`, shareBps: 10000 / count, joinedAt: '2026-10-31T01:00:00Z' })) });
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const http = {
  monitorReply: (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }),
  monitorBody: (request: Request) => request.json(),
  monitorError: (error: { status?: number; code?: string; message?: string }) => Response.json({ error: error.message },
    { status: error.code === 'P0001' ? 409 : error.status ?? 503 }),
};
function moduleAt(path: string, mocks: Record<string, unknown>) {
  const exports: Record<string, (...args: any[]) => any> = {};
  const code = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, Request, Response, URL, Buffer, Map, Set,
    require: (key: string) => {
      if (!(key in mocks)) throw new Error('Unexpected module: ' + key);
      return mocks[key];
    } });
  return exports;
}
const teamModule = { allocateMonitorWage, loadMonitorTeams, parseMonitorTeamInput, readMonitorTeam };

test('team inputs enforce 1–4 unique workers, positive basis points and exactly 100%', () => {
  for (const count of [1, 2, 4]) assert.equal(parseMonitorTeamInput(team(count).participants).length, count);
  assert.equal(parseMonitorTeamInput([{ employeeCode: 'E1', shareBps: 3334 }, { employeeCode: 'E2', shareBps: 3333 },
    { employeeCode: 'E3', shareBps: 3333 }]).length, 3);
  for (const input of [[], team(5).participants, [{ employeeCode: 'E1', shareBps: 0 }],
    [{ employeeCode: 'E1', shareBps: 5000 }, { employeeCode: 'e1', shareBps: 5000 }],
    [{ employeeCode: 'E1', shareBps: 9999 }], [{ employeeCode: 'E1', shareBps: 10000.1 }],
    [{ employeeCode: 'E1\n', shareBps: 10000 }], null]) assert.throws(() => parseMonitorTeamInput(input));
});

test('wage allocation conserves every rupiah for 1–4 participants and remains stable after reordering', () => {
  const participants = [{ employeeCode: 'E3', shareBps: 3333 }, { employeeCode: 'E1', shareBps: 3334 }, { employeeCode: 'E2', shareBps: 3333 }];
  for (const wage of [0, 1, 2, 3, 7, 10001, 1e9]) {
    const values = allocateMonitorWage(wage, participants);
    assert.equal(values.reduce<number>((sum, value) => sum + value!, 0), wage);
    assert.deepEqual(values, allocateMonitorWage(wage, participants.slice().reverse()).reverse());
  }
  assert.deepEqual(allocateMonitorWage(1, participants), [0, 1, 0]);
  assert.deepEqual(allocateMonitorWage(null, participants), [null, null, null]);
  assert.throws(() => allocateMonitorWage(-1, participants));
});

test('team polling batches refs and supports legacy reads only for a missing migration RPC', async () => {
  const batches: string[][] = [];
  const service = { rpc: async (_name: string, args: { p_refs: string[] }) => {
    batches.push(args.p_refs); return { data: args.p_refs.includes('X4801') ? [team()] : [] };
  } } as unknown as Parameters<typeof loadMonitorTeams>[0];
  const loaded = await loadMonitorTeams(service, ['X4801', ...Array.from({ length: 160 }, (_, index) => `X${5000 + index}`), 'X4801']);
  assert.equal(loaded.teams.size, 1); assert.deepEqual(batches.map(batch => batch.length), [80, 80, 1]);
  const missing = await loadMonitorTeams({ rpc: async () => ({ error: { code: 'PGRST202' } }) } as never, ['X4801']);
  assert.equal(missing.supported, false);
  assert.equal((await loadMonitorTeams({ rpc: async () => ({ error: { code: 'PGRST202' } }) } as never, [])).supported, false);
  await assert.rejects(loadMonitorTeams({ rpc: async () => ({ error: { code: '42501' } }) } as never, ['X4801']));
  await assert.rejects(loadMonitorTeams({ rpc: async () => ({ data: [team(), team()] }) } as never, ['X4801']));
});

test('team API requires verified admin identity before reads or writes and forwards locked version', async () => {
  let admin = false, writes = 0, last: any;
  const route = moduleAt('app/api/admin/payroll/mobile/team/route.ts', {
    '@/lib/monitorAccess': { requireMonitorAccess: async () => ({ actor: { id: 'admin-user', isAdmin: admin },
      supabaseAdmin: { rpc: async (name: string, args: unknown) => { writes++; last = { name, args }; return { data: team() }; } } }) },
    '@/lib/monitorHttp': http, '@/lib/monitorTeams': teamModule,
  });
  const request = (body: unknown) => new Request('https://test/team', { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await route.GET(new Request('https://test/team?orderRef=X4801'))).status, 403);
  assert.equal((await route.POST(request({ orderRef: 'X4801', version: 1, participants: team().participants }))).status, 403);
  assert.equal(writes, 0); admin = true;
  assert.equal((await route.POST(request({ orderRef: 'X4801', version: -1, participants: team().participants }))).status, 400);
  assert.equal((await route.POST(request({ orderRef: 'X4801', version: 1, participants: [{ employeeCode: 'E1', shareBps: 99 }] }))).status, 400);
  assert.equal(writes, 0);
  const response = await route.POST(request({ orderRef: 'X4801', version: 1, participants: team().participants }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(last.name, 'cp_monitor_set_team'); assert.equal(last.args.p_actor_user_id, 'admin-user');
  assert.equal(last.args.p_expected_version, 1); assert.equal((await response.json()).teamVersion, 2);
});

test('initial multi-worker TAKE uses one atomic assignment RPC and never sends after a conflict', async () => {
  let admin = true, conflict = false, sent = 0, call: any;
  class TakeNoticeError extends Error { uncertain = false; }
  const service = { from: () => { const query: any = { select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: { division: 'FH3', chat_id: -100123, fh3_order_sender_id: 22, admin_user_id: 22, active: true } }) }; return query; },
    rpc: async (name: string, args: unknown) => { call = { name, args }; return conflict
      ? { error: { code: 'P0001', message: 'changed' } } : { data: { ...team(), employeeCode: 'E1', employeeName: 'Worker 1' } }; } };
  const route = moduleAt('app/api/admin/payroll/mobile/assign/route.ts', {
    '@/lib/monitorAccess': { requireMonitorAccess: async () => ({ actor: { id: 'admin-user', isAdmin: admin }, supabaseAdmin: service }), requireOwnEmployee: () => {} },
    '@/lib/adminSecurity': { adminErrorStatus: (error: { status?: number }) => error.status ?? 503 },
    '@/lib/payrollMobileTake': { TakeNoticeError, deliverTakeNotice: async () => { sent++; return { takeSent: true }; } },
    '@/lib/monitorTeams': teamModule,
  });
  const body = { orderRef: 'X4801', employeeCode: 'E1', teamVersion: 0, participants: team().participants };
  const post = () => route.POST(new Request('https://test/assign', { method: 'POST', body: JSON.stringify(body) }));
  admin = false; assert.equal((await post()).status, 403); assert.equal(sent, 0);
  admin = true; conflict = true; assert.equal((await post()).status, 409); assert.equal(sent, 0);
  conflict = false; assert.equal((await post()).status, 200); assert.equal(sent, 1);
  assert.equal(call.name, 'cp_monitor_assign_team'); assert.equal(call.args.p_expected_version, 0);
});

const roster = [1, 2, 3, 4].map(index => ({ id: `e${index}`, code: `E${index}`, name: `Worker ${index}`, team: 'FH3' }));
const receipt = { order_ref: 'X4801', chat_id: -100123, game: 'Aion', duration: '12H', discord: 'DC', task: 'Mission', active: true };
const proof = { order_ref: 'X4801', employee_code: 'E1', chat_id: -100123, action: 'done', status: 'sent',
  telegram_message_id: 42, sent_at: '2026-10-31T02:00:00Z' };
const job = { order_ref: 'X4801', employee_id: 'e1', employee_code: 'E1', employee_name: 'Worker 1', chat_id: -100123,
  status: 'completed', created_at: '2026-10-31T01:00:00Z', started_at: null, completed_at: proof.sent_at };
const control = { order_ref: 'X4801', state: 'normal', archived: false, wage_rupiah: 101, version: 2 };
const completedModule = () => moduleAt('lib/payrollMobileCompleted.ts', {
  '@/features/payroll/lib/workspace-model': { workspaceKeys: { employees: 'employees', orders: 'orders' } },
  '@/features/payroll/lib/order-workers': { getOrderAssignments: (order: any) => order.workerAssignments ?? [] },
  './monitorTeams': teamModule,
});

test('confirmed team completion credits each worker, counts one order globally and apportions wages once', () => {
  const build = completedModule().buildMobileCompleted;
  const args = [{ employees: roster, orders: [] }, [receipt], [proof, proof], [job]];
  const result = build(...args, '', 0, [control], true, false, [team(4)]);
  assert.equal(result.work.length, 4); assert.equal(result.totals.completedCount, 1); assert.equal(result.totals.contributors, 4);
  assert.equal(result.work.reduce((sum: number, row: any) => sum + row.wageRupiah, 0), 101);
  for (const worker of roster) {
    const own = build(...args, worker.code, 0, [control], false, false, [team(4)]);
    assert.equal(own.workTotal, 1); assert.equal(own.work[0].employeeId, worker.id); assert.equal(own.work[0].shareBps, 2500);
  }
  const legacy = build(...args, 'E1', 0, [control]);
  assert.equal(legacy.workTotal, 1); assert.equal(legacy.work[0].wageRupiah, 101); assert.equal(legacy.work[0].shareBps, 10000);
  assert.equal(build(args[0], [receipt], [{ ...proof, status: 'unknown' }], [job], '', 0, [control], true, false, [team(4)]).work.length, 0);
});

function managementModule() {
  return moduleAt('lib/monitorManagement.ts', {
    '@/lib/fh3MonitorCompletedData': { loadCompletedMonitorEvidence: async () => ({ receipts: [receipt], proofs: [proof] }) },
    '@/lib/fh3MonitorJobs': { loadFH3MonitorJobs: async () => new Map([['X4801', job]]) },
    '@/lib/payrollMobileCompleted': { buildMobileCompleted: completedModule().buildMobileCompleted },
    './monitorWorkspaceSnapshot': { loadMonitorWorkspace: async () => ({ payload: { employees: roster, orders: [] }, revision: 1 }) },
    './monitorTeams': teamModule,
  });
}
const ledgerItem = { order_ref: 'X4801', closing_id: 'book-1', employee_id: 'e1', employee_code: 'E1', employee_name: 'Worker 1',
  wage_rupiah: 101, completed_at: proof.sent_at, game: 'Aion', discord: 'DC', task: 'Mission' };

test('immutable closing shares replace the parent beneficiary while order totals and order count stay unique', async () => {
  const shares = team().participants.map((member, index) => ({ order_ref: 'X4801', closing_id: 'book-1',
    employee_id: member.employeeId, employee_code: member.employeeCode, employee_name: member.employeeName,
    share_bps: member.shareBps, wage_rupiah: index ? 50 : 51, joined_at: member.joinedAt, team_version: 2 }));
  const service = { rpc: async () => ({ data: [team()] }), from: (table: string) => {
    const query: any = { select: () => query, order: () => query, range: async () => ({ data: table === 'cp_fh3_monitor_controls' ? [control]
      : table === 'cp_fh3_monitor_closing_items' ? [ledgerItem] : shares }),
      in: async () => ({ data: [{ id: 'book-1', title: 'October', created_at: proof.sent_at }] }) }; return query;
  } };
  const result = await managementModule().monitorBookData(service);
  assert.equal(result.open.length, 0); assert.equal(result.eligible.length, 0);
  assert.equal(result.closings[0].totalRupiah, 101); assert.equal(result.closings[0].orderCount, 1);
  assert.equal(result.closings[0].work.length, 2); assert.equal(result.closings[0].employees.length, 2);
  assert.equal(result.closed.get('X4801').wage_rupiah, 101);
  assert.deepEqual(clean(result.closings[0].work.map((row: any) => row.wageRupiah)), [51, 50]);
  shares[1].wage_rupiah = 101;
  await assert.rejects(managementModule().monitorBookData(service), /Snapshot pembagian/);
});

test('closing expectation contains each order once at its full wage while open rows expose worker shares', async () => {
  const service = { rpc: async () => ({ data: [team()] }), from: (table: string) => {
    const query: any = { select: () => query, order: () => query, range: async () => ({ data: table === 'cp_fh3_monitor_controls' ? [control] : [] }) }; return query;
  } };
  const result = await managementModule().monitorBookData(service);
  assert.equal(result.open.length, 2); assert.equal(result.open[0].wageRupiah, 51); assert.equal(result.open[1].wageRupiah, 50);
  assert.equal(result.eligible.length, 1); assert.equal(result.eligible[0].wageRupiah, 101);
});

test('an added employee can see the shared task while only its lead reports the order lifecycle', async () => {
  let admin = false;
  const snapshot = { payload: { employees: roster.map(employee => ({ ...employee, workforceStatus: 'SHIFT' })), orders: [] },
    revision: 1, updated_at: proof.sent_at };
  const service = { rpc: async (name: string) => ({ data: name === 'cp_monitor_team_states' ? [team()] : [] }),
    from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }) };
  const route = moduleAt('app/api/admin/payroll/mobile/tasks/route.ts', {
    '@/lib/monitorSessionDeadline': { withMonitorSessionDeadline: (callback: (...args: unknown[]) => unknown) => callback(undefined) },
    '@/lib/monitorManagement': { loadMonitorControls: async () => new Map() },
    '@/lib/monitorAccess': { requireMonitorAccess: async () => ({ actor: { isAdmin: admin }, supabaseAdmin: service,
      employeeCode: 'E2', canOperateAll: false, operableEmployeeCodes: ['E2'], workspaceSnapshot: snapshot }) },
    '@/lib/adminSecurity': { adminErrorStatus: () => 503 },
    '@/features/payroll/lib/workspace-model': { workspaceKeys: { employees: 'employees', orders: 'orders' } },
    '@/lib/fh3ManualTelegramQueue': { loadFH3ManualOrders: async () => new Map([['X4801', receipt]]), manualFH3OrderTitle: () => 'Aion' },
    '@/lib/payrollMobileWorkflow': { mobileWorkflow: () => ({ canTake: false, canStart: false, canDone: true, takeSent: true }) },
    '@/lib/fh3MonitorJobs': { loadFH3MonitorJobs: async () => new Map([['X4801', { ...job, status: 'in_progress' }]]) },
    '@/lib/monitorPauseWorkflow': { monitorPauseWorkflow: () => ({ canDone: true, canPause: true, canContinue: false }) },
    '@/lib/monitorDuration': { monitorDuration: () => ({ durationDisplay: '12H' }), dailyWorkflow: () => ({}) },
    '@/lib/monitorDailyData': { loadMonitorDailyStates: async () => ({ supported: true, states: new Map() }) },
    '@/lib/monitorWorkspaceSnapshot': { loadMonitorWorkspace: async () => snapshot },
    '@/lib/monitorTeams': teamModule,
  });
  let response = await route.GET(new Request('https://test/tasks'));
  assert.equal(response.status, 200);
  let result = await response.json(); assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].employeeCode, 'E1'); assert.equal(result.tasks[0].participants.length, 2);
  assert.equal(result.tasks[0].canDone, false); assert.equal(result.tasks[0].canPause, false);
  assert.equal(result.tasks[0].teamSupported, true);
  admin = true; response = await route.GET(new Request('https://test/tasks')); result = await response.json();
  assert.equal(result.tasks.length, 1); assert.equal(result.tasks[0].canDone, true);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical, workspaceKeys } from '../features/payroll/lib/workspace-model';

type Store = typeof import('../features/payroll/lib/workspace-store');
type Response = { state: Record<string, unknown>; revision: number; actor?: { id: string; name: string; email: string; isAdmin: boolean } };
const source = readFileSync(new URL('../features/payroll/lib/workspace-store.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness() {
  const requests: { init?: RequestInit; resolve: (value: Response) => void; reject: (error: Error) => void }[] = [];
  let events = 0;
  const exported: Partial<Store> = {};
  runInNewContext(code, {
    exports: exported, structuredClone, setTimeout, clearTimeout, Event,
    window: { dispatchEvent: () => { events++; } },
    require(name: string) {
      if (name === 'react') return {};
      if (name === './workspace-model') return { canonical, workspaceKeys };
      if (name === '@/lib/authenticatedFetch') return { authenticatedFetchJson: (_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => requests.push({ init, resolve, reject })) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { store: exported as Store, requests, events: () => events };
}
const snapshot = (revision: number, name = 'First'): Response => ({ revision, state: { [workspaceKeys.orders]: [{ id: 'o1', orderName: name }] } });

test('concurrent payroll invalidations share one in-flight GET and unchanged revision emits no storage event', async t => {
  const h = harness(); t.after(() => h.store.clearPayroll());
  const first = h.store.loadPayroll(), second = h.store.loadPayroll();
  assert.equal(h.requests.length, 1); assert.equal(first, second);
  h.requests[0].resolve(snapshot(1)); await first; assert.equal(h.events(), 1);
  const again = h.store.loadPayroll(); h.requests[1].resolve(snapshot(1)); await again;
  assert.equal(h.events(), 1);
});

test('a change in another tab becomes visible without rewriting the local workspace', async t => {
  const h = harness(); t.after(() => h.store.clearPayroll());
  const first = h.store.loadPayroll(); h.requests[0].resolve(snapshot(1)); await first;
  const next = h.store.loadPayroll(); h.requests[1].resolve(snapshot(2, 'Changed in another tab')); await next;
  assert.match(h.store.payrollStorage.getItem(workspaceKeys.orders)!, /Changed in another tab/);
  assert.equal(h.store.payrollStatus().revision, 2);
  assert.equal(h.requests.filter(request => request.init?.method === 'POST').length, 0);
});

test('local edits made during a remote read survive its delayed response', async t => {
  const h = harness(); t.after(() => h.store.clearPayroll());
  const first = h.store.loadPayroll(); h.requests[0].resolve(snapshot(1)); await first;
  const next = h.store.loadPayroll();
  h.store.payrollStorage.setItem(workspaceKeys.orders, JSON.stringify([{ id: 'o1', orderName: 'Unsaved draft' }]));
  h.requests[1].resolve(snapshot(2, 'Remote')); assert.equal(await next, false);
  assert.match(h.store.payrollStorage.getItem(workspaceKeys.orders)!, /Unsaved draft/);
  assert.equal(await h.store.loadPayroll(), false); assert.equal(h.requests.length, 2);
});

test('remote invalidation waits for a save, then accepts the next committed revision', async t => {
  const h = harness(); t.after(() => h.store.clearPayroll());
  const initial = h.store.loadPayroll(); h.requests[0].resolve(snapshot(1)); await initial;
  h.store.payrollStorage.setItem(workspaceKeys.orders, JSON.stringify([{ id: 'o1', orderName: 'Local saved' }]));
  const save = h.store.flushPayroll();
  assert.equal(await h.store.loadPayroll(), false);
  h.requests[1].resolve(snapshot(2, 'Local saved')); await save;
  const next = h.store.loadPayroll(); h.requests[2].resolve(snapshot(3, 'Other user')); await next;
  assert.equal(h.store.payrollStatus().revision, 3);
  assert.match(h.store.payrollStorage.getItem(workspaceKeys.orders)!, /Other user/);
});

test('logout/account changes discard late private snapshots from the previous session', async () => {
  const h = harness(); const load = h.store.loadPayroll();
  h.store.clearPayroll(); h.requests[0].resolve(snapshot(10)); await load;
  assert.equal(h.store.payrollStatus().ready, false);
  assert.equal(h.store.payrollStorage.getItem(workspaceKeys.orders), null);
});

test('server conflict preserves the local edits and never retries a blind overwrite', async t => {
  const h = harness(); t.after(() => h.store.clearPayroll());
  const load = h.store.loadPayroll(); h.requests[0].resolve(snapshot(1)); await load;
  h.store.payrollStorage.setItem(workspaceKeys.orders, JSON.stringify([{ id: 'o1', orderName: 'My draft' }]));
  const save = h.store.flushPayroll();
  h.requests[1].reject(Object.assign(new Error('Data diubah pengguna lain.'), { status: 409 }));
  await assert.rejects(save, /pengguna lain/);
  assert.equal(h.store.payrollStatus().pending, true);
  assert.match(h.store.payrollStorage.getItem(workspaceKeys.orders)!, /My draft/);
  assert.equal(h.requests.length, 2);
});

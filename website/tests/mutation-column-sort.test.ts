import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Order } from '../features/payroll/types/domain';
import { compareMutationOrders, defaultMutationSort, mutationSortLabel, toggleMutationSort, type MutationSortState } from '../features/payroll/lib/mutation-table-sort';

function row(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o-1',
    externalReference: 'X10',
    orderedAt: '2026-09-10T00:00:00.000Z',
    source: 'G2G',
    orderType: 'boosting',
    buyerName: 'Beta',
    orderName: 'Order B',
    service: 'Service B',
    game: 'WOW',
    gameName: 'World of Warcraft',
    region: 'NA',
    server: 'A',
    quantity: 10,
    grossMinor: 100000,
    operationalStatus: 'assigned',
    workerAssignments: [],
    ...overrides,
  } as Order;
}

function sorted(rows: Order[], state: MutationSortState) {
  return [...rows].sort((a,b)=>compareMutationOrders(a,b,state)).map(order=>order.externalReference);
}

test('default order remains newest first', () => {
  assert.deepEqual(defaultMutationSort, { column: 'date', direction: 'desc' });
  assert.deepEqual(sorted([
    row({ externalReference: 'X1', orderedAt: '2026-09-08T00:00:00.000Z' }),
    row({ externalReference: 'X2', orderedAt: '2026-09-17T00:00:00.000Z' }),
  ], defaultMutationSort), ['X2','X1']);
});

test('clicking the active date header toggles old-to-new then new-to-old', () => {
  const ascending = toggleMutationSort(defaultMutationSort, 'date');
  assert.deepEqual(ascending, { column: 'date', direction: 'asc' });
  assert.equal(mutationSortLabel(ascending), 'Hari & tanggal: lama → baru');
  const descending = toggleMutationSort(ascending, 'date');
  assert.deepEqual(descending, { column: 'date', direction: 'desc' });
});

test('a different header starts ascending and second click reverses', () => {
  const first = toggleMutationSort(defaultMutationSort, 'buyer');
  assert.deepEqual(first, { column: 'buyer', direction: 'asc' });
  assert.deepEqual(sorted([
    row({ externalReference: 'X2', buyerName: 'Zulu' }),
    row({ externalReference: 'X1', buyerName: 'Alpha' }),
  ], first), ['X1','X2']);
  assert.deepEqual(sorted([
    row({ externalReference: 'X2', buyerName: 'Zulu' }),
    row({ externalReference: 'X1', buyerName: 'Alpha' }),
  ], toggleMutationSort(first, 'buyer')), ['X2','X1']);
});

test('numeric columns sort numerically, not as text', () => {
  const quantity = { column: 'quantity', direction: 'asc' } as const;
  assert.deepEqual(sorted([
    row({ externalReference: 'X10', quantity: 10 }),
    row({ externalReference: 'X2', quantity: 2 }),
  ], quantity), ['X2','X10']);
  const total = { column: 'total', direction: 'desc' } as const;
  assert.deepEqual(sorted([
    row({ externalReference: 'X10', grossMinor: 10000 }),
    row({ externalReference: 'X2', grossMinor: 90000 }),
  ], total), ['X2','X10']);
});

test('codes use natural numeric ordering', () => {
  const state = { column: 'code', direction: 'asc' } as const;
  assert.deepEqual(sorted([
    row({ externalReference: 'X10' }),
    row({ externalReference: 'X2' }),
    row({ externalReference: 'X1' }),
  ], state), ['X1','X2','X10']);
});

test('Mutasi page wires every sortable header to the active sort state', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync('app/admin/payroll/mutations/page.tsx', 'utf8');
  const component = readFileSync('features/payroll/components/mutation-spreadsheet.tsx', 'utf8');
  assert.match(page, /sortColumn=\{sortState\.column\}/);
  assert.match(page, /sortDirection=\{sortState\.direction\}/);
  assert.match(page, /onSort=\{\(column\) => setSortState/);
  assert.match(page, /compareMutationOrders\(a, b, sortState\)/);
  assert.match(component, /column\.id !== 'actions'/);
  assert.match(component, /aria-sort=\{activeSort/);
  assert.match(component, /Klik judul kolom untuk mengurutkan/);
  assert.match(component, /'↑' : '↓'/);
});

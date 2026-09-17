import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { mutationColumns, defaultMutationWidths, readMutationWidths, clampMutationWidth, mutationWidthsStorageKey } from '../features/payroll/lib/mutation-table-layout';

test('all fourteen original columns retain their order and have comfortable widths', () => {
  assert.deepEqual(mutationColumns.map(column => column.id), ['date','code','source','type','buyer','order','workers','game','region','server','quantity','total','status','actions']);
  assert.equal(new Set(mutationColumns.map(column => column.id)).size, 14);
  assert.ok(mutationColumns.reduce((sum,column) => sum + column.width,0) > 2400);
  for (const column of mutationColumns) assert.ok(column.min <= column.width && column.width <= column.max);
});
test('manual dimensions are finite, rounded and clamped', () => {
  assert.equal(clampMutationWidth('code', -100), 100);
  assert.equal(clampMutationWidth('order', 999999), 1200);
  assert.equal(clampMutationWidth('order', 426.7), 427);
  assert.equal(clampMutationWidth('order', NaN), 320);
  assert.equal(clampMutationWidth('order', Infinity), 320);
});
test('unavailable, corrupt, legacy and non-object storage fall back safely', () => {
  for (const raw of [null, '', '{', '[]', 'null', 'true', '{"version":2,"widths":{"order":700}}', '{"version":1,"widths":[]}']) assert.deepEqual(readMutationWidths(raw),defaultMutationWidths());
});
test('only known numeric width preferences are loaded, never order data', () => {
  const loaded = readMutationWidths('{"version":1,"widths":{"order":610,"code":0,"buyer":"850","total":1e999,"unknown":999,"__proto__":{"polluted":true}},"orders":[{"id":"ignored"}]}');
  assert.deepEqual(Object.keys(loaded), Object.keys(defaultMutationWidths()));
  assert.equal(loaded.order,610); assert.equal(loaded.code,100); assert.equal(loaded.buyer,210); assert.equal(loaded.total,190);
  assert.equal(({} as Record<string,unknown>).polluted,undefined);
});
test('valid preferences round-trip and reset returns independent objects', () => {
  const widths = defaultMutationWidths(); widths.buyer = 500;
  assert.deepEqual(readMutationWidths(JSON.stringify({version:1,widths})), widths);
  assert.equal(defaultMutationWidths().buyer,210);
  assert.equal(mutationWidthsStorageKey.startsWith('cp-ofs-demo-'),false);
});
test('only the presentation wrapper is connected, retaining edit and export handlers', () => {
  const source = readFileSync('app/admin/payroll/mutations/page.tsx','utf8');
  assert.match(source,/<MutationSpreadsheet rowCount=\{rows.length\}/);
  assert.match(source,/readOnly=\{isLocked\}/);
  assert.match(source,/overlay=\{editingOrder \? <MutationEditModal/);
  assert.match(source,/exportMutationsSpreadsheet\(rows, exportLabel\)/);
  assert.match(source,/getAssignmentGrossMinor\(order, a\)/);
  assert.match(source,/confirm\(`Tandai/);
  const component = readFileSync('features/payroll/components/mutation-spreadsheet.tsx','utf8');
  assert.doesNotMatch(component,/authenticatedFetch|supabase|payrollStorage|updateOrder|addOrder|fetch\(/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseManualOrderTime } from '../features/payroll/lib/manual-order-time';
import { formatDateTimeID, toJakartaDateInput, toJakartaDateTimeInput } from '../features/payroll/lib/date';
import { validateWorkspaceEdit, workspaceKeys as K } from '../features/payroll/lib/workspace-model';
import { attributeWorkspaceEdit } from '../features/payroll/lib/audit-model';
import type { Order } from '../features/payroll/types/domain';

function time(value = '2026-09-08T04:05') {
  const result = parseManualOrderTime(value);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function order(): Order {
  const { orderedAt, dueAt } = time();
  return { id: 'ord-test', orderNumber: 'TEST-1', externalReference: 'TEST-1', source: 'G2G', game: 'TEST', service: 'Boosting', orderType: 'boosting', quantity: 1, grossMinor: 10000, operationalStatus: 'assigned', financeStatus: 'pending', expectedPaymentMinor: 10000, matchedPaymentMinor: 0, orderedAt, dueAt };
}

test('historical WIB time is preserved as an explicit UTC instant', () => {
  assert.equal(time().orderedAt, '2026-09-07T21:05:00.000Z');
  assert.equal(time().dueAt, '2026-09-08T21:05:00.000Z');
});
test('midnight and year boundaries use WIB, not the machine timezone', () => {
  assert.equal(time('2026-01-01T00:05').orderedAt, '2025-12-31T17:05:00.000Z');
  assert.equal(toJakartaDateTimeInput(time().orderedAt), '2026-09-08T04:05');
});
test('the same past date survives the existing mutations filter and display helpers', () => {
  assert.equal(toJakartaDateInput(time().orderedAt), '2026-09-08');
  assert.match(formatDateTimeID(time().orderedAt), /Selasa/);
  assert.match(formatDateTimeID(time().orderedAt), /WIB$/);
});
test('blank, malformed, timezone-suffixed, and partial values are rejected', () => {
  for (const value of ['', '2026-09-08', '08/09/2026 04:05', '2026-9-8T4:5', '2026-09-08T04:05Z', '2026-09-08T04:05:12', ' 2026-09-08T04:05', '2026-09-08T04:05 ']) assert.equal(parseManualOrderTime(value).ok, false, value);
});
test('calendar overflow, invalid hours, zero years, and non-leap days are rejected', () => {
  for (const value of ['2026-02-29T04:05', '2026-02-30T04:05', '2026-04-31T12:00', '2026-13-01T00:00', '2026-00-01T00:00', '2026-01-00T00:00', '2026-01-01T24:00', '2026-01-01T12:60', '0000-01-01T00:00', '1900-02-29T12:00']) assert.equal(parseManualOrderTime(value).ok, false, value);
});
test('valid leap days and end-of-month dates are accepted', () => {
  for (const value of ['2000-02-29T12:00', '2024-02-29T23:59', '2026-04-30T23:59', '2026-12-31T23:59']) assert.equal(parseManualOrderTime(value).ok, true, value);
});
test('server workspace accepts the manual timestamp without replacing it', () => {
  const data = order(), state = { [K.orders]: [data] };
  const attributed = attributeWorkspaceEdit({}, state, { id: 'test-actor', name: 'Test Admin' }, '2026-09-17T14:00:00.000Z');
  assert.doesNotThrow(() => validateWorkspaceEdit({}, attributed));
  assert.equal((attributed[K.orders] as Order[])[0].orderedAt, data.orderedAt);
  assert.equal((attributed[K.orders] as Order[])[0].operationalStatus, 'assigned');
  assert.equal((attributed[K.orders] as Order[])[0].payrollClosedAt, undefined);
});
test('manual dates cannot bypass the workspace period lock', () => {
  const before = { [K.orders]: [], [K.lock]: { from: '2026-09-01T00:00', to: '2026-09-15T23:59' } };
  assert.throws(() => validateWorkspaceEdit(before, { ...before, [K.orders]: [order()] }), /dikunci/);
});
test('dates on already closed orders cannot be changed', () => {
  const closed = { ...order(), payrollClosedAt: '2026-09-16T14:00:00.000Z' };
  assert.throws(() => validateWorkspaceEdit({ [K.orders]: [closed] }, { [K.orders]: [{ ...closed, orderedAt: time('2026-09-09T05:00').orderedAt }] }), /Closing/);
});
test('the actual entry form no longer polls or depends on server time', () => {
  const form = readFileSync(new URL('../features/payroll/components/order-entry-form.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(form, /getServerTime|serverTime|setInterval|authenticatedFetch/);
  assert.match(form, /const submittedTime = parseManualOrderTime\(orderDateTime\)/);
  assert.match(form, /orderedAt: orderTime/);
  assert.match(form, /dueAt: due/);
  assert.match(form, /await flushPayroll\(\)/);
  assert.match(form, /reserveAllocations\(inventoryAllocations\)/);
});
test('both entry routes describe manual time', () => {
  for (const path of ['orders/page.tsx', 'orders/new/page.tsx']) {
    const page = readFileSync(new URL(`../app/admin/payroll/${path}`, import.meta.url), 'utf8');
    assert.match(page, /tanggal dan jam pesanan dipilih manual dalam WIB/);
    assert.doesNotMatch(page, /tanggal mengikuti server/);
  }
});

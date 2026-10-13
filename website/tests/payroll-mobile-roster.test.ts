import assert from 'node:assert/strict';
import test from 'node:test';
import { mobilePayrollRoster } from '../features/payroll/lib/mobile-roster';
import type { Employee } from '../features/payroll/types/domain';

const employee = (changes: Partial<Employee> = {}): Employee => ({
  id: 'gsheet-employee:abc', code: 'EMP-SHEET-ABC', name: 'Rani', team: 'FH1',
  workforceStatus: 'SHIFT', utilization: 44, earningsMinor: 150000,
  sheetRosterSource: { spreadsheetId: 'secret-sheet-id', sheetName: 'PAYROLL-1', rowNumber: 3 },
  ...changes,
});

test('APK roster hanya mengirim identitas, team, status kerja dan active, tanpa uang/source spreadsheet', () => {
  const [row] = mobilePayrollRoster([employee()]);
  assert.deepEqual(row, { id: 'gsheet-employee:abc', code: 'EMP-SHEET-ABC', name: 'Rani',
    team: 'FH1', workforceStatus: 'SHIFT', active: true });
  assert.equal(JSON.stringify(row).includes('150000'), false);
  assert.equal(JSON.stringify(row).includes('secret-sheet-id'), false);
});

test('resign dan hilang dari sheet tidak lagi aktif, namun identitas tetap dikirim untuk histori lokal', () => {
  const rows = mobilePayrollRoster([
    employee({ workforceStatus: 'RESIGN' }),
    employee({ id: 'id2', code: 'EMP-B', sheetRosterMissingAt: '2026-10-13T00:00:00Z' }),
  ]);
  assert.deepEqual(rows.map(row => row.active), [false, false]);
  assert.equal(rows[1].id, 'id2');
});
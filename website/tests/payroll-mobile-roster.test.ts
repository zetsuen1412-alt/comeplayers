import assert from 'node:assert/strict';
import test from 'node:test';
import { mobilePayrollRoster } from '../features/payroll/lib/mobile-roster';
import type { Employee } from '../features/payroll/types/domain';

const employee = (changes: Partial<Employee> = {}): Employee => ({
  id: 'fh3a', code: 'EMP-0098', name: 'EKO3', team: 'FH3',
  workforceStatus: 'FULL', utilization: 44, earningsMinor: 150000,
  sheetRosterSource: { spreadsheetId: 'private-sheet-id', sheetName: 'PAYROLL-3', rowNumber: 3 },
  ...changes,
});

test('API untuk APK mengirim FH3 saja dan tidak membocorkan data gaji/Sheet', () => {
  const roster = mobilePayrollRoster([
    employee({ id: 'fh1', code: 'C1', team: 'FH1' }),
    employee({ id: 'fh2', code: 'C2', team: 'FH2' }),
    employee(),
    employee({ id: 'admin', code: 'CA', team: 'ADMIN' }),
    employee({ id: 'bandar', code: 'CB', team: 'BANDAR' }),
    employee({ id: 'fh3b', code: 'EMP-0099', name: 'TEGUH3' }),
  ]);
  assert.equal(roster.length, 2);
  assert.deepEqual(roster.map(row => row.name), ['EKO3', 'TEGUH3']);
  assert.ok(roster.every(row => row.team === 'FH3'));
  assert.deepEqual(roster[0], { id: 'fh3a', code: 'EMP-0098', name: 'EKO3',
    team: 'FH3', workforceStatus: 'FULL', active: true });
  assert.ok(!JSON.stringify(roster).includes('150000'));
  assert.ok(!JSON.stringify(roster).includes('private-sheet-id'));
});

test('karyawan FH3 resign atau hilang dari Sheet dinonaktifkan', () => {
  const rows = mobilePayrollRoster([
    employee({ workforceStatus: 'RESIGN' }),
    employee({ id: 'missing', code: 'CM', sheetRosterMissingAt: '2026-10-13T00:00:00Z' }),
    employee({ id: 'fh1', code: 'C1', team: 'FH1' }),
  ]);
  assert.deepEqual(rows.map(row => row.active), [false, false]);
  assert.ok(rows.every(row => row.team === 'FH3'));
});

test('daftar menjadi kosong apabila Payroll tidak memiliki FH3', () => {
  assert.deepEqual(mobilePayrollRoster([employee({ team: 'FH1' })]), []);
});

test('rename FH3 tidak mengubah ID yang dipakai untuk status boosting', () => {
  const before = mobilePayrollRoster([employee()]);
  const after = mobilePayrollRoster([employee({name:'EKO3 BARU'})]);
  assert.equal(before[0].id, after[0].id);
  assert.equal(after[0].name, 'EKO3 BARU');
});

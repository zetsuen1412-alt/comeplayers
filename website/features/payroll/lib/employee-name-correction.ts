import type { Employee } from "../types/domain";
import { payrollFailure, workspaceKeys, type WorkspaceState } from "./workspace-model";

export type EmployeeNameCorrection = NonNullable<Employee["sheetNameCorrection"]>;
const compact = (value: string) => value.trim().replace(/\s+/g, " ");
const folded = (value: string) => compact(value).toLocaleUpperCase("id-ID");
const reserved = /^(?:NAMA|TOTAL(?:\s.*)?|GOLD ALL GAME|GOLD PAYROLL|SELISIH|FH[123])$/i;

export function normalizeEmployeeName(value: unknown) {
  if (typeof value !== "string") payrollFailure("Nama harus berupa teks.", 400);
  const name = compact(value);
  if (!name || name.length > 160 || reserved.test(name) || /^[=+@\-']/u.test(name)
    || /[\r\n\t\x00-\x1f]/u.test(name)) payrollFailure("Nama karyawan kosong, terlalu panjang, atau mengandung karakter yang tidak aman.", 400);
  return name;
}

export function prepareEmployeeNameCorrection(
  state: WorkspaceState, employeeId: string, originalName: string, desiredName: string,
  actor: {id: string; name: string}, now: string, requestId: string,
) {
  const next = structuredClone(state);
  const employees = (next[workspaceKeys.employees] ?? []) as Employee[];
  const employee = employees.find(row => row.id === employeeId);
  if (!employee) payrollFailure("Karyawan tidak ditemukan; muat ulang halaman.", 404);
  if (employee.sheetRosterMissingAt) payrollFailure("Karyawan tidak ada pada Sheet aktif. Pulihkan baris sumber dahulu.", 409);
  if (employee.name !== originalName) payrollFailure("Nama sudah diubah pengguna lain. Muat ulang sebelum mengedit.", 409);
  if (employee.sheetNameCorrection) payrollFailure("Masih ada koreksi Sheet yang menunggu sinkronisasi.", 409);
  const name = normalizeEmployeeName(desiredName);
  if (folded(name) === folded(employee.name)) {
    if (name === employee.name) payrollFailure("Nama tidak berubah.", 400);
  }
  if (employees.some(other => other.id !== employee.id && other.team === employee.team && !other.sheetRosterMissingAt && folded(other.name) === folded(name))) {
    payrollFailure("Nama karyawan tersebut sudah ada pada FH yang sama.", 409);
  }
  if (employee.sheetRosterSource) {
    const source = employee.sheetRosterSource;
    if (!/^PAYROLL-[123]$/.test(source.sheetName) || !Number.isSafeInteger(source.rowNumber) || source.rowNumber < 3 || !source.spreadsheetId) {
      payrollFailure("Identitas baris Sheet tidak lengkap; jangan mengubah nama sebelum sumber diperiksa.", 409);
    }
    employee.sheetNameCorrection = {requestId, oldName: employee.name, newName: name, requestedAt: now, requestedBy: actor.id};
    return {state: next, pendingSheet: true, employee};
  }
  employee.name = name;
  return {state: next, pendingSheet: false, employee};
}

export function listPendingSheetNameCorrections(state: WorkspaceState, spreadsheetId: string) {
  const employees = (state[workspaceKeys.employees] ?? []) as Employee[];
  return employees.filter(employee => employee.sheetRosterSource?.spreadsheetId === spreadsheetId
    && !employee.sheetRosterMissingAt && employee.sheetNameCorrection)
    .map(employee => ({
      requestId: employee.sheetNameCorrection!.requestId,
      employeeCode: employee.code,
      sheetName: employee.sheetRosterSource!.sheetName,
      rowNumber: employee.sheetRosterSource!.rowNumber,
      oldName: employee.sheetNameCorrection!.oldName,
      newName: employee.sheetNameCorrection!.newName,
    }));
}

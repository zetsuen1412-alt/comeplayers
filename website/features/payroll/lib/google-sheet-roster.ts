import { createHash } from "node:crypto";
import { canonical, workspaceKeys, type WorkspaceState } from "./workspace-model";
import type { Employee, EmployeeWorkStatus } from "../types/domain";

export const payrollSheetTeams = {
  "PAYROLL-1": "FH1", "PAYROLL-2": "FH2", "PAYROLL-3": "FH3",
} as const;

export type PayrollRosterRow = { rowNumber: number; name: string; type?: string };
export type GoogleSheetRosterSnapshot = {
  complete: true;
  sheets: { sheetName: keyof typeof payrollSheetTeams; rows: PayrollRosterRow[] }[];
};

const folded = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
const summaryNames = new Set(["TOTAL", "GOLD ALL GAME", "GOLD PAYROLL", "SELISIH", "FH1", "FH2", "FH3"]);
const workStatuses = new Set<EmployeeWorkStatus>(["NEW", "SHIFT", "FULL", "SAKIT", "IJIN", "RESIGN"]);

export function validateGoogleSheetRoster(value: unknown): GoogleSheetRosterSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Daftar karyawan Sheet tidak valid.");
  const snapshot = value as Partial<GoogleSheetRosterSnapshot>;
  if (snapshot.complete !== true || !Array.isArray(snapshot.sheets) || snapshot.sheets.length !== 3) {
    throw new Error("Daftar karyawan harus lengkap dari PAYROLL-1, PAYROLL-2, dan PAYROLL-3.");
  }
  const sheetNames = new Set<string>();
  for (const sheet of snapshot.sheets) {
    if (!sheet || typeof sheet !== "object" || !Object.hasOwn(payrollSheetTeams, sheet.sheetName) || sheetNames.has(sheet.sheetName)
      || !Array.isArray(sheet.rows) || sheet.rows.length > 1000) throw new Error("Sheet daftar karyawan tidak valid atau duplikat.");
    sheetNames.add(sheet.sheetName);
    const rows = new Set<number>(), names = new Set<string>();
    for (const row of sheet.rows) {
      if (!row || !Number.isSafeInteger(row.rowNumber) || row.rowNumber < 3 || rows.has(row.rowNumber)
        || typeof row.name !== "string" || !folded(row.name) || row.name.length > 160 || summaryNames.has(folded(row.name))
        || (row.type !== undefined && (typeof row.type !== "string" || row.type.length > 80))) throw new Error("Baris daftar karyawan tidak valid.");
      const name = folded(row.name);
      if (names.has(name)) throw new Error("Nama karyawan duplikat dalam divisi Sheet yang sama.");
      rows.add(row.rowNumber); names.add(name);
    }
  }
  return snapshot as GoogleSheetRosterSnapshot;
}

function suffixAlias(name: string, team: Employee["team"]) {
  const suffix = /^FH([123])$/.exec(team)?.[1];
  const key = folded(name);
  return suffix && key.endsWith(suffix) && /\p{L}$/u.test(key.slice(0, -1)) ? key.slice(0, -1) : key;
}

function referencedEmployeeCodes(state: WorkspaceState, employees: Employee[]) {
  const codes = new Set(employees.map(employee => employee.code));
  const referenced = new Set<string>();
  function visit(value: unknown) {
    if (typeof value === "string") { if (codes.has(value)) referenced.add(value); }
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (codes.has(key)) referenced.add(key);
        visit(item);
      }
    }
  }
  for (const [key, value] of Object.entries(state)) if (key !== workspaceKeys.employees) visit(value);
  return referenced;
}

/** Remove only retired identities that have no remaining financial/order references. */
export function pruneUnreferencedSheetRosterEmployees(state: WorkspaceState, spreadsheetId: string) {
  const employees = (state[workspaceKeys.employees] ?? []) as Employee[];
  const referenced = referencedEmployeeCodes(state, employees);
  const kept = employees.filter(employee => !employee.sheetRosterMissingAt
    || employee.sheetRosterSource?.spreadsheetId !== spreadsheetId || referenced.has(employee.code));
  state[workspaceKeys.employees] = kept;
  return employees.length - kept.length;
}

/** Merge names before resolving Mutasi workers; financial records are not rewritten. */
export function mergeGoogleSheetRoster(state: WorkspaceState, snapshot: GoogleSheetRosterSnapshot, spreadsheetId: string, sentAt: string) {
  const employees = structuredClone((state[workspaceKeys.employees] ?? []) as Employee[]);
  const original = [...employees];
  const referenced = referencedEmployeeCodes(state, employees);
  const claimed = new Set<string>();
  let rosterAdded = 0, rosterUpdated = 0, rosterRemoved = 0;
  for (const sheet of snapshot.sheets) {
    const team = payrollSheetTeams[sheet.sheetName];
    for (const row of sheet.rows) {
      const name = row.name.trim().replace(/\s+/g, " ");
      const key = folded(name);
      let matches = original.filter(employee => employee.team === team && folded(employee.name) === key);
      if (!matches.length) {
        const alias = suffixAlias(name, team);
        // A suffix alias is safe only when both the old and current roster names are unique.
        const incomingMatches = sheet.rows.filter(item => suffixAlias(item.name, team) === alias);
        if (incomingMatches.length === 1) matches = original.filter(employee => employee.team === team && suffixAlias(employee.name, team) === alias);
      }
      if (matches.length > 1 || (matches[0] && claimed.has(matches[0].id))) throw new Error("Identitas karyawan Sheet ambigu; data payroll tidak diubah.");
      const type = row.type?.trim() || undefined;
      const source: NonNullable<Employee["sheetRosterSource"]> = { spreadsheetId, sheetName: sheet.sheetName, rowNumber: row.rowNumber, ...(type ? { type } : {}) };
      const status = type && workStatuses.has(folded(type) as EmployeeWorkStatus) ? folded(type) as EmployeeWorkStatus : undefined;
      if (matches.length === 1) {
        const existing = employees.find(employee => employee.id === matches[0].id)!;
        const next = { ...existing, name, sheetRosterSource: source, ...(status ? { workforceStatus: status } : {}) };
        delete next.sheetRosterMissingAt;
        if (canonical(existing) !== canonical(next)) { employees[employees.indexOf(existing)] = next; rosterUpdated++; }
        claimed.add(existing.id);
      } else {
        const identity = `${spreadsheetId}\n${team}\n${key}`;
        const hash = createHash("sha256").update(identity).digest("hex");
        // The letter prefix keeps hash digits from being mistaken for STATUS quantities.
        const code = `EMP-SHEET-A${hash.slice(0, 24).toUpperCase()}`;
        const id = `gsheet-employee:${hash}`;
        if (employees.some(employee => employee.code === code || employee.id === id)) throw new Error("Identitas karyawan Sheet bertabrakan.");
        employees.push({ id, code, name, team, workforceStatus: status ?? "SHIFT", utilization: 0, earningsMinor: 0, sheetRosterSource: source });
        claimed.add(id); rosterAdded++;
      }
    }
  }
  const nextEmployees = employees.filter(employee => {
    if (claimed.has(employee.id) || !/^FH[123]$/.test(employee.team)) return true;
    if (employee.sheetRosterSource?.spreadsheetId === spreadsheetId && !referenced.has(employee.code)) { rosterRemoved++; return false; }
    if (!employee.sheetRosterMissingAt) { employee.sheetRosterMissingAt = sentAt; rosterUpdated++; }
    return true;
  });
  state[workspaceKeys.employees] = nextEmployees;
  return { rosterAdded, rosterUpdated, rosterRemoved };
}

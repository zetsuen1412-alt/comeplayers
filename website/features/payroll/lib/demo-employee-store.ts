"use client";

import { payrollStorage } from "@/features/payroll/lib/workspace-store";

import { useCallback, useEffect, useMemo, useState } from "react";
import { employees as seedEmployees } from "@/features/payroll/lib/demo-data";
import type { Employee, EmployeeWorkStatus } from "@/features/payroll/types/domain";

const STORAGE_KEY = "cp-ofs-demo-employees-v2";
const OLD_STORAGE_KEYS = ["cp-ofs-demo-employees-v1"];
const CHANGE_EVENT = "cp-ofs-demo-employees-changed";

function normalizeStatus(value: unknown): EmployeeWorkStatus {
  const normalized = String(value ?? "").toUpperCase();
  if (["NEW", "SHIFT", "FULL", "SAKIT", "IJIN", "RESIGN"].includes(normalized)) return normalized as EmployeeWorkStatus;
  if (value === "busy") return "FULL";
  if (value === "leave") return "IJIN";
  if (value === "sick") return "SAKIT";
  if (value === "available") return "SHIFT";
  if (value === "training") return "NEW";
  return "SHIFT";
}

function readRows(): Employee[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = payrollStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Employee[];
    if (!Array.isArray(parsed)) return null;
    return parsed.map((row) => ({ ...row, workforceStatus: normalizeStatus(row.workforceStatus) }));
  } catch {
    return null;
  }
}

function writeRows(rows: Employee[]) {
  payrollStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function nextEmployeeCode(rows: Employee[]) {
  const max = rows.reduce((current, row) => {
    const match = /^EMP-(\d+)$/i.exec(row.code);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}

export function useDemoEmployees() {
  const [rows, setRows] = useState<Employee[]>(seedEmployees);

  useEffect(() => {
    for (const key of OLD_STORAGE_KEYS) payrollStorage.removeItem(key);
    const sync = () => setRows(readRows() ?? seedEmployees);
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const employees = useMemo(() => rows, [rows]);

  const addEmployee = useCallback((input: { name: string; team: Employee["team"]; status?: EmployeeWorkStatus }) => {
    const current = readRows() ?? seedEmployees;
    const normalized = input.name.trim();
    if (!normalized) return { ok: false as const, message: "Nama karyawan wajib diisi." };
    if (current.some((row) => row.name.toLocaleLowerCase("id-ID") === normalized.toLocaleLowerCase("id-ID"))) {
      return { ok: false as const, message: "Nama karyawan sudah ada." };
    }

    const row: Employee = {
      id: `emp-user-${Date.now()}`,
      code: nextEmployeeCode(current),
      name: normalized,
      team: input.team,
      workforceStatus: input.status ?? "NEW",
      utilization: 0,
      earningsMinor: 0,
    };
    const next = [...current, row];
    writeRows(next);
    setRows(next);
    return { ok: true as const, row };
  }, []);

  const updateEmployeeStatus = useCallback((employeeId: string, status: EmployeeWorkStatus) => {
    const current = readRows() ?? seedEmployees;
    const next = current.map((row) => row.id === employeeId ? { ...row, workforceStatus: status } : row);
    writeRows(next);
    setRows(next);
  }, []);

  const resetEmployees = useCallback(() => {
    payrollStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    for (const key of OLD_STORAGE_KEYS) payrollStorage.removeItem(key);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setRows([]);
  }, []);

  return { employees, addEmployee, updateEmployeeStatus, resetEmployees };
}

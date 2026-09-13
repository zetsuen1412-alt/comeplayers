"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Employee } from "@/types/domain";

export type KasbonRecord = {
  id: string;
  employeeCode: string;
  employeeName: string;
  team: Employee["team"];
  amountMinor: number;
  remainingMinor: number;
  note: string;
  createdAt: string;
  status: "active" | "paid";
};

const STORAGE_KEY = "cp-ofs-demo-kasbon-v2";
const OLD_STORAGE_KEYS = ["cp-ofs-demo-kasbon-v1"];
const CHANGE_EVENT = "cp-ofs-demo-kasbon-changed";

const seedKasbon: KasbonRecord[] = [];

function readRows(): KasbonRecord[] {
  if (typeof window === "undefined") return seedKasbon;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedKasbon;
    const parsed = JSON.parse(raw) as KasbonRecord[];
    return Array.isArray(parsed) ? parsed : seedKasbon;
  } catch {
    return seedKasbon;
  }
}

function writeRows(rows: KasbonRecord[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDemoAdvances() {
  const [records, setRecords] = useState<KasbonRecord[]>(seedKasbon);

  useEffect(() => {
    for (const key of OLD_STORAGE_KEYS) window.localStorage.removeItem(key);
    const sync = () => setRecords(readRows());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const addKasbon = useCallback((employee: Employee, amountMinor: number, note: string) => {
    const amount = Math.max(0, Math.round(amountMinor));
    if (!amount) return { ok: false as const, message: "Jumlah kasbon harus lebih dari Rp0." };
    const current = readRows();
    const row: KasbonRecord = {
      id: `kasbon-${Date.now()}`,
      employeeCode: employee.code,
      employeeName: employee.name,
      team: employee.team,
      amountMinor: amount,
      remainingMinor: amount,
      note: note.trim(),
      createdAt: new Date().toISOString(),
      status: "active",
    };
    const next = [row, ...current];
    writeRows(next);
    setRecords(next);
    return { ok: true as const, row };
  }, []);

  const markPaid = useCallback((id: string) => {
    const next = readRows().map((row) => row.id === id ? { ...row, remainingMinor: 0, status: "paid" as const } : row);
    writeRows(next);
    setRecords(next);
  }, []);


  const applyRepayment = useCallback((employeeCode: string, amountMinor: number) => {
    let remainingPayment = Math.max(0, Math.round(amountMinor));
    if (!remainingPayment) return;
    const current = readRows();
    const next = current.map((row) => {
      if (row.employeeCode !== employeeCode || row.status !== "active" || remainingPayment <= 0) return row;
      const paid = Math.min(row.remainingMinor, remainingPayment);
      remainingPayment -= paid;
      const remainingMinor = Math.max(0, row.remainingMinor - paid);
      return { ...row, remainingMinor, status: remainingMinor === 0 ? "paid" as const : "active" as const };
    });
    writeRows(next);
    setRecords(next);
  }, []);

  const resetKasbon = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    for (const key of OLD_STORAGE_KEYS) window.localStorage.removeItem(key);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setRecords([]);
  }, []);

  const outstandingByEmployee = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of records) {
      if (row.status !== "active") continue;
      map[row.employeeCode] = (map[row.employeeCode] ?? 0) + row.remainingMinor;
    }
    return map;
  }, [records]);

  return { records, outstandingByEmployee, addKasbon, markPaid, applyRepayment, resetKasbon };
}

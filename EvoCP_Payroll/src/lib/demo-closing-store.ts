"use client";

import { useCallback, useEffect, useState } from "react";

export type DemoClosingRecord = {
  id: string;
  from: string;
  to: string;
  closedAt: string;
  orderRefs: string[];
  totalOrderMinor: number;
  totalPayrollMinor: number;
};

const STORAGE_KEY = "cp-ofs-demo-closing-v1";
const CHANGE_EVENT = "cp-ofs-demo-closing-changed";

function readRows(): DemoClosingRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw) as DemoClosingRecord[];
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => ({
      ...row,
      from: /^\d{4}-\d{2}-\d{2}$/.test(row.from) ? `${row.from}T00:00` : row.from,
      to: /^\d{4}-\d{2}-\d{2}$/.test(row.to) ? `${row.to}T23:59` : row.to,
    }));
  } catch {
    return [];
  }
}

function writeRows(rows: DemoClosingRecord[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDemoClosings() {
  const [closings, setClosings] = useState<DemoClosingRecord[]>([]);

  useEffect(() => {
    const sync = () => setClosings(readRows());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const addClosing = useCallback((input: Omit<DemoClosingRecord, "id" | "closedAt">) => {
    const row: DemoClosingRecord = {
      ...input,
      id: `CLOSE-${Date.now()}`,
      closedAt: new Date().toISOString(),
    };
    const next = [row, ...readRows()];
    writeRows(next);
    setClosings(next);
    return row;
  }, []);

  return { closings, addClosing };
}

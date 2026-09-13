"use client";

import { payrollStorage } from "@/features/payroll/lib/workspace-store";

import { useCallback, useEffect, useMemo, useState } from "react";

export type MutationChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type MutationHistoryEntry = {
  id: string;
  orderId: string;
  orderReference: string;
  editedAt: string;
  editedBy: string;
  reason?: string;
  wasCompleted: boolean;
  wasPayrollClosed: boolean;
  changes: MutationChange[];
};

const STORAGE_KEY = "cp-ofs-demo-mutation-history-v1";
const CHANGE_EVENT = "cp-ofs-demo-mutation-history-changed";

function readRows(): MutationHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = payrollStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MutationHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows: MutationHistoryEntry[]) {
  payrollStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDemoMutationHistory() {
  const [entries, setEntries] = useState<MutationHistoryEntry[]>([]);

  useEffect(() => {
    const sync = () => setEntries(readRows());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const addHistory = useCallback((input: Omit<MutationHistoryEntry, "id" | "editedAt">) => {
    const row: MutationHistoryEntry = {
      ...input,
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      editedAt: new Date().toISOString(),
    };
    const next = [row, ...readRows()];
    writeRows(next);
    setEntries(next);
    return row;
  }, []);

  const countsByOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) map.set(entry.orderId, (map.get(entry.orderId) ?? 0) + 1);
    return map;
  }, [entries]);

  return { entries, addHistory, countsByOrder };
}

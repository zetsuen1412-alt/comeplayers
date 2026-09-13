"use client";

import { payrollStorage } from "@/features/payroll/lib/workspace-store";

import { useCallback, useEffect, useState } from "react";
import { jakartaDateTimeInputToISO } from "@/features/payroll/lib/date";

export type DemoPeriodLock = {
  id: string;
  from: string;
  to: string;
  lockedAt: string;
  lockedBy: string;
};

const STORAGE_KEY = "cp-ofs-demo-period-lock-v1";
const CHANGE_EVENT = "cp-ofs-demo-period-lock-changed";

function readLock(): DemoPeriodLock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = payrollStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoPeriodLock;
    if (!parsed || !parsed.from || !parsed.to || !parsed.lockedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLock(lock: DemoPeriodLock | null) {
  if (lock) payrollStorage.setItem(STORAGE_KEY, JSON.stringify(lock));
  else payrollStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDemoPeriodLock() {
  const [lock, setLock] = useState<DemoPeriodLock | null>(null);

  useEffect(() => {
    const sync = () => setLock(readLock());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const lockPeriod = useCallback((input: { from: string; to: string; lockedBy?: string }) => {
    if (!input.from || !input.to) return { ok: false as const, message: "Tanggal dan jam periode wajib diisi." };
    const fromMs = new Date(jakartaDateTimeInputToISO(input.from)).getTime();
    const toMs = new Date(jakartaDateTimeInputToISO(input.to)).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
      return { ok: false as const, message: "Waktu awal harus sebelum atau sama dengan waktu akhir." };
    }

    const next: DemoPeriodLock = {
      id: `LOCK-${Date.now()}`,
      from: input.from,
      to: input.to,
      lockedAt: new Date().toISOString(),
      lockedBy: input.lockedBy ?? "Admin",
    };
    writeLock(next);
    setLock(next);
    return { ok: true as const, lock: next };
  }, []);

  const unlockPeriod = useCallback(() => {
    writeLock(null);
    setLock(null);
  }, []);

  return { lock, isLocked: Boolean(lock), lockPeriod, unlockPeriod };
}

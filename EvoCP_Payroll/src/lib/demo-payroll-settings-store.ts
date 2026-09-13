"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type EmployeePayrollAdjustment = {
  operationalMinor: 0 | 25_000 | 50_000;
  penaltyMinor: number;
  bonusTipsMinor: number;
};

export type PayrollSettings = {
  defaultSharePercent: number;
  employeeSharePercent: Record<string, number>;
  adjustments: Record<string, EmployeePayrollAdjustment>;
};

const STORAGE_KEY = "cp-ofs-demo-payroll-settings-v3";
const CHANGE_EVENT = "cp-ofs-demo-payroll-settings-changed";

const seed: PayrollSettings = {
  defaultSharePercent: 50,
  employeeSharePercent: {},
  adjustments: {},
};

function clampPercent(value: unknown, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function readSettings(): PayrollSettings {
  if (typeof window === "undefined") return seed;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw) as Partial<PayrollSettings> & { sharePercent?: number };
    const defaultSharePercent = clampPercent(parsed.defaultSharePercent ?? parsed.sharePercent ?? 50);
    return {
      defaultSharePercent,
      employeeSharePercent: parsed.employeeSharePercent ?? {},
      adjustments: parsed.adjustments ?? {},
    };
  } catch {
    return seed;
  }
}

function writeSettings(value: PayrollSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDemoPayrollSettings() {
  const [settings, setSettings] = useState<PayrollSettings>(seed);

  useEffect(() => {
    const sync = () => setSettings(readSettings());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const setDefaultSharePercent = useCallback((value: number) => {
    const current = readSettings();
    const next = { ...current, defaultSharePercent: clampPercent(value) };
    writeSettings(next);
    setSettings(next);
  }, []);

  const setEmployeeSharePercent = useCallback((employeeCode: string, value: number) => {
    const current = readSettings();
    const next = {
      ...current,
      employeeSharePercent: {
        ...current.employeeSharePercent,
        [employeeCode]: clampPercent(value, current.defaultSharePercent),
      },
    };
    writeSettings(next);
    setSettings(next);
  }, []);

  const updateEmployeeAdjustment = useCallback((employeeCode: string, patch: Partial<EmployeePayrollAdjustment>) => {
    const current = readSettings();
    const previous = current.adjustments[employeeCode] ?? { operationalMinor: 0, penaltyMinor: 0, bonusTipsMinor: 0 };
    const nextRow: EmployeePayrollAdjustment = {
      operationalMinor: ([0, 25_000, 50_000].includes(Number(patch.operationalMinor ?? previous.operationalMinor)) ? Number(patch.operationalMinor ?? previous.operationalMinor) : previous.operationalMinor) as EmployeePayrollAdjustment["operationalMinor"],
      penaltyMinor: Math.max(0, Math.round(Number(patch.penaltyMinor ?? previous.penaltyMinor))),
      bonusTipsMinor: Math.max(0, Math.round(Number(patch.bonusTipsMinor ?? previous.bonusTipsMinor))),
    };
    const next = { ...current, adjustments: { ...current.adjustments, [employeeCode]: nextRow } };
    writeSettings(next);
    setSettings(next);
  }, []);


  const clearAdjustmentsForEmployees = useCallback((employeeCodes: string[]) => {
    const current = readSettings();
    const adjustments = { ...current.adjustments };
    for (const code of employeeCodes) delete adjustments[code];
    const next = { ...current, adjustments };
    writeSettings(next);
    setSettings(next);
  }, []);

  const resetPayrollSettings = useCallback(() => {
    writeSettings(seed);
    setSettings(seed);
  }, []);

  return useMemo(() => ({
    settings,
    setDefaultSharePercent,
    setEmployeeSharePercent,
    updateEmployeeAdjustment,
    clearAdjustmentsForEmployees,
    resetPayrollSettings,
  }), [settings, setDefaultSharePercent, setEmployeeSharePercent, updateEmployeeAdjustment, clearAdjustmentsForEmployees, resetPayrollSettings]);
}

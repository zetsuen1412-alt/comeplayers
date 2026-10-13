"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { payrollStorage } from "./workspace-store";
import { workspaceKeys } from "./workspace-model";

export type BoostingPlan = { id: string; gameId: string; name: string; rateMinor: number; active: boolean };
const eventName = "cp-ofs-boosting-catalog-changed";
function read(): BoostingPlan[] {
  try { const rows = JSON.parse(payrollStorage.getItem(workspaceKeys.boostingCatalog) ?? "[]"); return Array.isArray(rows) ? rows : []; }
  catch { return []; }
}
function save(rows: BoostingPlan[]) { payrollStorage.setItem(workspaceKeys.boostingCatalog, JSON.stringify(rows)); window.dispatchEvent(new Event(eventName)); }
export function useBoostingCatalog() {
  const [plans, setPlans] = useState<BoostingPlan[]>([]);
  useEffect(() => {
    const sync = () => setPlans(read());
    sync(); window.addEventListener(eventName, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(eventName, sync); window.removeEventListener("storage", sync); };
  }, []);
  const upsert = useCallback((draft: Omit<BoostingPlan, "id"> & {id?: string}) => {
    const name = draft.name.trim();
    if (!draft.gameId || !name || name.length > 180 || !Number.isSafeInteger(draft.rateMinor) || draft.rateMinor < 0) throw new Error("Isi game, nama paket dan harga rupiah yang valid.");
    const current = read();
    if (current.some(x => x.id !== draft.id && x.gameId === draft.gameId && x.name.toLocaleLowerCase("id-ID") === name.toLocaleLowerCase("id-ID"))) throw new Error("Paket ini sudah ada pada game tersebut.");
    const row: BoostingPlan = {id: draft.id ?? crypto.randomUUID(), gameId: draft.gameId, name, rateMinor: draft.rateMinor, active: draft.active};
    const next = current.some(x => x.id === row.id) ? current.map(x => x.id === row.id ? row : x) : [...current, row];
    save(next); setPlans(next); return row;
  }, []);
  const active = useMemo(() => plans.filter(x => x.active), [plans]);
  return {plans, active, upsert};
}

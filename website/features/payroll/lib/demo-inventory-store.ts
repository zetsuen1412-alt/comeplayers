"use client";

import { payrollStorage } from "@/features/payroll/lib/workspace-store";

import { useCallback, useEffect, useMemo, useState } from "react";
import { inventoryRows as seedRows } from "@/features/payroll/lib/demo-data";
import type { InventoryMovement, InventoryStock, OrderInventoryAllocation } from "@/features/payroll/types/domain";
import { getAvailableStock } from "@/features/payroll/lib/inventory";

const STORAGE_KEY = "cp-ofs-demo-inventory-v4";
const MOVEMENT_STORAGE_KEY = "cp-ofs-demo-inventory-movements-v1";
const OLD_STORAGE_KEYS = ["cp-ofs-demo-inventory-v3", "cp-ofs-demo-inventory-v2", "cp-ofs-demo-inventory-v1"];
const CHANGE_EVENT = "cp-ofs-demo-inventory-changed";

function normalizeRows(rows: Array<Partial<InventoryStock>>): InventoryStock[] {
  return rows.map((row) => ({
    ...(row as InventoryStock),
    itemName: row.stockType === "gold" ? "Gold" : String(row.itemName ?? ""),
    locationName: "",
    sold: Math.max(0, Number(row.sold ?? 0)),
    // Dipertahankan hanya untuk kompatibilitas data lama. UI v0.15.2 tidak lagi memakai modal rata-rata.
    avgCostMinor: Math.max(0, Number(row.avgCostMinor ?? 0)),
  }));
}

function openingMovements(rows: InventoryStock[]): InventoryMovement[] {
  const now = new Date().toISOString();
  const result: InventoryMovement[] = [];
  for (const row of rows) {
    const originalApprox = Math.max(0, Number(row.onHand ?? 0) + Number(row.sold ?? 0));
    if (originalApprox > 0) {
      result.push({
        id: `opening-in-${row.id}`,
        stockId: row.id,
        movementType: "in",
        occurredAt: now,
        stockType: row.stockType,
        game: row.game,
        region: row.region,
        server: row.server,
        itemName: row.itemName,
        locationName: row.locationName,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        team: row.team,
        quantity: originalApprox,
        note: "Saldo awal saat fitur Stok Masuk/Keluar diaktifkan",
      });
    }
    if ((row.sold ?? 0) > 0) {
      result.push({
        id: `opening-out-${row.id}`,
        stockId: row.id,
        movementType: "out",
        occurredAt: now,
        stockType: row.stockType,
        game: row.game,
        region: row.region,
        server: row.server,
        itemName: row.itemName,
        locationName: row.locationName,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        team: row.team,
        quantity: row.sold,
        rateMinor: 0,
        note: "Riwayat terjual sebelum fitur Stok Masuk/Keluar diaktifkan (rate tidak tersedia)",
      });
    }
  }
  return result;
}

function readStoredRows(): InventoryStock[] | null {
  if (typeof window === "undefined") return null;
  try {
    const currentRaw = payrollStorage.getItem(STORAGE_KEY);
    if (currentRaw) {
      const parsed = JSON.parse(currentRaw) as Array<Partial<InventoryStock>>;
      return Array.isArray(parsed) ? normalizeRows(parsed) : null;
    }

    for (const key of OLD_STORAGE_KEYS) {
      const legacyRaw = payrollStorage.getItem(key);
      if (!legacyRaw) continue;
      const parsed = JSON.parse(legacyRaw) as Array<Partial<InventoryStock>>;
      if (!Array.isArray(parsed)) continue;
      const migrated = normalizeRows(parsed);
      payrollStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      if (!payrollStorage.getItem(MOVEMENT_STORAGE_KEY)) {
        payrollStorage.setItem(MOVEMENT_STORAGE_KEY, JSON.stringify(openingMovements(migrated)));
      }
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

function readMovements(rows?: InventoryStock[]): InventoryMovement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = payrollStorage.getItem(MOVEMENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as InventoryMovement[];
      if (Array.isArray(parsed)) return parsed;
    }
    const generated = openingMovements(rows ?? readStoredRows() ?? seedRows);
    if (generated.length) payrollStorage.setItem(MOVEMENT_STORAGE_KEY, JSON.stringify(generated));
    return generated;
  } catch {
    return [];
  }
}

function writeRows(rows: InventoryStock[]) {
  payrollStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function writeMovements(rows: InventoryMovement[]) {
  payrollStorage.setItem(MOVEMENT_STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDemoInventory() {
  const [rows, setRows] = useState<InventoryStock[]>(seedRows);
  const [movementRows, setMovementRows] = useState<InventoryMovement[]>([]);

  useEffect(() => {
    const sync = () => {
      const current = readStoredRows() ?? seedRows;
      setRows(current);
      setMovementRows(readMovements(current));
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const inventory = useMemo(() => rows, [rows]);
  const movements = useMemo(() => movementRows, [movementRows]);

  const addStock = useCallback((row: InventoryStock) => {
    const current = readStoredRows() ?? seedRows;
    const normalized: InventoryStock = { ...row, locationName: "", avgCostMinor: row.avgCostMinor ?? 0, sold: row.sold ?? 0 };
    const next = [normalized, ...current.filter((x) => x.id !== row.id)];
    const currentMovements = readMovements(current);
    const movement: InventoryMovement = {
      id: `stock-in-${Date.now()}-${row.id}`,
      stockId: row.id,
      movementType: "in",
      occurredAt: new Date().toISOString(),
      stockType: row.stockType,
      game: row.game,
      region: row.region,
      server: row.server,
      itemName: row.itemName,
      locationName: row.locationName,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      team: row.team,
      quantity: row.onHand,
      note: "Stok masuk manual",
    };
    writeRows(next);
    writeMovements([movement, ...currentMovements]);
    setRows(next);
    setMovementRows([movement, ...currentMovements]);
  }, []);

  const reserveAllocations = useCallback((allocations: OrderInventoryAllocation[]) => {
    const current = readStoredRows() ?? seedRows;
    const requested = new Map<string, number>();
    for (const allocation of allocations) {
      requested.set(allocation.inventoryStockId, (requested.get(allocation.inventoryStockId) ?? 0) + allocation.quantity);
    }

    for (const [stockId, quantity] of requested) {
      const row = current.find((x) => x.id === stockId);
      if (!row) return { ok: false as const, message: "Stok gudang tidak ditemukan." };
      const available = getAvailableStock(row);
      if (quantity > available) {
        return { ok: false as const, message: `Stok ${row.itemName} milik ${row.employeeName} tidak cukup. Tersedia ${available.toLocaleString("id-ID")}.` };
      }
    }

    const next = current.map((row) => ({ ...row, reserved: row.reserved + (requested.get(row.id) ?? 0) }));
    writeRows(next);
    setRows(next);
    return { ok: true as const };
  }, []);

  const consumeAllocations = useCallback((
    allocations: OrderInventoryAllocation[],
    context?: { orderReference?: string; rateMinor?: number; occurredAt?: string },
  ) => {
    const current = readStoredRows() ?? seedRows;
    const requested = new Map<string, number>();
    for (const allocation of allocations) {
      requested.set(allocation.inventoryStockId, (requested.get(allocation.inventoryStockId) ?? 0) + allocation.quantity);
    }

    const next = current.map((row) => {
      const qty = requested.get(row.id) ?? 0;
      if (!qty) return row;
      return {
        ...row,
        onHand: Math.max(0, row.onHand - qty),
        reserved: Math.max(0, row.reserved - qty),
        sold: Math.max(0, (row.sold ?? 0) + qty),
      };
    });

    const currentMovements = readMovements(current);
    const at = context?.occurredAt ?? new Date().toISOString();
    const outMovements: InventoryMovement[] = allocations.map((allocation, index) => ({
      id: `stock-out-${Date.now()}-${index}-${allocation.inventoryStockId}`,
      stockId: allocation.inventoryStockId,
      movementType: "out",
      occurredAt: at,
      stockType: allocation.stockType,
      game: allocation.game,
      region: allocation.region,
      server: allocation.server,
      itemName: allocation.itemName,
      locationName: allocation.locationName,
      employeeCode: allocation.employeeCode,
      employeeName: allocation.employeeName,
      team: allocation.team,
      quantity: allocation.quantity,
      rateMinor: Math.max(0, Number(context?.rateMinor ?? 0)),
      orderReference: context?.orderReference,
      note: "Stok keluar dari order selesai",
    }));

    writeRows(next);
    writeMovements([...outMovements, ...currentMovements]);
    setRows(next);
    setMovementRows([...outMovements, ...currentMovements]);
  }, []);

  const resetInventory = useCallback(() => {
    payrollStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    payrollStorage.setItem(MOVEMENT_STORAGE_KEY, JSON.stringify([]));
    for (const key of OLD_STORAGE_KEYS) payrollStorage.removeItem(key);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setRows([]);
    setMovementRows([]);
  }, []);

  return { inventory, movements, addStock, reserveAllocations, consumeAllocations, resetInventory };
}

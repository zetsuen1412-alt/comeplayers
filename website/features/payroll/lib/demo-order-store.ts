"use client";

import { getPayrollActor, payrollStorage } from "@/features/payroll/lib/workspace-store";

import { useCallback, useEffect, useMemo, useState } from "react";
import { orders as seedOrders } from "@/features/payroll/lib/demo-data";
import type { Order, InventoryStock, InventoryMovement } from "@/features/payroll/types/domain";
import { activeSheetOrders } from "./sheet-sync-policy";
import { applyBulkMutationAction, type BulkMutationAction, type BulkMutationContext, type BulkMutationTarget } from "./bulk-mutation-actions";
import { planBulkMutationInventory } from "./bulk-mutation-inventory";
import { workspaceKeys } from "./workspace-model";
import { isDailySettlementOrder, replaceDailyWorkStatus } from "./daily-orders";

const STORAGE_KEY = "cp-ofs-demo-user-orders-v3";
const OLD_STORAGE_KEYS = ["cp-ofs-demo-user-orders-v2", "cp-ofs-demo-user-orders-v1"];
const CHANGE_EVENT = "cp-ofs-demo-orders-changed";

function readStoredOrders(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = payrollStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Order[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredOrders(rows: Order[]) {
  payrollStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  for (const key of OLD_STORAGE_KEYS) payrollStorage.removeItem(key);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function mergeOrders(stored: Order[]) {
  const byRef = new Map<string, Order>();
  for (const order of seedOrders) byRef.set(order.externalReference.toLowerCase(), order);
  for (const order of stored) byRef.set(order.externalReference.toLowerCase(), order);
  return [...byRef.values()].sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
}

function planBulkAction(targets: Iterable<string | BulkMutationTarget>, action: BulkMutationAction, context: BulkMutationContext, batchId: string) {
  const orders = mergeOrders(readStoredOrders());
  const actor = getPayrollActor();
  const closings = JSON.parse(payrollStorage.getItem(workspaceKeys.closings) ?? "[]") as { orderRefs?: string[]; ordersSnapshot?: Order[] }[];
  const movements = JSON.parse(payrollStorage.getItem(workspaceKeys.movements) ?? "[]") as InventoryMovement[];
  const trustedContext: BulkMutationContext = { ...context, stockCompletionOrderIds: undefined,
    now: context.now ?? new Date().toISOString(), actorName: actor?.name,
    workspaceLocked: Boolean(JSON.parse(payrollStorage.getItem(workspaceKeys.lock) ?? "null")) || context.workspaceLocked,
    closingReferences: closings.flatMap(closing => [...closing.orderRefs ?? [], ...closing.ordersSnapshot?.map(order => order.externalReference) ?? []]),
    inventoryMovementReferences: movements.flatMap(movement => movement.orderReference ? [movement.orderReference] : []),
  };
  const selected = [...targets];
  let result = applyBulkMutationAction(orders, selected, action, trustedContext);
  if (action !== "complete") return { result };
  const inventoryIds = new Set(result.skipped.filter(skip => skip.code === "inventory").map(skip => skip.orderId));
  if (!inventoryIds.size) return { result };
  const inventory = JSON.parse(payrollStorage.getItem(workspaceKeys.inventory) ?? "[]") as InventoryStock[];
  const byId = new Map(orders.map(order => [order.id, order]));
  const stockOrders = [...inventoryIds].map(id => byId.get(id)!).filter(order => !isDailySettlementOrder(order));
  const inventoryPlan = planBulkMutationInventory(inventory, movements, stockOrders, { now: trustedContext.now!, batchId });
  result = applyBulkMutationAction(orders, selected, action, { ...trustedContext, stockCompletionOrderIds: inventoryPlan.stockCompletionOrderIds });
  result.skipped = result.skipped.map(skip => skip.code === "inventory" && inventoryPlan.skippedOrderReasons[skip.orderId]
    ? { ...skip, reason: inventoryPlan.skippedOrderReasons[skip.orderId] } : skip);
  return { result, inventoryPlan };
}

export function useDemoOrders() {
  const [storedOrders, setStoredOrders] = useState<Order[]>([]);

  useEffect(() => {
    for (const key of OLD_STORAGE_KEYS) payrollStorage.removeItem(key);
    const sync = () => setStoredOrders(readStoredOrders());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const allOrders = useMemo(() => activeSheetOrders(mergeOrders(storedOrders)), [storedOrders]);
  const archivedOrders = useMemo(() => storedOrders.filter(order => order.sheetDeletedAt || order.websiteDeletedAt), [storedOrders]);
  const userOrders = useMemo(() => storedOrders.filter((x) => x.id.startsWith("ord-user-")), [storedOrders]);
  const changedSeedOrders = useMemo(() => storedOrders.filter((x) => !x.sheetDeletedAt && !x.websiteDeletedAt && !x.id.startsWith("ord-user-")), [storedOrders]);

  const addOrder = useCallback((order: Order) => {
    const existing = readStoredOrders();
    if (mergeOrders(existing).some(x => x.id === order.id || x.externalReference.trim().toLowerCase() === order.externalReference.trim().toLowerCase())) throw new Error("Kode order sudah digunakan.");
    const next = [order, ...existing];
    writeStoredOrders(next);
    setStoredOrders(next);
  }, []);

  const updateOrder = useCallback((orderId: string, patch: Partial<Order>) => {
    const current = mergeOrders(readStoredOrders()).find((x) => x.id === orderId);
    if (!current) return false;
    const updated: Order = { ...current, ...patch };
    const existing = readStoredOrders();
    if (mergeOrders(existing).some(x => x.id !== orderId && x.externalReference.trim().toLowerCase() === updated.externalReference.trim().toLowerCase())) throw new Error("Kode order sudah digunakan.");
    const next = [updated, ...existing.filter((x) => x.id !== orderId)];
    writeStoredOrders(next);
    setStoredOrders(next);
    return true;
  }, []);

  const clearUserOrders = useCallback(() => {
    writeStoredOrders([]);
    setStoredOrders([]);
  }, []);

  const applyBulkAction = useCallback((ids: Iterable<string | BulkMutationTarget>, action: BulkMutationAction, context: BulkMutationContext = {}) => {
    if ((action === "complete" || action === "delete") && !getPayrollActor()?.isAdmin) throw new Error("Hanya admin website yang dapat melakukan aksi ini.");
    const { result, inventoryPlan } = planBulkAction(ids, action, context, crypto.randomUUID());
    if (inventoryPlan?.stockCompletionOrderIds.length) {
      payrollStorage.setItem(workspaceKeys.inventory, JSON.stringify(inventoryPlan.inventory));
      payrollStorage.setItem(workspaceKeys.movements, JSON.stringify(inventoryPlan.movements));
      window.dispatchEvent(new Event("cp-ofs-demo-inventory-changed"));
    }
    if (result.changedIds.length) {
      writeStoredOrders(result.orders);
      setStoredOrders(result.orders);
    }
    return result;
  }, []);
  const previewBulkAction = useCallback((ids: Iterable<string | BulkMutationTarget>, action: BulkMutationAction, context: BulkMutationContext = {}) =>
    planBulkAction(ids, action, context, "preview").result, []);

  const withdrawDailyFromPayroll = useCallback((orderId: string, dailyId: string) => {
    if (!getPayrollActor()?.isAdmin) throw new Error("Hanya admin website yang dapat menarik hari dari Gaji.");
    if (JSON.parse(payrollStorage.getItem(workspaceKeys.lock) ?? "null")) throw new Error("Sistem dikunci. Buka kunci sebelum mengedit.");
    const existing = readStoredOrders();
    const current = mergeOrders(existing).find(order => order.id === orderId);
    const day = current?.dailyWork?.find(row => row.id === dailyId);
    if (!current || !isDailySettlementOrder(current) || !day) throw new Error("Hari pekerjaan tidak ditemukan; muat ulang Mutasi.");
    const closings = JSON.parse(payrollStorage.getItem(workspaceKeys.closings) ?? "[]") as { orderRefs?: string[]; ordersSnapshot?: Order[] }[];
    const legacyClosing = !current.dailyWork?.some(row => row.payrollClosedAt || row.payrollPeriodId)
      && closings.some(closing => [...closing.orderRefs ?? [], ...closing.ordersSnapshot?.map(order => order.externalReference) ?? []]
        .some(reference => reference.trim().toLowerCase() === current.externalReference.trim().toLowerCase()));
    if (current.websiteDeletedAt || current.sheetDeletedAt || current.payrollClosedAt || current.payrollPeriodId
      || current.financeStatus === "closed" || day.payrollClosedAt || day.payrollPeriodId || legacyClosing) {
      throw new Error("Hari ini sudah diarsipkan atau masuk Tutup Buku/Gaji dan tidak dapat ditarik.");
    }
    if (day.status !== "verified") return false;
    const updated = { ...current, ...replaceDailyWorkStatus(current, dailyId, "in_progress") };
    const next = [updated, ...existing.filter(order => order.id !== orderId)];
    writeStoredOrders(next);
    setStoredOrders(next);
    return true;
  }, []);

  return {
    allOrders,
    archivedOrders,
    userOrders,
    changedSeedOrders,
    addOrder,
    updateOrder,
    clearUserOrders,
    applyBulkAction,
    previewBulkAction,
    withdrawDailyFromPayroll,
  };
}

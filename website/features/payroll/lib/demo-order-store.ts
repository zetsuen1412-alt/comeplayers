"use client";

import { payrollStorage } from "@/features/payroll/lib/workspace-store";

import { useCallback, useEffect, useMemo, useState } from "react";
import { orders as seedOrders } from "@/features/payroll/lib/demo-data";
import type { Order } from "@/features/payroll/types/domain";

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

  const allOrders = useMemo(() => mergeOrders(storedOrders), [storedOrders]);
  const userOrders = useMemo(() => storedOrders.filter((x) => x.id.startsWith("ord-user-")), [storedOrders]);
  const changedSeedOrders = useMemo(() => storedOrders.filter((x) => !x.id.startsWith("ord-user-")), [storedOrders]);

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

  return {
    allOrders,
    userOrders,
    changedSeedOrders,
    addOrder,
    updateOrder,
    clearUserOrders,
  };
}

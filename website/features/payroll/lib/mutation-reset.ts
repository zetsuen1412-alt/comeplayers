import { payrollFailure, workspaceKeys as K, type WorkspaceState } from './workspace-model';
import type { Order, InventoryMovement } from '../types/domain';

export const mutationResetConfirmation = 'HAPUS SEMUA MUTASI';
export type MutationResetPreview = {
  revision: number; count: number; totalMinor: number; payrollReadyCount: number;
  closedCount: number; stockLinkedCount: number; paymentLinkedCount: number;
  locked: boolean; canReset: boolean; blockers: string[];
};
export type MutationResetReceipt = {
  id: string; removed_count: number; total_minor: number; revision_after: number; created_at: string;
};
export type MutationResetRequest = { expectedRevision: number; expectedCount: number; requestId: string; confirmation: string };
export const isResetId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function mutationResetPreview(state: WorkspaceState, revision: number): MutationResetPreview {
  const orders = (state[K.orders] ?? []) as Order[];
  const closedIds = new Set<string>(), closedRefs = new Set<string>();
  for (const closing of (state[K.closings] ?? []) as Array<{ orderRefs?: string[]; ordersSnapshot?: Order[] }>) {
    for (const ref of closing.orderRefs ?? []) closedRefs.add(ref.trim().toLowerCase());
    for (const order of closing.ordersSnapshot ?? []) closedIds.add(order.id);
  }
  const movementRefs = new Set(((state[K.movements] ?? []) as InventoryMovement[]).map(row => row.orderReference?.trim().toLowerCase()).filter(Boolean));
  const closedCount = orders.filter(o => o.payrollClosedAt || o.payrollPeriodId || o.financeStatus === 'closed' || closedIds.has(o.id) || closedRefs.has(o.externalReference.trim().toLowerCase())).length;
  const stockLinkedCount = orders.filter(o => o.inventoryConsumedAt || o.inventoryAllocations?.length || movementRefs.has(o.externalReference.trim().toLowerCase())).length;
  const paymentLinkedCount = orders.filter(o => o.matchedPaymentMinor > 0 || ['reconciled', 'ready_to_close'].includes(o.financeStatus)).length;
  const locked = Boolean(state[K.lock]);
  const blockers: string[] = [];
  if (locked) blockers.push('Payroll sedang dikunci. Buka kunci periode sebelum menghapus.');
  if (closedCount) blockers.push(`${closedCount} pesanan sudah terkait Tutup Buku. Penghapusan massal diblokir agar riwayat gaji tidak rusak.`);
  if (stockLinkedCount) blockers.push(`${stockLinkedCount} pesanan terkait stok atau pergerakan gudang. Selesaikan koreksi stok sebelum penghapusan massal.`);
  if (paymentLinkedCount) blockers.push(`${paymentLinkedCount} pesanan terkait pencocokan pembayaran. Selesaikan koreksi keuangan sebelum penghapusan massal.`);
  if (!orders.length) blockers.push('Tidak ada mutasi yang perlu dihapus.');
  return { revision, count: orders.length, totalMinor: orders.reduce((sum, o) => sum + o.grossMinor, 0), payrollReadyCount: orders.filter(o => o.operationalStatus === 'verified' && !o.payrollClosedAt).length, closedCount, stockLinkedCount, paymentLinkedCount, locked, canReset: blockers.length === 0, blockers };
}
export function validateMutationResetRequest(value: unknown): MutationResetRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) payrollFailure('Konfirmasi penghapusan tidak valid.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['expectedRevision', 'expectedCount', 'requestId', 'confirmation'].includes(key)) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || !Number.isSafeInteger(body.expectedCount) || Number(body.expectedCount) < 1 || !isResetId(body.requestId) || body.confirmation !== mutationResetConfirmation) payrollFailure('Ketik HAPUS SEMUA MUTASI dan periksa ringkasan terbaru sebelum melanjutkan.');
  return body as MutationResetRequest;
}
/** All removals use the audited admin reset, never an ordinary autosave. */
export function rejectUnauditedOrderRemoval(previous: WorkspaceState, next: WorkspaceState) {
  const ids = new Set(((next[K.orders] ?? []) as Order[]).map(order => order.id));
  if (((previous[K.orders] ?? []) as Order[]).some(order => !ids.has(order.id))) payrollFailure('Penghapusan pesanan harus melalui Hapus Semua Mutasi oleh admin, dengan cadangan dan konfirmasi.', 403);
}

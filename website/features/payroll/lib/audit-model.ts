import { canonical, payrollFailure, workspaceKeys as K, type WorkspaceState } from "./workspace-model";
import { hasAutomaticSheetProtection, isSheetOrder } from "./sheet-sync-policy";
import type { Order } from "../types/domain";

export const auditSections: Record<string,string> = {
  [K.orders]: "Pesanan", [K.employees]: "Karyawan", [K.advances]: "Kasbon", [K.settings]: "Pengaturan gaji",
  [K.inventory]: "Stok / Gudang", [K.movements]: "Pergerakan stok", [K.products]: "Produk / Game",
  [K.history]: "Catatan mutasi", [K.closings]: "Tutup buku", [K.lock]: "Kunci periode",
};
export type AuditChange = { section: string; record: string; field: string; before: string; after: string };
export type AuditRecord = { revision: number; actor_id: string; actor_name: string | null; actor_email: string | null; action: string; changed_keys: string[] | null; created_at: string };
const display = (value: unknown) => value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value);
const recordName = (value: Record<string,unknown>) => String(value.externalReference || value.code || value.name || value.employeeName || value.id || "Pengaturan");
export function diffWorkspace(before: WorkspaceState, after: WorkspaceState): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const key of new Set([...Object.keys(before),...Object.keys(after)])) {
    if (canonical(before[key]) === canonical(after[key])) continue;
    const section = auditSections[key] || key;
    const previous = before[key], next = after[key];
    if (Array.isArray(previous ?? next)) {
      const oldRows = new Map(((previous ?? []) as Record<string,unknown>[]).map(row => [String(row.id),row]));
      const newRows = new Map(((next ?? []) as Record<string,unknown>[]).map(row => [String(row.id),row]));
      for (const id of new Set([...oldRows.keys(),...newRows.keys()])) {
        const a = oldRows.get(id), b = newRows.get(id), record = recordName(b || a || {});
        if (!a || !b) changes.push({ section, record, field: a ? "Dihapus" : "Ditambahkan", before: display(a), after: display(b) });
        else for (const field of new Set([...Object.keys(a),...Object.keys(b)]))
          if (canonical(a[field]) !== canonical(b[field])) changes.push({ section,record,field,before:display(a[field]),after:display(b[field]) });
      }
    } else {
      const a = previous && typeof previous === "object" ? previous as Record<string,unknown> : {};
      const b = next && typeof next === "object" ? next as Record<string,unknown> : {};
      for (const field of new Set([...Object.keys(a),...Object.keys(b)]))
        if (canonical(a[field]) !== canonical(b[field])) changes.push({section,record:"Pengaturan",field,before:display(a[field]),after:display(b[field])});
    }
  }
  return changes;
}
// Keep this set aligned with the source fields merged by google-sheet-sync.
const sheetOwnedOrderFields = [
  "orderNumber", "externalReference", "source", "buyerName", "orderName", "orderType", "task",
  "game", "gameId", "gameName", "service", "process", "employeeCode", "employeeName", "team",
  "quantity", "rateMinor", "grossMinor", "workerAssignments", "expectedPaymentMinor", "orderedAt", "dueAt",
  "importIssues", "importNeedsReview", "importSourceRow",
] as const satisfies readonly (keyof Order)[];

// Client annotations may supply a reason, but never the identity or clock of the editor.
export function attributeWorkspaceEdit(previous: WorkspaceState, next: WorkspaceState, actor: {id:string;name:string;isAdmin?:boolean}, now: string) {
  const result = structuredClone(next);
  const oldOrders = new Map(((previous[K.orders] ?? []) as Order[]).map(order => [order.id, order]));
  const nextOrderIds = new Set(((result[K.orders] ?? []) as Order[]).map(order => order.id));
  for (const old of oldOrders.values()) if (old.websiteDeletedAt && !nextOrderIds.has(old.id)) {
    payrollFailure("Arsip pesanan website tidak dapat dihapus permanen.", 409);
  }
  const closingReferences = new Set(((previous[K.closings] ?? []) as { orderRefs?: string[]; ordersSnapshot?: Order[] }[])
    .flatMap(closing => [...closing.orderRefs ?? [], ...closing.ordersSnapshot?.map(order => order.externalReference) ?? []])
    .map(reference => reference.trim().toLowerCase()));
  const inventoryReferences = new Set(((previous[K.movements] ?? []) as { orderReference?: string }[])
    .flatMap(movement => movement.orderReference ? [movement.orderReference.trim().toLowerCase()] : []));
  for (const order of (result[K.orders] ?? []) as Order[]) {
    const old = oldOrders.get(order.id);
    const archiveChanged = Boolean(old?.websiteDeletedAt) !== Boolean(order.websiteDeletedAt);
    if (archiveChanged) {
      if (!actor.isAdmin || !old) payrollFailure("Hanya admin website yang dapat menghapus atau memulihkan pesanan.", 403);
      if (order.websiteDeletedAt) {
        const reference = old.externalReference.trim().toLowerCase();
        if (hasAutomaticSheetProtection(old) || ["verified", "reconciled", "ready_to_close"].includes(old.financeStatus)
          || closingReferences.has(reference) || inventoryReferences.has(reference)) {
          payrollFailure("Pesanan terkait verifikasi, Gaji/Closing, pembayaran, atau stok tidak dapat dihapus.", 409);
        }
        const preserved = { ...order, websiteDeletedAt: old.websiteDeletedAt, websiteDeletedBy: old.websiteDeletedBy,
          sheetSyncLocked: old.sheetSyncLocked };
        if (canonical(preserved) !== canonical({ ...old, websiteDeletedAt: old.websiteDeletedAt,
          websiteDeletedBy: old.websiteDeletedBy, sheetSyncLocked: old.sheetSyncLocked })) {
          payrollFailure("Penghapusan harus mempertahankan seluruh rincian pesanan.", 409);
        }
        order.websiteDeletedAt = now;
        order.websiteDeletedBy = actor.name;
        if (isSheetOrder(old)) order.sheetSyncLocked = true;
      } else {
        const preserved = { ...order, websiteDeletedAt: old.websiteDeletedAt, websiteDeletedBy: old.websiteDeletedBy };
        if (canonical(preserved) !== canonical({ ...old, websiteDeletedBy: old.websiteDeletedBy })) payrollFailure("Pemulihan harus mempertahankan seluruh rincian pesanan.", 409);
        delete order.websiteDeletedAt;
        delete order.websiteDeletedBy;
      }
    } else {
      if (order.websiteDeletedAt !== old?.websiteDeletedAt || order.websiteDeletedBy !== old?.websiteDeletedBy) {
        payrollFailure("Metadata arsip website tidak boleh diubah langsung.", 403);
      }
      if (old?.websiteDeletedAt && canonical(old) !== canonical(order)) payrollFailure("Pulihkan pesanan dari arsip sebelum mengubahnya.", 409);
    }
    if (old && isSheetOrder(old) && (order.externalReference !== old.externalReference || order.orderNumber !== old.orderNumber)) {
      payrollFailure("KODE pesanan dari Sheet harus diubah di Sheet.", 409);
    }
    if (!actor.isAdmin && (((order.operationalStatus === "verified" || old?.operationalStatus === "verified") && order.operationalStatus !== old?.operationalStatus)
      || ((order.financeStatus === "closed" || old?.financeStatus === "closed") && order.financeStatus !== old?.financeStatus)
      || ["verifiedAt", "payrollClosedAt", "payrollPeriodId"].some(key => order[key as keyof Order] !== old?.[key as keyof Order]))) {
      payrollFailure("Hanya admin website yang dapat memverifikasi pesanan atau melakukan Closing.", 403);
    }
    if (Boolean(old?.sheetSyncLocked) !== Boolean(order.sheetSyncLocked)) {
      if (!actor.isAdmin || !old || !order.id.startsWith("gsheet:")) payrollFailure("Hanya admin website yang dapat mengunci sinkronisasi pesanan spreadsheet.", 403);
      order.sheetSyncLockedAt = now;
      order.sheetSyncLockedBy = actor.name;
      order.sheetSyncRefreshRequested = !order.sheetSyncLocked;
    } else {
      for (const key of ["sheetSyncLockedAt", "sheetSyncLockedBy", "sheetSyncRefreshRequested"] as const) {
        if (canonical(order[key]) !== canonical(old?.[key])) payrollFailure("Metadata kunci sinkronisasi tidak boleh diubah langsung.", 403);
      }
    }
    if (order.sheetDeletedAt !== old?.sheetDeletedAt) {
      if (!actor.isAdmin || !old?.sheetDeletedAt || order.sheetDeletedAt || !order.sheetSyncLocked) payrollFailure("Arsip spreadsheet hanya dapat dipulihkan admin dengan mengunci pesanannya.", 403);
    }
    // Request an acknowledged source replay after a website override. The source
    // row hash may be unchanged, so presence reconciliation clears that cached hash.
    // Validate client metadata above before stamping this server-owned flag.
    if (old && isSheetOrder(old) && !old.sheetSyncLocked && !order.sheetSyncLocked
      && !old.sheetDeletedAt && !order.sheetDeletedAt
      && !hasAutomaticSheetProtection(order)
      && !closingReferences.has(old.externalReference.trim().toLowerCase())
      && (hasAutomaticSheetProtection(old)
        || sheetOwnedOrderFields.some(field => canonical(old[field]) !== canonical(order[field])))) {
      order.sheetSyncRefreshRequested = true;
    }
  }
  const oldRows = (previous[K.history] ?? []) as Record<string,unknown>[];
  const rows = (result[K.history] ?? []) as Record<string,unknown>[];
  const oldById = new Map(oldRows.map(row => [row.id,row]));
  for (const old of oldRows) if (canonical(old) !== canonical(rows.find(row => row.id === old.id)))
    payrollFailure("History yang sudah tersimpan tidak dapat diubah atau dihapus.",409);
  if (result[K.history]) result[K.history] = rows.map(row => oldById.has(row.id) ? row : {...row,editedBy:actor.name,actorId:actor.id,editedAt:now});
  if (result[K.lock] && canonical(previous[K.lock]) !== canonical(result[K.lock]))
    result[K.lock] = {...result[K.lock] as object,lockedBy:actor.name,actorId:actor.id,lockedAt:now};
  return result;
}

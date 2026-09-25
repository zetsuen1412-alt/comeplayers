import { canonical, payrollFailure, workspaceKeys as K, type WorkspaceState } from "./workspace-model";
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
// Client annotations may supply a reason, but never the identity or clock of the editor.
export function attributeWorkspaceEdit(previous: WorkspaceState, next: WorkspaceState, actor: {id:string;name:string;isAdmin?:boolean}, now: string) {
  const result = structuredClone(next);
  const oldOrders = new Map(((previous[K.orders] ?? []) as Order[]).map(order => [order.id, order]));
  for (const order of (result[K.orders] ?? []) as Order[]) {
    const old = oldOrders.get(order.id);
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

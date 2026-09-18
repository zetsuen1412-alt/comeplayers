export const mutationColumns = [
  { id: 'date', label: 'Hari & tanggal', width: 250, min: 210, max: 640 },
  { id: 'code', label: 'Kode', width: 135, min: 100, max: 640 },
  { id: 'source', label: 'Sumber', width: 155, min: 130, max: 640 },
  { id: 'type', label: 'Jenis', width: 120, min: 110, max: 400 },
  { id: 'buyer', label: 'Pembeli', width: 210, min: 150, max: 900 },
  { id: 'order', label: 'Nama pesanan', width: 320, min: 190, max: 1200 },
  { id: 'workers', label: 'Karyawan', width: 330, min: 230, max: 1000 },
  { id: 'game', label: 'Gim', width: 180, min: 110, max: 900 },
  { id: 'region', label: 'Wilayah', width: 160, min: 120, max: 640 },
  { id: 'server', label: 'Server', width: 190, min: 120, max: 900 },
  { id: 'quantity', label: 'Jumlah', width: 140, min: 110, max: 640 },
  { id: 'total', label: 'Total', width: 190, min: 180, max: 640 },
  { id: 'status', label: 'Status', width: 250, min: 240, max: 640 },
  { id: 'actions', label: 'Aksi', width: 430, min: 330, max: 1200 },
] as const;
export type MutationColumnId = typeof mutationColumns[number]['id'];
export type MutationColumnWidths = Record<MutationColumnId, number>;
export const mutationWidthsStorageKey = 'cp-payroll-mutations-column-widths-v1';
export function defaultMutationWidths(): MutationColumnWidths {
  return Object.fromEntries(mutationColumns.map(column => [column.id, column.width])) as MutationColumnWidths;
}
export function clampMutationWidth(id: MutationColumnId, value: number): number {
  const column = mutationColumns.find(item => item.id === id)!;
  return Number.isFinite(value) ? Math.min(column.max, Math.max(column.min, Math.round(value))) : column.width;
}
export function readMutationWidths(raw: string | null): MutationColumnWidths {
  const widths = defaultMutationWidths();
  try {
    const parsed: unknown = JSON.parse(raw ?? 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return widths;
    const data = parsed as { version?: unknown; widths?: unknown };
    if (data.version !== 1 || !data.widths || typeof data.widths !== 'object' || Array.isArray(data.widths)) return widths;
    for (const column of mutationColumns) {
      const value = (data.widths as Record<string, unknown>)[column.id];
      if (typeof value === 'number' && Number.isFinite(value)) widths[column.id] = clampMutationWidth(column.id, value);
    }
  } catch { /* Storage can be absent, unavailable, or from an older version. */ }
  return widths;
}

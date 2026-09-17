/** Pinned, reviewed one-time workbook import. No employee identity is inferred here. */
export const mutasiFhManifest = {
  batchId: 'mutasi-fh-c1b7e68321ee1040',
  fileName: 'ComePlayers-MUTASI-FH-2026-V2.cpimport',
  packetSha256: '2aee03d714b63afc37d332fc71375f09ec51170df95655133b924100b8f6f39b',
  payloadSha256: '762b1d97ca171bf221a7c32f74ec8d63b0b0bf7b7da457513419e7f384231ebb',
  sourceSha256: 'c1b7e68321ee1040cc103ad85578b1fd5efab121c8b81eb950a1346b68f36b4b',
  mappingVersion: 2,
  orderCount: 4404,
  sourceRowCount: 4854,
  grossMinor: 1575401476,
  maxPacketBytes: 600000,
  maxPayloadBytes: 6000000,
} as const;

export type MutasiFhSourceRow = {
  row: number;
  kind: string;
  values: Record<string, unknown>;
  issues?: string[];
  boosterBlack?: boolean;
  importReference?: string;
};

export function sourceText(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/** The workbook's STATUS is not the application's operationalStatus. */
export function getMutasiFhTitles(row: MutasiFhSourceRow, fallback = '') {
  const originalName = sourceText(row.values.E);
  const booster = sourceText(row.values.F);
  const status = sourceText(row.values.H);
  const black = row.boosterBlack === true || booster.toUpperCase() === 'HITAM';
  const usesStatus = Boolean(booster && !black && status);
  return {
    orderName: usesStatus ? status : originalName || fallback,
    originalName,
    usesStatus,
    usesWorkerList: black,
  };
}

export function validateMutasiFhTitles(
  orders: Array<{ sourceRow?: number; orderName?: string; service: string }>,
  sourceRows: MutasiFhSourceRow[],
) {
  const rows = new Map<number, MutasiFhSourceRow>();
  for (const row of sourceRows) {
    if (!Number.isSafeInteger(row.row) || rows.has(row.row)) throw new Error('Baris sumber kosong atau duplikat.');
    rows.set(row.row, row);
  }
  for (const order of orders) {
    const row = rows.get(order.sourceRow ?? -1);
    if (!row) throw new Error('Asal baris pesanan tidak ditemukan.');
    const titles = getMutasiFhTitles(row, order.orderName);
    if (titles.usesStatus && (order.orderName !== titles.orderName || (titles.originalName && order.service !== titles.originalName))) {
      throw new Error(`Pemetaan STATUS / Nama order baris ${row.row} belum sesuai versi 2.`);
    }
    if (titles.usesWorkerList && titles.originalName && order.orderName !== titles.originalName) {
      throw new Error(`Daftar karyawan baris ${row.row} tidak boleh dijadikan Nama order.`);
    }
  }
}

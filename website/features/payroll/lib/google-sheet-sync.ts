import { manualOrderCode } from "@/features/payroll/lib/manual-order-code";
import { hasAutomaticSheetProtection } from "./sheet-sync-policy";
import { canonical, workspaceKeys, type WorkspaceState } from "@/features/payroll/lib/workspace-model";
import type { Employee, Order, OrderIssue, OrderWorkerAssignment, ProductGame } from "@/features/payroll/types/domain";

export type GoogleSheetSyncRow = {
  rowNumber: number;
  values: unknown[];
  display?: string[];
  boosterBlack?: boolean;
  /** Duplicate KODE elsewhere in the sheet, including rows outside an edit range. */
  duplicateCode?: boolean;
};

export type GoogleSheetSyncPayload = {
  version: 1;
  syncMode?: "incremental" | "reconcile";
  spreadsheetId: string;
  spreadsheetName?: string;
  sheetName: string;
  headerRow?: number;
  headers: string[];
  sentAt: string;
  actor?: { id?: string; email?: string };
  rows: GoogleSheetSyncRow[];
  /** Complete KODE inventory, sent separately after all row batches succeed. */
  presence?: { complete: true; startRow: number; references: string[] };
};

export type GoogleSheetSyncIssue = {
  rowNumber: number;
  code?: string;
  message: string;
};

export type GoogleSheetSyncMergeResult = {
  state: WorkspaceState;
  added: number;
  updated: number;
  archived: number;
  restored: number;
  refreshReferences: string[];
  unchanged: number;
  skippedProtected: number;
  skippedConflicts: number;
  skippedInvalid: number;
  issues: GoogleSheetSyncIssue[];
  rowResults: { rowNumber: number; status: "added" | "updated" | "unchanged" | "skippedProtected" | "skippedConflicts" | "skippedInvalid" }[];
};

const MAX_ROWS = 10_000;
const SHEET_ORDER_PREFIX = "gsheet:";
const normalize = (value: unknown) => String(value ?? "").trim();
const folded = (value: unknown) => normalize(value).replace(/\s+/g, " ").toUpperCase();
const normalizedHeader = (value: unknown) => folded(value).replace(/[^A-Z0-9]/g, "");
const jsonClean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function safeIdPart(value: string, maximum: number) {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return (normalized || "sheet").slice(0, maximum);
}

export function sheetOrderId(payload: Pick<GoogleSheetSyncPayload, "spreadsheetId" | "sheetName">, rowNumber: number) {
  return `${SHEET_ORDER_PREFIX}${safeIdPart(payload.spreadsheetId, 72)}:${safeIdPart(payload.sheetName, 48)}:${rowNumber}`;
}

export function isGoogleSheetOrder(order: Pick<Order, "id">) {
  return order.id.startsWith(SHEET_ORDER_PREFIX);
}

function sheetSourcePrefix(payload: GoogleSheetSyncPayload) {
  return sheetOrderId(payload, 0).slice(0, -1);
}

function headerIndex(headers: string[], names: string[], fallback: number) {
  const wanted = new Set(names.map(normalizedHeader));
  const index = headers.findIndex(header => wanted.has(normalizedHeader(header)));
  return index >= 0 ? index : fallback;
}

function rawAt(row: GoogleSheetSyncRow, index: number) {
  return index >= 0 && index < row.values.length ? row.values[index] : undefined;
}

function displayAt(row: GoogleSheetSyncRow, index: number) {
  if (index < 0) return "";
  const display = row.display?.[index];
  return display == null ? normalize(rawAt(row, index)) : String(display).trim();
}

function parseIdr(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const source = normalize(value);
  if (!source) return null;
  const negative = /^\s*-/.test(source);
  const digits = source.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const result = Number(digits) * (negative ? -1 : 1);
  return Number.isSafeInteger(result) ? result : null;
}

function parseUnit(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const source = normalize(value).replace(/\s+/g, "");
  if (!source) return null;
  const match = source.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const result = Number(match[0].replace(",", "."));
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function parseSheetOrderedAt(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const source = normalize(value);
  if (!source) return null;
  const local = source.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (local) {
    const [, day, month, year, hour, minute, second = "00"] = local;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second}+07:00`;
    const timestamp = Date.parse(iso);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }
  const timestamp = Date.parse(source);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function mapTeam(value: unknown): Employee["team"] | undefined {
  const compact = folded(value).replace(/\s+/g, "");
  const aliases: Record<string, Employee["team"]> = {
    "1": "FH1", FH1: "FH1", "2": "FH2", FH2: "FH2", "3": "FH3", FH3: "FH3",
    ADMIN: "ADMIN", BANDAR: "BANDAR",
  };
  return aliases[compact];
}

function employeeLookup(employees: Employee[]) {
  const map = new Map<string, Employee>();
  for (const employee of employees) {
    map.set(folded(employee.code), employee);
    map.set(folded(employee.name), employee);
  }
  return map;
}

function gameLookup(games: ProductGame[]) {
  const map = new Map<string, ProductGame>();
  for (const game of games) {
    for (const value of [game.code, game.name, ...(game.aliases ?? [])]) {
      const key = folded(value);
      if (key && !map.has(key)) map.set(key, game);
    }
  }
  return map;
}

function workerAssignment(employee: Employee, process: string, quantity: number, rowNumber: number, index: number): OrderWorkerAssignment {
  return {
    id: `gsheet-worker:${rowNumber}:${employee.code}:${index}`,
    employeeCode: employee.code,
    employeeName: employee.name,
    team: employee.team,
    process: process || "LAINNYA",
    quantity: Math.max(0, quantity),
  };
}

function parseWorkerList(status: string, process: string, employees: Employee[], rowNumber: number) {
  const lookup = employeeLookup(employees);
  const assignments: OrderWorkerAssignment[] = [];
  const missing: string[] = [];
  const quantityPattern = /(\d+(?:[.,]\d+)?)\s*(?:K|M|B|G)?/gi;
  let cursor = 0;
  let assignmentIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = quantityPattern.exec(status)) !== null) {
    const rawName = status
      .slice(cursor, match.index)
      .replace(/^[\s,;|/+&\-:=>]+|[\s,;|/+&\-:=>]+$/g, "")
      .trim();
    cursor = quantityPattern.lastIndex;
    if (!rawName) continue;

    const employee = lookup.get(folded(rawName));
    const quantity = parseUnit(match[1]);
    if (!employee || quantity == null) {
      missing.push(`${rawName} ${match[0].trim()}`);
      continue;
    }
    assignments.push(workerAssignment(employee, process, quantity, rowNumber, assignmentIndex++));
  }

  const remainder = status
    .slice(cursor)
    .replace(/^[\s,;|/+&\-:=>]+|[\s,;|/+&\-:=>]+$/g, "")
    .trim();
  if (remainder) missing.push(remainder);
  return { assignments, missing };
}

function uniqueIssues(issues: OrderIssue[]) {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.code}:${issue.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function importIssue(code: string, title: string, description: string): OrderIssue {
  return { code, title, description, severity: "warning", source: "import" };
}

type ColumnMap = ReturnType<typeof columnsFor>;
function columnsFor(headers: string[]) {
  return {
    orderedAt: headerIndex(headers, ["TANGGAL", "TANGGAL JAM", "DATE", "DATETIME", "WAKTU"], 0),
    code: headerIndex(headers, ["KODE", "CODE", "ORDER CODE"], 1),
    source: headerIndex(headers, ["GATE", "SUMBER", "SOURCE"], 2),
    buyer: headerIndex(headers, ["NAMA BUYER", "BUYER", "BUYER NAME"], 3),
    orderName: headerIndex(headers, ["NAMA ORDER", "ORDER NAME", "PESANAN"], 4),
    booster: headerIndex(headers, ["BOOSTER", "KARYAWAN", "PEKERJA"], 5),
    team: headerIndex(headers, ["FH", "TEAM", "BAGIAN"], 6),
    status: headerIndex(headers, ["STATUS"], 7),
    game: headerIndex(headers, ["GAME", "GIM", "PERMAINAN"], 8),
    process: headerIndex(headers, ["PROSES", "PROCESS", "METODE"], 9),
    quantity: headerIndex(headers, ["JUMLAH", "QTY", "QUANTITY"], 10),
    rate: headerIndex(headers, ["RATE", "HARGA", "PRICE"], 11),
    total: headerIndex(headers, ["TOTAL", "TOTAL HARGA", "GROSS"], 12),
    task: headerIndex(headers, ["TASK", "TUGAS", "KETERANGAN TASK"], -1),
  };
}

function parseIncomingOrder(input: {
  payload: GoogleSheetSyncPayload;
  row: GoogleSheetSyncRow;
  columns: ColumnMap;
  employees: Employee[];
  games: ProductGame[];
}): { order?: Order; issue?: GoogleSheetSyncIssue } {
  const { payload, row, columns, employees, games } = input;
  const referenceSource = displayAt(row, columns.code) || normalize(rawAt(row, columns.code));
  if (!referenceSource) return { issue: { rowNumber: row.rowNumber, message: "KODE kosong; baris dilewati." } };
  let reference: string;
  try { reference = manualOrderCode(referenceSource); }
  catch (error) { return { issue: { rowNumber: row.rowNumber, code: referenceSource, message: error instanceof Error ? error.message : "KODE tidak valid." } }; }

  const orderedAt = parseSheetOrderedAt(displayAt(row, columns.orderedAt) || rawAt(row, columns.orderedAt));
  if (!orderedAt) return { issue: { rowNumber: row.rowNumber, code: reference, message: "Tanggal/jam tidak dapat dibaca." } };

  const source = displayAt(row, columns.source) || "Spreadsheet";
  const buyerName = displayAt(row, columns.buyer);
  const orderName = displayAt(row, columns.orderName) || reference;
  const task = displayAt(row, columns.task);
  const booster = displayAt(row, columns.booster);
  const status = displayAt(row, columns.status);
  const gameText = displayAt(row, columns.game);
  const process = displayAt(row, columns.process) || "LAINNYA";
  const quantity = parseUnit(rawAt(row, columns.quantity)) ?? parseUnit(displayAt(row, columns.quantity)) ?? 1;
  const rateMinor = parseIdr(rawAt(row, columns.rate)) ?? parseIdr(displayAt(row, columns.rate));
  const totalFromSheet = parseIdr(rawAt(row, columns.total)) ?? parseIdr(displayAt(row, columns.total));
  const grossMinor = totalFromSheet ?? (rateMinor == null ? 0 : Math.max(0, Math.round(rateMinor * quantity)));
  const issues: OrderIssue[] = [];

  if (grossMinor <= 0) issues.push(importIssue("sheet_amount_review", "Nilai pesanan perlu diperiksa", "TOTAL/RATE pada spreadsheet kosong atau bernilai 0."));

  const gamesByName = gameLookup(games);
  const game = gamesByName.get(folded(gameText));
  if (gameText && !game) issues.push(importIssue("sheet_game_unmatched", "Game belum cocok", `Game “${gameText}” belum ditemukan di Produk / Game.`));

  const employeesByName = employeeLookup(employees);
  let assignments: OrderWorkerAssignment[] = [];
  if (row.boosterBlack === true) {
    const parsed = parseWorkerList(status, process, employees, row.rowNumber);
    assignments = parsed.assignments;
    if (parsed.missing.length) issues.push(importIssue("sheet_workers_review", "Daftar karyawan perlu diperiksa", `Belum cocok: ${parsed.missing.join(", ")}`));
    if (status && !assignments.length) issues.push(importIssue("sheet_workers_empty", "Karyawan belum ditemukan", "BOOSTER hitam tetapi STATUS belum dapat dipetakan ke karyawan payroll."));
  } else if (booster && !mapTeam(booster)) {
    const employee = employeesByName.get(folded(booster));
    if (employee) assignments = [workerAssignment(employee, process, quantity, row.rowNumber, 0)];
    else issues.push(importIssue("sheet_booster_unmatched", "Booster belum cocok", `BOOSTER “${booster}” belum ditemukan di daftar karyawan.`));
  }

  const sheetTeam = mapTeam(displayAt(row, columns.team)) ?? mapTeam(booster);
  const firstWorker = assignments[0];
  const finalIssues = uniqueIssues(issues);
  // KODE is the identity; physical row numbers can move after sorts/deletions.
  // Legacy row-based IDs are preserved when an existing KODE is matched.
  const id = `${sheetSourcePrefix(payload)}ref:${encodeURIComponent(reference.toLowerCase())}`;
  const gameName = game?.name || gameText || "—";

  return {
    order: jsonClean({
      id,
      orderNumber: reference,
      externalReference: reference,
      source,
      buyerName: buyerName || undefined,
      orderName,
      task: task || undefined,
      game: game?.code || gameText || "—",
      gameId: game?.id,
      gameName,
      service: orderName,
      process,
      employeeCode: firstWorker?.employeeCode,
      employeeName: firstWorker?.employeeName,
      team: sheetTeam ?? firstWorker?.team,
      quantity,
      rateMinor: rateMinor ?? undefined,
      grossMinor,
      workerAssignments: assignments,
      operationalStatus: "draft",
      financeStatus: "pending",
      expectedPaymentMinor: grossMinor,
      matchedPaymentMinor: 0,
      orderedAt,
      dueAt: orderedAt,
      importIssues: finalIssues.length ? finalIssues : undefined,
      importNeedsReview: finalIssues.length > 0,
      importSourceRow: row.rowNumber,
    }),
  };
}

function protectedFromSheet(order: Order, closingReferences: Set<string>) {
  return Boolean(order.sheetSyncLocked || hasAutomaticSheetProtection(order)
    || closingReferences.has(order.externalReference.trim().toLowerCase()));
}

function mergeSheetOwnedFields(existing: Order, incoming: Order): Order {
  return jsonClean({
    ...existing,
    sheetDeletedAt: undefined,
    sheetSyncRefreshRequested: undefined,
    orderNumber: incoming.orderNumber,
    externalReference: incoming.externalReference,
    source: incoming.source,
    buyerName: incoming.buyerName,
    orderName: incoming.orderName,
    task: incoming.task,
    game: incoming.game,
    gameId: incoming.gameId,
    gameName: incoming.gameName,
    service: incoming.service,
    process: incoming.process,
    employeeCode: incoming.employeeCode,
    employeeName: incoming.employeeName,
    team: incoming.team,
    quantity: incoming.quantity,
    rateMinor: incoming.rateMinor,
    grossMinor: incoming.grossMinor,
    workerAssignments: incoming.workerAssignments,
    expectedPaymentMinor: incoming.grossMinor,
    orderedAt: incoming.orderedAt,
    importIssues: incoming.importIssues,
    importNeedsReview: incoming.importNeedsReview,
    importSourceRow: incoming.importSourceRow,
  });
}

export function validateGoogleSheetSyncPayload(value: unknown): GoogleSheetSyncPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Payload Google Sheets tidak valid.");
  const payload = value as Partial<GoogleSheetSyncPayload>;
  if (payload.version !== 1) throw new Error("Versi sinkronisasi Google Sheets tidak didukung.");
  if (payload.syncMode !== undefined && payload.syncMode !== "incremental" && payload.syncMode !== "reconcile") throw new Error("Mode sinkronisasi tidak valid.");
  if (!normalize(payload.spreadsheetId) || normalize(payload.spreadsheetId).length > 200) throw new Error("Spreadsheet ID tidak valid.");
  if (!normalize(payload.sheetName) || normalize(payload.sheetName).length > 120) throw new Error("Nama sheet tidak valid.");
  if (!Array.isArray(payload.headers) || payload.headers.length < 2 || payload.headers.length > 64) throw new Error("Header spreadsheet tidak valid.");
  if (!Array.isArray(payload.rows) || payload.rows.length > MAX_ROWS) throw new Error("Jumlah baris sinkronisasi terlalu besar.");
  if (!Number.isFinite(Date.parse(normalize(payload.sentAt)))) throw new Error("Waktu sinkronisasi tidak valid.");
  if (payload.presence !== undefined) {
    const presence = payload.presence;
    if (payload.syncMode !== "reconcile" || payload.rows.length || presence.complete !== true
      || !Number.isSafeInteger(presence.startRow) || presence.startRow < 2
      || !Array.isArray(presence.references) || presence.references.length > 50000
      || presence.references.some(ref => typeof ref !== "string" || !ref.trim() || ref.length > 200)) {
      throw new Error("Daftar KODE lengkap tidak valid; penghapusan tidak diproses.");
    }
  }
  const rowNumbers = new Set<number>();
  for (const row of payload.rows) {
    if (!row || !Number.isSafeInteger(row.rowNumber) || row.rowNumber < 1 || !Array.isArray(row.values) || row.values.length > 64) throw new Error("Baris sinkronisasi tidak valid.");
    if (row.display !== undefined && (!Array.isArray(row.display) || row.display.length > 64)) throw new Error("Tampilan baris sinkronisasi tidak valid.");
    if (rowNumbers.has(row.rowNumber)) throw new Error("Nomor baris sinkronisasi duplikat.");
    rowNumbers.add(row.rowNumber);
    if (row.boosterBlack !== undefined && typeof row.boosterBlack !== "boolean") throw new Error("Warna BOOSTER tidak valid.");
    if (row.duplicateCode !== undefined && typeof row.duplicateCode !== "boolean") throw new Error("Penanda KODE duplikat tidak valid.");
  }
  return payload as GoogleSheetSyncPayload;
}

export function mergeGoogleSheetPayroll(current: WorkspaceState, rawPayload: unknown): GoogleSheetSyncMergeResult {
  const payload = validateGoogleSheetSyncPayload(rawPayload);
  const state = structuredClone(current);
  const orders = [...((state[workspaceKeys.orders] ?? []) as Order[])];
  const employees = (state[workspaceKeys.employees] ?? []) as Employee[];
  const games = (state[workspaceKeys.products] ?? []) as ProductGame[];
  const columns = columnsFor(payload.headers);
  const issues: GoogleSheetSyncIssue[] = [];
  const rowResults: GoogleSheetSyncMergeResult["rowResults"] = [];
  const referenceCounts = new Map<string, number>();
  for (const row of payload.rows) {
    const key = (displayAt(row, columns.code) || normalize(rawAt(row, columns.code))).toLowerCase();
    referenceCounts.set(key, (referenceCounts.get(key) ?? 0) + 1);
  }
  const closingReferences = new Set(
    ((state[workspaceKeys.closings] ?? []) as { orderRefs?: string[] }[])
      .flatMap(closing => closing.orderRefs ?? []).map(ref => ref.trim().toLowerCase()),
  );
  let added = 0, updated = 0, unchanged = 0, skippedProtected = 0, skippedConflicts = 0, skippedInvalid = 0;
  let archived = 0, restored = 0;

  for (const row of payload.rows) {
    const parsed = parseIncomingOrder({ payload, row, columns, employees, games });
    if (!parsed.order) {
      skippedInvalid++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedInvalid" });
      if (parsed.issue) issues.push(parsed.issue);
      continue;
    }
    const incoming = parsed.order;
    const refKey = incoming.externalReference.trim().toLowerCase();
    if (row.duplicateCode || (referenceCounts.get(refKey) ?? 0) > 1) {
      skippedConflicts++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedConflicts" });
      issues.push({ rowNumber: row.rowNumber, code: incoming.externalReference, message: "KODE duplikat di payload sinkronisasi." });
      continue;
    }
    const index = orders.findIndex(order => order.externalReference.trim().toLowerCase() === refKey);

    if (index < 0) {
      orders.push(incoming);
      added++;
      rowResults.push({ rowNumber: row.rowNumber, status: "added" });
      continue;
    }

    const existing = orders[index];
    if (!isGoogleSheetOrder(existing) || !existing.id.startsWith(sheetSourcePrefix(payload))) {
      skippedConflicts++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedConflicts" });
      issues.push({ rowNumber: row.rowNumber, code: incoming.externalReference, message: "KODE sudah ada sebagai pesanan manual/sumber lain; data tidak ditimpa." });
      continue;
    }
    const otherReference = orders.findIndex((order, orderIndex) => orderIndex !== index && order.externalReference.trim().toLowerCase() === refKey);
    if (otherReference >= 0) {
      skippedConflicts++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedConflicts" });
      issues.push({ rowNumber: row.rowNumber, code: incoming.externalReference, message: "Perubahan KODE bertabrakan dengan pesanan lain." });
      continue;
    }
    if (protectedFromSheet(existing, closingReferences)) {
      skippedProtected++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedProtected" });
      issues.push({ rowNumber: row.rowNumber, code: incoming.externalReference, message: "Pesanan dikunci admin atau dilindungi Gaji/Closing/stok/pembayaran; spreadsheet tidak boleh mengubahnya." });
      continue;
    }

    const next = mergeSheetOwnedFields(existing, incoming);
    if (canonical(existing) === canonical(next)) {
      unchanged++;
      rowResults.push({ rowNumber: row.rowNumber, status: "unchanged" });
    } else {
      if (existing.sheetDeletedAt) restored++;
      orders[index] = next; updated++;
      rowResults.push({ rowNumber: row.rowNumber, status: "updated" });
    }
  }

  const present = payload.presence ? new Set(payload.presence.references.map(ref => ref.trim().toLowerCase())) : null;
  const refreshReferences: string[] = [];
  if (present && payload.presence) {
    for (const order of orders) {
      if (!order.id.startsWith(sheetSourcePrefix(payload))) continue;
      const found = present.has(order.externalReference.trim().toLowerCase());
      if (found) {
        if (!protectedFromSheet(order, closingReferences) && (order.sheetSyncRefreshRequested || order.sheetDeletedAt)) refreshReferences.push(order.externalReference);
        continue;
      }
      // A later Closing boundary never removes earlier periods or legacy unknown rows.
      if (!order.importSourceRow || order.importSourceRow < payload.presence.startRow || order.sheetDeletedAt) continue;
      if (protectedFromSheet(order, closingReferences)) { skippedProtected++; continue; }
      order.sheetDeletedAt = payload.sentAt;
      archived++;
    }
  }
  state[workspaceKeys.orders] = orders;
  return { state, added, updated, archived, restored, refreshReferences, unchanged, skippedProtected, skippedConflicts, skippedInvalid, issues: issues.slice(0, 100), rowResults };
}

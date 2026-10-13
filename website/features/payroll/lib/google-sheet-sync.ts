import { manualOrderCode } from "@/features/payroll/lib/manual-order-code";
import { automaticSingleDelivery, automaticDailyDelivery, sheetTransferStatus } from "./sheet-transfer-payroll";
import { conflictRecord, unrelatedCodeIdentity, type SheetCodeConflict } from "./sheet-code-collision";
import { FH_NEW_BOOK_ROW, legacyRowId, type LegacyMutationSnapshot } from "./legacy-fh-cutover";
import { hasAutomaticSheetProtection } from "./sheet-sync-policy";
import { mergeGoogleSheetRoster, pruneUnreferencedSheetRosterEmployees, validateGoogleSheetRoster, type GoogleSheetRosterSnapshot } from "./google-sheet-roster";
import { buildGoogleSheetDailyOrder, mergeGoogleSheetDailyOrder, parseGoogleSheetBoostingDays } from "./google-sheet-daily";
import { canonical, workspaceKeys, type WorkspaceState } from "@/features/payroll/lib/workspace-model";
import type { Employee, Order, OrderIssue, OrderWorkerAssignment, ProductGame } from "@/features/payroll/types/domain";

export type GoogleSheetSyncRow = {
  rowNumber: number;
  values: unknown[];
  display?: string[];
  boosterBlack?: boolean;
  /** Duplicate KODE in the same Closing period, including rows outside an edit range. */
  duplicateCode?: boolean;
  /** Complete-sheet count permits a unique KODE to move before the new-order boundary. */
  codeOccurrences?: number;
  /** One atomic, complete full-Sheet KODE group; nested rows cannot contain packages. */
  dailyPackage?: { complete: true; rows: GoogleSheetSyncRow[] };
};

export type GoogleSheetSyncPayload = {
  version: 1;
  syncMode?: "incremental" | "reconcile";
  spreadsheetId: string;
  spreadsheetName?: string;
  sheetName: string;
  headerRow?: number;
  /** Earlier rows refresh existing Sheet orders only; they never create history. */
  newOrdersStartRow?: number;
  headers: string[];
  sentAt: string;
  actor?: { id?: string; email?: string };
  rows: GoogleSheetSyncRow[];
  /** Complete FH1/FH2/FH3 employee roster, applied before resolving order workers. */
  roster?: GoogleSheetRosterSnapshot;
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
  rosterAdded: number;
  rosterUpdated: number;
  rosterRemoved: number;
  added: number;
  updated: number;
  archived: number;
  restored: number;
  refreshReferences: string[];
  /** Source identities only, used to skip unimported historical rows before uploading. */
  trackedRows: { reference: string; rowNumber?: number }[];
  unchanged: number;
  skippedProtected: number;
  skippedConflicts: number;
  skippedInvalid: number;
  skippedHistorical: number;
  conflictsUpdated: number;
  legacyArchived: number;
  issues: GoogleSheetSyncIssue[];
  rowResults: { rowNumber: number; status: "added" | "updated" | "unchanged" | "skippedProtected" | "skippedConflicts" | "skippedInvalid" | "skippedHistorical" }[];
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
  if (typeof value === "number") {
    const rounded = Math.round(value);
    return Number.isSafeInteger(rounded) ? rounded : null;
  }
  const stripCurrency = (text: string) => text
    .replace(/^(?:Rp\.?|IDR|\p{Sc})\s*/iu, "")
    .replace(/\s*(?:Rp\.?|IDR|\p{Sc})$/iu, "").trim();
  let source = stripCurrency(normalize(value).normalize("NFKC"));
  if (!source) return null;
  const parenthesized = source.startsWith("(") && source.endsWith(")");
  if (parenthesized) source = source.slice(1, -1).trim();
  const signedNegative = source.startsWith("-");
  if (/^[+-]/.test(source)) source = source.slice(1).trim();
  if (parenthesized && signedNegative) return null;
  const sign = parenthesized || signedNegative ? -1 : 1;
  source = stripCurrency(source);
  // Spaces may group thousands, but arbitrary text/digits must not become money.
  if (/\s/.test(source)) {
    if (!/^[1-9]\d{0,2}(?:\s+\d{3})+(?:[.,]\d{1,2})?$/.test(source)) return null;
    source = source.replace(/\s/g, "");
  }
  if (!/^\d+(?:[.,]\d+)*$/.test(source)) return null;
  const dot = source.lastIndexOf("."), comma = source.lastIndexOf(",");
  let numeric = source;
  if (dot >= 0 && comma >= 0) {
    // With both separators the final one is decimal; the other must group 3 digits.
    const decimalIndex = Math.max(dot, comma);
    const integerPart = source.slice(0, decimalIndex);
    const fraction = source.slice(decimalIndex + 1);
    const grouping = dot > comma ? "," : ".";
    const groups = integerPart.split(grouping);
    if (!/^[1-9]\d{0,2}$/.test(groups[0]) || groups.length < 2
      || !groups.slice(1).every(group => /^\d{3}$/.test(group)) || !/^\d+$/.test(fraction)) return null;
    numeric = `${groups.join("")}.${fraction}`;
  } else if (dot >= 0 || comma >= 0) {
    const groups = source.split(dot >= 0 ? "." : ",");
    // Preserve familiar IDR thousands (2.200 / 2,200); other single separators are decimal.
    const groupedThousands = /^[1-9]\d{0,2}$/.test(groups[0])
      && groups.slice(1).every(group => /^\d{3}$/.test(group));
    if (groupedThousands) numeric = groups.join("");
    else if (groups.length === 2) numeric = `${groups[0]}.${groups[1]}`;
    else return null;
  }
  const result = Math.round(Number(numeric) * sign);
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

function employeeLookup(employees: Employee[], team?: Employee["team"]) {
  const codes = new Map<string, Employee>();
  const names = new Map<string, Employee[]>();
  const aliases = new Map<string, Employee[]>();
  const suffix = /^FH([123])$/.exec(team ?? "")?.[1];
  const addName = (map: Map<string, Employee[]>, name: string, employee: Employee) => {
    map.set(name, [...(map.get(name) ?? []), employee]);
  };
  for (const employee of employees) {
    if (employee.sheetRosterMissingAt) continue;
    if (team && employee.team !== team) continue;
    codes.set(folded(employee.code), employee);
    const name = folded(employee.name);
    addName(names, name, employee);
    // Older MUTASI rows omit the payroll FH suffix. Never guess without a known FH.
    if (suffix && name.endsWith(suffix) && /\p{L}$/u.test(name.slice(0, -1))) {
      addName(aliases, name.slice(0, -1), employee);
    }
  }
  return (value: string) => {
    const key = folded(value);
    const code = codes.get(key);
    if (code) return { employee: code, ambiguous: false };
    const matches = names.get(key) ?? aliases.get(key) ?? [];
    return { employee: matches.length === 1 ? matches[0] : undefined, ambiguous: matches.length > 1 };
  };
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

function parseWorkerList(status: string, process: string, employees: Employee[], rowNumber: number, team?: Employee["team"]) {
  const lookup = employeeLookup(employees, team);
  const assignments: OrderWorkerAssignment[] = [];
  const missing: string[] = [];
  const quantityPattern = /(?<![\p{L}\p{N}_.])(\d+(?:[.,]\d+)?)[ \t]*(?:[KMGB](?![\p{L}\p{N}_]))?/giu;
  let cursor = 0;
  let assignmentIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = quantityPattern.exec(status)) !== null) {
    const rawName = status
      .slice(cursor, match.index)
      .replace(/^[\s,;|/+&\-:=>]+|[\s,;|/+&\-:=>]+$/g, "")
      .trim();
    const identityPrefix = status.slice(cursor, match.index + match[1].length)
      .replace(/^[\s,;|/+&\-:=>]+|[\s,;|/+&\-:=>]+$/g, "").trim();
    // EMP-0123 is an identity; its digits are not the quantity after the hyphen.
    if (lookup(identityPrefix).employee) continue;
    cursor = quantityPattern.lastIndex;
    if (!rawName) continue;
    if (/[\s,;|/+&\-:=>]-[ \t]*$/.test(status.slice(0, match.index))) {
      missing.push(`${rawName} -${match[0].trim()} (jumlah negatif)`);
      continue;
    }

    const { employee, ambiguous } = lookup(rawName);
    const quantity = parseUnit(match[1]);
    if (!employee || quantity == null) {
      missing.push(`${rawName} ${match[0].trim()}${ambiguous ? " (nama ambigu; isi FH)" : ""}`);
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
    transfer: headerIndex(headers, ["STATUS TRANSFER", "TRANSFER STATUS", "STATUS TRANSFERAN"], -1),
    task: headerIndex(headers, ["TASK", "TUGAS", "KETERANGAN TASK"], -1),
    orderType: headerIndex(headers, ["JENIS ORDER", "JENIS", "ORDER TYPE", "TYPE"], -1),
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
  const transferStatus = displayAt(row, columns.transfer);
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

  const sheetTeam = mapTeam(displayAt(row, columns.team)) ?? mapTeam(booster);
  const employeesByName = employeeLookup(employees, sheetTeam);
  let assignments: OrderWorkerAssignment[] = [];
  if (row.boosterBlack === true) {
    const parsed = parseWorkerList(status, process, employees, row.rowNumber, sheetTeam);
    assignments = parsed.assignments;
    if (parsed.missing.length) issues.push(importIssue("sheet_workers_review", "Daftar karyawan perlu diperiksa", `Belum cocok: ${parsed.missing.join(", ")}`));
    if (status && !assignments.length) issues.push(importIssue("sheet_workers_empty", "Karyawan belum ditemukan", "BOOSTER hitam tetapi STATUS belum dapat dipetakan ke karyawan payroll."));
  } else if (booster && !mapTeam(booster)) {
    const { employee, ambiguous } = employeesByName(booster);
    if (employee) assignments = [workerAssignment(employee, process, quantity, row.rowNumber, 0)];
    else issues.push(importIssue("sheet_booster_unmatched", "Booster belum cocok", ambiguous
      ? `BOOSTER “${booster}” cocok dengan beberapa karyawan. Isi FH untuk menentukan karyawan yang benar.`
      : `BOOSTER “${booster}” belum ditemukan di daftar karyawan.`));
  }

  const explicitType = folded(displayAt(row, columns.orderType));
  const namedGoldDistribution = Boolean(status.trim()) && status.split(/[\r\n;|]+/).filter(part => part.trim())
    .every(part => /^[\p{L}][\p{L}\p{N} .'-]*\s*:?\s*\d+(?:[.,]\d+)?\s*[KMGB]$/iu.test(part.trim()));
  const typeAliases: Record<string, Order["orderType"]> = {
    GOLD: "gold", KOIN: "gold", COIN: "gold", BOOSTING: "boosting", BOOST: "boosting",
    JOKI: "boosting", "JASA BOOSTING": "boosting", ITEM: "item", "ITEM GAME": "item",
  };
  const orderType = explicitType ? typeAliases[explicitType]
    : ["JOKI", "BOOST", "BOOSTING"].includes(folded(process)) ? "boosting"
      : row.boosterBlack && namedGoldDistribution ? "gold" : undefined;
  if (!orderType) issues.push(importIssue("sheet_order_type_unknown", "Jenis order belum diketahui", "Isi JENIS ORDER dengan GOLD, BOOSTING, atau ITEM. Telegram menunggu jenis order yang jelas."));
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
      orderType,
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
      transferStatus: transferStatus ? sheetTransferStatus(transferStatus) : undefined,
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

function protectedFromDailySheet(order: Order, closingReferences: Set<string>) {
  if (order.sheetSyncLocked || order.websiteDeletedAt || order.payrollClosedAt || order.payrollPeriodId
    || ["verified", "reconciled", "ready_to_close", "closed"].includes(order.financeStatus)
    || order.inventoryAllocations?.length || order.inventoryConsumedAt || order.matchedPaymentMinor > 0
    || order.verifiedAt || order.operationalStatus === "verified") return true;
  // A partial daily Closing freezes its own segments; a whole-order/legacy Closing stays locked.
  return closingReferences.has(order.externalReference.trim().toLowerCase())
    && !(order.scheduleMode === "daily" && order.dailyWork?.some(day => day.payrollClosedAt || day.payrollPeriodId));
}

function resolveDailyWorkerNames(value: string, employees: Employee[], team?: Employee["team"]) {
  const lookup = employeeLookup(employees, team), full = lookup(value);
  if (full.employee) return { employees: [full.employee], ambiguous: false };
  if (full.ambiguous) return { employees: [] as Employee[], ambiguous: true };
  const tokens = value.replace(/[,;+&/|]+/g, " ").trim().split(/\s+/);
  if (tokens.length > 32) return { employees: [] as Employee[], ambiguous: false };
  const memo = new Map<number, Employee[][]>();
  const solutions = (start: number): Employee[][] => {
    if (start === tokens.length) return [[]];
    const cached = memo.get(start); if (cached) return cached;
    const found: Employee[][] = [];
    for (let end = start + 1; end <= tokens.length && found.length < 2; end++) {
      const match = lookup(tokens.slice(start, end).join(" "));
      if (!match.employee) continue;
      for (const tail of solutions(end)) {
        const candidate = [match.employee, ...tail];
        if (new Set(candidate.map(employee => employee.code)).size !== candidate.length) continue;
        found.push(candidate); if (found.length === 2) break;
      }
    }
    memo.set(start, found); return found;
  };
  const found = solutions(0);
  return { employees: found.length === 1 ? found[0] : [], ambiguous: found.length > 1 };
}

function parseIncomingDailyPackage(input: {
  payload: GoogleSheetSyncPayload; row: GoogleSheetSyncRow; columns: ColumnMap; employees: Employee[]; games: ProductGame[];
}): { order?: Order; issue?: GoogleSheetSyncIssue } {
  const { row, columns } = input;
  try {
    const sourceRows = row.dailyPackage!.rows;
    if (row.codeOccurrences !== sourceRows.length) throw new Error("Paket harian tidak mencakup semua baris KODE pada Sheet.");
    const leader = [...sourceRows].sort((a, b) => a.rowNumber - b.rowNumber)[0];
    const snapshot = (source: GoogleSheetSyncRow) => ({ rowNumber: source.rowNumber, values: source.values, display: source.display, boosterBlack: source.boosterBlack });
    if (canonical(snapshot(row)) !== canonical(snapshot(leader))) throw new Error("Baris pemimpin paket harus sama dengan baris sumber paling awal.");
    const expectedCode = folded(displayAt(row, columns.code) || rawAt(row, columns.code));
    const records = sourceRows.map(source => {
      if (folded(displayAt(source, columns.code) || rawAt(source, columns.code)) !== expectedCode) throw new Error("Paket harian mencampur KODE yang berbeda.");
      const claims = displayAt(source, columns.booster).split(/[\r\n]+/).filter(line => line.trim()).map(line => {
        const marker = parseGoogleSheetBoostingDays(line);
        if (!marker) throw new Error(`BOOSTER pada baris ${source.rowNumber} tidak memiliki nama dan penanda DAY yang jelas pada setiap baris pekerja.`);
        return marker;
      });
      if (!claims.length) throw new Error(`BOOSTER pada baris ${source.rowNumber} kosong.`);
      const days = [...new Set(claims.flatMap(claim => claim.days))].sort((a, b) => a - b);
      const values = [...source.values], display = source.display ? [...source.display] : undefined;
      values[columns.booster] = claims[0].workerName;
      if (display) display[columns.booster] = claims[0].workerName;
      // An explicit Boosting DAY worker is named in BOOSTER, regardless of its fill color.
      const parsed = parseIncomingOrder({ ...input, row: { ...source, values, display, boosterBlack: false } });
      if (!parsed.order) throw new Error(parsed.issue?.message ?? `Baris ${source.rowNumber} tidak dapat dibaca.`);
      const quantity = parseUnit(rawAt(source, columns.quantity)) ?? parseUnit(displayAt(source, columns.quantity));
      const quantityPerDay = quantity === null ? NaN : quantity / days.length;
      const team = mapTeam(displayAt(source, columns.team));
      const resolved = claims.map(claim => ({ ...claim, ...resolveDailyWorkerNames(claim.workerName, input.employees, team) }));
      const workersByDay = days.map(sequence => {
        const relevant = resolved.filter(claim => claim.days.includes(sequence));
        const workers = [...new Map(relevant.flatMap(claim => claim.employees).map(employee => [employee.code, employee])).values()];
        const unknown = relevant.filter(claim => !claim.employees.length);
        const issues: OrderIssue[] = [];
        if (unknown.length) issues.push(importIssue("sheet_daily_workers_review", "Karyawan hari ini perlu diperiksa", `Hari ${sequence}: belum cocok ${unknown.map(claim => `${claim.workerName}${claim.ambiguous ? " (nama ambigu; isi FH)" : ""}`).join(", ")}. Jumlah dan TOTAL sumber tetap disimpan tanpa menebak karyawan.`));
        const share = quantityPerDay / workers.length;
        if (workers.length > 1 && !Number.isInteger(share)) issues.push(importIssue("sheet_daily_worker_share_review", "Pembagian kerja harian perlu diperiksa", `Hari ${sequence}: ${quantityPerDay} unit kerja dibagi rata kepada ${workers.length} karyawan (${share} per karyawan). Periksa pembagian sebelum diselesaikan.`));
        return { sequence, assignments: unknown.length ? [] : workers.map((employee, index) => workerAssignment(employee, parsed.order!.process ?? "LAINNYA", share, source.rowNumber, index)), issues };
      });
      const order = { ...parsed.order, importIssues: parsed.order.importIssues?.filter(issue => issue.code !== "sheet_booster_unmatched") };
      return {
        order, sourceRow: source.rowNumber, days, quantity, workersByDay,
        totalMinor: parseIdr(rawAt(source, columns.total)) ?? parseIdr(displayAt(source, columns.total)),
        sourceStatus: displayAt(source, columns.status),
        sourceTransferStatus: displayAt(source, columns.transfer) ? sheetTransferStatus(displayAt(source, columns.transfer)) : undefined,
      };
    });
    return { order: jsonClean(buildGoogleSheetDailyOrder(records)) };
  } catch (error) {
    return { issue: { rowNumber: row.rowNumber, code: displayAt(row, columns.code) || normalize(rawAt(row, columns.code)),
      message: error instanceof Error ? error.message : "Paket harian tidak dapat digabung dengan aman." } };
  }
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
    orderType: incoming.orderType,
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
    dueAt: incoming.dueAt,
    importIssues: incoming.importIssues,
    importNeedsReview: incoming.importNeedsReview,
    importSourceRow: incoming.importSourceRow,
    transferStatus: incoming.transferStatus,
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
  if (payload.newOrdersStartRow !== undefined && (!Number.isSafeInteger(payload.newOrdersStartRow)
    || payload.newOrdersStartRow <= (payload.headerRow ?? 1) || payload.newOrdersStartRow > 50001)) {
    throw new Error("Batas pesanan baru tidak valid.");
  }
  if (payload.roster !== undefined) validateGoogleSheetRoster(payload.roster);
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
  let sourceRowCount = 0;
  function validateRow(row: GoogleSheetSyncRow) {
    if (!row || !Number.isSafeInteger(row.rowNumber) || row.rowNumber < 1 || !Array.isArray(row.values) || row.values.length > 64) throw new Error("Baris sinkronisasi tidak valid.");
    if (row.display !== undefined && (!Array.isArray(row.display) || row.display.length > 64)) throw new Error("Tampilan baris sinkronisasi tidak valid.");
    if (row.boosterBlack !== undefined && typeof row.boosterBlack !== "boolean") throw new Error("Warna BOOSTER tidak valid.");
    if (row.duplicateCode !== undefined && typeof row.duplicateCode !== "boolean") throw new Error("Penanda KODE duplikat tidak valid.");
    if (row.codeOccurrences !== undefined && (!Number.isSafeInteger(row.codeOccurrences) || row.codeOccurrences < 1 || row.codeOccurrences > 50000)) {
      throw new Error("Jumlah kemunculan KODE tidak valid.");
    }
  }
  for (const row of payload.rows) {
    validateRow(row);
    if (rowNumbers.has(row.rowNumber)) throw new Error("Nomor baris sinkronisasi duplikat.");
    rowNumbers.add(row.rowNumber);
    if (row.dailyPackage !== undefined) {
      const group = row.dailyPackage;
      if (!group || group.complete !== true || !Array.isArray(group.rows) || !group.rows.length || group.rows.length > 366) throw new Error("Daftar sumber paket harian harus lengkap dan berisi 1–366 baris.");
      const numbers = new Set<number>();
      for (const source of group.rows) {
        validateRow(source);
        if (source.dailyPackage !== undefined || numbers.has(source.rowNumber) || source.rowNumber <= (payload.headerRow ?? 1)) throw new Error("Baris sumber paket harian rekursif, duplikat, atau sebelum header.");
        numbers.add(source.rowNumber);
      }
      sourceRowCount += group.rows.length;
    } else sourceRowCount++;
    if (sourceRowCount > MAX_ROWS) throw new Error("Jumlah baris sumber sinkronisasi terlalu besar.");
  }
  return payload as GoogleSheetSyncPayload;
}

export function mergeGoogleSheetPayroll(current: WorkspaceState, rawPayload: unknown): GoogleSheetSyncMergeResult {
  const payload = validateGoogleSheetSyncPayload(rawPayload);
  const state = structuredClone(current);
  const rosterResult = payload.roster ? mergeGoogleSheetRoster(state, payload.roster, payload.spreadsheetId, payload.sentAt)
    : { rosterAdded: 0, rosterUpdated: 0, rosterRemoved: 0 };
  const orders = [...((state[workspaceKeys.orders] ?? []) as Order[])];
  const employees = (state[workspaceKeys.employees] ?? []) as Employee[];
  const games = (state[workspaceKeys.products] ?? []) as ProductGame[];
  const columns = columnsFor(payload.headers);
  const issues: GoogleSheetSyncIssue[] = [];
  const previousLegacy=(state[workspaceKeys.legacyFhArchive]??[]) as LegacyMutationSnapshot[];
  const legacyRows=new Map(previousLegacy.map(record=>[record.id,record]));
  let legacyArchived=0;
  if(payload.sheetName==="MUTASI FH" && payload.newOrdersStartRow===FH_NEW_BOOK_ROW) {
    // This is a separate legacy SOURCE ledger. No financial Closing is created
    // and no old row is passed to the live payroll importer.
    for(const item of payload.rows) for(const source of (item.dailyPackage?.rows ?? [item])) {
      if(source.rowNumber>=FH_NEW_BOOK_ROW || source.rowNumber<3)continue;
      const code=displayAt(source,columns.code)||normalize(rawAt(source,columns.code));
      if(!code || code.length>160)continue;
      const id=legacyRowId(payload.spreadsheetId,source.rowNumber);
      if(legacyRows.has(id))continue; // Immutable historical row snapshot.
      const safe=(value:string)=>value.slice(0,300);
      const number=(column:number)=> {
        const val=rawAt(source,column);
        return typeof val==="number"&&Number.isFinite(val)?val:parseIdr(val)??0;
      };
      legacyRows.set(id,{id,spreadsheetId:payload.spreadsheetId,sheetName:"MUTASI FH",
        sourceRow:source.rowNumber,code,sourceDate:safe(displayAt(source,columns.orderedAt)),
        source:safe(displayAt(source,columns.source)),
        buyerName:safe(displayAt(source,columns.buyer)),orderName:safe(displayAt(source,columns.orderName)),
        booster:safe(displayAt(source,columns.booster)),team:safe(displayAt(source,columns.team)),
        game:safe(displayAt(source,columns.game)),process:safe(displayAt(source,columns.process)),
        quantity:number(columns.quantity),rateMinor:number(columns.rate),grossMinor:number(columns.total),
        transferStatus:safe(displayAt(source,columns.transfer)),archiveType:"legacy-before-X2754",
        importedAt:payload.sentAt});
      legacyArchived++;
    }
  }
  if(legacyArchived)state[workspaceKeys.legacyFhArchive]=[...legacyRows.values()].sort((a,b)=>a.sourceRow-b.sourceRow);
  const previousAlerts=(state[workspaceKeys.sheetCodeConflicts]??[]) as SheetCodeConflict[];
  const alerts=new Map(previousAlerts.map(alert=>[alert.id,alert]));
  function clearAlert(code:string) {
    alerts.delete(conflictRecord(payload.spreadsheetId,code,1,"",payload.sentAt).id);
  }
  function recordCodeProblem(code:string,rowNumber:number,message:string) {
    if(!code.trim())return;
    const entry=conflictRecord(payload.spreadsheetId,code,rowNumber,message,payload.sentAt);
    const old=alerts.get(entry.id);
    if(old?.sourceRow!==entry.sourceRow||old.message!==entry.message)alerts.set(entry.id,entry);
    const ix=orders.findIndex(order=>order.externalReference.trim().toLowerCase()===code.trim().toLowerCase()
      && isGoogleSheetOrder(order) && !protectedFromSheet(order,closingReferences));
    if(ix>=0) {
      const item=orders[ix], sourceIssues=(item.importIssues??[]).filter(problem=>problem.code!=="sheet_code_collision");
      const next={...item,operationalStatus:"on_hold" as const,importNeedsReview:true,importIssues:[...sourceIssues,
        {code:"sheet_code_collision",title:"KODE ganda tidak cocok",description:message,
          severity:"high" as const,source:"import" as const}]};
      if(canonical(item)!==canonical(next)){orders[ix]=next;updated++;}
    }
  }
  const rowResults: GoogleSheetSyncMergeResult["rowResults"] = [];
  const dailyPackages = new Map<GoogleSheetSyncRow, ReturnType<typeof parseIncomingDailyPackage>>();
  for (const row of payload.rows) if (row.dailyPackage) dailyPackages.set(row, parseIncomingDailyPackage({ payload, row, columns, employees, games }));
  const existingByReference = new Map<string, Order[]>();
  for (const order of orders) {
    const key = order.externalReference.trim().toLowerCase();
    existingByReference.set(key, [...(existingByReference.get(key) ?? []), order]);
  }
  function historicalRowIsUnrelated(row: GoogleSheetSyncRow) {
    if (row.dailyPackage) return false; // Invalid groups are reported as conflicts; valid complete groups may recover history.
    if (payload.newOrdersStartRow === undefined || row.rowNumber >= payload.newOrdersStartRow) return false;
    const key = (displayAt(row, columns.code) || normalize(rawAt(row, columns.code))).trim().toLowerCase();
    const matches = existingByReference.get(key) ?? [];
    if (!matches.length) return true;
    // Existing manual/source and duplicated identities still use the normal conflict checks.
    if (matches.length !== 1 || !matches[0].id.startsWith(sheetSourcePrefix(payload))) return false;
    return row.rowNumber !== matches[0].importSourceRow && row.codeOccurrences !== 1;
  }
  function conflictsWithTrackedRow(row: GoogleSheetSyncRow) {
    if (row.dailyPackage) return false; // Full-CODE validation replaces physical-row identity only for this atomic group.
    if (payload.newOrdersStartRow === undefined || (row.codeOccurrences ?? 0) <= 1) return false;
    const key = (displayAt(row, columns.code) || normalize(rawAt(row, columns.code))).trim().toLowerCase();
    const matches = existingByReference.get(key) ?? [];
    return matches.length === 1 && matches[0].id.startsWith(sheetSourcePrefix(payload))
      && row.rowNumber !== matches[0].importSourceRow;
  }
  const referenceCounts = new Map<string, number>();
  const packageReferences = new Set(payload.rows.filter(row => row.dailyPackage)
    .map(row => folded(displayAt(row, columns.code) || rawAt(row, columns.code))));
  for (const row of payload.rows) {
    if (!packageReferences.has(folded(displayAt(row, columns.code) || rawAt(row, columns.code)))
      && (historicalRowIsUnrelated(row) || conflictsWithTrackedRow(row))) continue;
    const key = (displayAt(row, columns.code) || normalize(rawAt(row, columns.code))).toLowerCase();
    referenceCounts.set(key, (referenceCounts.get(key) ?? 0) + 1);
  }
  const closingReferences = new Set(
    ((state[workspaceKeys.closings] ?? []) as { orderRefs?: string[]; ordersSnapshot?: Order[] }[])
      .flatMap(closing => [...closing.orderRefs ?? [], ...closing.ordersSnapshot?.map(order => order.externalReference) ?? []])
      .map(ref => ref.trim().toLowerCase()),
  );
  let added = 0, updated = 0, unchanged = 0, skippedProtected = 0, skippedConflicts = 0, skippedInvalid = 0;
  let archived = 0, restored = 0;
  let skippedHistorical = 0;

  for (const row of payload.rows) {
    const dailyPackage = dailyPackages.get(row);
    // Rows preceding X2754 must not enter live Mutasi or payroll, even if
    // they were part of a group of identical KODEs.
    if(payload.sheetName==="MUTASI FH" && row.rowNumber<FH_NEW_BOOK_ROW && payload.newOrdersStartRow===FH_NEW_BOOK_ROW && !row.dailyPackage) {
      skippedHistorical++;
      rowResults.push({rowNumber:row.rowNumber,status:"skippedHistorical"});
      continue;
    }
    if (dailyPackage && !dailyPackage.order) {
      skippedConflicts++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedConflicts" });
      if (dailyPackage.issue) {
        issues.push(dailyPackage.issue);
        recordCodeProblem(dailyPackage.issue.code??"",row.rowNumber,dailyPackage.issue.message);
      }
      continue;
    }
    if (historicalRowIsUnrelated(row)) {
      skippedHistorical++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedHistorical" });
      continue;
    }
    if (conflictsWithTrackedRow(row)) {
      skippedConflicts++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedConflicts" });
      issues.push({ rowNumber: row.rowNumber, code: displayAt(row, columns.code) || normalize(rawAt(row, columns.code)),
        message: "KODE berulang di periode lain dan nomor baris berbeda dari pesanan terdaftar; data tidak ditimpa." });
      continue;
    }
    const parsed = dailyPackage ?? parseIncomingOrder({ payload, row, columns, employees, games });
    if (!parsed.order) {
      skippedInvalid++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedInvalid" });
      if (parsed.issue) issues.push(parsed.issue);
      continue;
    }
    const incoming = dailyPackage ? automaticDailyDelivery(parsed.order) : automaticSingleDelivery(parsed.order);
    const refKey = incoming.externalReference.trim().toLowerCase();
    if ((!dailyPackage && row.duplicateCode) || (referenceCounts.get(refKey) ?? 0) > 1) {
      skippedConflicts++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedConflicts" });
      issues.push({ rowNumber: row.rowNumber, code: incoming.externalReference, message: "KODE duplikat di payload sinkronisasi." });
      recordCodeProblem(incoming.externalReference,row.rowNumber,"KODE sama dipakai lebih dari satu baris non-paket. Periksa NAMA BUYER dan NAMA ORDER; kode yang sama hanya untuk hari paket yang sama.");
      continue;
    }
    const index = orders.findIndex(order => order.externalReference.trim().toLowerCase() === refKey);

    if (index < 0) {
      if (dailyPackage && closingReferences.has(refKey)) {
        skippedProtected++;
        rowResults.push({ rowNumber: row.rowNumber, status: "skippedProtected" });
        issues.push({ rowNumber: row.rowNumber, code: incoming.externalReference, message: "KODE sudah tercatat dalam Closing; identitas yang hilang tidak dibuat ulang sebagai pekerjaan belum digaji." });
        continue;
      }
      if (!dailyPackage && payload.newOrdersStartRow !== undefined && row.rowNumber < payload.newOrdersStartRow) {
        skippedHistorical++;
        rowResults.push({ rowNumber: row.rowNumber, status: "skippedHistorical" });
        continue;
      }
      orders.push(incoming);
      clearAlert(incoming.externalReference);
      added++;
      rowResults.push({ rowNumber: row.rowNumber, status: "added" });
      continue;
    }

    const existing = orders[index];
    if (unrelatedCodeIdentity(existing,incoming)) {
      skippedConflicts++;
      rowResults.push({rowNumber:row.rowNumber,status:"skippedConflicts"});
      const message=`KODE ${incoming.externalReference} sama tetapi nama buyer atau nama order tidak mirip dengan pesanan yang sudah tersimpan. Jangan gabungkan kedua transaksi; koreksi KODE di Sheet.`;
      issues.push({rowNumber:row.rowNumber,code:incoming.externalReference,message});
      recordCodeProblem(incoming.externalReference,row.rowNumber,message);
      continue;
    }
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
    if (dailyPackage ? protectedFromDailySheet(existing, closingReferences) : protectedFromSheet(existing, closingReferences)) {
      skippedProtected++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedProtected" });
      issues.push({ rowNumber: row.rowNumber, code: incoming.externalReference, message: "Pesanan dikunci admin atau dilindungi Gaji/Closing/stok/pembayaran; spreadsheet tidak boleh mengubahnya." });
      continue;
    }

    if (!dailyPackage && existing.scheduleMode === "daily") {
      skippedConflicts++;
      rowResults.push({ rowNumber: row.rowNumber, status: "skippedConflicts" });
      issues.push({ rowNumber: row.rowNumber, code: incoming.externalReference, message: "Paket harian harus dikirim lengkap agar hari lain tidak tertimpa baris tunggal." });
      continue;
    }
    let next = mergeSheetOwnedFields(existing, incoming);
    if (!dailyPackage && incoming.transferStatus) next=automaticSingleDelivery({ ...next,
      ...(incoming.transferStatus === "PENDING" ? {operationalStatus:"draft",verifiedAt:undefined,completedAt:undefined} : {}) });
    if (dailyPackage) {
      try {
        next = automaticDailyDelivery(jsonClean(mergeGoogleSheetDailyOrder(existing, { ...next, scheduleMode: incoming.scheduleMode,
          scheduleTotalDays: incoming.scheduleTotalDays, dailyHours: incoming.dailyHours, dailyWork: incoming.dailyWork })));
      } catch (error) {
        skippedConflicts++;
        rowResults.push({ rowNumber: row.rowNumber, status: "skippedConflicts" });
        issues.push({ rowNumber: row.rowNumber, code: incoming.externalReference, message: error instanceof Error ? error.message : "Paket harian website tidak dapat diperbarui dengan aman." });
        continue;
      }
    }
    clearAlert(incoming.externalReference);
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
  // Unlock/refresh retries are independent of whether source deletions are enabled.
  for (const order of orders) {
    if (!order.id.startsWith(sheetSourcePrefix(payload)) || (!order.sheetSyncRefreshRequested && !order.sheetDeletedAt)
      || refreshReferences.includes(order.externalReference)) continue;
    const protectedOrder = order.scheduleMode === "daily" ? protectedFromDailySheet(order, closingReferences) : protectedFromSheet(order, closingReferences);
    if (!protectedOrder) refreshReferences.push(order.externalReference);
  }
  const currentAlerts=[...alerts.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const conflictsUpdated=canonical(previousAlerts)!==canonical(currentAlerts)?1:0;
  if(currentAlerts.length||state[workspaceKeys.sheetCodeConflicts]) state[workspaceKeys.sheetCodeConflicts]=currentAlerts;
  state[workspaceKeys.orders] = orders;
  if (payload.roster) rosterResult.rosterRemoved += pruneUnreferencedSheetRosterEmployees(state, payload.spreadsheetId);
  const trackedRows = orders.filter(order => order.id.startsWith(sheetSourcePrefix(payload)))
    .map(order => ({ reference: order.externalReference, ...(order.importSourceRow ? { rowNumber: order.importSourceRow } : {}) }));
  return { state, ...rosterResult, added, updated, archived, restored, refreshReferences, trackedRows, unchanged, skippedProtected, skippedConflicts, skippedInvalid, skippedHistorical, conflictsUpdated, legacyArchived, issues: issues.slice(0, 100), rowResults };
}

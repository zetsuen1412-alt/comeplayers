import type { Employee, FinanceIssue, InventoryMovement, InventoryStock, Order } from "@/features/payroll/types/domain";
import type { LivePayrollRow } from "@/features/payroll/lib/payroll-live";
import { getAssignmentGrossMinor, getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { calculateWorkerEarning } from "@/features/payroll/lib/finance";
import { formatDateTimeID, formatJakartaDateTimeInput, toJakartaDateInput } from "@/features/payroll/lib/date";
import { expandMutationRows, formatMutationDistribution, mutationDayLabel, mutationRowStatusText, normalizeDivisionLabel, type MutationViewRow } from "@/features/payroll/lib/mutation-rows";

// Export Excel v0.15.5 mengambil gaya visual dari spreadsheet operasional EVO GAMING lama:
// bar judul hitam, header berwarna, border rapih, format Rupiah, filter, status berwarna,
// dan lebar kolom yang disesuaikan agar mudah dibaca setelah file dibuka di Excel.

type ExportValue = string | number | boolean | null | undefined;
type ExportRecord = Record<string, ExportValue>;

type ClosingExportRow = {
  id: string;
  from: string;
  to: string;
  closedAt: string;
  orderRefs: string[];
  totalOrderMinor: number;
  totalPayrollMinor: number;
};

const COLORS = {
  black: "000000",
  white: "FFFFFF",
  titleYellow: "FFD700",
  blue: "3C78D8",
  blue2: "4A86E8",
  blueLight: "D9EAF7",
  green: "00B050",
  greenBright: "00FF00",
  greenLight: "D9EAD3",
  cyan: "00FFFF",
  cyanLight: "D9EAF7",
  red: "FF0000",
  redLight: "F4CCCC",
  orange: "FF9900",
  yellowLight: "FFF2CC",
  gray: "D9D9D9",
  grayLight: "F3F4F6",
  border: "111827",
};

const MONEY_FORMAT = '[$Rp-421]#,##0;[Red]-[$Rp-421]#,##0';
const NUMBER_FORMAT = '#,##0.########';
const PERCENT_WHOLE_FORMAT = '0.##"%"';

const MUTATION_HEADERS = [
  "HARI & TANGGAL", "KODE", "SUMBER", "JENIS ORDER", "NAMA BUYER", "NAMA ORDER", "TASK", "HARI PAKET", "PEMBAGIAN JUMLAH",
  "GAME", "REGION", "SERVER", "JUMLAH ORDER", "RATE", "TOTAL ORDER", "KARYAWAN", "DIVISI", "NILAI PER KARYAWAN",
  "STOK GUDANG", "STATUS", "PERIODE GAJI", "STATUS TRANSFER",
];
const SOURCE_SUMMARY_HEADERS = ["SUMBER", "JUMLAH ORDER", "TOTAL NILAI", "SELESAI", "BERMASALAH"];
const PAYROLL_HEADERS = [
  "NAMA", "KODE KARYAWAN", "FH", "STATUS KARYAWAN", "GAME", "ORDER SELESAI", "TOTAL UNIT", "NILAI PEKERJAAN",
  "PERSENTASE GAJI (%)", "GAJI SEBELUM POTONGAN", "OPERASIONAL", "KASBON", "SISA KASBON", "DENDA", "BONUS / TIPS", "GAJI BERSIH",
];
const INCOME_HEADERS = [
  "HARI & TANGGAL SELESAI", "KODE", "SUMBER", "NAMA", "GAME", "REGION", "SERVER", "FH", "PROSES", "NILAI PEKERJAAN",
  "PERSENTASE GAJI (%)", "PENDAPATAN SEBELUM POTONGAN",
];
const INVENTORY_HEADERS = [
  "GAME", "REGION", "SERVER", "JENIS STOK", "NAMA GOLD / ITEM", "KODE KARYAWAN", "KARYAWAN / GUDANG", "FH",
  "STOK TOTAL", "DIPESAN / CADANGAN", "STOK TERJUAL", "TERSEDIA",
];
const INVENTORY_MOVEMENT_HEADERS = [
  "WAKTU", "ARAH", "GAME", "REGION", "SERVER", "JENIS STOK", "NAMA GOLD / ITEM",
  "KODE KARYAWAN", "KARYAWAN / GUDANG", "FH", "JUMLAH", "RATE", "KODE ORDER", "CATATAN",
];
const SALES_HEADERS = [
  "WAKTU ORDER", "KODE ORDER", "SUMBER", "JENIS ORDER", "BUYER", "GAME", "REGION", "SERVER", "NAMA ORDER", "TASK", "JUMLAH",
  "HARGA TOTAL", "KARYAWAN", "STATUS", "WAKTU SELESAI", "CLOSING ID", "SUDAH DIGAJI",
];
const EMPLOYEE_HEADERS = ["ID KARYAWAN", "KODE KARYAWAN", "NAMA KARYAWAN", "FH", "STATUS", "PERSENTASE GAJI (%)"];
const CLOSING_HISTORY_HEADERS = [
  "CLOSING ID", "MULAI", "SAMPAI", "WAKTU CLOSING", "JUMLAH ORDER SELESAI", "DAFTAR ORDER", "TOTAL PENJUALAN", "TOTAL PAYROLL", "STATUS",
];
const DEFERRED_HEADERS = ["KODE", "SUMBER", "GAME", "STATUS", "NILAI ORDER"];
const ISSUE_HEADERS = ["ENTITAS", "KODE", "MASALAH", "PENJELASAN", "TINGKAT", "NILAI RISIKO", "STATUS"];
const INVENTORY_CLOSING_HEADERS = [
  "KARYAWAN / GUDANG", "FH", "JENIS", "GAME", "REGION", "SERVER", "NAMA GOLD / ITEM", "STOK", "SUDAH DIPESAN", "STOK TERJUAL", "BISA DIPAKAI",
];

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-");
}

async function loadXlsx(): Promise<any> {
  const mod: any = await import("xlsx-js-style");
  return mod.default ?? mod;
}

function simpleOrderStatus(order: Order) {
  if (order.payrollClosedAt) return "SELESAI - SUDAH DIGAJI";
  if (order.operationalStatus === "verified") return "SELESAI - MENUNGGU CLOSING";
  if (order.operationalStatus === "on_hold") return "BERMASALAH";
  if (order.operationalStatus === "completed") return "SELESAI - BELUM DIVERIFIKASI";
  if (order.operationalStatus === "in_progress") return "DIKERJAKAN";
  if (order.operationalStatus === "assigned") return "PROSES";
  if (order.operationalStatus === "cancelled") return "DIBATALKAN";
  return "BARU";
}

function mutationAssignmentGross(row: MutationViewRow, assignmentIndex: number) {
  const assignment = row.assignments[assignmentIndex];
  if (!assignment) return 0;
  if (row.order.orderType === "boosting") {
    const count = Math.max(1, row.assignments.length);
    const base = Math.floor(row.grossMinor / count);
    const remainder = row.grossMinor - base * count;
    return base + (assignmentIndex < remainder ? 1 : 0);
  }
  return getAssignmentGrossMinor({
    ...row.order,
    grossMinor: row.grossMinor,
    quantity: row.quantity,
    workerAssignments: row.assignments,
  }, assignment);
}

function mutationRow(row: MutationViewRow): ExportRecord {
  const order = row.order;
  const rate = order.rateMinor ?? (row.quantity ? Math.round(row.grossMinor / row.quantity) : row.grossMinor);
  return {
    "HARI & TANGGAL": formatDateTimeID(row.orderedAt),
    KODE: order.externalReference,
    SUMBER: order.source,
    "JENIS ORDER": order.orderType === "gold" ? "GOLD" : order.orderType === "item" ? "ITEM" : "BOOSTING",
    "NAMA BUYER": order.buyerName ?? "",
    "NAMA ORDER": order.orderName ?? order.service,
    TASK: order.task ?? "",
    "HARI PAKET": mutationDayLabel(row),
    "PEMBAGIAN JUMLAH": formatMutationDistribution(row),
    GAME: order.gameName ?? order.game,
    REGION: order.region ?? "",
    SERVER: order.server ?? "",
    "JUMLAH ORDER": row.quantity,
    RATE: rate,
    "TOTAL ORDER": row.grossMinor,
    KARYAWAN: row.assignments.map((a) => a.employeeName).join(" | "),
    DIVISI: [...new Set(row.assignments.map((a) => normalizeDivisionLabel(a.team)))].join(" | "),
    "NILAI PER KARYAWAN": row.assignments.map((a, index) => `${a.employeeName}: ${mutationAssignmentGross(row, index)}`).join(" | "),
    "STOK GUDANG": order.inventoryAllocations?.map((x) => `${x.stockType === "gold" ? "Gold" : x.itemName} ${x.quantity} - ${x.employeeName} (${x.team})`).join(" | ") ?? "",
    STATUS: mutationRowStatusText(row).toUpperCase(),
    "PERIODE GAJI": row.day?.payrollPeriodId ?? order.payrollPeriodId ?? "",
    "STATUS TRANSFER": order.transferStatus ?? "PENDING",
  };
}

function mutationSourceSummaryRows(rows: MutationViewRow[]): ExportRecord[] {
  const map = new Map<string, { source: string; rows: number; total: number; selesai: number; bermasalah: number }>();
  for (const row of rows) {
    const source = row.order.source;
    const current = map.get(source) ?? { source, rows: 0, total: 0, selesai: 0, bermasalah: 0 };
    current.rows += 1;
    current.total += row.grossMinor;
    if (row.day ? Boolean(row.day.payrollClosedAt || row.day.status === "verified") : Boolean(row.order.payrollClosedAt || row.order.operationalStatus === "verified")) current.selesai += 1;
    if (row.day ? row.day.status === "on_hold" : row.order.operationalStatus === "on_hold") current.bermasalah += 1;
    map.set(source, current);
  }
  const result = [...map.values()].map((x) => ({
    SUMBER: x.source,
    "JUMLAH ORDER": x.rows,
    "TOTAL NILAI": x.total,
    SELESAI: x.selesai,
    BERMASALAH: x.bermasalah,
  }));
  if (result.length) result.push({
    SUMBER: "TOTAL",
    "JUMLAH ORDER": rows.length,
    "TOTAL NILAI": rows.reduce((sum, row) => sum + row.grossMinor, 0),
    SELESAI: rows.filter((row) => row.day ? Boolean(row.day.payrollClosedAt || row.day.status === "verified") : Boolean(row.order.payrollClosedAt || row.order.operationalStatus === "verified")).length,
    BERMASALAH: rows.filter((row) => row.day ? row.day.status === "on_hold" : row.order.operationalStatus === "on_hold").length,
  });
  return result;
}

function sourceSummaryRows(orders: Order[]): ExportRecord[] {
  const map = new Map<string, { source: string; orders: number; total: number; selesai: number; bermasalah: number }>();
  for (const order of orders) {
    const row = map.get(order.source) ?? { source: order.source, orders: 0, total: 0, selesai: 0, bermasalah: 0 };
    row.orders += 1;
    row.total += order.grossMinor;
    if (order.operationalStatus === "verified" || order.payrollClosedAt) row.selesai += 1;
    if (order.operationalStatus === "on_hold") row.bermasalah += 1;
    map.set(order.source, row);
  }
  const result = [...map.values()].map((x) => ({
    SUMBER: x.source,
    "JUMLAH ORDER": x.orders,
    "TOTAL NILAI": x.total,
    SELESAI: x.selesai,
    BERMASALAH: x.bermasalah,
  }));
  if (result.length) {
    result.push({
      SUMBER: "TOTAL",
      "JUMLAH ORDER": orders.length,
      "TOTAL NILAI": orders.reduce((sum, x) => sum + x.grossMinor, 0),
      SELESAI: orders.filter((x) => x.operationalStatus === "verified" || x.payrollClosedAt).length,
      BERMASALAH: orders.filter((x) => x.operationalStatus === "on_hold").length,
    });
  }
  return result;
}

function payrollSheetRows(rows: LivePayrollRow[]): ExportRecord[] {
  return rows.filter((row) => row.orderRefs.length).map((row) => ({
    NAMA: row.employee,
    "KODE KARYAWAN": row.employeeCode,
    FH: row.team,
    "STATUS KARYAWAN": row.employeeStatus,
    GAME: row.game,
    "ORDER SELESAI": row.orderRefs.join(", "),
    "TOTAL UNIT": row.units,
    "NILAI PEKERJAAN": row.gross,
    "PERSENTASE GAJI (%)": row.sharePercent,
    "GAJI SEBELUM POTONGAN": row.earning,
    OPERASIONAL: row.operational,
    KASBON: row.kasbon,
    "SISA KASBON": row.kasbonRemaining,
    DENDA: row.penalty,
    "BONUS / TIPS": row.bonusTips,
    "GAJI BERSIH": row.net,
  }));
}

function incomeRows(orders: Order[], payroll: LivePayrollRow[]): ExportRecord[] {
  const shareByEmployee = new Map(payroll.map((r) => [r.employeeCode, r.shareBps]));
  return orders.filter((order) => order.operationalStatus === "verified" || order.payrollClosedAt).flatMap((order) => getOrderAssignments(order).map((assignment) => {
    const workValue = getAssignmentGrossMinor(order, assignment);
    const shareBps = shareByEmployee.get(assignment.employeeCode) ?? 5000;
    return {
      "HARI & TANGGAL SELESAI": formatDateTimeID(order.verifiedAt ?? order.completedAt ?? order.orderedAt),
      KODE: order.externalReference,
      SUMBER: order.source,
      NAMA: assignment.employeeName,
      GAME: order.gameName ?? order.game,
      REGION: order.region ?? "",
      SERVER: order.server ?? "",
      FH: assignment.team,
      PROSES: assignment.process,
      "NILAI PEKERJAAN": workValue,
      "PERSENTASE GAJI (%)": shareBps / 100,
      "PENDAPATAN SEBELUM POTONGAN": calculateWorkerEarning(workValue, shareBps),
    };
  }));
}

function salesRow(order: Order): ExportRecord {
  const assignments = getOrderAssignments(order);
  return {
    "WAKTU ORDER": formatDateTimeID(order.orderedAt),
    "KODE ORDER": order.externalReference,
    SUMBER: order.source,
    "JENIS ORDER": order.orderType === "gold" ? "GOLD" : order.orderType === "item" ? "ITEM" : "BOOSTING",
    BUYER: order.buyerName ?? "",
    GAME: order.gameName ?? order.game,
    REGION: order.region ?? "",
    SERVER: order.server ?? "",
    "NAMA ORDER": order.orderType === "gold" ? "" : (order.orderName ?? order.service),
    TASK: order.task ?? "",
    JUMLAH: order.quantity,
    "HARGA TOTAL": order.grossMinor,
    KARYAWAN: assignments.map((a) => `${a.employeeName} (${a.team})`).join(" | "),
    STATUS: simpleOrderStatus(order),
    "WAKTU SELESAI": order.verifiedAt || order.completedAt ? formatDateTimeID(order.verifiedAt ?? order.completedAt ?? order.orderedAt) : "",
    "CLOSING ID": order.payrollPeriodId ?? "",
    "SUDAH DIGAJI": order.payrollClosedAt ? "YA" : "TIDAK",
  };
}

function employeeRows(
  employees: Employee[],
  defaultSharePercent: number,
  employeeSharePercent: Record<string, number>,
): ExportRecord[] {
  return employees.map((employee) => ({
    "ID KARYAWAN": employee.id,
    "KODE KARYAWAN": employee.code,
    "NAMA KARYAWAN": employee.name,
    FH: employee.team,
    STATUS: employee.workforceStatus,
    "PERSENTASE GAJI (%)": employeeSharePercent[employee.code] ?? defaultSharePercent,
  }));
}

function inventoryExportRows(rows: InventoryStock[]): ExportRecord[] {
  return rows.map((row) => ({
    GAME: row.game,
    REGION: row.region ?? "",
    SERVER: row.server ?? "",
    "JENIS STOK": row.stockType === "gold" ? "GOLD" : "ITEM",
    "NAMA GOLD / ITEM": row.stockType === "gold" ? "" : row.itemName,
    "KODE KARYAWAN": row.employeeCode,
    "KARYAWAN / GUDANG": row.employeeName,
    FH: row.team,
    "STOK TOTAL": row.onHand,
    "DIPESAN / CADANGAN": row.reserved,
    "STOK TERJUAL": row.sold ?? 0,
    TERSEDIA: Math.max(0, row.onHand - row.reserved),
  }));
}

function inventoryMovementRows(rows: InventoryMovement[]): ExportRecord[] {
  return rows.map((row) => ({
    WAKTU: formatDateTimeID(row.occurredAt),
    ARAH: row.movementType === "in" ? "STOK MASUK" : "STOK KELUAR",
    GAME: row.game,
    REGION: row.region ?? "",
    SERVER: row.server ?? "",
    "JENIS STOK": row.stockType === "gold" ? "GOLD" : "ITEM",
    "NAMA GOLD / ITEM": row.stockType === "gold" ? "" : row.itemName,
    "KODE KARYAWAN": row.employeeCode,
    "KARYAWAN / GUDANG": row.employeeName,
    FH: row.team,
    JUMLAH: row.quantity,
    RATE: row.movementType === "out" ? (row.rateMinor ?? 0) : "",
    "KODE ORDER": row.orderReference ?? "",
    CATATAN: row.note ?? "",
  }));
}

function closingHistoryRows(rows: ClosingExportRow[]): ExportRecord[] {
  return rows.map((row) => ({
    "CLOSING ID": row.id,
    MULAI: formatJakartaDateTimeInput(row.from),
    SAMPAI: formatJakartaDateTimeInput(row.to),
    "WAKTU CLOSING": formatDateTimeID(row.closedAt),
    "JUMLAH ORDER SELESAI": row.orderRefs.length,
    "DAFTAR ORDER": row.orderRefs.join(", "),
    "TOTAL PENJUALAN": row.totalOrderMinor,
    "TOTAL PAYROLL": row.totalPayrollMinor,
    STATUS: "CLOSED",
  }));
}

function isMoneyHeader(header: string) {
  return /RATE|HARGA|TOTAL NILAI|TOTAL ORDER|NILAI PEKERJAAN|PENDAPATAN|GAJI|OPERASIONAL|KASBON|DENDA|BONUS|MODAL|NILAI STOK|NILAI RISIKO|TOTAL PENJUALAN|TOTAL PAYROLL|NILAI ORDER/.test(header);
}

function isPercentHeader(header: string) {
  return /PERSENTASE|\(%\)/.test(header);
}

function isQuantityHeader(header: string) {
  return /JUMLAH|UNIT|STOK TOTAL|DIPESAN|TERSEDIA|BISA DIPAKAI|SELESAI|BERMASALAH/.test(header) && !isMoneyHeader(header);
}

function headerFill(header: string) {
  if (isPercentHeader(header)) return COLORS.greenBright;
  if (/RATE|MODAL RATA-RATA/.test(header)) return COLORS.cyan;
  if (/TOTAL ORDER|HARGA TOTAL|GAJI BERSIH|TOTAL NILAI|TOTAL PENJUALAN|TOTAL PAYROLL|NILAI RISIKO|NILAI STOK/.test(header)) return COLORS.red;
  if (isQuantityHeader(header)) return COLORS.greenBright;
  if (/STATUS|CLOSING|SUDAH DIGAJI/.test(header)) return COLORS.orange;
  return COLORS.blue;
}

function readableFontColor(fill: string) {
  return [COLORS.greenBright, COLORS.cyan, COLORS.orange].includes(fill) ? COLORS.black : COLORS.white;
}

function borderStyle() {
  const side = { style: "thin", color: { rgb: COLORS.border } };
  return { top: side, bottom: side, left: side, right: side };
}

function columnWidth(header: string, rows: ExportRecord[]) {
  const upper = header.toUpperCase();
  if (/HARI|WAKTU|MULAI|SAMPAI/.test(upper)) return 23;
  if (/NAMA ORDER|STOK GUDANG|NILAI PER KARYAWAN|DAFTAR ORDER|PENJELASAN|CATATAN/.test(upper)) return 34;
  if (/BUYER|KARYAWAN/.test(upper)) return 24;
  if (/GAME|LOKASI/.test(upper)) return 22;
  if (/KODE|REGION|SERVER|FH|JENIS|STATUS/.test(upper)) return 16;
  if (isMoneyHeader(upper)) return 20;
  const values = rows.slice(0, 100).map((r) => String(r[header] ?? "").length);
  const max = Math.max(header.length + 2, ...values, 10);
  return Math.min(30, Math.max(12, max + 2));
}

function ensureCell(XLSX: any, ws: any, r: number, c: number) {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  return ws[addr];
}

function styleStatusCell(cell: any, header: string) {
  if (typeof cell?.v !== "string") return;
  if (!/STATUS|SUDAH DIGAJI/.test(header)) return;
  const value = String(cell.v).toUpperCase();
  if (/SELESAI|DELIVERED|CLOSED|^YA$/.test(value)) {
    cell.s.fill = { patternType: "solid", fgColor: { rgb: COLORS.greenLight } };
    cell.s.font = { ...(cell.s.font ?? {}), bold: true, color: { rgb: "166534" } };
  } else if (/BERMASALAH|DIBATALKAN|DITUNDA|^TIDAK$/.test(value)) {
    cell.s.fill = { patternType: "solid", fgColor: { rgb: COLORS.redLight } };
    cell.s.font = { ...(cell.s.font ?? {}), bold: true, color: { rgb: "991B1B" } };
  } else if (/PROSES|DIKERJAKAN|PENDING|MENUNGGU|BARU/.test(value)) {
    cell.s.fill = { patternType: "solid", fgColor: { rgb: COLORS.yellowLight } };
    cell.s.font = { ...(cell.s.font ?? {}), bold: true, color: { rgb: "92400E" } };
  }
}

function styledJsonSheet(
  XLSX: any,
  rows: ExportRecord[],
  headers: string[],
  options: { title: string; subtitle: string; totalRow?: boolean },
) {
  const dataRows = rows.map((row) => headers.map((header) => row[header] ?? ""));
  const aoa: ExportValue[][] = [[options.title], [options.subtitle], headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const lastCol = Math.max(0, headers.length - 1);
  const lastDataRow = 2 + rows.length;

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: Math.max(2, lastDataRow), c: lastCol } }) };
  ws["!freeze"] = { xSplit: 0, ySplit: 3, topLeftCell: "A4", activePane: "bottomLeft", state: "frozen" };
  ws["!cols"] = headers.map((header) => ({ wch: columnWidth(header, rows) }));
  ws["!rows"] = [{ hpt: 30 }, { hpt: 24 }, { hpt: 38 }, ...rows.map(() => ({ hpt: 24 }))];

  for (let c = 0; c <= lastCol; c += 1) {
    const titleCell = ensureCell(XLSX, ws, 0, c);
    titleCell.s = {
      font: { name: "Roboto", sz: 17, bold: true, color: { rgb: COLORS.titleYellow } },
      fill: { patternType: "solid", fgColor: { rgb: COLORS.black } },
      alignment: { vertical: "center", horizontal: c === 0 ? "left" : "center" },
      border: borderStyle(),
    };

    const subtitleCell = ensureCell(XLSX, ws, 1, c);
    subtitleCell.s = {
      font: { name: "Roboto", sz: 10, bold: true, color: { rgb: COLORS.white } },
      fill: { patternType: "solid", fgColor: { rgb: COLORS.blue2 } },
      alignment: { vertical: "center", horizontal: c === 0 ? "left" : "center", wrapText: true },
      border: borderStyle(),
    };

    const header = headers[c];
    const fill = headerFill(header);
    const headerCell = ensureCell(XLSX, ws, 2, c);
    headerCell.s = {
      font: { name: "Roboto", sz: 10, bold: true, color: { rgb: readableFontColor(fill) } },
      fill: { patternType: "solid", fgColor: { rgb: fill } },
      alignment: { vertical: "center", horizontal: "center", wrapText: true },
      border: borderStyle(),
    };
  }

  for (let r = 0; r < rows.length; r += 1) {
    const actualRow = r + 3;
    for (let c = 0; c < headers.length; c += 1) {
      const header = headers[c];
      const cell = ensureCell(XLSX, ws, actualRow, c);
      const alternate = r % 2 === 0 ? COLORS.white : COLORS.grayLight;
      cell.s = {
        font: { name: "Roboto", sz: 10, bold: /KODE/.test(header), color: { rgb: COLORS.black } },
        fill: { patternType: "solid", fgColor: { rgb: alternate } },
        alignment: {
          vertical: "center",
          horizontal: typeof cell.v === "number" ? "right" : /KODE|SUMBER|FH|REGION|SERVER|JENIS|STATUS/.test(header) ? "center" : "left",
          wrapText: true,
        },
        border: borderStyle(),
      };
      if (typeof cell.v === "number") {
        if (isMoneyHeader(header)) cell.s.numFmt = MONEY_FORMAT;
        else if (isPercentHeader(header)) cell.s.numFmt = PERCENT_WHOLE_FORMAT;
        else cell.s.numFmt = NUMBER_FORMAT;
      }
      if (/^KODE$|KODE ORDER|KODE KARYAWAN/.test(header)) {
        cell.s.fill = { patternType: "solid", fgColor: { rgb: COLORS.black } };
        cell.s.font = { name: "Roboto", sz: 10, bold: true, color: { rgb: COLORS.greenBright } };
      }
      styleStatusCell(cell, header);
    }
  }

  if (options.totalRow && rows.length) {
    const totalIndex = rows.length - 1;
    const totalRow = totalIndex + 3;
    const first = rows[totalIndex];
    if (String(first[headers[0]] ?? "").toUpperCase() === "TOTAL") {
      for (let c = 0; c < headers.length; c += 1) {
        const cell = ensureCell(XLSX, ws, totalRow, c);
        cell.s = {
          ...(cell.s ?? {}),
          font: { name: "Roboto", sz: 10, bold: true, color: { rgb: COLORS.black } },
          fill: { patternType: "solid", fgColor: { rgb: COLORS.yellowLight } },
          border: borderStyle(),
          alignment: { vertical: "center", horizontal: typeof cell.v === "number" ? "right" : "center", wrapText: true },
          ...(typeof cell.v === "number" && isMoneyHeader(headers[c]) ? { numFmt: MONEY_FORMAT } : {}),
        };
      }
    }
  }

  return ws;
}


function styledSummaryDetailSheet(
  XLSX: any,
  args: {
    title: string;
    subtitle: string;
    summaryTitle: string;
    summaryRows: ExportRecord[];
    summaryHeaders: string[];
    detailTitle: string;
    detailRows: ExportRecord[];
    detailHeaders: string[];
  },
) {
  const maxCols = Math.max(args.summaryHeaders.length, args.detailHeaders.length);
  const summaryData = args.summaryRows.map((row) => args.summaryHeaders.map((header) => row[header] ?? ""));
  const detailData = args.detailRows.map((row) => args.detailHeaders.map((header) => row[header] ?? ""));
  const summaryHeaderRow = 3;
  const summaryStartRow = 4;
  const blankRow = summaryStartRow + summaryData.length;
  const detailTitleRow = blankRow + 1;
  const detailHeaderRow = detailTitleRow + 1;
  const detailStartRow = detailHeaderRow + 1;

  const aoa: ExportValue[][] = [
    [args.title],
    [args.subtitle],
    [args.summaryTitle],
    args.summaryHeaders,
    ...summaryData,
    [],
    [args.detailTitle],
    args.detailHeaders,
    ...detailData,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const lastCol = Math.max(0, maxCols - 1);
  const lastDetailRow = Math.max(detailHeaderRow, detailStartRow + detailData.length - 1);

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
    { s: { r: detailTitleRow, c: 0 }, e: { r: detailTitleRow, c: lastCol } },
  ];
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: detailHeaderRow, c: 0 },
      e: { r: lastDetailRow, c: Math.max(0, args.detailHeaders.length - 1) },
    }),
  };
  ws["!freeze"] = {
    xSplit: 0,
    ySplit: detailHeaderRow + 1,
    topLeftCell: `A${detailHeaderRow + 2}`,
    activePane: "bottomLeft",
    state: "frozen",
  };

  ws["!cols"] = Array.from({ length: maxCols }, (_, c) => {
    const summaryHeader = args.summaryHeaders[c];
    const detailHeader = args.detailHeaders[c];
    const summaryWidth = summaryHeader ? columnWidth(summaryHeader, args.summaryRows) : 0;
    const detailWidth = detailHeader ? columnWidth(detailHeader, args.detailRows) : 0;
    return { wch: Math.max(12, Math.min(36, Math.max(summaryWidth, detailWidth))) };
  });

  ws["!rows"] = aoa.map((_, r) => ({
    hpt: r === 0 ? 30 : r === 1 ? 28 : r === 2 || r === detailTitleRow ? 26 : r === summaryHeaderRow || r === detailHeaderRow ? 38 : r === blankRow ? 10 : 24,
  }));

  function styleMergedBand(row: number, fill: string, fontColor: string, fontSize: number, align: "left" | "center" = "left") {
    for (let c = 0; c <= lastCol; c += 1) {
      const cell = ensureCell(XLSX, ws, row, c);
      cell.s = {
        font: { name: "Roboto", sz: fontSize, bold: true, color: { rgb: fontColor } },
        fill: { patternType: "solid", fgColor: { rgb: fill } },
        alignment: { vertical: "center", horizontal: c === 0 ? align : "center", wrapText: true },
        border: borderStyle(),
      };
    }
  }

  styleMergedBand(0, COLORS.black, COLORS.titleYellow, 17, "left");
  styleMergedBand(1, COLORS.blue2, COLORS.white, 10, "left");
  styleMergedBand(2, COLORS.black, COLORS.titleYellow, 12, "left");
  styleMergedBand(detailTitleRow, COLORS.black, COLORS.titleYellow, 12, "left");

  function styleTable(headers: string[], rows: ExportRecord[], headerRow: number, dataStartRow: number, totalRow = false) {
    for (let c = 0; c < headers.length; c += 1) {
      const header = headers[c];
      const fill = headerFill(header);
      const cell = ensureCell(XLSX, ws, headerRow, c);
      cell.s = {
        font: { name: "Roboto", sz: 10, bold: true, color: { rgb: readableFontColor(fill) } },
        fill: { patternType: "solid", fgColor: { rgb: fill } },
        alignment: { vertical: "center", horizontal: "center", wrapText: true },
        border: borderStyle(),
      };
    }

    for (let r = 0; r < rows.length; r += 1) {
      const actualRow = dataStartRow + r;
      for (let c = 0; c < headers.length; c += 1) {
        const header = headers[c];
        const cell = ensureCell(XLSX, ws, actualRow, c);
        const alternate = r % 2 === 0 ? COLORS.white : COLORS.grayLight;
        cell.s = {
          font: { name: "Roboto", sz: 10, bold: /KODE/.test(header), color: { rgb: COLORS.black } },
          fill: { patternType: "solid", fgColor: { rgb: alternate } },
          alignment: {
            vertical: "center",
            horizontal: typeof cell.v === "number" ? "right" : /KODE|SUMBER|FH|REGION|SERVER|JENIS|STATUS/.test(header) ? "center" : "left",
            wrapText: true,
          },
          border: borderStyle(),
        };
        if (typeof cell.v === "number") {
          if (isMoneyHeader(header)) cell.s.numFmt = MONEY_FORMAT;
          else if (isPercentHeader(header)) cell.s.numFmt = PERCENT_WHOLE_FORMAT;
          else cell.s.numFmt = NUMBER_FORMAT;
        }
        if (/^KODE$|KODE ORDER|KODE KARYAWAN/.test(header)) {
          cell.s.fill = { patternType: "solid", fgColor: { rgb: COLORS.black } };
          cell.s.font = { name: "Roboto", sz: 10, bold: true, color: { rgb: COLORS.greenBright } };
        }
        styleStatusCell(cell, header);
      }
    }

    if (totalRow && rows.length && String(rows[rows.length - 1][headers[0]] ?? "").toUpperCase() === "TOTAL") {
      const r = dataStartRow + rows.length - 1;
      for (let c = 0; c < headers.length; c += 1) {
        const cell = ensureCell(XLSX, ws, r, c);
        cell.s = {
          ...(cell.s ?? {}),
          font: { name: "Roboto", sz: 10, bold: true, color: { rgb: COLORS.black } },
          fill: { patternType: "solid", fgColor: { rgb: COLORS.yellowLight } },
          border: borderStyle(),
          alignment: { vertical: "center", horizontal: typeof cell.v === "number" ? "right" : "center", wrapText: true },
          ...(typeof cell.v === "number" && isMoneyHeader(headers[c]) ? { numFmt: MONEY_FORMAT } : {}),
        };
      }
    }
  }

  styleTable(args.summaryHeaders, args.summaryRows, summaryHeaderRow, summaryStartRow, true);
  styleTable(args.detailHeaders, args.detailRows, detailHeaderRow, detailStartRow, false);
  return ws;
}

function styledKeyValueSheet(XLSX: any, title: string, subtitle: string, rows: [string, ExportValue][]) {
  const aoa: ExportValue[][] = [[title, ""], [subtitle, ""], ["KETERANGAN", "NILAI"], ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
  ];
  ws["!cols"] = [{ wch: 34 }, { wch: 34 }];
  ws["!rows"] = [{ hpt: 30 }, { hpt: 24 }, { hpt: 32 }, ...rows.map(() => ({ hpt: 24 }))];
  for (let c = 0; c < 2; c += 1) {
    ensureCell(XLSX, ws, 0, c).s = {
      font: { name: "Roboto", sz: 17, bold: true, color: { rgb: COLORS.titleYellow } },
      fill: { patternType: "solid", fgColor: { rgb: COLORS.black } },
      alignment: { vertical: "center", horizontal: "left" },
      border: borderStyle(),
    };
    ensureCell(XLSX, ws, 1, c).s = {
      font: { name: "Roboto", sz: 10, bold: true, color: { rgb: COLORS.white } },
      fill: { patternType: "solid", fgColor: { rgb: COLORS.blue2 } },
      alignment: { vertical: "center", horizontal: "left", wrapText: true },
      border: borderStyle(),
    };
    ensureCell(XLSX, ws, 2, c).s = {
      font: { name: "Roboto", sz: 10, bold: true, color: { rgb: COLORS.white } },
      fill: { patternType: "solid", fgColor: { rgb: COLORS.blue } },
      alignment: { vertical: "center", horizontal: "center", wrapText: true },
      border: borderStyle(),
    };
  }
  for (let r = 0; r < rows.length; r += 1) {
    const rowIndex = r + 3;
    for (let c = 0; c < 2; c += 1) {
      const cell = ensureCell(XLSX, ws, rowIndex, c);
      cell.s = {
        font: { name: "Roboto", sz: 10, bold: c === 0, color: { rgb: COLORS.black } },
        fill: { patternType: "solid", fgColor: { rgb: r % 2 === 0 ? COLORS.white : COLORS.grayLight } },
        alignment: { vertical: "center", horizontal: c === 0 ? "left" : typeof cell.v === "number" ? "right" : "left", wrapText: true },
        border: borderStyle(),
      };
      if (c === 1 && typeof cell.v === "number" && /GAJI|TOTAL|NILAI|PENJUALAN|PAYROLL|UANG|PROFIT/i.test(String(rows[r][0]))) {
        cell.s.numFmt = MONEY_FORMAT;
      } else if (c === 1 && typeof cell.v === "number") {
        cell.s.numFmt = NUMBER_FORMAT;
      }
    }
  }
  return ws;
}

function workbookWithMetadata(XLSX: any, title: string) {
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: title,
    Subject: "EVO COMEPLAYERS Ekspor Operasional & Keuangan",
    Author: "EVO COMEPLAYERS",
    Company: "EVO COMEPLAYERS",
    CreatedDate: new Date(),
  };
  return wb;
}

function appendStyledSheet(XLSX: any, wb: any, name: string, ws: any) {
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function writeStyledFile(XLSX: any, wb: any, filename: string) {
  XLSX.writeFile(wb, filename, { cellStyles: true, bookSST: true, compression: true });
}

function exportSubtitle(label: string) {
  return `FILTER / PERIODE: ${label || "SEMUA DATA"}  •  DIEKSPOR: ${formatDateTimeID(new Date().toISOString())}`;
}

export async function exportMutationsSpreadsheet(rows: MutationViewRow[] | Order[], label: string) {
  const viewRows: MutationViewRow[] = rows.length && "order" in rows[0] ? rows as MutationViewRow[] : expandMutationRows(rows as Order[]);
  const XLSX = await loadXlsx();
  const wb = workbookWithMetadata(XLSX, "EVO COMEPLAYERS - MUTASI");
  appendStyledSheet(XLSX, wb, "MUTASI", styledSummaryDetailSheet(XLSX, {
    title: "EVO COMEPLAYERS — MUTASI",
    subtitle: exportSubtitle(label),
    summaryTitle: "RINGKASAN MUTASI PER SUMBER",
    summaryRows: mutationSourceSummaryRows(viewRows),
    summaryHeaders: SOURCE_SUMMARY_HEADERS,
    detailTitle: "DATA MUTASI SESUAI FILTER",
    detailRows: viewRows.map(mutationRow),
    detailHeaders: MUTATION_HEADERS,
  }));
  writeStyledFile(XLSX, wb, `EVO_COMEPLAYERS_MUTASI_${safeFilePart(label)}.xlsx`);
}

export async function exportSalesSpreadsheet(rows: Order[], label: string) {
  const XLSX = await loadXlsx();
  const wb = workbookWithMetadata(XLSX, "EVO COMEPLAYERS - PENJUALAN");
  appendStyledSheet(XLSX, wb, "PENJUALAN", styledSummaryDetailSheet(XLSX, {
    title: "EVO COMEPLAYERS — PENJUALAN",
    subtitle: exportSubtitle(label),
    summaryTitle: "RINGKASAN PENJUALAN PER SUMBER",
    summaryRows: sourceSummaryRows(rows),
    summaryHeaders: SOURCE_SUMMARY_HEADERS,
    detailTitle: "DATA PENJUALAN SESUAI FILTER",
    detailRows: rows.map(salesRow),
    detailHeaders: SALES_HEADERS,
  }));
  writeStyledFile(XLSX, wb, `EVO_COMEPLAYERS_PENJUALAN_${safeFilePart(label)}.xlsx`);
}

export async function exportInventorySpreadsheet(rows: InventoryStock[], label: string) {
  const XLSX = await loadXlsx();
  const wb = workbookWithMetadata(XLSX, "EVO COMEPLAYERS - STOK GUDANG");
  const onlyGold = rows.length > 0 && rows.every((row) => row.stockType === "gold");
  const headers = onlyGold ? INVENTORY_HEADERS.filter((header) => header !== "NAMA GOLD / ITEM") : INVENTORY_HEADERS;
  appendStyledSheet(XLSX, wb, "STOK", styledJsonSheet(XLSX, inventoryExportRows(rows), headers, {
    title: "EVO COMEPLAYERS — STOK / GUDANG",
    subtitle: exportSubtitle(label),
  }));
  writeStyledFile(XLSX, wb, `EVO_COMEPLAYERS_STOK_${safeFilePart(label)}.xlsx`);
}

function movementDateKey(iso: string) {
  return toJakartaDateInput(iso);
}

function shortExportDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${day}-${months[Math.max(0, month - 1)]}-${year}`;
}

function movementProductKey(row: InventoryMovement) {
  return row.stockType === "gold"
    ? `GOLD|${row.game}`
    : `ITEM|${row.game}|${row.itemName || "ITEM"}`;
}

function movementProductTitle(rows: InventoryMovement[]) {
  const first = rows[0];
  if (!first) return "STOK";
  if (first.stockType === "gold") return first.game;
  return `${first.game} — ${first.itemName || "ITEM"}`;
}

function uniqueSheetName(base: string, used: Set<string>) {
  const cleaned = base.replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "STOK";
  if (!used.has(cleaned)) {
    used.add(cleaned);
    return cleaned;
  }
  let n = 2;
  while (true) {
    const suffix = ` ${n}`;
    const candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    n += 1;
  }
}

function styledInventoryMovementMatrixSheet(
  XLSX: any,
  rows: InventoryMovement[],
  options: { title: string; subtitle: string; isOut: boolean },
) {
  const dates = [...new Set(rows.map((row) => movementDateKey(row.occurredAt)))].sort();
  const first = rows[0];
  const isGold = rows.length === 0 || rows.every((row) => row.stockType === "gold");
  const unitLabel = isGold ? "GOLD" : "ITEM";
  const totalLabel = isGold ? "TOTAL GOLD" : "TOTAL ITEM";

  type MatrixRow = {
    employeeCode: string;
    employeeName: string;
    team: string;
    region: string;
    byDate: Record<string, { quantity: number; weightedValue: number }>;
    total: number;
    totalIncome: number;
  };

  const map = new Map<string, MatrixRow>();
  for (const row of rows) {
    const key = [row.employeeCode, row.employeeName, row.team, row.region ?? ""].join("|");
    const current = map.get(key) ?? {
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      team: row.team,
      region: row.region ?? "",
      byDate: {},
      total: 0,
      totalIncome: 0,
    };
    const date = movementDateKey(row.occurredAt);
    const cell = current.byDate[date] ?? { quantity: 0, weightedValue: 0 };
    cell.quantity += row.quantity;
    cell.weightedValue += row.quantity * Math.max(0, row.rateMinor ?? 0);
    current.byDate[date] = cell;
    current.total += row.quantity;
    if (options.isOut && row.stockType === "gold") {
      current.totalIncome += row.quantity * Math.max(0, row.rateMinor ?? 0);
    }
    map.set(key, current);
  }

  const matrixRows = [...map.values()].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName, "id") || a.employeeCode.localeCompare(b.employeeCode, "id"),
  );

  const headerTop: ExportValue[] = ["KODE KARYAWAN", "NAMA", "FH", "REGION"];
  const headerBottom: ExportValue[] = ["", "", "", ""];
  for (const date of dates) {
    headerTop.push(shortExportDate(date));
    headerBottom.push(options.isOut ? unitLabel : "");
    if (options.isOut) {
      headerTop.push("");
      headerBottom.push("RATE");
    }
  }
  headerTop.push(totalLabel);
  headerBottom.push("");
  const includeTotalIncome = options.isOut && isGold;
  if (includeTotalIncome) {
    headerTop.push("TOTAL PENGHASILAN");
    headerBottom.push("");
  }

  const aoa: ExportValue[][] = [
    [options.title],
    [options.subtitle],
    headerTop,
    headerBottom,
  ];

  for (const row of matrixRows) {
    const values: ExportValue[] = [row.employeeCode, row.employeeName, row.team, row.region];
    for (const date of dates) {
      const cell = row.byDate[date];
      values.push(cell?.quantity || "");
      if (options.isOut) {
        const rate = cell?.quantity ? Math.round(cell.weightedValue / cell.quantity) : 0;
        values.push(cell?.quantity ? rate : "");
      }
    }
    values.push(row.total);
    if (includeTotalIncome) values.push(row.totalIncome);
    aoa.push(values);
  }

  if (matrixRows.length) {
    const totals: ExportValue[] = ["TOTAL", "", "", ""];
    for (const date of dates) {
      const dateQty = matrixRows.reduce((sum, row) => sum + (row.byDate[date]?.quantity ?? 0), 0);
      totals.push(dateQty || "");
      if (options.isOut) {
        const weighted = matrixRows.reduce((sum, row) => sum + (row.byDate[date]?.weightedValue ?? 0), 0);
        totals.push(dateQty ? Math.round(weighted / dateQty) : "");
      }
    }
    totals.push(matrixRows.reduce((sum, row) => sum + row.total, 0));
    if (includeTotalIncome) {
      totals.push(matrixRows.reduce((sum, row) => sum + row.totalIncome, 0));
    }
    aoa.push(totals);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const lastCol = Math.max(0, headerTop.length - 1);
  const lastRow = Math.max(3, aoa.length - 1);

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];
  for (let c = 0; c < 4; c += 1) {
    ws["!merges"].push({ s: { r: 2, c }, e: { r: 3, c } });
  }
  let dateCol = 4;
  for (const _date of dates) {
    if (options.isOut) {
      ws["!merges"].push({ s: { r: 2, c: dateCol }, e: { r: 2, c: dateCol + 1 } });
      dateCol += 2;
    } else {
      ws["!merges"].push({ s: { r: 2, c: dateCol }, e: { r: 3, c: dateCol } });
      dateCol += 1;
    }
  }
  const totalGoldCol = includeTotalIncome ? lastCol - 1 : lastCol;
  ws["!merges"].push({ s: { r: 2, c: totalGoldCol }, e: { r: 3, c: totalGoldCol } });
  if (includeTotalIncome) {
    ws["!merges"].push({ s: { r: 2, c: lastCol }, e: { r: 3, c: lastCol } });
  }

  ws["!freeze"] = { xSplit: 4, ySplit: 4, topLeftCell: "E5", activePane: "bottomRight", state: "frozen" };
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: lastRow, c: lastCol } }) };
  ws["!cols"] = headerTop.map((_, c) => ({
    wch: c === 0 ? 18
      : c === 1 ? 22
      : c === 2 ? 10
      : c === 3 ? 12
      : includeTotalIncome && c === lastCol ? 20
      : options.isOut && c >= 4 && c < totalGoldCol ? 13
      : 14,
  }));
  ws["!rows"] = aoa.map((_, r) => ({ hpt: r === 0 ? 32 : r === 1 ? 26 : r <= 3 ? 30 : 24 }));

  for (let c = 0; c <= lastCol; c += 1) {
    const title = ensureCell(XLSX, ws, 0, c);
    title.s = {
      font: { name: "Roboto", sz: 18, bold: true, color: { rgb: COLORS.titleYellow } },
      fill: { patternType: "solid", fgColor: { rgb: COLORS.black } },
      alignment: { vertical: "center", horizontal: c === 0 ? "left" : "center" },
      border: borderStyle(),
    };
    const subtitle = ensureCell(XLSX, ws, 1, c);
    subtitle.s = {
      font: { name: "Roboto", sz: 10, bold: true, color: { rgb: COLORS.white } },
      fill: { patternType: "solid", fgColor: { rgb: COLORS.blue2 } },
      alignment: { vertical: "center", horizontal: c === 0 ? "left" : "center", wrapText: true },
      border: borderStyle(),
    };
  }

  for (let c = 0; c <= lastCol; c += 1) {
    for (let r = 2; r <= 3; r += 1) {
      const cell = ensureCell(XLSX, ws, r, c);
      const isIdentity = c < 4;
      const isTotalGold = c === totalGoldCol;
      const isTotalIncome = includeTotalIncome && c === lastCol;
      const isRate = options.isOut && r === 3 && String(cell.v).toUpperCase() === "RATE";
      const fill = isIdentity ? COLORS.blue
        : isRate ? COLORS.yellowLight
        : isTotalIncome ? COLORS.titleYellow
        : isTotalGold ? COLORS.orange
        : COLORS.greenBright;
      cell.s = {
        font: { name: "Roboto", sz: 10, bold: true, color: { rgb: fill === COLORS.blue ? COLORS.white : COLORS.black } },
        fill: { patternType: "solid", fgColor: { rgb: fill } },
        alignment: { vertical: "center", horizontal: "center", wrapText: true },
        border: borderStyle(),
      };
    }
  }

  for (let r = 4; r < aoa.length; r += 1) {
    const isTotalRow = String(ensureCell(XLSX, ws, r, 0).v ?? "").toUpperCase() === "TOTAL";
    for (let c = 0; c <= lastCol; c += 1) {
      const cell = ensureCell(XLSX, ws, r, c);
      const isIdentity = c < 4;
      const isRateCol = options.isOut && c >= 4 && c < totalGoldCol && ((c - 4) % 2 === 1);
      const isIncomeCol = includeTotalIncome && c === lastCol;
      cell.s = {
        font: { name: "Roboto", sz: 10, bold: isIdentity || isTotalRow, color: { rgb: COLORS.black } },
        fill: { patternType: "solid", fgColor: { rgb: isTotalRow ? COLORS.yellowLight : isIdentity ? COLORS.white : cell.v === "" ? COLORS.gray : COLORS.cyan } },
        alignment: { vertical: "center", horizontal: isIdentity ? (c === 1 ? "left" : "center") : "right", wrapText: true },
        border: borderStyle(),
      };
      if (typeof cell.v === "number") cell.s.numFmt = isRateCol || isIncomeCol ? MONEY_FORMAT : NUMBER_FORMAT;
      if (c === 0 && !isTotalRow) {
        cell.s.fill = { patternType: "solid", fgColor: { rgb: COLORS.black } };
        cell.s.font = { name: "Roboto", sz: 10, bold: true, color: { rgb: COLORS.greenBright } };
      }
    }
  }

  return ws;
}

export async function exportInventoryMovementsSpreadsheet(rows: InventoryMovement[], label: string) {
  const XLSX = await loadXlsx();
  const isOut = rows.some((row) => row.movementType === "out") || label.toUpperCase().includes("KELUAR");
  const baseTitle = isOut ? "STOK KELUAR" : "STOK MASUK";
  const wb = workbookWithMetadata(XLSX, `EVO COMEPLAYERS - ${baseTitle}`);
  const grouped = new Map<string, InventoryMovement[]>();
  for (const row of rows) {
    const key = movementProductKey(row);
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const usedNames = new Set<string>();
  if (!grouped.size) {
    appendStyledSheet(XLSX, wb, baseTitle, styledInventoryMovementMatrixSheet(XLSX, [], {
      title: `EVO COMEPLAYERS — ${baseTitle}`,
      subtitle: exportSubtitle(label),
      isOut,
    }));
  } else {
    let index = 1;
    for (const groupRows of grouped.values()) {
      const productTitle = movementProductTitle(groupRows);
      const sheetName = uniqueSheetName(grouped.size === 1 ? baseTitle : `${index}-${productTitle}`, usedNames);
      appendStyledSheet(XLSX, wb, sheetName, styledInventoryMovementMatrixSheet(XLSX, groupRows, {
        title: `EVO COMEPLAYERS — ${productTitle} — ${baseTitle}`,
        subtitle: exportSubtitle(label),
        isOut,
      }));
      index += 1;
    }
  }
  writeStyledFile(XLSX, wb, `EVO_COMEPLAYERS_${isOut ? "STOK_KELUAR" : "STOK_MASUK"}_${safeFilePart(label)}.xlsx`);
}

export async function exportPayrollSpreadsheet(rows: LivePayrollRow[], label: string) {
  const XLSX = await loadXlsx();
  const exportedRows = payrollSheetRows(rows);
  const normalized = label.trim().toUpperCase();
  const suffixMap: Record<string, string> = { FH1: "FH 1", FH2: "FH 2", FH3: "FH 3", ADMIN: "ADMIN", BANDAR: "BANDAR" };
  const suffix = normalized === "SEMUA" ? "" : (suffixMap[normalized] ?? label.trim());
  const payrollTitle = `EVO COMEPLAYERS — PENGGAJIAN${suffix ? ` ${suffix}` : ""}`;
  const wb = workbookWithMetadata(XLSX, `EVO COMEPLAYERS - PENGGAJIAN${suffix ? ` ${suffix}` : ""}`);
  appendStyledSheet(XLSX, wb, "PENGGAJIAN", styledJsonSheet(XLSX, exportedRows, PAYROLL_HEADERS, {
    title: payrollTitle,
    subtitle: exportSubtitle(label),
  }));
  writeStyledFile(XLSX, wb, `EVO_COMEPLAYERS_PAYROLL_${safeFilePart(label)}.xlsx`);
}

export async function exportEmployeesSpreadsheet(
  employees: Employee[],
  defaultSharePercent: number,
  employeeSharePercent: Record<string, number>,
  label: string,
) {
  const XLSX = await loadXlsx();
  const wb = workbookWithMetadata(XLSX, "EVO COMEPLAYERS - KARYAWAN");
  appendStyledSheet(XLSX, wb, "KARYAWAN", styledJsonSheet(XLSX, employeeRows(employees, defaultSharePercent, employeeSharePercent), EMPLOYEE_HEADERS, {
    title: "EVO COMEPLAYERS — DATA KARYAWAN",
    subtitle: exportSubtitle(label),
  }));
  writeStyledFile(XLSX, wb, `EVO_COMEPLAYERS_KARYAWAN_${safeFilePart(label)}.xlsx`);
}

export async function exportClosingSpreadsheet(args: {
  start: string;
  end: string;
  orders: Order[];
  payroll: LivePayrollRow[];
  inventory?: InventoryStock[];
  issues?: FinanceIssue[];
  deferredOrders?: Order[];
}) {
  const XLSX = await loadXlsx();
  const totalOrder = args.orders.reduce((sum, x) => sum + x.grossMinor, 0);
  const totalPayrollBeforeDeductions = args.payroll.reduce((sum, x) => sum + x.earning, 0);
  const totalPayrollNet = args.payroll.reduce((sum, x) => sum + x.net, 0);
  const periodLabel = `${args.start} sampai ${args.end}`;
  const wb = workbookWithMetadata(XLSX, "EVO COMEPLAYERS - LAPORAN CLOSING");

  appendStyledSheet(XLSX, wb, "RINGKASAN", styledKeyValueSheet(XLSX,
    "EVO COMEPLAYERS — LAPORAN CLOSING",
    `PERIODE: ${periodLabel}  •  DIEKSPOR: ${formatDateTimeID(new Date().toISOString())}`,
    [
      ["Periode", periodLabel],
      ["Pesanan selesai masuk gajian", args.orders.length],
      ["Total nilai pesanan selesai", totalOrder],
      ["Gaji sebelum potongan", totalPayrollBeforeDeductions],
      ["Gaji bersih", totalPayrollNet],
      ["Pesanan bermasalah ditunda", args.deferredOrders?.length ?? 0],
    ],
  ));

  appendStyledSheet(XLSX, wb, "RINGKASAN SUMBER", styledJsonSheet(XLSX, sourceSummaryRows(args.orders), SOURCE_SUMMARY_HEADERS, {
    title: "EVO COMEPLAYERS — RINGKASAN SUMBER CLOSING",
    subtitle: `PERIODE: ${periodLabel}`,
    totalRow: true,
  }));
  appendStyledSheet(XLSX, wb, "MUTASI", styledJsonSheet(XLSX, expandMutationRows(args.orders).map(mutationRow), MUTATION_HEADERS, {
    title: "EVO COMEPLAYERS — MUTASI CLOSING",
    subtitle: `PERIODE: ${periodLabel}`,
  }));
  appendStyledSheet(XLSX, wb, "PENDAPATAN", styledJsonSheet(XLSX, incomeRows(args.orders, args.payroll), INCOME_HEADERS, {
    title: "EVO COMEPLAYERS — PENDAPATAN",
    subtitle: `PERIODE: ${periodLabel}`,
  }));

  for (const team of ["FH1", "FH2", "FH3", "ADMIN", "BANDAR"] as const) {
    appendStyledSheet(XLSX, wb, `GAJI ${team}`, styledJsonSheet(XLSX, payrollSheetRows(args.payroll.filter((x) => x.team === team)), PAYROLL_HEADERS, {
      title: `EVO COMEPLAYERS — GAJI ${team}`,
      subtitle: `PERIODE: ${periodLabel}`,
    }));
  }

  const deferred: ExportRecord[] = (args.deferredOrders ?? []).map((order) => ({
    KODE: order.externalReference,
    SUMBER: order.source,
    GAME: order.gameName ?? order.game,
    STATUS: "BERMASALAH - DITUNDA",
    "NILAI ORDER": order.grossMinor,
  }));
  appendStyledSheet(XLSX, wb, "DITUNDA", styledJsonSheet(XLSX, deferred, DEFERRED_HEADERS, {
    title: "EVO COMEPLAYERS — ORDER BERMASALAH / DITUNDA",
    subtitle: `Tidak masuk penggajian periode ${periodLabel}`,
  }));

  const inventoryRows: ExportRecord[] = (args.inventory ?? []).map((row) => ({
    "KARYAWAN / GUDANG": row.employeeName,
    FH: row.team,
    JENIS: row.stockType === "gold" ? "GOLD" : "ITEM",
    GAME: row.game,
    REGION: row.region ?? "",
    SERVER: row.server ?? "",
    "NAMA GOLD / ITEM": row.stockType === "gold" ? "" : row.itemName,
    STOK: row.onHand,
    "SUDAH DIPESAN": row.reserved,
    "STOK TERJUAL": row.sold ?? 0,
    "BISA DIPAKAI": Math.max(0, row.onHand - row.reserved),
  }));
  appendStyledSheet(XLSX, wb, "STOK GUDANG", styledJsonSheet(XLSX, inventoryRows, INVENTORY_CLOSING_HEADERS, {
    title: "EVO COMEPLAYERS — STOK GUDANG",
    subtitle: `SNAPSHOT CLOSING: ${periodLabel}`,
  }));

  const issueRows: ExportRecord[] = (args.issues ?? []).map((issue) => ({
    ENTITAS: issue.entity,
    KODE: issue.code,
    MASALAH: issue.title,
    PENJELASAN: issue.description,
    TINGKAT: issue.severity,
    "NILAI RISIKO": issue.exposureMinor,
    STATUS: issue.status,
  }));
  appendStyledSheet(XLSX, wb, "MASALAH", styledJsonSheet(XLSX, issueRows, ISSUE_HEADERS, {
    title: "EVO COMEPLAYERS — MASALAH / PEMERIKSAAN",
    subtitle: `PERIODE: ${periodLabel}`,
  }));

  writeStyledFile(XLSX, wb, `EVO_COMEPLAYERS_Closing_${safeFilePart(args.start)}_${safeFilePart(args.end)}.xlsx`);
}

export function filterOrdersByDateRange(allOrders: Order[], start: string, end: string) {
  return allOrders.filter((order) => {
    const day = toJakartaDateInput(order.orderedAt);
    return day >= start && day <= end;
  });
}

/**
 * Export snapshot seluruh data operasional demo ke satu workbook Excel.
 * Fitur ini hanya membaca data; tidak mengubah order, stok, payroll, atau closing.
 */
export async function exportAllDataSpreadsheet(args: {
  orders: Order[];
  inventory: InventoryStock[];
  employees: Employee[];
  payroll: LivePayrollRow[];
  closings: ClosingExportRow[];
  defaultSharePercent: number;
  employeeSharePercent: Record<string, number>;
}) {
  const XLSX = await loadXlsx();
  const exportedAt = new Date().toISOString();
  const wb = workbookWithMetadata(XLSX, "EVO COMEPLAYERS - EXPORT DATA");

  appendStyledSheet(XLSX, wb, "RINGKASAN", styledKeyValueSheet(XLSX,
    "EVO COMEPLAYERS — EXPORT SEMUA DATA",
    `WAKTU EXPORT: ${formatDateTimeID(exportedAt)}`,
    [
      ["Jumlah karyawan", args.employees.length],
      ["Jumlah penjualan / pesanan", args.orders.length],
      ["Jumlah mutasi", args.orders.length],
      ["Jumlah baris stok", args.inventory.length],
      ["Karyawan dalam penggajian aktif", args.payroll.filter((row) => row.orderRefs.length > 0).length],
      ["Jumlah tutup buku", args.closings.length],
    ],
  ));
  appendStyledSheet(XLSX, wb, "MUTASI", styledJsonSheet(XLSX, expandMutationRows(args.orders).map(mutationRow), MUTATION_HEADERS, {
    title: "EVO COMEPLAYERS — MUTASI",
    subtitle: exportSubtitle("SEMUA DATA"),
  }));
  appendStyledSheet(XLSX, wb, "STOK", styledJsonSheet(XLSX, inventoryExportRows(args.inventory), INVENTORY_HEADERS, {
    title: "EVO COMEPLAYERS — STOK / GUDANG",
    subtitle: exportSubtitle("SEMUA DATA"),
  }));
  appendStyledSheet(XLSX, wb, "PENJUALAN", styledJsonSheet(XLSX, args.orders.map(salesRow), SALES_HEADERS, {
    title: "EVO COMEPLAYERS — PENJUALAN",
    subtitle: exportSubtitle("SEMUA DATA"),
  }));
  appendStyledSheet(XLSX, wb, "PENGGAJIAN", styledJsonSheet(XLSX, payrollSheetRows(args.payroll), PAYROLL_HEADERS, {
    title: "EVO COMEPLAYERS — PENGGAJIAN",
    subtitle: exportSubtitle("SEMUA DATA"),
  }));
  appendStyledSheet(XLSX, wb, "TUTUP BUKU", styledJsonSheet(XLSX, closingHistoryRows(args.closings), CLOSING_HISTORY_HEADERS, {
    title: "EVO COMEPLAYERS — RIWAYAT TUTUP BUKU",
    subtitle: exportSubtitle("SEMUA DATA"),
  }));
  appendStyledSheet(XLSX, wb, "KARYAWAN", styledJsonSheet(XLSX, employeeRows(args.employees, args.defaultSharePercent, args.employeeSharePercent), EMPLOYEE_HEADERS, {
    title: "EVO COMEPLAYERS — DATA KARYAWAN",
    subtitle: exportSubtitle("SEMUA DATA"),
  }));

  const stamp = exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  writeStyledFile(XLSX, wb, `EVO_COMEPLAYERS_EXPORT_${stamp}.xlsx`);
}

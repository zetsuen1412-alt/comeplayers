export type Severity = "info" | "warning" | "high" | "critical";

export type OperationalStatus =
  | "draft"
  | "confirmed"
  | "assignment_pending"
  | "assigned"
  | "in_progress"
  | "partially_completed"
  | "completed"
  | "verified"
  | "on_hold"
  | "cancelled";

export type FinanceStatus =
  | "pending"
  | "under_review"
  | "verified"
  | "reconciled"
  | "ready_to_close"
  | "closed";

export type OrderType = "gold" | "item" | "boosting";
export type OrderScheduleMode = "single" | "daily";
export type OrderDailyStatus = "pending" | "in_progress" | "verified" | "on_hold";

export interface OrderIssue {
  code: string;
  title: string;
  description: string;
  severity: Severity;
  source?: "import" | "validation" | "manual";
}

export interface OrderDailyWork {
  id: string;
  sequence: number;
  workDate: string;
  grossMinor: number;
  /** RATE asli pada hari ini; tidak diturunkan dari TOTAL. */
  rateMinor?: number;
  status: OrderDailyStatus;
  /** Jumlah unit pada baris harian. Untuk boosting biasanya 1 hari. */
  quantity?: number;
  /** Jam kerja per hari yang terbaca dari nama paket, mis. 5 atau 12 jam/hari. */
  hours?: number;
  /** Karyawan khusus hari ini. Jika kosong, gunakan workerAssignments pada parent order. */
  workerAssignments?: OrderWorkerAssignment[];
  /** Jejak sumber spreadsheet untuk impor historis. */
  sourceRow?: number;
  sourceOrderedAt?: string;
  sourceStatus?: string;
  issues?: OrderIssue[];
  completedAt?: string;
  verifiedAt?: string;
  payrollClosedAt?: string;
  payrollPeriodId?: string;
}
export type StockType = "gold" | "item";
export type EmployeeWorkStatus = "NEW" | "SHIFT" | "FULL" | "SAKIT" | "IJIN" | "RESIGN";

export interface ProductGameRegion {
  name: string;
  servers: string[];
}

export interface ProductGame {
  id: string;
  code: string;
  name: string;
  aliases?: string[];
  regions: ProductGameRegion[];
  active: boolean;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  team: "FH1" | "FH2" | "FH3" | "ADMIN" | "BANDAR";
  workforceStatus: EmployeeWorkStatus;
  utilization: number;
  earningsMinor: number;
  /** Stable website identity linked to an authoritative Payroll sheet roster. */
  sheetRosterSource?: {
    spreadsheetId: string;
    sheetName: "PAYROLL-1" | "PAYROLL-2" | "PAYROLL-3";
    rowNumber: number;
    type?: string;
  };
  /** Retained identity when a referenced employee disappears from the Sheet. */
  sheetRosterMissingAt?: string;
}

export interface OrderWorkerAssignment {
  id: string;
  employeeCode: string;
  employeeName: string;
  team: "FH1" | "FH2" | "FH3" | "ADMIN" | "BANDAR";
  process: string;
  quantity: number;
}

export interface InventoryStock {
  id: string;
  stockType: StockType;
  game: string;
  region?: string;
  server?: string;
  itemName: string;
  locationName: string;
  employeeCode: string;
  employeeName: string;
  team: "FH1" | "FH2" | "FH3" | "ADMIN" | "BANDAR";
  onHand: number;
  reserved: number;
  sold: number;
  avgCostMinor?: number;
}

export type InventoryMovementType = "in" | "out";

export interface InventoryMovement {
  id: string;
  stockId: string;
  movementType: InventoryMovementType;
  occurredAt: string;
  stockType: StockType;
  game: string;
  region?: string;
  server?: string;
  itemName: string;
  locationName: string;
  employeeCode: string;
  employeeName: string;
  team: "FH1" | "FH2" | "FH3" | "ADMIN" | "BANDAR";
  quantity: number;
  rateMinor?: number;
  orderReference?: string;
  note?: string;
}

export interface OrderInventoryAllocation {
  id: string;
  inventoryStockId: string;
  stockType: StockType;
  game: string;
  region?: string;
  server?: string;
  itemName: string;
  locationName: string;
  employeeCode: string;
  employeeName: string;
  team: "FH1" | "FH2" | "FH3" | "ADMIN" | "BANDAR";
  quantity: number;
}

export interface Order {
  /** Website-admin controls. Spreadsheet payloads never supply these fields. */
  sheetSyncLocked?: boolean;
  sheetSyncLockedAt?: string;
  sheetSyncLockedBy?: string;
  sheetSyncRefreshRequested?: boolean;
  /** Recoverable archive marker: KODE absent from a complete source snapshot. */
  sheetDeletedAt?: string;
  /** Recoverable deletion by a website admin; source sync must preserve it. */
  websiteDeletedAt?: string;
  websiteDeletedBy?: string;
  id: string;
  orderNumber: string;
  externalReference: string;
  source: string;
  buyerName?: string;
  orderName?: string;
  /** Optional task/instruction note shown in Pesanan and Mutasi. */
  task?: string;
  orderType?: OrderType;
  scheduleMode?: OrderScheduleMode;
  scheduleStartDate?: string;
  /** Total hari paket asli, termasuk bila impor hanya memuat sebagian hari. */
  scheduleTotalDays?: number;
  /** Jam pengerjaan per hari yang terbaca dari nama paket. */
  dailyHours?: number;
  dailyWork?: OrderDailyWork[];
  game: string;
  gameId?: string;
  gameName?: string;
  region?: string;
  server?: string;
  service: string;
  process?: string;
  employeeCode?: string;
  employeeName?: string;
  team?: string;
  /** Admin chooses the destination; a leader may choose the worker later. */
  assignmentMode?: "leader" | "direct";
  quantity: number;
  rateMinor?: number;
  grossMinor: number;
  workerAssignments?: OrderWorkerAssignment[];
  inventoryAllocations?: OrderInventoryAllocation[];
  inventoryConsumedAt?: string;
  /** Legacy field kept only for compatibility with older demo orders. Payroll percentage is now configured globally in Gaji. */
  workerShareBps?: number;
  transferStatus?: string;
  operationalStatus: OperationalStatus;
  financeStatus: FinanceStatus;
  expectedPaymentMinor: number;
  matchedPaymentMinor: number;
  orderedAt: string;
  dueAt: string;
  completedAt?: string;
  verifiedAt?: string;
  payrollClosedAt?: string;
  payrollPeriodId?: string;
  /** Detail masalah yang ditemukan saat impor/validasi agar baris Bermasalah dapat dijelaskan. */
  importIssues?: OrderIssue[];
  importNeedsReview?: boolean;
  importSourceRow?: number;
  importSourceRows?: number[];
}

export interface VendorMutation {
  id: string;
  code: string;
  source: string;
  buyerName: string;
  orderName: string;
  team: string;
  seller: string;
  game: string;
  process: string;
  quantity: number;
  sellRateMinor: number;
  sellTotalMinor: number;
  vendorRateMinor: number;
  vendorTotalMinor: number;
  profitMinor: number;
  transferStatus: string;
  orderedAt: string;
}

export interface FinanceIssue {
  id: string;
  code: string;
  entity: string;
  severity: Severity;
  exposureMinor: number;
  title: string;
  description: string;
  status: "open" | "under_review" | "resolved" | "false_positive";
}

"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
import { getPayrollActor, withPayrollBatch, flushPayroll } from "@/features/payroll/lib/workspace-store";
import { hasAutomaticSheetProtection, isSheetOrder } from "@/features/payroll/lib/sheet-sync-policy";
import { canonical } from "@/features/payroll/lib/workspace-model";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/features/payroll/components/page-header";
import { MutationSpreadsheet } from "@/features/payroll/components/mutation-spreadsheet";
import { MutationIssueModal } from "@/features/payroll/components/mutation-issue-modal";
import { TelegramEvidenceModal } from "@/features/payroll/components/telegram-evidence-modal";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { compareMutationOrders, defaultMutationSort, mutationSortLabel, toggleMutationSort, type MutationSortState } from "@/features/payroll/lib/mutation-table-sort";
import { useDemoPeriodLock } from "@/features/payroll/lib/demo-period-lock-store";
import { MutationEditModal } from "@/features/payroll/components/mutation-edit-modal";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoInventory } from "@/features/payroll/lib/demo-inventory-store";
import { formatMoney } from "@/features/payroll/lib/money";
import { formatDateTimeID, toJakartaDateInput, todayJakartaDateInput } from "@/features/payroll/lib/date";
import { getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { getPayrollEligibleGrossMinor, replaceDailyWorkStatus } from "@/features/payroll/lib/daily-orders";
import { exportMutationsSpreadsheet } from "@/features/payroll/lib/spreadsheet-export";
import { useDemoMutationHistory } from "@/features/payroll/lib/demo-mutation-history-store";
import { analyzeOrderIssues, hasBlockingOrderIssues } from "@/features/payroll/lib/order-issues";
import { analyzeOrderQuantityIssues } from "@/features/payroll/lib/order-quantity";
import { buildOrderPriceAssessments, type PriceTier } from "@/features/payroll/lib/price-anomaly";
import {
  expandMutationRows,
  formatMutationDistribution,
  mutationDayLabel,
  normalizeDivisionLabel,
  type MutationViewRow,
} from "@/features/payroll/lib/mutation-rows";
import type { Order, OrderIssue } from "@/features/payroll/types/domain";

type DateMode = "all" | "today" | "week" | "month" | "range";
type TypeFilter = "SEMUA" | "gold" | "item" | "boosting";
type ProblemFilter = "SEMUA" | "BERMASALAH" | "NORMAL";
type PriceFilter = "SEMUA" | "TURUN" | PriceTier;
type ActivePriceGroup = { key: string; label: string };
type SortMode = "newest" | "oldest" | "highest" | "lowest" | "source_az" | "buyer_az" | "game_az" | "employee_az" | "employee_za" | "division_az" | "division_za";
type PriceSortMode = SortMode | "price_drop";

const priceFilterLabels: Record<PriceFilter, string> = {
  SEMUA: "Semua harga",
  TURUN: "Semua penurunan ≥10%",
  "10": "Turun 10–<20% · biru muda",
  "20": "Turun 20–<30% · pink",
  "30": "Turun ≥30% · coklat",
};

const priceBasisLabels = { order: "Harga pesanan", unit: "Harga per unit", day: "Harga per hari" } as const;
const pricePercentFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
type TelegramMutationStatus = {
  order_ref: string;
  order_type: "boosting" | "gold" | "item";
  target_quantity: number | string;
  delivered_quantity: number | string;
  state: "waiting" | "assigned" | "in_progress" | "paused" | "problem" | "done_pending_admin" | "verified";
  dispatch_status?: string;
  last_event_at?: string;
  assignment?: { employee_code?: string; division?: string; status?: string } | null;
};

function dateDaysAgo(dateInput: string, days: number) {
  const date = new Date(`${dateInput}T12:00:00+07:00`);
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function monthStart(dateInput: string) {
  return `${dateInput.slice(0, 7)}-01`;
}

function workStatus(row: MutationViewRow, issues: OrderIssue[]) {
  if (hasBlockingOrderIssues(issues)) return { label: `Bermasalah · ${issues.length}`, cls: "bg-red-500 text-white" };
  if (row.day) {
    if (row.day.payrollClosedAt) return { label: "Selesai · sudah digaji", cls: "bg-emerald-500 text-black" };
    if (row.day.status === "verified") return { label: "Selesai · masuk gaji", cls: "bg-emerald-500/20 text-emerald-200" };
    if (row.day.status === "on_hold") return { label: "Bermasalah", cls: "bg-red-500 text-white" };
    if (row.day.status === "in_progress") return { label: "Dikerjakan", cls: "bg-sky-500/15 text-sky-200" };
    return { label: "Proses", cls: "bg-violet-500/15 text-violet-200" };
  }

  const order = row.order;
  if (order.payrollClosedAt) return { label: "Selesai · sudah digaji", cls: "bg-emerald-500 text-black" };
  if (order.operationalStatus === "verified") return { label: "Selesai · masuk gaji", cls: "bg-emerald-500/20 text-emerald-200" };
  if (order.operationalStatus === "on_hold") return { label: "Bermasalah", cls: "bg-red-500 text-white" };
  if (order.operationalStatus === "completed") return { label: "Selesai · belum masuk gaji", cls: "bg-amber-500/15 text-amber-200" };
  if (order.operationalStatus === "in_progress") return { label: "Dikerjakan", cls: "bg-sky-500/15 text-sky-200" };
  if (order.operationalStatus === "assigned") return { label: "Proses", cls: "bg-violet-500/15 text-violet-200" };
  if (order.operationalStatus === "assignment_pending") return { label: "Belum ada karyawan", cls: "bg-zinc-800 text-zinc-300" };
  if (order.operationalStatus === "cancelled") return { label: "Dibatalkan", cls: "bg-red-500/15 text-red-200" };
  return { label: "Baru", cls: "bg-zinc-800 text-zinc-300" };
}

function compareViewRows(a: MutationViewRow, b: MutationViewRow, sort: MutationSortState) {
  if (sort.column === "date" || sort.column === "quantity" || sort.column === "total") {
    let result = sort.column === "date"
      ? Date.parse(a.orderedAt) - Date.parse(b.orderedAt)
      : sort.column === "quantity"
        ? a.quantity - b.quantity
        : a.grossMinor - b.grossMinor;
    if (!result) result = a.order.externalReference.localeCompare(b.order.externalReference, "id", { numeric: true });
    if (!result) result = (a.day?.sequence ?? 0) - (b.day?.sequence ?? 0);
    return sort.direction === "asc" ? result : -result;
  }

  if (sort.column === "workers" || sort.column === "division") {
    const value = (row: MutationViewRow) => sort.column === "workers"
      ? row.assignments.map((assignment) => assignment.employeeName).join(" ")
      : mutationDivisions(row).join(" ");
    let result = value(a).localeCompare(value(b), "id", { numeric: true, sensitivity: "base" });
    if (!result) result = a.order.externalReference.localeCompare(b.order.externalReference, "id", { numeric: true });
    if (!result) result = (a.day?.sequence ?? 0) - (b.day?.sequence ?? 0);
    return sort.direction === "asc" ? result : -result;
  }

  const result = compareMutationOrders(a.order, b.order, sort);
  if (result) return result;
  return (a.day?.sequence ?? 0) - (b.day?.sequence ?? 0);
}

const divisionOrder = ["FH1", "FH2", "FH3", "ADMIN", "BANDAR"] as const;

function mutationDivisions(row: MutationViewRow) {
  return [...new Set(row.assignments.map((assignment) => normalizeDivisionLabel(assignment.team)))]
    .sort((a, b) => {
      const ai = divisionOrder.indexOf(a as (typeof divisionOrder)[number]);
      const bi = divisionOrder.indexOf(b as (typeof divisionOrder)[number]);
      if (ai === -1 && bi === -1) return a.localeCompare(b, "id");
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
}

const sortPresets: Record<SortMode, MutationSortState> = {
  newest: { column: "date", direction: "desc" },
  oldest: { column: "date", direction: "asc" },
  highest: { column: "total", direction: "desc" },
  lowest: { column: "total", direction: "asc" },
  source_az: { column: "source", direction: "asc" },
  buyer_az: { column: "buyer", direction: "asc" },
  game_az: { column: "game", direction: "asc" },
  employee_az: { column: "workers", direction: "asc" },
  employee_za: { column: "workers", direction: "desc" },
  division_az: { column: "division", direction: "asc" },
  division_za: { column: "division", direction: "desc" },
};

function sortModeFromState(state: MutationSortState): SortMode | "custom" {
  for (const [mode, preset] of Object.entries(sortPresets) as [SortMode, MutationSortState][]) {
    if (preset.column === state.column && preset.direction === state.direction) return mode;
  }
  return "custom";
}

function TaskDetailModal({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={`TASK ${order.externalReference}`} onMouseDown={onClose}>
      <section className="max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-yellow-300">TASK</div>
            <h2 className="mt-1 truncate text-xl font-semibold">{order.externalReference}</h2>
            <p className="mt-1 truncate text-sm text-zinc-500">{order.orderName ?? order.service}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-semibold hover:bg-zinc-700">Tutup</button>
        </div>
        <div className="max-h-[62vh] overflow-auto p-5">
          <div className="whitespace-pre-wrap break-words rounded-xl border border-zinc-800 bg-black/40 p-4 text-sm leading-7 text-zinc-200">
            {order.task?.trim() || "TASK belum diisi."}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function MutationsPage() {
  const { allOrders, archivedOrders, updateOrder } = useDemoOrders();
  const { employees } = useDemoEmployees();
  const { isLocked } = useDemoPeriodLock();
  const { consumeAllocations } = useDemoInventory();
  const { addHistory, countsByOrder } = useDemoMutationHistory();
  const today = todayJakartaDateInput();
  const [mode, setMode] = useState<DateMode>("all");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState("SEMUA");
  const [type, setType] = useState<TypeFilter>("SEMUA");
  const [buyer, setBuyer] = useState("SEMUA");
  const [game, setGame] = useState("SEMUA");
  const [employee, setEmployee] = useState("SEMUA");
  const [division, setDivision] = useState("SEMUA");
  const [problem, setProblem] = useState<ProblemFilter>("SEMUA");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("SEMUA");
  const [activePriceGroup, setActivePriceGroup] = useState<ActivePriceGroup | null>(null);
  const [sortByPriceDrop, setSortByPriceDrop] = useState(false);
  const [sortState, setSortState] = useState<MutationSortState>(defaultMutationSort);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [savingSyncLocks, setSavingSyncLocks] = useState(false);
  const [telegramStatuses, setTelegramStatuses] = useState<Record<string, TelegramMutationStatus>>({});
  const [telegramEvidenceOrder, setTelegramEvidenceOrder] = useState<string | null>(null);
  const canManageSync = getPayrollActor()?.isAdmin === true;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await authenticatedFetchJson<{ orders: TelegramMutationStatus[] }>("/api/admin/payroll/telegram/status");
        if (!active) return;
        setTelegramStatuses(Object.fromEntries(result.orders.map(row => [row.order_ref.trim().toLowerCase(), row])));
      } catch {
        // Mutasi tetap dapat dipakai bila integrasi Telegram belum dikonfigurasi.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  async function setSheetLocks(ids: string[], locked: boolean, restore = false) {
    if (!canManageSync || isLocked || savingSyncLocks) return;
    setSavingSyncLocks(true);
    try {
      const eligible = [...allOrders, ...archivedOrders].filter(order => ids.includes(order.id) && isSheetOrder(order) && !hasAutomaticSheetProtection(order));
      withPayrollBatch(() => {
        for (const order of eligible) updateOrder(order.id, { sheetSyncLocked: locked, ...(restore ? { sheetDeletedAt: undefined } : {}) });
      });
      await flushPayroll();
      const savedIds = new Set(eligible.map(order => order.id));
      setSelectedOrderIds(selected => selected.filter(id => !savedIds.has(id)));
      setNotice(restore ? "Pesanan dipulihkan dan dikunci dari spreadsheet." : `${eligible.length} pesanan ${locked ? "dikunci dari perubahan dan penghapusan spreadsheet" : "dibuka; perubahan terbaru akan diambil pada sinkronisasi berikutnya"}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Kunci sinkronisasi belum tersimpan."); }
    finally { setSavingSyncLocks(false); }
  }
  const [editingRow, setEditingRow] = useState<MutationViewRow | null>(null);
  const [taskOrder, setTaskOrder] = useState<Order | null>(null);
  const [issueRow, setIssueRow] = useState<{ row: MutationViewRow; issues: OrderIssue[] } | null>(null);

  const sources = useMemo(() => [...new Set(allOrders.map((order) => order.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [allOrders]);
  const buyers = useMemo(() => [...new Set(allOrders.map((order) => order.buyerName?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "id")), [allOrders]);
  const games = useMemo(() => [...new Set(allOrders.map((order) => (order.gameName ?? order.game).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [allOrders]);
  const assignmentOptions = useMemo(() => expandMutationRows(allOrders).flatMap((row) => row.assignments), [allOrders]);
  const employeeNames = useMemo(() => [...new Set(assignmentOptions.map((assignment) => assignment.employeeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [assignmentOptions]);
  const divisions = useMemo(() => [...new Set(assignmentOptions.map((assignment) => normalizeDivisionLabel(assignment.team)).filter(Boolean))].sort((a, b) => {
    const ai = divisionOrder.indexOf(a as (typeof divisionOrder)[number]);
    const bi = divisionOrder.indexOf(b as (typeof divisionOrder)[number]);
    if (ai === -1 && bi === -1) return a.localeCompare(b, "id");
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }), [assignmentOptions]);

  const priceAssessments = useMemo(() => buildOrderPriceAssessments(allOrders), [allOrders]);

  const filteredOrders = useMemo(() => allOrders.filter((order) => {
    if (type !== "SEMUA" && order.orderType !== type) return false;
    if (buyer !== "SEMUA" && (order.buyerName ?? "") !== buyer) return false;
    if (game !== "SEMUA" && (order.gameName ?? order.game) !== game) return false;
    return true;
  }), [allOrders, buyer, game, type]);

  const periodRows = useMemo(() => expandMutationRows(filteredOrders).filter((row) => {
    const day = toJakartaDateInput(row.orderedAt);
    if (mode === "today" && day !== today) return false;
    if (mode === "week" && !(day >= dateDaysAgo(today, 6) && day <= today)) return false;
    if (mode === "month" && !(day >= monthStart(today) && day <= today)) return false;
    if (mode === "range" && !(day >= from && day <= to)) return false;
    return true;
  }), [filteredOrders, from, mode, to, today]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = periodRows.filter((row) => {
      const price = priceAssessments.get(row.order.id);
      if (activePriceGroup && price?.groupKey !== activePriceGroup.key) return false;
      const priceTier = price?.tier;
      if (priceFilter === "TURUN" && !priceTier) return false;
      if (priceFilter !== "SEMUA" && priceFilter !== "TURUN" && priceTier !== priceFilter) return false;
      if (source !== "SEMUA" && row.order.source !== source) return false;
      if (employee !== "SEMUA" && !row.assignments.some((assignment) => assignment.employeeName === employee)) return false;
      if (division !== "SEMUA" && !row.assignments.some((assignment) => normalizeDivisionLabel(assignment.team) === division)) return false;

      const issues = analyzeOrderIssues(row.order, employees, row.day);
      const problematic = hasBlockingOrderIssues(issues) || (row.day ? row.day.status === "on_hold" : row.order.operationalStatus === "on_hold");
      if (problem === "BERMASALAH" && !problematic) return false;
      if (problem === "NORMAL" && problematic) return false;

      if (term) {
        const searchable = [
          row.order.externalReference,
          row.order.buyerName ?? "",
          row.order.orderName ?? row.order.service ?? "",
          row.order.task ?? "",
          row.order.gameName ?? row.order.game ?? "",
          problematic ? "bermasalah masalah perlu diperbaiki" : "normal tidak bermasalah",
          ...row.assignments.flatMap((assignment) => [assignment.employeeName, assignment.team]),
          ...issues.flatMap((issue) => [issue.code, issue.title, issue.description]),
        ].join(" ").toLowerCase();
        if (!searchable.includes(term)) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sortByPriceDrop) {
        const aDrop = priceAssessments.get(a.order.id)?.dropPercent;
        const bDrop = priceAssessments.get(b.order.id)?.dropPercent;
        if (aDrop === undefined && bDrop !== undefined) return 1;
        if (aDrop !== undefined && bDrop === undefined) return -1;
        if (aDrop !== undefined && bDrop !== undefined && aDrop !== bDrop) return bDrop - aDrop;
      }
      return compareViewRows(a, b, sortState);
    });
  }, [activePriceGroup, division, employee, employees, periodRows, priceAssessments, priceFilter, problem, search, sortByPriceDrop, sortState, source]);

  const visibleOrderIds = useMemo(() => [...new Set(rows.map(row => row.order.id))], [rows]);
  const visibleOrderIdSet = useMemo(() => new Set(visibleOrderIds), [visibleOrderIds]);
  const selectedOrderIdSet = useMemo(() => {
    const activeIds = new Set(allOrders.map(order => order.id));
    return new Set(selectedOrderIds.filter(id => activeIds.has(id)));
  }, [allOrders, selectedOrderIds]);
  const selectedVisibleCount = visibleOrderIds.filter(id => selectedOrderIdSet.has(id)).length;
  const selectedSheetIds = useMemo(() => [...new Set(rows
    .filter(row => selectedOrderIdSet.has(row.order.id) && isSheetOrder(row.order) && !hasAutomaticSheetProtection(row.order))
    .map(row => row.order.id))], [rows, selectedOrderIdSet]);

  function toggleVisibleSelection(checked: boolean) {
    setSelectedOrderIds(ids => checked
      ? [...new Set([...ids, ...visibleOrderIds])]
      : ids.filter(id => !visibleOrderIdSet.has(id)));
  }

  function toggleOrderSelection(id: string, checked: boolean) {
    setSelectedOrderIds(ids => checked ? [...new Set([...ids, id])] : ids.filter(selectedId => selectedId !== id));
  }

  const issuesByRow = useMemo(() => new Map(rows.map((row) => [row.id, analyzeOrderIssues(row.order, employees, row.day)])), [employees, rows]);
  const total = rows.reduce((sum, row) => sum + row.grossMinor, 0);
  const payrollReady = rows.reduce((sum, row) => {
    if (row.day) return sum + (row.day.status === "verified" && !row.day.payrollClosedAt ? row.grossMinor : 0);
    return sum + getPayrollEligibleGrossMinor(row.order);
  }, 0);

  const sourceSummary = useMemo(() => {
    const map = new Map<string, { source: string; rows: number; total: number; done: number; problem: number }>();
    for (const row of periodRows) {
      const current = map.get(row.order.source) ?? { source: row.order.source, rows: 0, total: 0, done: 0, problem: 0 };
      current.rows += 1;
      current.total += row.grossMinor;
      const issues = analyzeOrderIssues(row.order, employees, row.day);
      if (row.day ? Boolean(row.day.payrollClosedAt || row.day.status === "verified") : Boolean(row.order.payrollClosedAt || row.order.operationalStatus === "verified")) current.done += 1;
      if (hasBlockingOrderIssues(issues) || (row.day ? row.day.status === "on_hold" : row.order.operationalStatus === "on_hold")) current.problem += 1;
      map.set(row.order.source, current);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [employees, periodRows]);

  const periodLabel = mode === "all" ? "Semua periode" : mode === "today" ? "Hari ini" : mode === "week" ? "7 hari" : mode === "month" ? "Bulan ini" : `${from} s.d. ${to}`;
  const selectedSortMode = sortByPriceDrop ? "price_drop" : sortModeFromState(sortState);
  const exportLabel = [
    periodLabel,
    `Sumber: ${source === "SEMUA" ? "Semua" : source}`,
    `Jenis: ${type === "SEMUA" ? "Semua" : type === "gold" ? "Gold" : type === "item" ? "Item" : "Boosting"}`,
    `Buyer: ${buyer === "SEMUA" ? "Semua" : buyer}`,
    `GAME: ${game === "SEMUA" ? "Semua" : game}`,
    `Karyawan: ${employee === "SEMUA" ? "Semua" : employee}`,
    `Divisi: ${division === "SEMUA" ? "Semua" : division}`,
    `Masalah: ${problem === "SEMUA" ? "Semua" : problem === "BERMASALAH" ? "Bermasalah" : "Tidak bermasalah"}`,
    `Harga: ${priceFilterLabels[priceFilter]}`,
    `Kelompok harga: ${activePriceGroup?.label ?? "Semua"}`,
    search.trim() ? `Pencarian: ${search.trim()}` : "Pencarian: Semua",
    `Urutan: ${sortByPriceDrop ? "Penurunan harga terbesar" : mutationSortLabel(sortState)}`,
  ].join(" • ");

  function resetFilters() {
    setMode("all");
    setSource("SEMUA");
    setType("SEMUA");
    setBuyer("SEMUA");
    setGame("SEMUA");
    setEmployee("SEMUA");
    setDivision("SEMUA");
    setProblem("SEMUA");
    setPriceFilter("SEMUA");
    setActivePriceGroup(null);
    setSortByPriceDrop(false);
    setSortState(defaultMutationSort);
    setSearch("");
  }

  function pullOrderFromPayroll(order: Order) {
    if (order.payrollClosedAt) {
      setNotice(`Pesanan ${order.externalReference} sudah Tutup Buku/Gajian dan tidak dapat ditarik kembali.`);
      return;
    }
    if (order.operationalStatus !== "verified") return;

    updateOrder(order.id, {
      operationalStatus: "completed",
      verifiedAt: undefined,
    });
    addHistory({
      orderId: order.id,
      orderReference: order.externalReference,
      editedBy: getPayrollActor()?.name ?? "Pengguna penggajian",
      reason: "Ditarik dari Gaji untuk koreksi sebelum diverifikasi ulang.",
      wasCompleted: true,
      wasPayrollClosed: false,
      changes: [
        { field: "operationalStatus", label: "Status", before: "Selesai · masuk gaji", after: "Selesai · belum masuk gaji" },
      ],
    });
    setNotice(`↩ ${order.externalReference} ditarik dari Gaji. Silakan Edit Mutasi bila perlu, lalu klik Pesanan ini selesai untuk memasukkannya kembali.`);
  }

  function pullDailyFromPayroll(row: MutationViewRow) {
    if (!row.day) return;
    if (row.day.payrollClosedAt) {
      setNotice(`${row.order.externalReference} · Hari ${row.day.sequence} sudah Tutup Buku/Gajian dan tidak dapat ditarik kembali.`);
      return;
    }
    if (row.day.status !== "verified") return;
    setDailyMutationStatus(row, "in_progress");
    setNotice(`↩ ${row.order.externalReference} · Hari ${row.day.sequence} ditarik dari Gaji. Setelah koreksi, klik Pesanan ini selesai untuk memasukkannya kembali.`);
  }

  function setDailyMutationStatus(row: MutationViewRow, nextStatus: "pending" | "in_progress" | "on_hold" | "verified") {
    if (!row.day) return;
    if (row.day.payrollClosedAt) {
      setNotice(`${row.order.externalReference} · Hari ${row.day.sequence} sudah masuk Tutup Buku/Gaji dan dikunci.`);
      return;
    }
    try {
      const patch = replaceDailyWorkStatus(row.order, row.day.id, nextStatus);
      updateOrder(row.order.id, patch);
      if (nextStatus === "verified") {
        setNotice(`✓ ${row.order.externalReference} · Hari ${row.day.sequence} selesai. Nilai ${formatMoney(row.day.grossMinor)} sekarang masuk daftar Gaji berikutnya.`);
      } else {
        const label = nextStatus === "in_progress" ? "Dikerjakan" : nextStatus === "on_hold" ? "Bermasalah" : "Proses";
        setNotice(`Status ${row.order.externalReference} · Hari ${row.day.sequence} menjadi ${label}.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Status harian tidak dapat diperbarui.");
    }
  }

  function setMutationStatus(order: Order, nextStatus: "assigned" | "in_progress" | "on_hold" | "verified") {
    if (order.payrollClosedAt) {
      setNotice(`Pesanan ${order.externalReference} sudah masuk Tutup Buku/Gaji dan dikunci.`);
      return;
    }
    if (order.operationalStatus === "verified") {
      setNotice(`Pesanan ${order.externalReference} sudah selesai dan sedang menunggu Tutup Buku/Gaji.`);
      return;
    }
    const assignments = getOrderAssignments(order);
    if (!assignments.length) {
      setNotice(`Pesanan ${order.externalReference} belum punya karyawan.`);
      return;
    }

    if (nextStatus === "verified") {
      const quantityIssues = analyzeOrderQuantityIssues(order);
      if (quantityIssues.length) {
        setNotice(`Pesanan ${order.externalReference} belum dapat diselesaikan. ${quantityIssues.map((issue) => issue.description).join(" ")}`);
        return;
      }
      const now = new Date().toISOString();
      if (order.inventoryAllocations?.length && !order.inventoryConsumedAt) consumeAllocations(order.inventoryAllocations, { orderReference: order.externalReference, rateMinor: order.rateMinor ?? (order.quantity ? Math.round(order.grossMinor / order.quantity) : order.grossMinor), occurredAt: now });
      updateOrder(order.id, {
        operationalStatus: "verified",
        completedAt: order.completedAt ?? now,
        verifiedAt: now,
        inventoryConsumedAt: order.inventoryAllocations?.length ? (order.inventoryConsumedAt ?? now) : order.inventoryConsumedAt,
      });
      setNotice(`✓ ${order.externalReference} selesai. Pesanan sekarang masuk daftar Gaji berikutnya.`);
      return;
    }

    updateOrder(order.id, { operationalStatus: nextStatus });
    const statusText = nextStatus === "assigned" ? "Proses" : nextStatus === "in_progress" ? "Dikerjakan" : "Bermasalah";
    setNotice(`Status ${order.externalReference} menjadi ${statusText}. Belum masuk Gaji.`);
  }

  function saveMutationEdit(order: Order, patch: Partial<Order>, changes: import("@/features/payroll/lib/demo-mutation-history-store").MutationChange[], reason?: string) {
    if (canonical(allOrders.find(current => current.id === order.id)) !== canonical(order)) {
      throw new Error('Pesanan ini telah diubah pengguna lain. Isian Anda tetap tersedia; salin perubahan yang diperlukan, lalu buka kembali Edit Mutasi untuk memakai data terbaru.');
    }
    const wasCompleted = order.operationalStatus === "verified" || Boolean(order.payrollClosedAt);
    const wasPayrollClosed = Boolean(order.payrollClosedAt);
    updateOrder(order.id, patch);
    addHistory({
      orderId: order.id,
      orderReference: order.externalReference,
      editedBy: getPayrollActor()?.name ?? "Pengguna penggajian",
      reason,
      wasCompleted,
      wasPayrollClosed,
      changes,
    });
    setEditingRow(null);
    setNotice(wasPayrollClosed
      ? `✓ ${order.externalReference} berhasil diedit. Riwayat tersimpan sebagai perubahan setelah Tutup Buku.`
      : wasCompleted
        ? `✓ ${order.externalReference} berhasil diedit. Riwayat tersimpan sebagai perubahan setelah pesanan selesai.`
        : `✓ ${order.externalReference} berhasil diedit dan dicatat di Riwayat Perubahan.`);
  }

  return (
    <>
      <PageHeader title="Mutasi" description={"Telegram: START = hijau, PAUSE = oranye, DONE = kuning, Bermasalah = merah. Setelah admin klik Pesanan ini selesai, baris kembali normal/putih dan masuk proses Gaji sesuai aturan."} />

      <section className="cp-card p-5 sm:p-6">
        <div>
          <div className="text-sm font-semibold">Periode</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["all", "today", "week", "month", "range"] as DateMode[]).map((value) => (
              <button key={value} onClick={() => setMode(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mode === value ? "bg-emerald-500 text-black" : "bg-zinc-800"}`}>
                {value === "all" ? "Semua" : value === "today" ? "Hari ini" : value === "week" ? "7 hari" : value === "month" ? "Bulan ini" : "Pilih tanggal"}
              </button>
            ))}
          </div>
          {mode === "range" ? (
            <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
              <label className="text-sm">Dari tanggal<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3" /></label>
              <label className="text-sm">Sampai tanggal<input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value < from ? from : e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3" /></label>
            </div>
          ) : null}
        </div>

        <div className="mt-5 border-t border-zinc-800 pt-5">
          <div className="text-sm font-semibold">Tampilkan Mutasi berdasarkan</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm">Sumber<select value={source} onChange={(e) => setSource(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua sumber</option>{sources.map((value) => <option key={value} value={value}>{adminLabel(value)}</option>)}</select></label>
            <label className="text-sm">Jenis<select value={type} onChange={(e) => setType(e.target.value as TypeFilter)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua jenis</option><option value="gold">Gold</option><option value="item">Item</option><option value="boosting">Boosting</option></select></label>
            <label className="text-sm">Pembeli<select value={buyer} onChange={(e) => setBuyer(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua pembeli</option>{buyers.map((value) => <option key={value} value={value}>{adminLabel(value)}</option>)}</select></label>
            <label className="text-sm">GAME<select value={game} onChange={(e) => setGame(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua permainan</option>{games.map((value) => <option key={value} value={value}>{adminLabel(value)}</option>)}</select></label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm">Karyawan<select value={employee} onChange={(e) => setEmployee(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua karyawan</option>{employeeNames.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Divisi<select value={division} onChange={(e) => setDivision(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua divisi</option>{divisions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Masalah<select value={problem} onChange={(e) => setProblem(e.target.value as ProblemFilter)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua status</option><option value="BERMASALAH">Hanya Bermasalah</option><option value="NORMAL">Tidak bermasalah</option></select></label>
            <label className="text-sm">Harga<select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value as PriceFilter)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3">{(["SEMUA", "TURUN", "10", "20", "30"] as PriceFilter[]).map(value => <option key={value} value={value}>{priceFilterLabels[value]}</option>)}</select></label>
            <label className="text-sm">Cari kode / nama / divisi / masalah<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Contoh: X1151, ANGGA, FH2, bermasalah" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 outline-none focus:border-yellow-400" /></label>
            <label className="text-sm">Sortir / urutkan<select value={selectedSortMode} onChange={(e) => { const value = e.target.value as PriceSortMode; setSortByPriceDrop(value === "price_drop"); if (value !== "price_drop" && sortPresets[value]) setSortState(sortPresets[value]); }} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3">{selectedSortMode === "custom" ? <option value="custom" disabled>{mutationSortLabel(sortState)}</option> : null}<option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="highest">Nilai terbesar</option><option value="lowest">Nilai terkecil</option><option value="price_drop">Penurunan harga terbesar</option><option value="employee_az">Karyawan A-Z</option><option value="employee_za">Karyawan Z-A</option><option value="division_az">Divisi A-Z</option><option value="division_za">Divisi Z-A</option><option value="source_az">Sumber A-Z</option><option value="buyer_az">Pembeli A-Z</option><option value="game_az">Permainan A-Z</option></select></label>
            <button onClick={resetFilters} className="self-end rounded-xl bg-zinc-800 px-4 py-3 text-sm font-semibold">Atur Ulang filter</button>
          </div>
          {activePriceGroup ? <div className="mutation-price-active-group" role="status">
            <span>Pesanan sejenis: <strong>{activePriceGroup.label}</strong></span>
            <button type="button" onClick={() => setActivePriceGroup(null)} aria-label="Tampilkan semua kelompok harga">Keluar kelompok</button>
          </div> : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-5">
          <button onClick={async () => { setExporting(true); try { await exportMutationsSpreadsheet(rows, exportLabel); } finally { setExporting(false); } }} disabled={exporting} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50">
            {exporting ? "Membuat Excel..." : `⬇ Ekspor Mutasi (${rows.length})`}
          </button>
          <span className="text-sm text-zinc-500">Excel mengikuti baris Hari dan Pembagian jumlah yang sedang tampil.</span>
        </div>
      </section>

      {notice ? <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">{adminText(notice)}</div> : null}

      {canManageSync ? <section className="mt-4 rounded-xl border border-zinc-700 p-4" aria-label="Kunci sinkronisasi spreadsheet">
        <p className="text-sm text-zinc-300">Pesanan terbuka mengikuti perubahan dan penghapusan di Sheet. Kunci pesanan untuk mempertahankan data website. Gaji/Closing, stok, dan pembayaran tetap dilindungi otomatis.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-zinc-400">Centang pesanan di tabel. Kunci hanya berlaku untuk pesanan dari Sheet pada filter ini yang belum dilindungi otomatis.</span>
          <button disabled={!selectedSheetIds.length || isLocked || savingSyncLocks} onClick={() => void setSheetLocks(selectedSheetIds, true)} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-black disabled:opacity-40">Kunci pilihan ({selectedSheetIds.length})</button>
          <button disabled={!selectedSheetIds.length || isLocked || savingSyncLocks} onClick={() => void setSheetLocks(selectedSheetIds, false)} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm disabled:opacity-40">Buka kunci pilihan</button>
        </div>
      </section> : null}

      {archivedOrders.length ? <details className="mt-4 rounded-xl border border-zinc-700 p-4">
        <summary className="cursor-pointer font-semibold">Dihapus dari Sheet ({archivedOrders.length})</summary>
        <p className="mt-2 text-sm text-zinc-400">Arsip ini tidak masuk daftar aktif atau Gaji. KODE yang muncul kembali di Sheet dipulihkan otomatis bila tidak dikunci.</p>
        {archivedOrders.map(order => <div key={order.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
          <span>{order.externalReference} · {order.orderName ?? order.service}</span>
          {canManageSync ? <button disabled={isLocked || savingSyncLocks} onClick={() => void setSheetLocks([order.id], true, true)} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm disabled:opacity-40">Pulihkan & kunci {order.externalReference}</button> : null}
        </div>)}
      </details> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="cp-card p-4"><div className="text-sm text-zinc-500">Baris Mutasi</div><div className="mt-1 text-2xl font-semibold">{rows.length}</div></div>
        <div className="cp-card p-4"><div className="text-sm text-zinc-500">Total nilai pada filter</div><div className="mt-1 text-2xl font-semibold">{formatMoney(total)}</div></div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4"><div className="text-sm text-zinc-500">Menunggu Tutup Buku/Gaji</div><div className="mt-1 text-2xl font-semibold text-emerald-300">{formatMoney(payrollReady)}</div></div>
      </div>

      <section className="cp-card mt-5 p-5">
        <h2 className="text-lg font-semibold">Ringkasan berdasarkan sumber</h2>
        <p className="mt-1 text-sm text-zinc-500">Paket harian dihitung sebagai baris Hari pada Mutasi. Klik sumber untuk memfilter tabel.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sourceSummary.map((item) => <button key={item.source} onClick={() => setSource(item.source)} className={`rounded-xl border p-4 text-left ${source === item.source ? "border-yellow-400 bg-yellow-400/10" : "border-zinc-800 bg-zinc-950/60"}`}><div className="font-semibold">{item.source}</div><div className="mt-2 text-xl font-bold">{formatMoney(item.total)}</div><div className="mt-1 text-xs text-zinc-500">{item.rows} baris · {item.done} selesai · {item.problem} bermasalah</div></button>)}
          {!sourceSummary.length ? <div className="text-sm text-zinc-500">Belum ada data pada filter ini.</div> : null}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm leading-6 text-zinc-300">
        <strong>Paket harian:</strong> contoh 12 Hours Package X6 dibuat menjadi Hari 1–6; 1 Week menjadi 7 hari; 1 Month menjadi 30 hari; dan X2 mengalikan jumlah harinya. <strong className="text-red-300">Status Bermasalah dapat diklik</strong> untuk melihat penyebab seperti karyawan tidak ditemukan, pembagian jumlah tidak cocok, atau input paket harian tidak konsisten.
      </section>

      <section className="mutation-price-guide" aria-label="Panduan pemeriksaan harga">
        <strong>Cek harga otomatis</strong>
        <p>Harga dibandingkan dengan rata-rata minimal 3 pesanan lain yang serupa. Acuan mengikuti jenis, game, paket, wilayah dan server; filter tabel tidak mengubah rata-rata. Baris harian mengikuti pemeriksaan pesanan induk. Kolom Total menampilkan rata-rata, terendah dan tertinggi seluruh pesanan sejenis, termasuk pesanan ini. Rata-rata pembanding untuk penanda warna memakai pesanan lain. Klik Lihat pesanan sejenis untuk membandingkan seluruh kelompok.</p>
        <div className="mutation-price-legend">
          <span data-price-tier="10">Turun 10–&lt;20% · biru muda</span>
          <span data-price-tier="20">Turun 20–&lt;30% · pink</span>
          <span data-price-tier="30">Turun ≥30% · coklat</span>
        </div>
      </section>

      <MutationSpreadsheet rowCount={rows.length} filterLabel={periodLabel} readOnly={isLocked}
        selection={{ totalCount: visibleOrderIds.length, selectedCount: selectedVisibleCount, hiddenCount: selectedOrderIdSet.size - selectedVisibleCount,
          disabled: savingSyncLocks, onToggleAll: toggleVisibleSelection, onClear: () => setSelectedOrderIds([]) }}
        sortColumn={sortByPriceDrop ? undefined : sortState.column} sortDirection={sortState.direction} onSort={(column) => { setSortByPriceDrop(false); setSortState((current) => toggleMutationSort(current, column)); }}
        overlay={taskOrder ? <TaskDetailModal order={taskOrder} onClose={() => setTaskOrder(null)} /> : telegramEvidenceOrder ? <TelegramEvidenceModal orderRef={telegramEvidenceOrder} onClose={() => setTelegramEvidenceOrder(null)} /> : editingRow ? <MutationEditModal order={editingRow.order} day={editingRow.day} onClose={() => setEditingRow(null)} onSave={(patch, changes, reason) => saveMutationEdit(editingRow.order, patch, changes, reason)} /> : issueRow ? <MutationIssueModal order={issueRow.row.order} day={issueRow.row.day} issues={issueRow.issues} onClose={() => setIssueRow(null)} /> : null}
        onOverlayClose={() => { setTaskOrder(null); setTelegramEvidenceOrder(null); setEditingRow(null); setIssueRow(null); }}>
          <tbody>
            {rows.map((row) => {
              const order = row.order;
              const price = priceAssessments.get(order.id);
              const issues = issuesByRow.get(row.id) ?? [];
              const telegram = telegramStatuses[order.externalReference.trim().toLowerCase()];
              let status = workStatus(row, issues);
              const blocking = hasBlockingOrderIssues(issues);
              const quantityBlocked = !row.day && analyzeOrderQuantityIssues(order).length > 0;
              const adminVerified = Boolean(row.day?.payrollClosedAt || (!row.day && order.payrollClosedAt) || row.day?.status === "verified" || (!row.day && order.operationalStatus === "verified"));
              if (!blocking && !adminVerified && telegram) {
                if (telegram.state === "problem") status = { label: "Telegram · Bermasalah", cls: "bg-red-500 text-white" };
                else if (telegram.state === "done_pending_admin") status = { label: "Telegram · DONE · cek admin", cls: "bg-yellow-400 text-black" };
                else if (telegram.state === "verified") status = { label: "Diverifikasi admin", cls: "bg-zinc-200 text-black" };
                else if (telegram.dispatch_status === "waiting_division") status = { label: "Menunggu divisi", cls: "bg-zinc-700 text-zinc-200" };
                else if (telegram.state === "paused") status = { label: "Telegram · PAUSE", cls: "bg-orange-500 text-black" };
                else if (telegram.state === "in_progress") status = { label: "Telegram · START", cls: "bg-emerald-500 text-black" };
                else if (telegram.state === "assigned") status = { label: "Telegram · Karyawan dipilih", cls: "bg-violet-500/30 text-violet-100" };
              }
              const rowClass = adminVerified
                ? ""
                : blocking || row.day?.status === "on_hold" || order.operationalStatus === "on_hold" || telegram?.state === "problem"
                  ? "bg-red-500/10"
                  : telegram?.state === "done_pending_admin"
                    ? "bg-yellow-400/15"
                    : telegram?.state === "paused"
                      ? "bg-orange-500/15"
                      : telegram?.state === "in_progress"
                        ? "bg-emerald-500/15"
                        : "";
              return (
                <tr key={row.id} className={rowClass} data-price-tier={price?.tier} data-order-selected={selectedOrderIdSet.has(order.id)}>
                  <td data-column="selection"><input type="checkbox" className="mutation-sheet-checkbox" aria-label={`Pilih pesanan ${order.externalReference}${row.day ? ` · Hari ${row.day.sequence}` : ""}`}
                    checked={selectedOrderIdSet.has(order.id)} disabled={savingSyncLocks} onChange={event => toggleOrderSelection(order.id, event.target.checked)} /></td>
                  <td data-column="date" className="text-sm">{formatDateTimeID(row.orderedAt)}</td>
                  <td data-column="code" title={order.externalReference}><Link href={`/admin/payroll/orders/${encodeURIComponent(order.externalReference)}`} className="font-semibold hover:text-yellow-300">{order.externalReference}</Link></td>
                  <td data-column="source">{order.source}</td>
                  <td data-column="type">{order.orderType === "gold" ? "Gold" : order.orderType === "item" ? "Item" : "Boosting"}</td>
                  <td data-column="buyer">{order.buyerName ?? "—"}</td>
                  <td data-column="order">{order.orderName ?? order.service}{isSheetOrder(order) ? <div className="mt-1 text-xs text-amber-300">{hasAutomaticSheetProtection(order) ? "Dilindungi otomatis" : order.sheetSyncLocked ? "🔒 Dikunci dari Sheet" : "↻ Mengikuti Sheet"}</div> : null}</td>
                  <td data-column="task" className="text-center">{order.task?.trim() ? <button type="button" onClick={() => setTaskOrder(order)} className="whitespace-nowrap rounded-lg bg-zinc-800 px-2.5 py-2 text-xs font-semibold hover:bg-zinc-700" aria-label={`Lihat TASK ${order.externalReference}`}>Lihat</button> : <span className="text-zinc-600">—</span>}</td>
                  <td data-column="day"><strong className={row.day ? "text-sky-300" : "text-zinc-500"}>{mutationDayLabel(row)}</strong></td>
                  <td data-column="distribution" className="text-sm">{formatMutationDistribution(row)}</td>
                  <td data-column="workers">{row.assignments.length ? row.assignments.map((assignment) => <div key={assignment.id} className="font-semibold">{assignment.employeeName}</div>) : "Belum ada"}</td>
                  <td data-column="division">{mutationDivisions(row).length ? <div className="flex flex-wrap gap-1.5">{mutationDivisions(row).map((division) => <span key={division} className="inline-flex rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-xs font-bold text-violet-200">{division}</span>)}</div> : <span className="text-zinc-600">—</span>}</td>
                  <td data-column="game">{order.gameName ?? order.game}</td><td data-column="region">{order.region ?? "—"}</td><td data-column="server">{order.server ?? "—"}</td>
                  <td data-column="quantity">{row.quantity.toLocaleString("id-ID")}</td>
                  <td data-column="total">
                    {formatMoney(row.grossMinor)}
                    {price ? <div className="mutation-price-check">
                      {price.tier && price.dropPercent !== undefined ? <strong className="mutation-price-badge">Turun {pricePercentFormat.format(price.dropPercent)}%</strong> : null}
                      {price.basis !== "order" || row.day ? <div>{price.basis === "order" ? "Harga paket" : priceBasisLabels[price.basis]}: {formatMoney(price.priceMinor)}</div> : null}
                      <div>Rata-rata: {formatMoney(price.groupAverageMinor)}</div>
                      <div>Terendah: {formatMoney(price.lowestMinor)}</div>
                      <div>Tertinggi: {formatMoney(price.highestMinor)}</div>
                      <small>{price.sampleCount.toLocaleString("id-ID")} pesanan sejenis</small>
                      {price.peerCount >= 3 && price.averageMinor !== undefined ? <><div>Rata-rata pembanding: {formatMoney(price.averageMinor)}</div><small>{price.peerCount.toLocaleString("id-ID")} pesanan lain</small></> : <div>Pembanding belum cukup ({price.peerCount}/3 pesanan lain)</div>}
                      <button type="button" className="mutation-price-group-link" onClick={() => { resetFilters(); setActivePriceGroup({ key: price.groupKey, label: [order.gameName ?? order.game, order.orderName ?? order.service, order.region, order.server].filter(Boolean).join(" · ") }); }} aria-label={`Lihat pesanan sejenis ${order.externalReference}`}>Lihat pesanan sejenis</button>
                    </div> : null}
                  </td>
                  <td data-column="status">{issues.length ? <button type="button" onClick={() => setIssueRow({ row, issues })} className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`}>{status.label}</button> : <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`}>{status.label}</span>}</td>
                  <td data-column="actions">
                    <div className="flex flex-wrap gap-2">
                      {canManageSync && isSheetOrder(order) && !hasAutomaticSheetProtection(order) ? <>
                        <button disabled={isLocked || savingSyncLocks} onClick={() => void setSheetLocks([order.id], !order.sheetSyncLocked)} className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-40">{order.sheetSyncLocked ? "Buka kunci Sheet" : "Kunci dari Sheet"}</button>
                      </> : null}
                      {canManageSync && telegram ? <button onClick={() => setTelegramEvidenceOrder(order.externalReference)} className="rounded-lg bg-sky-500/20 px-3 py-2 text-xs font-bold text-sky-100">📎 Bukti Telegram</button> : null}
                      <button onClick={() => setEditingRow(row)} className="rounded-lg bg-yellow-400 px-3 py-2 text-xs font-bold text-black">✏️ Edit Mutasi</button>
                      {issues.length ? <button onClick={() => setIssueRow({ row, issues })} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white">⚠ Masalah ({issues.length})</button> : null}
                      {(countsByOrder.get(order.id) ?? 0) > 0 ? <Link href={`/admin/payroll/history?order=${encodeURIComponent(order.externalReference)}`} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200">Riwayat ({countsByOrder.get(order.id)})</Link> : null}
                      {row.day ? (
                        <>
                          <Link href={`/admin/payroll/orders/${encodeURIComponent(order.externalReference)}`} className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold text-black">📅 Kelola Hari {row.day.sequence}</Link>
                          {row.day.payrollClosedAt ? (
                            <span className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-black">✓ Sudah masuk gajian</span>
                          ) : row.day.status === "verified" ? (
                            <>
                              <Link href="/admin/payroll/gaji" className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200">✓ Hari ini masuk Gaji</Link>
                              <button onClick={() => confirm(`Tarik ${order.externalReference} · Hari ${row.day?.sequence} dari Gaji untuk dikoreksi?`) && pullDailyFromPayroll(row)} className="rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-200">↩ Tarik dari Gaji</button>
                            </>
                          ) : (
                            <button
                              onClick={() => confirm(`Tandai ${order.externalReference} · Hari ${row.day?.sequence} selesai? Nilai ${formatMoney(row.day?.grossMinor ?? 0)} akan masuk Gaji berikutnya.`) && setDailyMutationStatus(row, "verified")}
                              className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black"
                            >
                              Pesanan ini selesai
                            </button>
                          )}
                        </>
                      ) : order.payrollClosedAt ? <span className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-black">✓ Sudah masuk gajian</span> : order.operationalStatus === "verified" ? <>
                        <Link href="/admin/payroll/gaji" className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200">✓ Menunggu Tutup Buku</Link>
                        <button onClick={() => confirm(`Tarik ${order.externalReference} dari Gaji untuk dikoreksi?`) && pullOrderFromPayroll(order)} className="rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-200">↩ Tarik dari Gaji</button>
                      </> : <>
                        <button onClick={() => setMutationStatus(order, "assigned")} className="rounded-lg bg-violet-500/20 px-3 py-2 text-xs font-bold text-violet-100">Proses</button>
                        <button onClick={() => setMutationStatus(order, "in_progress")} className="rounded-lg bg-sky-500/20 px-3 py-2 text-xs font-bold text-sky-100">Dikerjakan</button>
                        <button onClick={() => setMutationStatus(order, "on_hold")} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white">Bermasalah</button>
                        <button disabled={quantityBlocked} title={quantityBlocked ? "Koreksi masalah jumlah sebelum menyelesaikan pesanan." : undefined} onClick={() => confirm(`Tandai ${order.externalReference} selesai dan masukkan ke Gaji berikutnya?`) && setMutationStatus(order, "verified")} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">Pesanan ini selesai</button>
                      </>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
      </MutationSpreadsheet>
    </>
  );
}

"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
import { getPayrollActor } from "@/features/payroll/lib/workspace-store";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/features/payroll/components/page-header";
import { MutationSpreadsheet } from "@/features/payroll/components/mutation-spreadsheet";
import { MutationIssueModal } from "@/features/payroll/components/mutation-issue-modal";
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
import {
  expandMutationRows,
  formatMutationDistribution,
  mutationDayLabel,
  type MutationViewRow,
} from "@/features/payroll/lib/mutation-rows";
import type { Order, OrderIssue } from "@/features/payroll/types/domain";

type DateMode = "all" | "today" | "week" | "month" | "range";
type TypeFilter = "SEMUA" | "gold" | "item" | "boosting";
type SortMode = "newest" | "oldest" | "highest" | "lowest" | "source_az" | "buyer_az" | "game_az" | "employee_az" | "employee_za" | "division_az" | "division_za";

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
  return [...new Set(row.assignments.map((assignment) => assignment.team))]
    .sort((a, b) => divisionOrder.indexOf(a) - divisionOrder.indexOf(b));
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
  const { allOrders, updateOrder } = useDemoOrders();
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
  const [sortState, setSortState] = useState<MutationSortState>(defaultMutationSort);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [taskOrder, setTaskOrder] = useState<Order | null>(null);
  const [issueRow, setIssueRow] = useState<{ row: MutationViewRow; issues: OrderIssue[] } | null>(null);

  const sources = useMemo(() => [...new Set(allOrders.map((order) => order.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [allOrders]);
  const buyers = useMemo(() => [...new Set(allOrders.map((order) => order.buyerName?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "id")), [allOrders]);
  const games = useMemo(() => [...new Set(allOrders.map((order) => (order.gameName ?? order.game).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [allOrders]);
  const assignmentOptions = useMemo(() => expandMutationRows(allOrders).flatMap((row) => row.assignments), [allOrders]);
  const employeeNames = useMemo(() => [...new Set(assignmentOptions.map((assignment) => assignment.employeeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [assignmentOptions]);
  const divisions = useMemo(() => [...new Set(assignmentOptions.map((assignment) => assignment.team).filter(Boolean))].sort((a, b) => divisionOrder.indexOf(a) - divisionOrder.indexOf(b)), [assignmentOptions]);

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
      if (source !== "SEMUA" && row.order.source !== source) return false;
      if (employee !== "SEMUA" && !row.assignments.some((assignment) => assignment.employeeName === employee)) return false;
      if (division !== "SEMUA" && !row.assignments.some((assignment) => assignment.team === division)) return false;
      if (term) {
        const searchable = [
          row.order.externalReference,
          row.order.buyerName ?? "",
          row.order.orderName ?? row.order.service ?? "",
          row.order.task ?? "",
          row.order.gameName ?? row.order.game ?? "",
          ...row.assignments.flatMap((assignment) => [assignment.employeeName, assignment.team]),
        ].join(" ").toLowerCase();
        if (!searchable.includes(term)) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => compareViewRows(a, b, sortState));
  }, [division, employee, periodRows, search, sortState, source]);

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
  const selectedSortMode = sortModeFromState(sortState);
  const exportLabel = [
    periodLabel,
    `Sumber: ${source === "SEMUA" ? "Semua" : source}`,
    `Jenis: ${type === "SEMUA" ? "Semua" : type === "gold" ? "Gold" : type === "item" ? "Item" : "Boosting"}`,
    `Buyer: ${buyer === "SEMUA" ? "Semua" : buyer}`,
    `GAME: ${game === "SEMUA" ? "Semua" : game}`,
    `Karyawan: ${employee === "SEMUA" ? "Semua" : employee}`,
    `Divisi: ${division === "SEMUA" ? "Semua" : division}`,
    search.trim() ? `Pencarian: ${search.trim()}` : "Pencarian: Semua",
    `Urutan: ${mutationSortLabel(sortState)}`,
  ].join(" • ");

  function resetFilters() {
    setMode("all");
    setSource("SEMUA");
    setType("SEMUA");
    setBuyer("SEMUA");
    setGame("SEMUA");
    setEmployee("SEMUA");
    setDivision("SEMUA");
    setSortState(defaultMutationSort);
    setSearch("");
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
    setEditingOrder(null);
    setNotice(wasPayrollClosed
      ? `✓ ${order.externalReference} berhasil diedit. Riwayat tersimpan sebagai perubahan setelah Tutup Buku.`
      : wasCompleted
        ? `✓ ${order.externalReference} berhasil diedit. Riwayat tersimpan sebagai perubahan setelah pesanan selesai.`
        : `✓ ${order.externalReference} berhasil diedit dan dicatat di Riwayat Perubahan.`);
  }

  return (
    <>
      <PageHeader title="Mutasi" description={"Paket harian ditampilkan per Hari 1, Hari 2, dan seterusnya. Pembagian jumlah Gold/Item ditampilkan per karyawan dan masalah dapat diklik untuk melihat penyebabnya."} />

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
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.35fr_1.15fr_auto]">
            <label className="text-sm">Karyawan<select value={employee} onChange={(e) => setEmployee(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua karyawan</option>{employeeNames.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Divisi<select value={division} onChange={(e) => setDivision(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua divisi</option>{divisions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Cari kode / nama / divisi<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Contoh: X1151, ANGGA, FH2" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 outline-none focus:border-yellow-400" /></label>
            <label className="text-sm">Sortir / urutkan<select value={selectedSortMode} onChange={(e) => { const value = e.target.value as SortMode; if (sortPresets[value]) setSortState(sortPresets[value]); }} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3">{selectedSortMode === "custom" ? <option value="custom" disabled>{mutationSortLabel(sortState)}</option> : null}<option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="highest">Nilai terbesar</option><option value="lowest">Nilai terkecil</option><option value="employee_az">Karyawan A-Z</option><option value="employee_za">Karyawan Z-A</option><option value="division_az">Divisi A-Z</option><option value="division_za">Divisi Z-A</option><option value="source_az">Sumber A-Z</option><option value="buyer_az">Pembeli A-Z</option><option value="game_az">Permainan A-Z</option></select></label>
            <button onClick={resetFilters} className="self-end rounded-xl bg-zinc-800 px-4 py-3 text-sm font-semibold">Atur Ulang filter</button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-5">
          <button onClick={async () => { setExporting(true); try { await exportMutationsSpreadsheet(rows, exportLabel); } finally { setExporting(false); } }} disabled={exporting} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50">
            {exporting ? "Membuat Excel..." : `⬇ Ekspor Mutasi (${rows.length})`}
          </button>
          <span className="text-sm text-zinc-500">Excel mengikuti baris Hari dan Pembagian jumlah yang sedang tampil.</span>
        </div>
      </section>

      {notice ? <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">{adminText(notice)}</div> : null}

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

      <MutationSpreadsheet rowCount={rows.length} filterLabel={periodLabel} readOnly={isLocked}
        sortColumn={sortState.column} sortDirection={sortState.direction} onSort={(column) => setSortState((current) => toggleMutationSort(current, column))}
        overlay={taskOrder ? <TaskDetailModal order={taskOrder} onClose={() => setTaskOrder(null)} /> : editingOrder ? <MutationEditModal order={editingOrder} onClose={() => setEditingOrder(null)} onSave={(patch, changes, reason) => saveMutationEdit(editingOrder, patch, changes, reason)} /> : issueRow ? <MutationIssueModal order={issueRow.row.order} day={issueRow.row.day} issues={issueRow.issues} onClose={() => setIssueRow(null)} /> : null}
        onOverlayClose={() => { setTaskOrder(null); setEditingOrder(null); setIssueRow(null); }}>
          <tbody>
            {rows.map((row) => {
              const order = row.order;
              const issues = issuesByRow.get(row.id) ?? [];
              const status = workStatus(row, issues);
              const blocking = hasBlockingOrderIssues(issues);
              const rowClass = row.day?.payrollClosedAt || (!row.day && order.payrollClosedAt) ? "bg-emerald-500/10" : blocking || row.day?.status === "on_hold" || order.operationalStatus === "on_hold" ? "bg-red-500/10" : "";
              return (
                <tr key={row.id} className={rowClass}>
                  <td className="text-sm">{formatDateTimeID(row.orderedAt)}</td>
                  <td title={order.externalReference}><Link href={`/admin/payroll/orders/${encodeURIComponent(order.externalReference)}`} className="font-semibold hover:text-yellow-300">{order.externalReference}</Link></td>
                  <td>{order.source}</td>
                  <td>{order.orderType === "gold" ? "Gold" : order.orderType === "item" ? "Item" : "Boosting"}</td>
                  <td>{order.buyerName ?? "—"}</td>
                  <td>{order.orderName ?? (order.orderType === "gold" ? order.service : order.service)}</td>
                  <td className="text-center">{order.task?.trim() ? <button type="button" onClick={() => setTaskOrder(order)} className="whitespace-nowrap rounded-lg bg-zinc-800 px-2.5 py-2 text-xs font-semibold hover:bg-zinc-700" aria-label={`Lihat TASK ${order.externalReference}`}>Lihat</button> : <span className="text-zinc-600">—</span>}</td>
                  <td><strong className={row.day ? "text-sky-300" : "text-zinc-500"}>{mutationDayLabel(row)}</strong></td>
                  <td className="text-sm">{formatMutationDistribution(row)}</td>
                  <td>{row.assignments.length ? row.assignments.map((assignment) => <div key={assignment.id} className="font-semibold">{assignment.employeeName}</div>) : "Belum ada"}</td>
                  <td>{mutationDivisions(row).length ? <div className="flex flex-wrap gap-1.5">{mutationDivisions(row).map((division) => <span key={division} className="inline-flex rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-xs font-bold text-violet-200">{division}</span>)}</div> : <span className="text-zinc-600">—</span>}</td>
                  <td>{order.gameName ?? order.game}</td><td>{order.region ?? "—"}</td><td>{order.server ?? "—"}</td>
                  <td>{row.quantity.toLocaleString("id-ID")}</td><td>{formatMoney(row.grossMinor)}</td>
                  <td>{issues.length ? <button type="button" onClick={() => setIssueRow({ row, issues })} className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`}>{status.label}</button> : <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`}>{status.label}</span>}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setEditingOrder(order)} className="rounded-lg bg-yellow-400 px-3 py-2 text-xs font-bold text-black">✏️ Edit Mutasi</button>
                      {issues.length ? <button onClick={() => setIssueRow({ row, issues })} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white">⚠ Masalah ({issues.length})</button> : null}
                      {(countsByOrder.get(order.id) ?? 0) > 0 ? <Link href={`/admin/payroll/history?order=${encodeURIComponent(order.externalReference)}`} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200">Riwayat ({countsByOrder.get(order.id)})</Link> : null}
                      {row.day ? (
                        <>
                          <Link href={`/admin/payroll/orders/${encodeURIComponent(order.externalReference)}`} className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold text-black">📅 Kelola Hari {row.day.sequence}</Link>
                          {row.day.payrollClosedAt ? (
                            <span className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-black">✓ Sudah masuk gajian</span>
                          ) : row.day.status === "verified" ? (
                            <Link href="/admin/payroll/gaji" className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200">✓ Hari ini masuk Gaji</Link>
                          ) : (
                            <button
                              onClick={() => confirm(`Tandai ${order.externalReference} · Hari ${row.day?.sequence} selesai? Nilai ${formatMoney(row.day?.grossMinor ?? 0)} akan masuk Gaji berikutnya.`) && setDailyMutationStatus(row, "verified")}
                              className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black"
                            >
                              Pesanan ini selesai
                            </button>
                          )}
                        </>
                      ) : order.payrollClosedAt ? <span className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-black">✓ Sudah masuk gajian</span> : order.operationalStatus === "verified" ? <Link href="/admin/payroll/gaji" className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200">✓ Menunggu Tutup Buku</Link> : <>
                        <button onClick={() => setMutationStatus(order, "assigned")} className="rounded-lg bg-violet-500/20 px-3 py-2 text-xs font-bold text-violet-100">Proses</button>
                        <button onClick={() => setMutationStatus(order, "in_progress")} className="rounded-lg bg-sky-500/20 px-3 py-2 text-xs font-bold text-sky-100">Dikerjakan</button>
                        <button onClick={() => setMutationStatus(order, "on_hold")} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white">Bermasalah</button>
                        <button onClick={() => confirm(`Tandai ${order.externalReference} selesai dan masukkan ke Gaji berikutnya?`) && setMutationStatus(order, "verified")} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black">Pesanan ini selesai</button>
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

"use client";
import { getPayrollActor } from "@/features/payroll/lib/workspace-store";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/features/payroll/components/page-header";
import { MutationEditModal } from "@/features/payroll/components/mutation-edit-modal";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoInventory } from "@/features/payroll/lib/demo-inventory-store";
import { formatMoney } from "@/features/payroll/lib/money";
import { formatDateTimeID, toJakartaDateInput, todayJakartaDateInput } from "@/features/payroll/lib/date";
import { getAssignmentGrossMinor, getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { exportMutationsSpreadsheet } from "@/features/payroll/lib/spreadsheet-export";
import { useDemoMutationHistory } from "@/features/payroll/lib/demo-mutation-history-store";
import type { Order } from "@/features/payroll/types/domain";

type DateMode = "all" | "today" | "week" | "month" | "range";
type TypeFilter = "SEMUA" | "gold" | "item" | "boosting";
type SortMode = "newest" | "oldest" | "highest" | "lowest" | "source_az" | "buyer_az" | "game_az";

function dateDaysAgo(dateInput: string, days: number) {
  const date = new Date(`${dateInput}T12:00:00+07:00`);
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function monthStart(dateInput: string) {
  return `${dateInput.slice(0, 7)}-01`;
}

function workStatus(order: Order) {
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

const sortLabels: Record<SortMode, string> = {
  newest: "Terbaru",
  oldest: "Terlama",
  highest: "Nilai terbesar",
  lowest: "Nilai terkecil",
  source_az: "Sumber A-Z",
  buyer_az: "Buyer A-Z",
  game_az: "Game A-Z",
};

export default function MutationsPage() {
  const { allOrders, updateOrder } = useDemoOrders();
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
  const [sort, setSort] = useState<SortMode>("newest");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const sources = useMemo(() => [...new Set(allOrders.map((order) => order.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [allOrders]);
  const buyers = useMemo(() => [...new Set(allOrders.map((order) => order.buyerName?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "id")), [allOrders]);
  const games = useMemo(() => [...new Set(allOrders.map((order) => (order.gameName ?? order.game).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [allOrders]);

  const baseRows = useMemo(() => allOrders.filter((order) => {
    const day = toJakartaDateInput(order.orderedAt);
    if (mode === "today" && day !== today) return false;
    if (mode === "week" && !(day >= dateDaysAgo(today, 6) && day <= today)) return false;
    if (mode === "month" && !(day >= monthStart(today) && day <= today)) return false;
    if (mode === "range" && !(day >= from && day <= to)) return false;
    if (type !== "SEMUA" && order.orderType !== type) return false;
    if (buyer !== "SEMUA" && (order.buyerName ?? "") !== buyer) return false;
    if (game !== "SEMUA" && (order.gameName ?? order.game) !== game) return false;
    if (search.trim() && !order.externalReference.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }), [allOrders, buyer, from, game, mode, search, to, today, type]);

  const rows = useMemo(() => {
    const filtered = source === "SEMUA" ? baseRows : baseRows.filter((order) => order.source === source);
    return [...filtered].sort((a, b) => {
      if (sort === "oldest") return a.orderedAt.localeCompare(b.orderedAt);
      if (sort === "highest") return b.grossMinor - a.grossMinor || b.orderedAt.localeCompare(a.orderedAt);
      if (sort === "lowest") return a.grossMinor - b.grossMinor || b.orderedAt.localeCompare(a.orderedAt);
      if (sort === "source_az") return a.source.localeCompare(b.source, "id") || b.orderedAt.localeCompare(a.orderedAt);
      if (sort === "buyer_az") return (a.buyerName ?? "").localeCompare(b.buyerName ?? "", "id") || b.orderedAt.localeCompare(a.orderedAt);
      if (sort === "game_az") return (a.gameName ?? a.game).localeCompare(b.gameName ?? b.game, "id") || b.orderedAt.localeCompare(a.orderedAt);
      return b.orderedAt.localeCompare(a.orderedAt);
    });
  }, [baseRows, sort, source]);

  const total = rows.reduce((sum, row) => sum + row.grossMinor, 0);
  const payrollReady = rows
    .filter((row) => row.operationalStatus === "verified" && !row.payrollClosedAt)
    .reduce((sum, order) => sum + getOrderAssignments(order).reduce((part, assignment) => part + getAssignmentGrossMinor(order, assignment), 0), 0);

  const sourceSummary = useMemo(() => {
    const map = new Map<string, { source: string; orders: number; total: number; done: number; problem: number }>();
    for (const order of baseRows) {
      const current = map.get(order.source) ?? { source: order.source, orders: 0, total: 0, done: 0, problem: 0 };
      current.orders += 1;
      current.total += order.grossMinor;
      if (order.operationalStatus === "verified" || order.payrollClosedAt) current.done += 1;
      if (order.operationalStatus === "on_hold") current.problem += 1;
      map.set(order.source, current);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [baseRows]);

  const periodLabel = mode === "all" ? "Semua periode" : mode === "today" ? "Hari ini" : mode === "week" ? "7 hari" : mode === "month" ? "Bulan ini" : `${from} s.d. ${to}`;
  const exportLabel = [
    periodLabel,
    `Sumber: ${source === "SEMUA" ? "Semua" : source}`,
    `Jenis: ${type === "SEMUA" ? "Semua" : type === "gold" ? "Gold" : type === "item" ? "Item" : "Boosting"}`,
    `Buyer: ${buyer === "SEMUA" ? "Semua" : buyer}`,
    `Game: ${game === "SEMUA" ? "Semua" : game}`,
    search.trim() ? `Kode: ${search.trim()}` : "Kode: Semua",
    `Urutan: ${sortLabels[sort]}`,
  ].join(" • ");

  function resetFilters() {
    setMode("all");
    setSource("SEMUA");
    setType("SEMUA");
    setBuyer("SEMUA");
    setGame("SEMUA");
    setSort("newest");
    setSearch("");
  }

  function setMutationStatus(order: Order, nextStatus: "assigned" | "in_progress" | "on_hold" | "verified") {
    if (order.payrollClosedAt) {
      setNotice(`Pesanan ${order.externalReference} sudah masuk Closing/Gaji dan dikunci.`);
      return;
    }
    if (order.operationalStatus === "verified") {
      setNotice(`Pesanan ${order.externalReference} sudah selesai dan sedang menunggu Closing/Gaji.`);
      return;
    }
    const assignments = getOrderAssignments(order);
    if (!assignments.length) {
      setNotice(`Order ${order.externalReference} belum punya karyawan.`);
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
      setNotice(`✓ ${order.externalReference} selesai. Order sekarang masuk daftar Gaji berikutnya.`);
      return;
    }

    updateOrder(order.id, { operationalStatus: nextStatus });
    const text = nextStatus === "assigned" ? "Proses" : nextStatus === "in_progress" ? "Dikerjakan" : "Bermasalah";
    setNotice(`Status ${order.externalReference} menjadi ${text}. Belum masuk Gaji.`);
  }

  function saveMutationEdit(order: Order, patch: Partial<Order>, changes: import("@/features/payroll/lib/demo-mutation-history-store").MutationChange[], reason?: string) {
    const wasCompleted = order.operationalStatus === "verified" || Boolean(order.payrollClosedAt);
    const wasPayrollClosed = Boolean(order.payrollClosedAt);
    updateOrder(order.id, patch);
    addHistory({
      orderId: order.id,
      orderReference: order.externalReference,
      editedBy: getPayrollActor()?.name ?? "Pengguna payroll",
      reason,
      wasCompleted,
      wasPayrollClosed,
      changes,
    });
    setEditingOrder(null);
    setNotice(wasPayrollClosed
      ? `✓ ${order.externalReference} berhasil diedit. History tersimpan sebagai perubahan setelah Closing.`
      : wasCompleted
        ? `✓ ${order.externalReference} berhasil diedit. History tersimpan sebagai perubahan setelah order selesai.`
        : `✓ ${order.externalReference} berhasil diedit dan dicatat di History Perubahan.`);
  }

  return (
    <>
      <PageHeader title="Mutasi" description="Atur periode, Sumber, Jenis, Buyer, Game, kode order, dan urutan. Tampilan serta Excel mengikuti filter yang sedang dipilih." />

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
            <label className="text-sm">Sumber<select value={source} onChange={(e) => setSource(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua sumber</option>{sources.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Jenis<select value={type} onChange={(e) => setType(e.target.value as TypeFilter)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua jenis</option><option value="gold">Gold</option><option value="item">Item</option><option value="boosting">Boosting</option></select></label>
            <label className="text-sm">Buyer<select value={buyer} onChange={(e) => setBuyer(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua buyer</option>{buyers.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Game<select value={game} onChange={(e) => setGame(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua game</option>{games.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
            <label className="text-sm">Cari kode order<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Contoh: EG25" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 outline-none focus:border-yellow-400" /></label>
            <label className="text-sm">Sortir / urutkan<select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="highest">Nilai terbesar</option><option value="lowest">Nilai terkecil</option><option value="source_az">Sumber A-Z</option><option value="buyer_az">Buyer A-Z</option><option value="game_az">Game A-Z</option></select></label>
            <button onClick={resetFilters} className="self-end rounded-xl bg-zinc-800 px-4 py-3 text-sm font-semibold">Reset filter</button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-5">
          <button onClick={async () => { setExporting(true); try { await exportMutationsSpreadsheet(rows, exportLabel); } finally { setExporting(false); } }} disabled={exporting} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50">
            {exporting ? "Membuat Excel..." : `⬇ Export Mutasi (${rows.length})`}
          </button>
          <span className="text-sm text-zinc-500">Excel memuat ringkasan di atas dan tabel data Mutasi di bawah, sesuai seluruh filter serta urutan yang sedang tampil.</span>
        </div>
      </section>

      {notice ? <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">{notice}</div> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="cp-card p-4"><div className="text-sm text-zinc-500">Jumlah order</div><div className="mt-1 text-2xl font-semibold">{rows.length}</div></div>
        <div className="cp-card p-4"><div className="text-sm text-zinc-500">Total nilai order</div><div className="mt-1 text-2xl font-semibold">{formatMoney(total)}</div></div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4"><div className="text-sm text-zinc-500">Menunggu Closing/Gaji</div><div className="mt-1 text-2xl font-semibold text-emerald-300">{formatMoney(payrollReady)}</div></div>
      </div>

      <section className="cp-card mt-5 p-5">
        <h2 className="text-lg font-semibold">Ringkasan berdasarkan sumber</h2>
        <p className="mt-1 text-sm text-zinc-500">Ringkasan ini ikut mengikuti Periode, Jenis, Buyer, Game, dan kode order. Klik sumber untuk memfilter tabel.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sourceSummary.map((item) => <button key={item.source} onClick={() => setSource(item.source)} className={`rounded-xl border p-4 text-left ${source === item.source ? "border-yellow-400 bg-yellow-400/10" : "border-zinc-800 bg-zinc-950/60"}`}><div className="font-semibold">{item.source}</div><div className="mt-2 text-xl font-bold">{formatMoney(item.total)}</div><div className="mt-1 text-xs text-zinc-500">{item.orders} order · {item.done} selesai · {item.problem} bermasalah</div></button>)}
          {!sourceSummary.length ? <div className="text-sm text-zinc-500">Belum ada data pada filter ini.</div> : null}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm leading-6 text-zinc-300">
        <strong>Status:</strong> Proses → Dikerjakan → Pesanan ini selesai. <strong className="text-yellow-300">Mutasi tetap bisa diedit walaupun sudah selesai</strong>; setiap edit dicatat di menu History Perubahan. <span className="text-red-300">Bermasalah</span> tidak masuk Gaji. <span className="text-emerald-300">Selesai</span> masuk Gaji berikutnya, dan setelah Closing akan ditandai sudah digaji.
      </section>

      <div className="cp-card mt-5 overflow-x-auto">
        <table className="cp-table">
          <thead><tr><th>Hari & tanggal</th><th>Kode</th><th>Sumber</th><th>Jenis</th><th>Buyer</th><th>Nama order</th><th>Karyawan</th><th>Game</th><th>Region</th><th>Server</th><th>Jumlah</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {rows.map((order) => {
              const status = workStatus(order);
              const assignments = getOrderAssignments(order);
              const rowClass = order.payrollClosedAt ? "bg-emerald-500/10" : order.operationalStatus === "on_hold" ? "bg-red-500/10" : "";
              return (
                <tr key={order.id} className={rowClass}>
                  <td className="min-w-[210px] text-sm">{formatDateTimeID(order.orderedAt)}</td>
                  <td><Link href={`/admin/payroll/orders/${order.externalReference}`} className="font-semibold hover:text-yellow-300">{order.externalReference}</Link></td>
                  <td>{order.source}</td>
                  <td>{order.orderType === "gold" ? "Gold" : order.orderType === "item" ? "Item" : "Boosting"}</td>
                  <td>{order.buyerName ?? "—"}</td>
                  <td>{order.orderName ?? (order.orderType === "gold" ? "Gold" : order.service)}</td>
                  <td className="min-w-[230px]">{assignments.length ? assignments.map((a) => <div key={a.id}><strong>{a.employeeName}</strong> · {a.team} · <span className="text-yellow-300">{formatMoney(getAssignmentGrossMinor(order, a))}</span></div>) : "Belum ada"}</td>
                  <td>{order.gameName ?? order.game}</td><td>{order.region ?? "—"}</td><td>{order.server ?? "—"}</td>
                  <td>{order.quantity.toLocaleString("id-ID")}</td><td>{formatMoney(order.grossMinor)}</td>
                  <td><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`}>{status.label}</span></td>
                  <td className="min-w-[360px]">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setEditingOrder(order)} className="rounded-lg bg-yellow-400 px-3 py-2 text-xs font-bold text-black">✏️ Edit Mutasi</button>
                      {(countsByOrder.get(order.id) ?? 0) > 0 ? <Link href={`/admin/payroll/history?order=${encodeURIComponent(order.externalReference)}`} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200">History ({countsByOrder.get(order.id)})</Link> : null}
                      {order.payrollClosedAt ? <span className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-black">✓ Sudah masuk gajian</span> : order.operationalStatus === "verified" ? <Link href="/admin/payroll/gaji" className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200">✓ Menunggu Closing</Link> : <>
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
        </table>
        {!rows.length ? <div className="p-6 text-sm text-zinc-500">Tidak ada Mutasi sesuai filter.</div> : null}
      </div>

      {editingOrder ? <MutationEditModal order={editingOrder} onClose={() => setEditingOrder(null)} onSave={(patch, changes, reason) => saveMutationEdit(editingOrder, patch, changes, reason)} /> : null}
    </>
  );
}

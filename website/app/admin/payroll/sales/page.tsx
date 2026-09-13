"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/features/payroll/components/page-header";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { formatMoney } from "@/features/payroll/lib/money";
import { formatDateTimeID, toJakartaDateInput, todayJakartaDateInput } from "@/features/payroll/lib/date";
import { exportSalesSpreadsheet } from "@/features/payroll/lib/spreadsheet-export";
import type { Order } from "@/features/payroll/types/domain";

type DateMode = "all" | "today" | "week" | "month" | "range";
type TypeFilter = "SEMUA" | "gold" | "item" | "boosting";
type SortMode = "newest" | "oldest" | "highest" | "lowest" | "source_az" | "buyer_az" | "game_az";

function dateDaysAgo(dateInput: string, days: number) {
  const date = new Date(`${dateInput}T12:00:00+07:00`);
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function monthStart(dateInput: string) {
  return `${dateInput.slice(0, 7)}-01`;
}

function isFinished(order: Order) {
  return order.operationalStatus === "verified" || Boolean(order.payrollClosedAt);
}

function typeName(order: Order) {
  return order.orderType === "gold" ? "Gold" : order.orderType === "item" ? "Item" : "Boosting";
}

function statusLabel(order: Order) {
  if (order.payrollClosedAt) return { label: "Selesai · sudah digaji", className: "bg-emerald-500 text-black" };
  if (order.operationalStatus === "verified") return { label: "Selesai", className: "bg-emerald-500/15 text-emerald-200" };
  if (order.operationalStatus === "on_hold") return { label: "Bermasalah", className: "bg-red-500/15 text-red-200" };
  if (order.operationalStatus === "in_progress") return { label: "Dikerjakan", className: "bg-sky-500/15 text-sky-200" };
  if (order.operationalStatus === "assigned") return { label: "Proses", className: "bg-violet-500/15 text-violet-200" };
  if (order.operationalStatus === "completed") return { label: "Menunggu cek", className: "bg-amber-500/15 text-amber-200" };
  return { label: "Baru", className: "bg-zinc-800 text-zinc-200" };
}

const sortLabels: Record<SortMode, string> = {
  newest: "Terbaru",
  oldest: "Terlama",
  highest: "Penjualan terbesar",
  lowest: "Penjualan terkecil",
  source_az: "Sumber A-Z",
  buyer_az: "Buyer A-Z",
  game_az: "Game A-Z",
};

export default function SalesPage() {
  const { allOrders } = useDemoOrders();
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

  const sources = useMemo(
    () => [...new Set(allOrders.map((order) => order.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")),
    [allOrders],
  );
  const buyers = useMemo(
    () => [...new Set(allOrders.map((order) => order.buyerName?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "id")),
    [allOrders],
  );
  const games = useMemo(
    () => [...new Set(allOrders.map((order) => (order.gameName ?? order.game).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")),
    [allOrders],
  );

  const rows = useMemo(() => {
    const filtered = allOrders.filter((order) => {
      const day = toJakartaDateInput(order.orderedAt);
      if (mode === "today" && day !== today) return false;
      if (mode === "week" && !(day >= dateDaysAgo(today, 6) && day <= today)) return false;
      if (mode === "month" && !(day >= monthStart(today) && day <= today)) return false;
      if (mode === "range" && !(day >= from && day <= to)) return false;
      if (source !== "SEMUA" && order.source !== source) return false;
      if (type !== "SEMUA" && order.orderType !== type) return false;
      if (buyer !== "SEMUA" && (order.buyerName ?? "") !== buyer) return false;
      if (game !== "SEMUA" && (order.gameName ?? order.game) !== game) return false;
      if (search.trim() && !order.externalReference.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "oldest") return a.orderedAt.localeCompare(b.orderedAt);
      if (sort === "highest") return b.grossMinor - a.grossMinor || b.orderedAt.localeCompare(a.orderedAt);
      if (sort === "lowest") return a.grossMinor - b.grossMinor || b.orderedAt.localeCompare(a.orderedAt);
      if (sort === "source_az") return a.source.localeCompare(b.source, "id") || b.orderedAt.localeCompare(a.orderedAt);
      if (sort === "buyer_az") return (a.buyerName ?? "").localeCompare(b.buyerName ?? "", "id") || b.orderedAt.localeCompare(a.orderedAt);
      if (sort === "game_az") return (a.gameName ?? a.game).localeCompare(b.gameName ?? b.game, "id") || b.orderedAt.localeCompare(a.orderedAt);
      return b.orderedAt.localeCompare(a.orderedAt);
    });
  }, [allOrders, buyer, from, game, mode, search, sort, source, to, today, type]);

  const totalSales = useMemo(() => rows.reduce((sum, order) => sum + order.grossMinor, 0), [rows]);
  const finishedRows = useMemo(() => rows.filter(isFinished), [rows]);
  const finishedSales = useMemo(() => finishedRows.reduce((sum, order) => sum + order.grossMinor, 0), [finishedRows]);
  const problemRows = useMemo(() => rows.filter((order) => order.operationalStatus === "on_hold"), [rows]);

  const bySource = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const order of rows) {
      const current = map.get(order.source) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += order.grossMinor;
      map.set(order.source, current);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

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

  return (
    <>
      <PageHeader title="Penjualan" description="Atur periode, Sumber, Jenis, Buyer, Game, dan urutan. Tabel serta Excel mengikuti pengaturan yang sedang dipilih." />

      <section className="cp-card mb-5 p-5">
        <div>
          <div className="text-sm font-semibold">Periode</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["all", "today", "week", "month", "range"] as DateMode[]).map((value) => (
              <button key={value} onClick={() => setMode(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mode === value ? "bg-yellow-400 text-black" : "bg-zinc-800"}`}>
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
          <div className="text-sm font-semibold">Tampilkan penjualan berdasarkan</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm">Sumber<select value={source} onChange={(e) => setSource(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua sumber</option>{sources.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Jenis<select value={type} onChange={(e) => setType(e.target.value as TypeFilter)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua jenis</option><option value="gold">Gold</option><option value="item">Item</option><option value="boosting">Boosting</option></select></label>
            <label className="text-sm">Buyer<select value={buyer} onChange={(e) => setBuyer(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua buyer</option>{buyers.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Game<select value={game} onChange={(e) => setGame(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua game</option>{games.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
            <label className="text-sm">Cari kode order<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Contoh: EG25" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3" /></label>
            <label className="text-sm">Sortir / urutkan<select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="highest">Penjualan terbesar</option><option value="lowest">Penjualan terkecil</option><option value="source_az">Sumber A-Z</option><option value="buyer_az">Buyer A-Z</option><option value="game_az">Game A-Z</option></select></label>
            <div className="flex items-end"><button type="button" onClick={resetFilters} className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-sm font-semibold hover:bg-zinc-700">Reset filter</button></div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-5">
          <button onClick={async () => { setExporting(true); try { await exportSalesSpreadsheet(rows, exportLabel); } finally { setExporting(false); } }} disabled={exporting} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">{exporting ? "Membuat Excel..." : `⬇ Export Penjualan (${rows.length})`}</button>
          <span className="text-sm text-zinc-500">Excel sekarang memuat ringkasan per sumber di atas dan tabel data Penjualan di bawah, sesuai filter dan urutan yang sedang tampil.</span>
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Total Penjualan</div><div className="mt-2 text-3xl font-bold text-yellow-300">{formatMoney(totalSales)}</div><div className="mt-1 text-xs text-zinc-500">Sesuai filter saat ini</div></div>
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Jumlah Order</div><div className="mt-2 text-3xl font-bold">{rows.length}</div><div className="mt-1 text-xs text-zinc-500">Sesuai filter</div></div>
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Penjualan Selesai</div><div className="mt-2 text-3xl font-bold text-emerald-300">{formatMoney(finishedSales)}</div><div className="mt-1 text-xs text-zinc-500">{finishedRows.length} order selesai</div></div>
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Bermasalah</div><div className="mt-2 text-3xl font-bold text-red-300">{problemRows.length}</div><div className="mt-1 text-xs text-zinc-500">Tidak dihitung sebagai selesai</div></div>
      </section>

      {bySource.length ? (
        <section className="cp-card mb-5 p-5">
          <h2 className="text-lg font-semibold">Total per Sumber</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {bySource.map(([name, data]) => (
              <button key={name} onClick={() => setSource(name)} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-left transition hover:border-yellow-500/40">
                <div className="text-sm font-semibold">{name}</div>
                <div className="mt-2 text-xl font-bold">{formatMoney(data.total)}</div>
                <div className="mt-1 text-xs text-zinc-500">{data.count} order</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="cp-card overflow-x-auto">
        <table className="cp-table">
          <thead><tr><th>Waktu</th><th>Kode</th><th>Sumber</th><th>Jenis</th><th>Buyer</th><th>Game</th><th>Jumlah</th><th>Total Penjualan</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((order) => {
              const status = statusLabel(order);
              return (
                <tr key={order.id}>
                  <td className="min-w-[220px] text-sm">{formatDateTimeID(order.orderedAt)}</td>
                  <td><Link className="font-semibold hover:text-yellow-300" href={`/admin/payroll/orders/${order.externalReference}`}>{order.externalReference}</Link></td>
                  <td>{order.source}</td>
                  <td>{typeName(order)}</td>
                  <td>{order.buyerName ?? "—"}</td>
                  <td>{order.gameName ?? order.game}</td>
                  <td>{order.quantity.toLocaleString("id-ID")}</td>
                  <td className="font-semibold">{formatMoney(order.grossMinor)}</td>
                  <td><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <div className="p-8 text-center text-sm text-zinc-500">Tidak ada penjualan sesuai filter.</div> : null}
      </div>
    </>
  );
}

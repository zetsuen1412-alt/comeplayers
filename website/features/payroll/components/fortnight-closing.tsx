"use client";

import { adminText } from "@/lib/adminLocale";
import { closePayroll, flushPayroll } from "../lib/workspace-store";
import { useMemo, useState } from "react";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoPayrollSettings } from "@/features/payroll/lib/demo-payroll-settings-store";
import { useDemoAdvances } from "@/features/payroll/lib/demo-advance-store";
import { useDemoInventory } from "@/features/payroll/lib/demo-inventory-store";
import { useDemoClosings } from "@/features/payroll/lib/demo-closing-store";
import { useDemoPeriodLock } from "@/features/payroll/lib/demo-period-lock-store";
import { buildLivePayrollRows, type LivePayrollRow } from "@/features/payroll/lib/payroll-live";
import { formatMoney } from "@/features/payroll/lib/money";
import { exportClosingSpreadsheet } from "@/features/payroll/lib/spreadsheet-export";
import {
  formatDateTimeID,
  formatJakartaDateTimeInput,
  jakartaDateTimeInputToISO,
  jakartaDateTimeLocalNow,
} from "@/features/payroll/lib/date";
import type { Order } from "@/features/payroll/types/domain";

type ClosingSnapshot = {
  id: string;
  from: string;
  to: string;
  orders: Order[];
  payroll: LivePayrollRow[];
};

function effectivePayrollTimestamp(order: Order) {
  return order.verifiedAt ?? order.completedAt ?? order.orderedAt;
}

function isIsoInsideRange(isoValue: string, fromLocal: string, toLocal: string) {
  const value = new Date(isoValue).getTime();
  const start = new Date(jakartaDateTimeInputToISO(fromLocal)).getTime();
  const end = new Date(jakartaDateTimeInputToISO(toLocal)).getTime();
  return value >= start && value <= end;
}

function sourceBreakdown(orders: Order[]) {
  const map = new Map<string, { source: string; count: number; total: number }>();
  for (const order of orders) {
    const row = map.get(order.source) ?? { source: order.source, count: 0, total: 0 };
    row.count += 1;
    row.total += order.grossMinor;
    map.set(order.source, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function FortnightClosing() {
  const { allOrders } = useDemoOrders();
  const { inventory } = useDemoInventory();
  const { employees } = useDemoEmployees();
  const { settings } = useDemoPayrollSettings();
  const { outstandingByEmployee } = useDemoAdvances();
  const { closings } = useDemoClosings();
  const { lock, isLocked, lockPeriod, unlockPeriod } = useDemoPeriodLock();

  const nowLocal = jakartaDateTimeLocalNow();
  const [from, setFrom] = useState(`${nowLocal.slice(0, 10)}T00:00`);
  const [to, setTo] = useState(nowLocal);
  const [message, setMessage] = useState<string | null>(null);
  const [lastClosed, setLastClosed] = useState<ClosingSnapshot | null>(null);
  const [closing, setClosing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activeFrom = lock?.from ?? from;
  const activeTo = lock?.to ?? to;

  const payrollOptions = useMemo(() => ({
    defaultSharePercent: settings.defaultSharePercent,
    employeeSharePercent: settings.employeeSharePercent,
    employees,
    adjustments: settings.adjustments,
    kasbonByEmployee: outstandingByEmployee,
  }), [employees, outstandingByEmployee, settings]);

  const eligibleOrders = useMemo(() => allOrders.filter((order) => {
    if (order.operationalStatus !== "verified" || order.payrollClosedAt) return false;
    return isIsoInsideRange(effectivePayrollTimestamp(order), activeFrom, activeTo);
  }), [allOrders, activeFrom, activeTo]);

  const problemOrders = useMemo(() => allOrders.filter((order) => {
    if (order.operationalStatus !== "on_hold") return false;
    return isIsoInsideRange(order.orderedAt, activeFrom, activeTo);
  }), [allOrders, activeFrom, activeTo]);

  const unfinishedOrders = useMemo(() => allOrders.filter((order) => {
    if (["verified", "on_hold", "cancelled"].includes(order.operationalStatus)) return false;
    return isIsoInsideRange(order.orderedAt, activeFrom, activeTo);
  }), [allOrders, activeFrom, activeTo]);

  const previewPayroll = useMemo(
    () => buildLivePayrollRows(eligibleOrders, payrollOptions).filter((row) => row.orderRefs.length > 0),
    [eligibleOrders, payrollOptions],
  );
  const previewTotal = eligibleOrders.reduce((sum, order) => sum + order.grossMinor, 0);
  const previewPayrollTotal = previewPayroll.reduce((sum, row) => sum + row.net, 0);
  const previewSources = useMemo(() => sourceBreakdown(eligibleOrders), [eligibleOrders]);

  async function handleLock() {
    setMessage(null);
    const result = lockPeriod({ from, to, lockedBy: "Admin" });
    if (!result.ok) return setMessage(result.message);
    try { await flushPayroll(); } catch(error) {setMessage(error instanceof Error?error.message:"Gagal menyimpan kunci.");return;}
    setMessage("🔒 Periode berhasil dikunci. Semua menu edit sekarang read-only. Tutup Buku sudah dapat dilakukan.");
  }

  async function handleUnlock() {
    if (!confirm("Buka kunci sistem? Setelah dibuka, pengguna dapat mengedit data lagi dan tombol Tutup Buku akan terkunci.")) return;
    unlockPeriod();
    try { await flushPayroll(); } catch(error) {setMessage(error instanceof Error?error.message:"Gagal membuka kunci.");return;}
    setMessage("🔓 Kunci dibuka. Pengguna dapat mengedit data lagi. Kunci kembali sebelum melakukan Tutup Buku.");
  }

  async function closePeriod() {
    setMessage(null);
    if (!lock) return setMessage("Tutup Buku belum bisa dilakukan. Kunci periode terlebih dahulu.");
    if (!eligibleOrders.length) return setMessage("Tidak ada pesanan selesai yang belum pernah masuk gajian pada periode terkunci ini.");

    setClosing(true);
    try {
      const result = await closePayroll();
      setLastClosed({ id: result.record.id, from: result.record.from, to: result.record.to, orders: result.orders, payroll: result.payroll });
      setMessage(`✓ Tutup Buku berhasil tersimpan. ${result.orders.length} pesanan masuk gajian dan tidak akan dihitung ulang.`);
    } catch(error) {setMessage(error instanceof Error ? error.message : "Tutup Buku gagal.");}
    finally {setClosing(false);}
  }

  const downloadTarget = lastClosed ?? { id: "preview", from: activeFrom, to: activeTo, orders: eligibleOrders, payroll: previewPayroll };

  async function downloadSpreadsheet() {
    if (!downloadTarget.orders.length) return setMessage("Belum ada pesanan selesai untuk dibuatkan Excel.");
    setExporting(true);
    try {
      await exportClosingSpreadsheet({
        start: formatJakartaDateTimeInput(downloadTarget.from),
        end: formatJakartaDateTimeInput(downloadTarget.to),
        orders: downloadTarget.orders,
        payroll: downloadTarget.payroll,
        inventory,
        deferredOrders: problemOrders,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="cp-card p-5 sm:p-6">
        <div className="text-sm font-semibold text-yellow-300">Tutup Buku manual + kunci sistem</div>
        <h2 className="mt-2 text-2xl font-semibold">Atur tanggal &amp; jam → Kunci → Tutup Buku</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Tutup Buku hanya dapat dilakukan saat sistem <strong className="text-yellow-200">DIKUNCI</strong>. Ketika dikunci, semua user tidak dapat mengedit Pesanan, Mutasi, Karyawan, Gaji, Kasbon, Produk/Game, atau Stok sampai kunci dibuka kembali.
        </p>

        <div className={`mt-5 rounded-2xl border p-4 ${isLocked ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
          <div className={`text-sm font-bold ${isLocked ? "text-emerald-200" : "text-amber-200"}`}>
            {isLocked ? "🔒 SISTEM DIKUNCI" : "🔓 SISTEM BELUM DIKUNCI"}
          </div>
          <div className="mt-1 text-sm text-zinc-300">
            {isLocked && lock
              ? `${formatJakartaDateTimeInput(lock.from)} → ${formatJakartaDateTimeInput(lock.to)}`
              : "Pilih tanggal dan jam, lalu klik Kunci Periode. Tombol Tutup Buku belum aktif sebelum dikunci."}
          </div>
          {isLocked && lock ? <div className="mt-1 text-xs text-zinc-500">Dikunci oleh {lock.lockedBy} · {formatDateTimeID(lock.lockedAt)}</div> : null}
        </div>

        <div className="mt-5 grid max-w-3xl gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Dari tanggal & jam
            <input type="datetime-local" value={activeFrom} disabled={isLocked} onChange={(e) => setFrom(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 disabled:cursor-not-allowed disabled:opacity-50" />
          </label>
          <label className="text-sm">
            Sampai tanggal & jam
            <input type="datetime-local" min={from} value={activeTo} disabled={isLocked} onChange={(e) => setTo(e.target.value < from ? from : e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 disabled:cursor-not-allowed disabled:opacity-50" />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {!isLocked ? (
            <button onClick={() => confirm(`Kunci seluruh sistem untuk periode ${formatJakartaDateTimeInput(from)} sampai ${formatJakartaDateTimeInput(to)}? Semua pengguna tidak akan bisa mengedit sampai kunci dibuka.`) && handleLock()} className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-black">🔒 Kunci Periode</button>
          ) : (
            <button onClick={handleUnlock} className="rounded-xl bg-zinc-700 px-5 py-3 text-sm font-bold text-white">🔓 Buka Kunci</button>
          )}
          <button
            onClick={() => lock && confirm(`Tutup Buku periode terkunci ${formatJakartaDateTimeInput(lock.from)} sampai ${formatJakartaDateTimeInput(lock.to)}? Pesanan selesai akan ditandai sudah masuk gaji.`) && closePeriod()}
            disabled={!isLocked || closing}
            className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-35"
          >
            Tutup Buku
          </button>
          <button onClick={downloadSpreadsheet} disabled={exporting} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-black disabled:opacity-50">{exporting ? "Membuat Excel..." : "⬇ Ekspor Periode Ini (.xlsx)"}</button>
        </div>
        {!isLocked ? <div className="mt-3 text-xs font-semibold text-red-300">Tutup Buku dinonaktifkan. Kunci periode terlebih dahulu.</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-100">{adminText(message)}</div> : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Siap masuk gaji</div><div className="mt-1 text-3xl font-semibold text-emerald-300">{eligibleOrders.length}</div></div>
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Nilai pesanan selesai</div><div className="mt-1 text-3xl font-semibold">{formatMoney(previewTotal)}</div></div>
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Gaji bersih</div><div className={`mt-1 text-3xl font-semibold ${previewPayrollTotal < 0 ? "text-red-300" : "text-yellow-300"}`}>{formatMoney(previewPayrollTotal)}</div></div>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5"><div className="text-sm text-zinc-400">Bermasalah · ditunda</div><div className="mt-1 text-3xl font-semibold text-red-300">{problemOrders.length}</div></div>
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Belum selesai</div><div className="mt-1 text-3xl font-semibold">{unfinishedOrders.length}</div></div>
      </div>

      <section className="cp-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Rincian berdasarkan sumber</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{previewSources.map((row) => <div key={row.source} className="rounded-xl bg-zinc-950/70 p-4"><div className="font-semibold">{row.source}</div><div className="mt-2 text-xl font-bold">{formatMoney(row.total)}</div><div className="mt-1 text-xs text-zinc-500">{row.count} pesanan selesai</div></div>)}{!previewSources.length ? <div className="text-sm text-zinc-500">Belum ada pesanan selesai pada periode ini.</div> : null}</div>
      </section>

      <section className="cp-card overflow-x-auto">
        <div className="p-5"><h2 className="text-xl font-semibold">Pesanan yang akan masuk Tutup Buku</h2><p className="mt-1 text-sm text-zinc-500">Daftar ini hanya menampilkan pesanan selesai pada rentang tanggal + jam yang dipilih dan belum pernah digaji.</p></div>
        <table className="cp-table"><thead><tr><th>Kode</th><th>Waktu selesai</th><th>Sumber</th><th>Gim</th><th>Nilai</th><th>Status</th></tr></thead><tbody>{eligibleOrders.map((order) => <tr key={order.id} className="bg-emerald-500/5"><td className="font-semibold">{order.externalReference}</td><td>{formatDateTimeID(effectivePayrollTimestamp(order))}</td><td>{order.source}</td><td>{order.gameName ?? order.game}</td><td>{formatMoney(order.grossMinor)}</td><td className="font-semibold text-emerald-300">SIAP GAJI</td></tr>)}</tbody></table>
        {!eligibleOrders.length ? <div className="p-5 text-sm text-zinc-500">Tidak ada pesanan selesai yang menunggu gajian pada periode ini.</div> : null}
      </section>

      {problemOrders.length ? <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5"><h2 className="text-xl font-semibold text-red-200">Pesanan bermasalah tidak masuk Tutup Buku</h2><div className="mt-3 flex flex-wrap gap-2">{problemOrders.map((order) => <span key={order.id} className="rounded-lg bg-red-500 px-3 py-2 text-sm font-bold text-white">{order.externalReference}</span>)}</div><p className="mt-3 text-sm text-red-100">Setelah pesanan diperbaiki dan ditandai Selesai di Mutasi, waktu selesai barunya akan menentukan gajian berikutnya.</p></section> : null}

      {lastClosed ? <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 sm:p-6"><div className="text-sm font-semibold text-emerald-200">✓ Hasil Tutup Buku terbaru · {lastClosed.id}</div><h2 className="mt-2 text-xl font-semibold">{lastClosed.orders.length} pesanan sudah dikunci ke gajian ini</h2><div className="mt-2 text-sm text-zinc-300">{formatJakartaDateTimeInput(lastClosed.from)} → {formatJakartaDateTimeInput(lastClosed.to)}</div><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-black/30 p-4"><div className="text-sm text-zinc-400">Pesanan selesai</div><div className="mt-2 flex flex-wrap gap-2">{lastClosed.orders.map((o) => <span key={o.id} className="rounded-lg bg-emerald-500 px-2 py-1 text-xs font-bold text-black">{o.externalReference}</span>)}</div></div><div className="rounded-xl bg-black/30 p-4"><div className="text-sm text-zinc-400">Penggajian gaji</div><div className="mt-2 space-y-2">{lastClosed.payroll.filter((r) => r.orderRefs.length).map((r) => <div key={r.employeeCode} className="flex justify-between gap-3 text-sm"><span>{r.employee} · {r.sharePercent}%</span><strong className={r.net < 0 ? "text-red-300" : "text-emerald-300"}>{formatMoney(r.net)}</strong></div>)}</div></div></div></section> : null}

      <section className="cp-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Riwayat Tutup Buku</h2><div className="mt-4 space-y-2">{closings.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-950/70 p-4"><div><div className="font-semibold">{row.id}</div><div className="text-xs text-zinc-500">{formatJakartaDateTimeInput(row.from)} → {formatJakartaDateTimeInput(row.to)} · {row.orderRefs.length} pesanan</div></div><div className="text-right">{row.ordersSnapshot && row.payrollSnapshot ? <button className="mb-2 rounded-lg bg-zinc-700 px-3 py-2 text-xs" onClick={() => { setLastClosed({id:row.id,from:row.from,to:row.to,orders:row.ordersSnapshot!,payroll:row.payrollSnapshot!}); setMessage("Snapshot Tutup Buku dipilih. Gunakan tombol Ekspor Periode Ini untuk mengunduh."); window.scrollTo({top:0,behavior:"smooth"}); }}>Lihat / Ekspor</button> : null}<div>{formatMoney(row.totalOrderMinor)}</div><div className={row.totalPayrollMinor < 0 ? "text-red-300" : "text-emerald-300"}>Gaji {formatMoney(row.totalPayrollMinor)}</div></div></div>)}{!closings.length ? <div className="text-sm text-zinc-500">Belum ada Tutup Buku.</div> : null}</div></section>
    </div>
  );
}

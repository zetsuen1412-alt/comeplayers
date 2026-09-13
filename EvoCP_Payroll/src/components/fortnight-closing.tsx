"use client";

import { useMemo, useState } from "react";
import { useDemoOrders } from "@/lib/demo-order-store";
import { useDemoEmployees } from "@/lib/demo-employee-store";
import { useDemoPayrollSettings } from "@/lib/demo-payroll-settings-store";
import { useDemoAdvances } from "@/lib/demo-advance-store";
import { useDemoInventory } from "@/lib/demo-inventory-store";
import { useDemoClosings } from "@/lib/demo-closing-store";
import { useDemoPeriodLock } from "@/lib/demo-period-lock-store";
import { buildLivePayrollRows, type LivePayrollRow } from "@/lib/payroll-live";
import { formatMoney } from "@/lib/money";
import { exportClosingSpreadsheet } from "@/lib/spreadsheet-export";
import {
  formatDateTimeID,
  formatJakartaDateTimeInput,
  jakartaDateTimeInputToISO,
  jakartaDateTimeLocalNow,
} from "@/lib/date";
import type { Order } from "@/types/domain";

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
  const { allOrders, updateOrder } = useDemoOrders();
  const { inventory } = useDemoInventory();
  const { employees } = useDemoEmployees();
  const { settings, clearAdjustmentsForEmployees } = useDemoPayrollSettings();
  const { outstandingByEmployee, applyRepayment } = useDemoAdvances();
  const { closings, addClosing } = useDemoClosings();
  const { lock, isLocked, lockPeriod, unlockPeriod } = useDemoPeriodLock();

  const nowLocal = jakartaDateTimeLocalNow();
  const [from, setFrom] = useState(`${nowLocal.slice(0, 10)}T00:00`);
  const [to, setTo] = useState(nowLocal);
  const [message, setMessage] = useState<string | null>(null);
  const [lastClosed, setLastClosed] = useState<ClosingSnapshot | null>(null);
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

  function handleLock() {
    setMessage(null);
    const result = lockPeriod({ from, to, lockedBy: "Admin DEMO" });
    if (!result.ok) return setMessage(result.message);
    setMessage("🔒 Periode berhasil dikunci. Semua menu edit sekarang read-only. Closing sudah dapat dilakukan.");
  }

  function handleUnlock() {
    if (!confirm("Buka kunci sistem? Setelah dibuka, user dapat mengedit data lagi dan tombol Closing akan terkunci.")) return;
    unlockPeriod();
    setMessage("🔓 Kunci dibuka. User dapat mengedit data lagi. Kunci kembali sebelum melakukan Closing.");
  }

  function closePeriod() {
    setMessage(null);
    if (!lock) return setMessage("Closing belum bisa dilakukan. Kunci periode terlebih dahulu.");
    if (!eligibleOrders.length) return setMessage("Tidak ada order selesai yang belum pernah masuk gajian pada periode terkunci ini.");

    const payroll = buildLivePayrollRows(eligibleOrders, payrollOptions).filter((row) => row.orderRefs.length > 0);
    const totalOrderMinor = eligibleOrders.reduce((sum, order) => sum + order.grossMinor, 0);
    const totalPayrollMinor = payroll.reduce((sum, row) => sum + row.net, 0);
    const record = addClosing({
      from: lock.from,
      to: lock.to,
      orderRefs: eligibleOrders.map((x) => x.externalReference),
      totalOrderMinor,
      totalPayrollMinor,
    });
    const now = new Date().toISOString();

    for (const order of eligibleOrders) {
      updateOrder(order.id, { payrollClosedAt: now, payrollPeriodId: record.id, financeStatus: "closed" });
    }
    for (const row of payroll) {
      if (row.kasbon > 0) applyRepayment(row.employeeCode, row.kasbon);
    }
    clearAdjustmentsForEmployees(payroll.map((row) => row.employeeCode));

    setLastClosed({ id: record.id, from: lock.from, to: lock.to, orders: eligibleOrders, payroll });
    setMessage(`✓ Closing berhasil. ${eligibleOrders.length} order masuk gajian ini dan tidak akan masuk lagi ke gajian berikutnya. Sistem masih dikunci; klik Buka Kunci jika pekerjaan sudah selesai.`);
  }

  const downloadTarget = lastClosed ?? { id: "preview", from: activeFrom, to: activeTo, orders: eligibleOrders, payroll: previewPayroll };

  async function downloadSpreadsheet() {
    if (!downloadTarget.orders.length) return setMessage("Belum ada order selesai untuk dibuatkan Excel.");
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
        <div className="text-sm font-semibold text-yellow-300">Closing manual + kunci sistem</div>
        <h2 className="mt-2 text-2xl font-semibold">Atur tanggal & jam → Kunci → Closing</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Closing hanya dapat dilakukan saat sistem <strong className="text-yellow-200">DIKUNCI</strong>. Ketika dikunci, semua user tidak dapat mengedit Pesanan, Mutasi, Karyawan, Gaji, Kasbon, Produk/Game, atau Stok sampai kunci dibuka kembali.
        </p>

        <div className={`mt-5 rounded-2xl border p-4 ${isLocked ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
          <div className={`text-sm font-bold ${isLocked ? "text-emerald-200" : "text-amber-200"}`}>
            {isLocked ? "🔒 SISTEM DIKUNCI" : "🔓 SISTEM BELUM DIKUNCI"}
          </div>
          <div className="mt-1 text-sm text-zinc-300">
            {isLocked && lock
              ? `${formatJakartaDateTimeInput(lock.from)} → ${formatJakartaDateTimeInput(lock.to)}`
              : "Pilih tanggal dan jam, lalu klik Kunci Periode. Tombol Closing belum aktif sebelum dikunci."}
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
            <button onClick={() => confirm(`Kunci seluruh sistem untuk periode ${formatJakartaDateTimeInput(from)} sampai ${formatJakartaDateTimeInput(to)}? Semua user tidak akan bisa mengedit sampai kunci dibuka.`) && handleLock()} className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-black">🔒 Kunci Periode</button>
          ) : (
            <button onClick={handleUnlock} className="rounded-xl bg-zinc-700 px-5 py-3 text-sm font-bold text-white">🔓 Buka Kunci</button>
          )}
          <button
            onClick={() => lock && confirm(`Closing periode terkunci ${formatJakartaDateTimeInput(lock.from)} sampai ${formatJakartaDateTimeInput(lock.to)}? Order selesai akan ditandai sudah masuk gaji.`) && closePeriod()}
            disabled={!isLocked}
            className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-35"
          >
            Closing
          </button>
          <button onClick={downloadSpreadsheet} disabled={exporting} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-black disabled:opacity-50">{exporting ? "Membuat Excel..." : "⬇ Export Periode Ini (.xlsx)"}</button>
        </div>
        {!isLocked ? <div className="mt-3 text-xs font-semibold text-red-300">Closing dinonaktifkan. Kunci periode terlebih dahulu.</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-100">{message}</div> : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Siap masuk gaji</div><div className="mt-1 text-3xl font-semibold text-emerald-300">{eligibleOrders.length}</div></div>
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Nilai order selesai</div><div className="mt-1 text-3xl font-semibold">{formatMoney(previewTotal)}</div></div>
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Gaji bersih</div><div className={`mt-1 text-3xl font-semibold ${previewPayrollTotal < 0 ? "text-red-300" : "text-yellow-300"}`}>{formatMoney(previewPayrollTotal)}</div></div>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5"><div className="text-sm text-zinc-400">Bermasalah · ditunda</div><div className="mt-1 text-3xl font-semibold text-red-300">{problemOrders.length}</div></div>
        <div className="cp-card p-5"><div className="text-sm text-zinc-500">Belum selesai</div><div className="mt-1 text-3xl font-semibold">{unfinishedOrders.length}</div></div>
      </div>

      <section className="cp-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Rincian berdasarkan sumber</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{previewSources.map((row) => <div key={row.source} className="rounded-xl bg-zinc-950/70 p-4"><div className="font-semibold">{row.source}</div><div className="mt-2 text-xl font-bold">{formatMoney(row.total)}</div><div className="mt-1 text-xs text-zinc-500">{row.count} order selesai</div></div>)}{!previewSources.length ? <div className="text-sm text-zinc-500">Belum ada order selesai pada periode ini.</div> : null}</div>
      </section>

      <section className="cp-card overflow-x-auto">
        <div className="p-5"><h2 className="text-xl font-semibold">Order yang akan masuk Closing</h2><p className="mt-1 text-sm text-zinc-500">Daftar ini hanya menampilkan order selesai pada rentang tanggal + jam yang dipilih dan belum pernah digaji.</p></div>
        <table className="cp-table"><thead><tr><th>Kode</th><th>Waktu selesai</th><th>Sumber</th><th>Game</th><th>Nilai</th><th>Status</th></tr></thead><tbody>{eligibleOrders.map((order) => <tr key={order.id} className="bg-emerald-500/5"><td className="font-semibold">{order.externalReference}</td><td>{formatDateTimeID(effectivePayrollTimestamp(order))}</td><td>{order.source}</td><td>{order.gameName ?? order.game}</td><td>{formatMoney(order.grossMinor)}</td><td className="font-semibold text-emerald-300">SIAP GAJI</td></tr>)}</tbody></table>
        {!eligibleOrders.length ? <div className="p-5 text-sm text-zinc-500">Tidak ada order selesai yang menunggu gajian pada periode ini.</div> : null}
      </section>

      {problemOrders.length ? <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5"><h2 className="text-xl font-semibold text-red-200">Order bermasalah tidak masuk Closing</h2><div className="mt-3 flex flex-wrap gap-2">{problemOrders.map((order) => <span key={order.id} className="rounded-lg bg-red-500 px-3 py-2 text-sm font-bold text-white">{order.externalReference}</span>)}</div><p className="mt-3 text-sm text-red-100">Setelah order diperbaiki dan ditandai Selesai di Mutasi, waktu selesai barunya akan menentukan gajian berikutnya.</p></section> : null}

      {lastClosed ? <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 sm:p-6"><div className="text-sm font-semibold text-emerald-200">✓ Hasil Closing terbaru · {lastClosed.id}</div><h2 className="mt-2 text-xl font-semibold">{lastClosed.orders.length} order sudah dikunci ke gajian ini</h2><div className="mt-2 text-sm text-zinc-300">{formatJakartaDateTimeInput(lastClosed.from)} → {formatJakartaDateTimeInput(lastClosed.to)}</div><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-black/30 p-4"><div className="text-sm text-zinc-400">Order selesai</div><div className="mt-2 flex flex-wrap gap-2">{lastClosed.orders.map((o) => <span key={o.id} className="rounded-lg bg-emerald-500 px-2 py-1 text-xs font-bold text-black">{o.externalReference}</span>)}</div></div><div className="rounded-xl bg-black/30 p-4"><div className="text-sm text-zinc-400">Payroll gaji</div><div className="mt-2 space-y-2">{lastClosed.payroll.filter((r) => r.orderRefs.length).map((r) => <div key={r.employeeCode} className="flex justify-between gap-3 text-sm"><span>{r.employee} · {r.sharePercent}%</span><strong className={r.net < 0 ? "text-red-300" : "text-emerald-300"}>{formatMoney(r.net)}</strong></div>)}</div></div></div></section> : null}

      <section className="cp-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Riwayat Closing</h2><div className="mt-4 space-y-2">{closings.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-950/70 p-4"><div><div className="font-semibold">{row.id}</div><div className="text-xs text-zinc-500">{formatJakartaDateTimeInput(row.from)} → {formatJakartaDateTimeInput(row.to)} · {row.orderRefs.length} order</div></div><div className="text-right"><div>{formatMoney(row.totalOrderMinor)}</div><div className={row.totalPayrollMinor < 0 ? "text-red-300" : "text-emerald-300"}>Gaji {formatMoney(row.totalPayrollMinor)}</div></div></div>)}{!closings.length ? <div className="text-sm text-zinc-500">Belum ada Closing.</div> : null}</div></section>
    </div>
  );
}

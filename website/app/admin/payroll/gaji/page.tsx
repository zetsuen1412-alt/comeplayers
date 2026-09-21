"use client";

import { adminLabel } from "@/lib/adminLocale";
import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/features/payroll/components/page-header";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoPayrollSettings } from "@/features/payroll/lib/demo-payroll-settings-store";
import { useDemoAdvances } from "@/features/payroll/lib/demo-advance-store";
import { buildLivePayrollRows, isPayrollEligible } from "@/features/payroll/lib/payroll-live";
import { formatMoney } from "@/features/payroll/lib/money";
import { formatDateTimeID } from "@/features/payroll/lib/date";
import { getAssignmentGrossMinor, getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { getPayrollEligibleGrossMinor, isDailySettlementOrder } from "@/features/payroll/lib/daily-orders";
import { exportPayrollSpreadsheet } from "@/features/payroll/lib/spreadsheet-export";

type TeamFilter = "SEMUA" | "FH1" | "FH2" | "FH3" | "ADMIN" | "BANDAR";

function statusClass(status: string) {
  if (status === "SAKIT" || status === "IJIN") return "bg-amber-500/15 text-amber-200";
  if (status === "RESIGN") return "bg-red-500/15 text-red-200";
  if (status === "FULL") return "bg-violet-500/15 text-violet-200";
  if (status === "NEW") return "bg-sky-500/15 text-sky-200";
  return "bg-emerald-500/15 text-emerald-200";
}

export default function PayrollPage() {
  const { allOrders } = useDemoOrders();
  const { employees } = useDemoEmployees();
  const { settings, setEmployeeSharePercent, updateEmployeeAdjustment, resetPayrollSettings } = useDemoPayrollSettings();
  const { outstandingByEmployee } = useDemoAdvances();
  const [team, setTeam] = useState<TeamFilter>("SEMUA");
  const [detailEmployeeCode, setDetailEmployeeCode] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const payrollOptions = useMemo(() => ({
    defaultSharePercent: settings.defaultSharePercent,
    employeeSharePercent: settings.employeeSharePercent,
    employees,
    adjustments: settings.adjustments,
    kasbonByEmployee: outstandingByEmployee,
  }), [employees, outstandingByEmployee, settings]);

  const liveRows = useMemo(() => buildLivePayrollRows(allOrders, payrollOptions), [allOrders, payrollOptions]);
  const rows = useMemo(() => liveRows.filter((row) => team === "SEMUA" || row.team === team), [liveRows, team]);
  const totalWorkValue = rows.reduce((sum, row) => sum + row.gross, 0);
  const totalIncome = rows.reduce((sum, row) => sum + row.earning, 0);
  const totalNet = rows.reduce((sum, row) => sum + row.net, 0);
  const waitingCheck = allOrders.filter((x) => x.operationalStatus === "completed" && getOrderAssignments(x).length > 0).length;

  const detailRow = detailEmployeeCode ? liveRows.find((row) => row.employeeCode === detailEmployeeCode) : undefined;
  const detailOrders = useMemo(() => {
    if (!detailEmployeeCode) return [];
    return allOrders.filter((order) => isPayrollEligible(order) && getOrderAssignments(order).some((a) => a.employeeCode === detailEmployeeCode));
  }, [allOrders, detailEmployeeCode]);

  return (
    <>
      <PageHeader title="Gaji" description={"Persentase gaji diatur per karyawan. Pesanan yang sudah Tutup Buku tidak akan dihitung lagi pada gajian berikutnya."} />

      <section className="mb-5 rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-yellow-200">Persentase per karyawan</div>
            <p className="mt-1 text-sm leading-6 text-zinc-400">Karyawan baru memakai bawaan {settings.defaultSharePercent}%. Persentase setiap karyawan bisa diubah sendiri, misalnya 40%, 50%, atau 60%.</p>
          </div>
          <button onClick={() => confirm("Atur Ulang persentase dan potongan gaji?") && resetPayrollSettings()} className="rounded-xl bg-zinc-800 px-4 py-3 text-sm font-semibold">Atur Ulang pengaturan</button>
        </div>
      </section>

      <section className="cp-card mb-5 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><div className="text-sm text-zinc-500">Nilai pekerjaan selesai</div><div className="mt-1 text-2xl font-semibold">{formatMoney(totalWorkValue)}</div></div>
          <div><div className="text-sm text-zinc-500">Gaji sebelum potongan</div><div className="mt-1 text-2xl font-semibold text-yellow-300">{formatMoney(totalIncome)}</div></div>
          <div><div className="text-sm text-zinc-500">Total gaji bersih</div><div className={`mt-1 text-2xl font-semibold ${totalNet < 0 ? "text-red-300" : "text-emerald-300"}`}>{formatMoney(totalNet)}</div></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(["SEMUA", "FH1", "FH2", "FH3", "ADMIN", "BANDAR"] as TeamFilter[]).map((value) => (
              <button key={value} onClick={() => setTeam(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${team === value ? "bg-yellow-400 text-black" : "bg-zinc-800"}`}>{value === "SEMUA" ? "Semua" : value}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={async () => { setExporting(true); try { await exportPayrollSpreadsheet(rows, team); } finally { setExporting(false); } }} disabled={exporting} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-50">{exporting ? "Membuat Excel..." : `⬇ Ekspor Gaji (${rows.length})`}</button>
            <Link href="/admin/payroll/advances" className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold text-white">Kelola Kasbon →</Link>
          </div>
        </div>
        <div className="mt-3 text-xs text-zinc-500">Ekspor Gaji mengikuti filter Semua / FH1 / FH2 / FH3 / ADMIN / BANDAR yang sedang dipilih.</div>
      </section>

      {waitingCheck > 0 ? <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Ada <strong>{waitingCheck} pesanan</strong> selesai tetapi belum dimasukkan ke Gaji. Buka <Link href="/admin/payroll/mutations" className="font-semibold underline">Mutasi</Link>.</div> : null}

      <section className="cp-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5">
          <div>
            <h2 className="font-semibold">Tabel Gaji Karyawan</h2>
            <p className="mt-1 text-xs text-zinc-500">Kolom dibuat lebar dan tetap terbaca. Geser ke kanan untuk Operasional, Kasbon, Denda, Bonus, dan Gaji Bersih.</p>
          </div>
          <div className="rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-400">{rows.length} karyawan · {team === "SEMUA" ? "Semua bagian" : team}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="cp-table min-w-[1840px] table-fixed">
            <colgroup>
              <col className="w-[190px]" />
              <col className="w-[105px]" />
              <col className="w-[120px]" />
              <col className="w-[150px]" />
              <col className="w-[160px]" />
              <col className="w-[205px]" />
              <col className="w-[150px]" />
              <col className="w-[155px]" />
              <col className="w-[155px]" />
              <col className="w-[145px]" />
              <col className="w-[165px]" />
              <col className="w-[155px]" />
            </colgroup>
            <thead className="bg-zinc-950">
              <tr>
                <th className="whitespace-nowrap">Karyawan</th>
                <th className="whitespace-nowrap text-center">Bagian / FH</th>
                <th className="whitespace-nowrap text-center">Status</th>
                <th className="whitespace-nowrap text-center">Pesanan selesai</th>
                <th className="whitespace-nowrap text-right">Nilai pekerjaan</th>
                <th className="whitespace-nowrap">Persentase</th>
                <th className="whitespace-nowrap text-right">Gaji awal</th>
                <th className="whitespace-nowrap">Operasional</th>
                <th className="whitespace-nowrap">Kasbon</th>
                <th className="whitespace-nowrap">Denda</th>
                <th className="whitespace-nowrap">Bonus / Uang Tip</th>
                <th className="whitespace-nowrap text-right">Gaji bersih</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const adjustment = settings.adjustments[row.employeeCode] ?? { operationalMinor: 0, penaltyMinor: 0, bonusTipsMinor: 0 };
                return (
                  <tr key={row.employeeCode} className="align-top">
                    <td className="font-semibold">
                      <div className="leading-5">{row.employee}</div>
                      <div className="mt-1 text-xs font-normal text-zinc-500">{row.employeeCode}</div>
                    </td>
                    <td className="text-center font-semibold">{row.team}</td>
                    <td className="text-center"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClass(row.employeeStatus)}`}>{adminLabel(row.employeeStatus)}</span></td>
                    <td className="text-center">{row.orderRefs.length ? <button onClick={() => setDetailEmployeeCode(row.employeeCode)} className="whitespace-nowrap rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold hover:bg-zinc-700">Perlihatkan ({row.orderRefs.length})</button> : <span className="text-zinc-600">Belum ada</span>}</td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(row.gross)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <input type="number" min="0" max="100" step="0.01" value={row.sharePercent} onChange={(e) => setEmployeeSharePercent(row.employeeCode, Number(e.target.value) || 0)} className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-center text-sm font-bold text-yellow-300" />
                        <span className="font-semibold">%</span>
                      </div>
                      <div className="mt-2 flex gap-1">{[40, 50, 60].map((v) => <button key={v} onClick={() => setEmployeeSharePercent(row.employeeCode, v)} className="rounded-md bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold hover:bg-zinc-700">{v}%</button>)}</div>
                    </td>
                    <td className="whitespace-nowrap text-right font-semibold text-yellow-300 tabular-nums">{formatMoney(row.earning)}</td>
                    <td><select value={adjustment.operationalMinor ?? 0} onChange={(e) => updateEmployeeAdjustment(row.employeeCode, { operationalMinor: Number(e.target.value) as 0 | 25000 | 50000 })} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"><option value={0}>Rp 0</option><option value={25000}>Rp 25.000</option><option value={50000}>Rp 50.000</option></select></td>
                    <td>
                      <div className="whitespace-nowrap font-semibold text-amber-200">- {formatMoney(row.kasbon)}</div>
                      {row.kasbonRemaining > 0 ? <div className="mt-1 text-xs text-zinc-500">Sisa {formatMoney(row.kasbonRemaining)}</div> : row.kasbonOutstanding > 0 ? <div className="mt-1 text-xs text-emerald-400">Terpotong penuh</div> : <div className="mt-1 text-xs text-zinc-600">Tidak ada</div>}
                    </td>
                    <td><input type="number" min="0" step="1000" value={adjustment.penaltyMinor ?? 0} onChange={(e) => updateEmployeeAdjustment(row.employeeCode, { penaltyMinor: Number(e.target.value) || 0 })} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-right text-sm tabular-nums" /></td>
                    <td><input type="number" min="0" step="1000" value={adjustment.bonusTipsMinor ?? 0} onChange={(e) => updateEmployeeAdjustment(row.employeeCode, { bonusTipsMinor: Number(e.target.value) || 0 })} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-right text-sm tabular-nums" /></td>
                    <td className={`whitespace-nowrap text-right font-bold tabular-nums ${row.net < 0 ? "text-red-300" : "text-emerald-300"}`}>{formatMoney(row.net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length ? <div className="p-8 text-center text-sm text-zinc-500">Belum ada data gaji.</div> : null}
        </div>
      </section>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm leading-6 text-zinc-400">Rumus: <strong className="text-white">Nilai pekerjaan × persentase karyawan + Bonus/Uang Tip − Operasional − Denda − Kasbon = Gaji Bersih.</strong> Jika hasil di bawah Rp0, angka tampil <span className="font-semibold text-red-300">merah dan minus</span>.</div>

      {detailEmployeeCode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={() => setDetailEmployeeCode(null)}>
          <section className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><div className="text-sm text-zinc-500">Pesanan selesai</div><h2 className="mt-1 text-xl font-semibold">{detailRow?.employee ?? detailEmployeeCode}</h2></div><button onClick={() => setDetailEmployeeCode(null)} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm">Tutup</button></div>
            <div className="mt-4 space-y-2">{detailOrders.map((order) => {
              const assignments = getOrderAssignments(order);
              const a = assignments.find((x) => x.employeeCode === detailEmployeeCode);
              let workValue = a ? getAssignmentGrossMinor(order, a) : 0;
              if (a && isDailySettlementOrder(order)) {
                const gross = getPayrollEligibleGrossMinor(order);
                const index = assignments.findIndex((item) => item.id === a.id);
                const base = Math.floor(gross / assignments.length);
                const remainder = gross - base * assignments.length;
                workValue = base + (index >= 0 && index < remainder ? 1 : 0);
              }
              return <Link key={order.id} href={`/admin/payroll/orders/${order.externalReference}`} className="block rounded-xl border border-zinc-800 bg-black/40 p-4 hover:border-yellow-500/40"><div className="flex flex-wrap justify-between gap-2"><strong>{order.externalReference}</strong><span className="text-yellow-300">{a ? formatMoney(workValue) : "—"}</span></div><div className="mt-1 text-xs text-zinc-500">{order.source} · {order.gameName ?? order.game} · {isDailySettlementOrder(order) ? "nilai hari selesai" : `selesai ${formatDateTimeID(order.verifiedAt ?? order.completedAt ?? order.orderedAt)}`}</div></Link>;
            })}</div>
          </section>
        </div>
      ) : null}
    </>
  );
}

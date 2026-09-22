"use client";

import { adminLabel } from "@/lib/adminLocale";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/features/payroll/components/page-header";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoPayrollSettings } from "@/features/payroll/lib/demo-payroll-settings-store";
import { useDemoAdvances } from "@/features/payroll/lib/demo-advance-store";
import { buildLivePayrollRows, isPayrollEligible } from "@/features/payroll/lib/payroll-live";
import { formatMoney } from "@/features/payroll/lib/money";
import { formatDateTimeID } from "@/features/payroll/lib/date";
import { getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { isDailySettlementOrder } from "@/features/payroll/lib/daily-orders";
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
  const [horizontalScroll, setHorizontalScroll] = useState(0);
  const [horizontalMax, setHorizontalMax] = useState(0);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const table = tableScrollRef.current;
    if (!table) return;

    const measure = () => {
      const max = Math.max(0, table.scrollWidth - table.clientWidth);
      setHorizontalMax(max);
      setHorizontalScroll((current) => Math.min(current, max));
    };

    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(table);
    const innerTable = table.querySelector("table");
    if (innerTable) observer?.observe(innerTable);

    return () => observer?.disconnect();
  }, [rows.length, team]);

  function setTableHorizontalScroll(value: number) {
    const max = Math.max(0, horizontalMax);
    const next = Math.max(0, Math.min(max, value));
    setHorizontalScroll(next);
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = next;
    if (topScrollRef.current) topScrollRef.current.scrollLeft = next;
  }

  const detailRow = detailEmployeeCode ? liveRows.find((row) => row.employeeCode === detailEmployeeCode) : undefined;
  const detailItems = useMemo(() => {
    if (!detailEmployeeCode) return [];

    const items: Array<{
      key: string;
      orderId: string;
      orderReference: string;
      source: string;
      game: string;
      label: string;
      workValue: number;
      completedAt: string;
    }> = [];

    for (const order of allOrders) {
      if (!isPayrollEligible(order)) continue;

      if (isDailySettlementOrder(order)) {
        for (const day of order.dailyWork ?? []) {
          if (day.status !== "verified" || day.payrollClosedAt) continue;
          const assignments = day.workerAssignments?.length ? day.workerAssignments : getOrderAssignments(order);
          const index = assignments.findIndex((assignment) => assignment.employeeCode === detailEmployeeCode);
          if (index < 0 || !assignments.length) continue;

          const base = Math.floor(day.grossMinor / assignments.length);
          const remainder = day.grossMinor - (base * assignments.length);
          items.push({
            key: `${order.id}::${day.id}::${detailEmployeeCode}`,
            orderId: order.id,
            orderReference: order.externalReference,
            source: order.source,
            game: order.gameName ?? order.game,
            label: `Hari ${day.sequence}/${order.scheduleTotalDays ?? order.dailyWork?.length ?? day.sequence}`,
            workValue: base + (index < remainder ? 1 : 0),
            completedAt: day.verifiedAt ?? day.completedAt ?? day.sourceOrderedAt ?? order.verifiedAt ?? order.completedAt ?? order.orderedAt,
          });
        }
        continue;
      }

      const assignments = getOrderAssignments(order);
      const index = assignments.findIndex((assignment) => assignment.employeeCode === detailEmployeeCode);
      if (index < 0 || !assignments.length) continue;

      const base = Math.floor(order.grossMinor / assignments.length);
      const remainder = order.grossMinor - (base * assignments.length);
      items.push({
        key: `${order.id}::${detailEmployeeCode}`,
        orderId: order.id,
        orderReference: order.externalReference,
        source: order.source,
        game: order.gameName ?? order.game,
        label: "Pesanan",
        workValue: base + (index < remainder ? 1 : 0),
        completedAt: order.verifiedAt ?? order.completedAt ?? order.orderedAt,
      });
    }

    return items.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || a.orderReference.localeCompare(b.orderReference, "id", { numeric: true }));
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
        <div className="border-b border-zinc-800 bg-zinc-950/80 px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-zinc-400">← Geser tabel ke kiri / kanan →</div>
            <div className="text-[11px] text-zinc-600">{horizontalMax > 0 ? `${Math.round((horizontalScroll / horizontalMax) * 100)}%` : "Tabel sudah muat"}</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTableHorizontalScroll(horizontalScroll - 360)} disabled={horizontalScroll <= 0} className="h-10 min-w-10 rounded-lg bg-zinc-800 px-3 text-lg font-bold disabled:cursor-not-allowed disabled:opacity-30" aria-label="Geser tabel ke kiri">←</button>
            <input
              type="range"
              min={0}
              max={Math.max(1, horizontalMax)}
              step={1}
              value={Math.min(horizontalScroll, Math.max(1, horizontalMax))}
              disabled={horizontalMax <= 0}
              onChange={(event) => setTableHorizontalScroll(Number(event.target.value))}
              className="h-10 min-w-0 flex-1 cursor-ew-resize accent-yellow-400 disabled:cursor-not-allowed"
              aria-label="Posisi horizontal tabel gaji"
            />
            <button type="button" onClick={() => setTableHorizontalScroll(horizontalScroll + 360)} disabled={horizontalScroll >= horizontalMax} className="h-10 min-w-10 rounded-lg bg-zinc-800 px-3 text-lg font-bold disabled:cursor-not-allowed disabled:opacity-30" aria-label="Geser tabel ke kanan">→</button>
          </div>
          <div
            ref={topScrollRef}
            onScroll={(event) => {
              const next = event.currentTarget.scrollLeft;
              setHorizontalScroll(next);
              if (tableScrollRef.current && tableScrollRef.current.scrollLeft !== next) {
                tableScrollRef.current.scrollLeft = next;
              }
            }}
            className="mt-1 h-5 overflow-x-scroll overflow-y-hidden rounded-md bg-zinc-900"
            style={{ scrollbarGutter: "stable", scrollbarColor: "#71717a #18181b" }}
            aria-label="Scrollbar tabel gaji"
          >
            <div className="h-px min-w-[1840px]" />
          </div>
        </div>
        <div
          ref={tableScrollRef}
          onScroll={(event) => {
            const next = event.currentTarget.scrollLeft;
            setHorizontalScroll(next);
            if (topScrollRef.current && topScrollRef.current.scrollLeft !== next) {
              topScrollRef.current.scrollLeft = next;
            }
          }}
          className="overflow-x-auto"
        >
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
          <section className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
              <div>
                <div className="text-sm text-zinc-500">Pesanan selesai</div>
                <h2 className="mt-1 text-xl font-semibold">{detailRow?.employee ?? detailEmployeeCode}</h2>
                <div className="mt-1 text-xs text-zinc-500">
                  Menampilkan <strong className="text-white">{detailItems.length}</strong> dari <strong className="text-white">{detailRow?.orderRefs.length ?? detailItems.length}</strong> pekerjaan yang masuk Gaji.
                </div>
              </div>
              <button onClick={() => setDetailEmployeeCode(null)} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm">Tutup</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="space-y-2">
                {detailItems.map((item) => (
                  <Link key={item.key} href={`/admin/payroll/orders/${encodeURIComponent(item.orderReference)}`} className="block rounded-xl border border-zinc-800 bg-black/40 p-4 hover:border-yellow-500/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{item.orderReference}</strong>
                        <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-200">{item.label}</span>
                      </div>
                      <span className="font-semibold text-yellow-300">{formatMoney(item.workValue)}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{item.source} · {item.game} · selesai {formatDateTimeID(item.completedAt)}</div>
                  </Link>
                ))}
                {!detailItems.length ? <div className="rounded-xl border border-zinc-800 bg-black/40 p-6 text-center text-sm text-zinc-500">Tidak ada pekerjaan selesai yang sedang masuk Gaji.</div> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

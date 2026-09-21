"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/features/payroll/components/page-header";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { formatMoney } from "@/features/payroll/lib/money";
import { formatDateTimeID } from "@/features/payroll/lib/date";
import { getAssignmentGrossMinor, getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { dailyProgress, getPayrollEligibleGrossMinor, isDailySettlementOrder, replaceDailyWorkStatus } from "@/features/payroll/lib/daily-orders";
import { formatMoney as formatDailyMoney } from "@/features/payroll/lib/money";
import { analyzeOrderIssues } from "@/features/payroll/lib/order-issues";
import { formatMutationDistribution, type MutationViewRow } from "@/features/payroll/lib/mutation-rows";

export default function OrderDetailPage() {
  const params = useParams<{ ref: string }>();
  const { allOrders, updateOrder } = useDemoOrders();
  const { employees } = useDemoEmployees();
  const ref = decodeURIComponent(params.ref ?? "");
  const order = allOrders.find((x) => x.externalReference.toLowerCase() === ref.toLowerCase());

  if (!order) {
    return <><div className="mb-4"><Link href="/admin/payroll/orders" className="text-sm text-yellow-300">← Kembali ke Pesanan</Link></div><PageHeader title="Pesanan tidak ditemukan" description="Data mungkin belum tersimpan atau sudah dihapus dari DEMO." /></>;
  }

  const currentOrder = order;
  const isDaily = isDailySettlementOrder(currentOrder);
  const progress = dailyProgress(currentOrder);
  const dailyPayrollReady = getPayrollEligibleGrossMinor(currentOrder);

  function setDailyStatus(dailyId: string, status: "pending" | "in_progress" | "verified" | "on_hold") {
    try {
      const patch = replaceDailyWorkStatus(currentOrder, dailyId, status);
      updateOrder(currentOrder.id, patch);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Status harian tidak dapat diperbarui.");
    }
  }

  const issues = analyzeOrderIssues(order, employees);
  const assignments = getOrderAssignments(order);
  const inPayroll = order.operationalStatus === "verified";
  const alreadyPaid = Boolean(order.payrollClosedAt);

  return (
    <>
      <div className="mb-4"><Link href="/admin/payroll/orders" className="text-sm text-yellow-300">← Kembali ke Pesanan</Link></div>
      <PageHeader title={`Pesanan ${order.externalReference}`} description={`${order.gameName ?? order.game} · ${order.region ?? "Wilayah belum ada"} · ${order.server ?? "Server belum ada"}${order.orderType === "gold" ? "" : ` · ${order.orderName ?? order.service}`}`} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="cp-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Ringkasan</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Waktu pesanan masuk</span><strong className="text-right">{formatDateTimeID(order.orderedAt)}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Sumber</span><strong>{order.source}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Jenis Pesanan</span><strong>{order.orderType === "gold" ? "Gold" : order.orderType === "item" ? "Item" : "Boosting"}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Pembeli</span><strong>{order.buyerName ?? "—"}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">GAME</span><strong>{order.gameName ?? order.game} <span className="text-zinc-500">({order.game})</span></strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Wilayah</span><strong>{order.region ?? "—"}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Server</span><strong>{order.server ?? "—"}</strong></div>
            {order.orderType !== "gold" ? <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Nama pesanan</span><strong>{order.orderName ?? order.service}</strong></div> : null}
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">TASK</span><strong className="max-w-[65%] whitespace-pre-wrap text-right">{order.task?.trim() || "—"}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Jumlah pesanan</span><strong>{order.quantity.toLocaleString("id-ID")}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Tarif</span><strong>{order.rateMinor !== undefined ? formatMoney(order.rateMinor) : "—"}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Harga pesanan</span><strong>{formatMoney(order.grossMinor)}</strong></div>
            {isDaily ? <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Pengerjaan</span><strong className="text-sky-300">Harian · {progress.verified}/{progress.total} selesai</strong></div> : null}
            {isDaily ? <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Siap masuk gaji</span><strong className="text-emerald-300">{formatMoney(dailyPayrollReady)}</strong></div> : null}
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Perhitungan gaji</span><strong className="text-yellow-300">Diatur di menu Gaji</strong></div>
            <div className="flex justify-between gap-4"><span className="text-zinc-500">Status gaji</span><strong className={inPayroll ? "text-emerald-300" : "text-amber-300"}>{alreadyPaid ? "SUDAH DIGAJI" : inPayroll ? "MENUNGGU CLOSING" : "BELUM"}</strong></div>
          </div>
        </section>

        {order.inventoryAllocations?.length ? (
          <section className="cp-card p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Stok dari Gudang</h2>
            <div className="mt-4 space-y-3">
              {order.inventoryAllocations.map((stock) => (
                <div key={stock.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong>{stock.stockType === "gold" ? `${stock.game} Gold` : stock.itemName}</strong><span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">{stock.stockType === "gold" ? "Gold" : "Item"}</span></div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div><span className="text-zinc-500">Pemegang stok:</span> {stock.employeeName} ({stock.team})</div>
                    <div><span className="text-zinc-500">Permainan:</span> {stock.game}</div>
                    <div><span className="text-zinc-500">Wilayah / Server:</span> {stock.region ?? "—"} / {stock.server ?? "—"}</div>
                    <div><span className="text-zinc-500">Jumlah diambil:</span> {stock.quantity.toLocaleString("id-ID")}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-sm text-zinc-500">Status stok: {order.inventoryConsumedAt ? "Sudah keluar dari Gudang" : "Dicadangkan untuk pesanan ini"}</div>
          </section>
        ) : null}

        <section className="cp-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Karyawan yang Mengerjakan</h2>
          <div className="mt-4 space-y-3">
            {assignments.length ? assignments.map((assignment) => (
              <div key={assignment.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong>{assignment.employeeName}</strong><span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">{assignment.team}</span></div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div><span className="text-zinc-500">Proses:</span> {assignment.process}</div>
                  <div><span className="text-zinc-500">Jumlah:</span> {assignment.quantity.toLocaleString("id-ID")}</div>
                  <div><span className="text-zinc-500">Nilai pekerjaan:</span> <strong className="text-yellow-300">{formatMoney(getAssignmentGrossMinor(order, assignment))}</strong></div>
                </div>
              </div>
            )) : <div className="text-sm text-zinc-500">Belum ada karyawan yang ditugaskan.</div>}
          </div>
        </section>
      </div>


      {isDaily ? (
        <section className="cp-card mt-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Penyelesaian Harian</h2>
              <p className="mt-1 text-sm text-zinc-400">Hanya hari berstatus <strong className="text-emerald-300">Selesai</strong> yang masuk Gaji. Hari yang sudah masuk Tutup Buku terkunci dan tidak dapat diubah.</p>
            </div>
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              {progress.verified}/{progress.total} hari selesai · {formatDailyMoney(dailyPayrollReady)} menunggu gaji
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="cp-table">
              <thead><tr><th>Hari</th><th>Tanggal</th><th>Jam/hari</th><th>Karyawan</th><th>Pembagian</th><th>Nilai hari</th><th>Status</th><th>Gaji</th><th>Tindakan</th></tr></thead>
              <tbody>
                {(order.dailyWork ?? []).map((day) => {
                  const closed = Boolean(day.payrollClosedAt);
                  const dayAssignments = day.workerAssignments?.length ? day.workerAssignments : assignments;
                  const dayIssues = analyzeOrderIssues(order, employees, day);
                  const dayRow: MutationViewRow = { id: `${order.id}::${day.id}`, order, day, orderedAt: day.sourceOrderedAt ?? `${day.workDate}T12:00:00+07:00`, quantity: day.quantity ?? 1, grossMinor: day.grossMinor, assignments: dayAssignments };
                  const statusLabel = closed ? "Sudah digaji" : day.status === "verified" ? "Selesai" : day.status === "in_progress" ? "Dikerjakan" : day.status === "on_hold" ? "Bermasalah" : "Belum mulai";
                  return <tr key={day.id} className={closed ? "bg-emerald-500/10" : day.status === "on_hold" || dayIssues.some((item) => item.severity === "high" || item.severity === "critical") ? "bg-red-500/10" : ""}>
                    <td className="font-semibold">Hari {day.sequence}/{order.scheduleTotalDays ?? order.dailyWork?.length ?? day.sequence}</td>
                    <td>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(`${day.workDate}T12:00:00+07:00`))}</td>
                    <td>{day.hours ?? order.dailyHours ? <strong className="text-sky-300">{day.hours ?? order.dailyHours} jam</strong> : "—"}</td>
                    <td>{dayAssignments.length ? dayAssignments.map((worker) => <div key={worker.id}><strong>{worker.employeeName}</strong> · {worker.team}</div>) : <span className="text-red-300">Belum ada</span>}</td>
                    <td className="text-sm">{formatMutationDistribution(dayRow)}</td>
                    <td className="font-semibold text-yellow-300">{formatMoney(day.grossMinor)}</td>
                    <td><span className={closed ? "text-emerald-300" : day.status === "verified" ? "text-emerald-300" : day.status === "on_hold" || dayIssues.length ? "text-red-300" : day.status === "in_progress" ? "text-sky-300" : "text-zinc-400"}>{dayIssues.length ? `Bermasalah (${dayIssues.length})` : statusLabel}</span>{dayIssues.length ? <div className="mt-2 space-y-1 text-xs text-red-200">{dayIssues.slice(0, 2).map((item, index) => <div key={`${item.code}-${index}`}>• {item.title}</div>)}</div> : null}</td>
                    <td>{closed ? <span className="font-semibold text-emerald-300">✓ Sudah masuk closing</span> : day.status === "verified" ? <span className="font-semibold text-emerald-300">Siap dicairkan</span> : <span className="text-zinc-500">Belum bisa dicairkan</span>}</td>
                    <td>
                      {closed ? <span className="text-xs text-zinc-500">Dikunci</span> : <div className="flex flex-wrap gap-2">
                        <button onClick={() => setDailyStatus(day.id, "pending")} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold">Belum</button>
                        <button onClick={() => setDailyStatus(day.id, "in_progress")} className="rounded-lg bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-100">Dikerjakan</button>
                        <button onClick={() => setDailyStatus(day.id, "on_hold")} className="rounded-lg bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-100">Bermasalah</button>
                        <button onClick={() => confirm(`Tandai hari ke-${day.sequence} selesai? Nilai ${formatMoney(day.grossMinor)} akan masuk Gaji berikutnya.`) && setDailyStatus(day.id, "verified")} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black">✓ Selesai</button>
                      </div>}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="cp-card mt-5 p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Alur pesanan</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {["Pesanan dicatat", "Otomatis masuk Mutasi", "Karyawan mengerjakan sesuai jumlah", "Hasil diperiksa", "Pendapatan masuk ke Gaji"].map((text, index) => (
            <div key={text} className="flex items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-300">{index + 1}</div><div className="text-sm">{text}</div></div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2"><Link href="/admin/payroll/mutations" className="inline-flex rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-black">Lihat Mutasi</Link>{inPayroll ? <Link href="/admin/payroll/gaji" className="inline-flex rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black">Lihat di Gaji</Link> : null}</div>
      </section>

      {issues.length ? (
        <section className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-amber-100">⚠️ Pesanan ini perlu dicek</h2>
          <div className="mt-3 space-y-3">{issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="rounded-xl bg-black/20 p-4"><div className="font-semibold">{issue.title}</div><p className="mt-1 text-sm leading-6 text-zinc-300">{issue.description}</p><div className="mt-2 text-xs text-zinc-500">Kode pemeriksaan: {issue.code}</div></div>)}</div>
        </section>
      ) : <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-100">✓ Tidak ada masalah pada pesanan ini.</div>}
    </>
  );
}

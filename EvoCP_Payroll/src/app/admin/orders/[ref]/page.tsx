"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { financeIssues } from "@/lib/demo-data";
import { useDemoOrders } from "@/lib/demo-order-store";
import { formatMoney } from "@/lib/money";
import { formatDateTimeID } from "@/lib/date";
import { getAssignmentGrossMinor, getOrderAssignments } from "@/lib/order-workers";

export default function OrderDetailPage() {
  const params = useParams<{ ref: string }>();
  const { allOrders } = useDemoOrders();
  const ref = decodeURIComponent(params.ref ?? "");
  const order = allOrders.find((x) => x.externalReference.toLowerCase() === ref.toLowerCase());

  if (!order) {
    return <><div className="mb-4"><Link href="/admin/orders" className="text-sm text-yellow-300">← Kembali ke Pesanan</Link></div><PageHeader title="Pesanan tidak ditemukan" description="Data mungkin belum tersimpan atau sudah dihapus dari DEMO." /></>;
  }

  const issues = financeIssues.filter((x) => x.entity === order.externalReference);
  const assignments = getOrderAssignments(order);
  const inPayroll = order.operationalStatus === "verified";
  const alreadyPaid = Boolean(order.payrollClosedAt);

  return (
    <>
      <div className="mb-4"><Link href="/admin/orders" className="text-sm text-yellow-300">← Kembali ke Pesanan</Link></div>
      <PageHeader title={`Pesanan ${order.externalReference}`} description={`${order.gameName ?? order.game} · ${order.region ?? "Region belum ada"} · ${order.server ?? "Server belum ada"}${order.orderType === "gold" ? "" : ` · ${order.orderName ?? order.service}`}`} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="cp-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Ringkasan</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Waktu order masuk</span><strong className="text-right">{formatDateTimeID(order.orderedAt)}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Sumber</span><strong>{order.source}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Jenis Order</span><strong>{order.orderType === "gold" ? "Gold" : order.orderType === "item" ? "Item" : "Boosting"}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Buyer</span><strong>{order.buyerName ?? "—"}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Game</span><strong>{order.gameName ?? order.game} <span className="text-zinc-500">({order.game})</span></strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Region</span><strong>{order.region ?? "—"}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Server</span><strong>{order.server ?? "—"}</strong></div>
            {order.orderType !== "gold" ? <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Nama order</span><strong>{order.orderName ?? order.service}</strong></div> : null}
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Jumlah order</span><strong>{order.quantity.toLocaleString("id-ID")}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Rate</span><strong>{order.rateMinor !== undefined ? formatMoney(order.rateMinor) : "—"}</strong></div>
            <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3"><span className="text-zinc-500">Harga pesanan</span><strong>{formatMoney(order.grossMinor)}</strong></div>
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
                    <div><span className="text-zinc-500">Game:</span> {stock.game}</div>
                    <div><span className="text-zinc-500">Region / Server:</span> {stock.region ?? "—"} / {stock.server ?? "—"}</div>
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

      <section className="cp-card mt-5 p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Alur pesanan</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {["Pesanan dicatat", "Otomatis masuk Mutasi", "Karyawan mengerjakan sesuai jumlah", "Hasil diperiksa", "Pendapatan masuk ke Gaji"].map((text, index) => (
            <div key={text} className="flex items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-300">{index + 1}</div><div className="text-sm">{text}</div></div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2"><Link href="/admin/mutations" className="inline-flex rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-black">Lihat Mutasi</Link>{inPayroll ? <Link href="/admin/payroll" className="inline-flex rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black">Lihat di Gaji</Link> : null}</div>
      </section>

      {issues.length ? (
        <section className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-amber-100">⚠️ Pesanan ini perlu dicek</h2>
          <div className="mt-3 space-y-3">{issues.map((issue) => <div key={issue.id} className="rounded-xl bg-black/20 p-4"><div className="font-semibold">{issue.title}</div><p className="mt-1 text-sm leading-6 text-zinc-300">{issue.description}</p><div className="mt-2 text-sm">Nilai yang perlu diperiksa: <strong>{formatMoney(issue.exposureMinor)}</strong></div></div>)}</div>
        </section>
      ) : <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-100">✓ Tidak ada masalah pada pesanan ini.</div>}
    </>
  );
}

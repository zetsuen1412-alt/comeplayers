"use client";

import Link from "next/link";
import { KpiCard } from "@/features/payroll/components/kpi-card";
import { PageHeader } from "@/features/payroll/components/page-header";
import { financeIssues } from "@/features/payroll/lib/demo-data";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { formatMoney } from "@/features/payroll/lib/money";

export default function FinancePage() {
  const { allOrders } = useDemoOrders();
  const expected = allOrders.reduce((sum, order) => sum + order.expectedPaymentMinor, 0);
  const received = allOrders.reduce((sum, order) => sum + order.matchedPaymentMinor, 0);
  const openIssues = financeIssues.filter((issue) => issue.status !== "resolved");
  const critical = openIssues.filter((issue) => issue.severity === "critical");

  return (
    <>
      <PageHeader title="Keuangan" description="Lihat uang masuk, uang yang belum masuk, masalah, dan tutup buku yang periodenya bisa Anda atur." />

      <div className="cp-grid sm:grid-cols-3">
        <KpiCard label="Uang masuk" value={formatMoney(received)} />
        <KpiCard label="Belum masuk" value={formatMoney(expected - received)} />
        <KpiCard label="Masalah" value={String(openIssues.length)} note={critical.length ? `${critical.length} masalah penting` : "Tidak ada masalah penting"} />
      </div>

      <section className="cp-card mt-6 p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Yang perlu dicek</h2>
        <div className="mt-4 space-y-3">
          {!openIssues.length ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">Belum ada masalah keuangan.</div> : null}
          {openIssues.map((issue) => (
            <div key={issue.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{issue.entity} — {issue.title}</div>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">{issue.description}</p>
                </div>
                <div className="text-sm font-semibold text-amber-200">{formatMoney(issue.exposureMinor)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Link href="/admin/payroll/finance/closing" className={`mt-6 block rounded-2xl border p-5 transition hover:border-yellow-400/50 sm:p-6 ${critical.length ? "border-red-500/30 bg-red-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">📕 Tutup Buku</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{critical.length ? `Belum bisa ditutup karena masih ada ${critical.length} masalah penting.` : "Periode siap diperiksa dan ditutup."}</p>
          </div>
          <span className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-black">Buka Tutup Buku →</span>
        </div>
      </Link>
    </>
  );
}

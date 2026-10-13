"use client";

import Link from "next/link";
import { KpiCard } from "@/features/payroll/components/kpi-card";
import { PageHeader } from "@/features/payroll/components/page-header";
import { financeIssues } from "@/features/payroll/lib/demo-data";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoPayrollSettings } from "@/features/payroll/lib/demo-payroll-settings-store";
import { useDemoAdvances } from "@/features/payroll/lib/demo-advance-store";
import { buildLivePayrollRows } from "@/features/payroll/lib/payroll-live";
import { formatMoney } from "@/features/payroll/lib/money";

export default function ControlCenterPage() {
  const { allOrders } = useDemoOrders();
  const { employees } = useDemoEmployees();
  const { settings } = useDemoPayrollSettings();
  const { outstandingByEmployee } = useDemoAdvances();
  const cash = allOrders.reduce((sum, order) => sum + order.matchedPaymentMinor, 0);
  const outstanding = allOrders.reduce((sum, order) => sum + Math.max(0, order.expectedPaymentMinor - order.matchedPaymentMinor), 0);
  const openIssues = financeIssues.filter((issue) => issue.status !== "resolved").length;
  const payrollTotal = buildLivePayrollRows(allOrders, { defaultSharePercent: settings.defaultSharePercent, employeeSharePercent: settings.employeeSharePercent, employees, adjustments: settings.adjustments, kasbonByEmployee: outstandingByEmployee }).reduce((sum, row) => sum + row.net, 0);
  const unfinished = allOrders.filter((order) => !["verified", "cancelled"].includes(order.operationalStatus)).length;

  const steps = [
    ["1", "Pesanan", "Catat pesanan satu kali", "/admin/payroll/orders"],
    ["2", "Order Harian", "Cek pekerjaan & pembagian per hari", "/admin/payroll/daily"],
    ["2b", "Mutasi", "Cek & tandai selesai", "/admin/payroll/mutations"],
    ["3", "Gaji", "Atur % & potongan", "/admin/payroll/gaji"],
    ["4", "Kasbon", "Catat pinjaman karyawan", "/admin/payroll/advances"],
    ["5", "Keuangan", "Cek uang & masalah", "/admin/payroll/finance"],
    ["6", "AI Cek", "Cari data yang aneh", "/admin/payroll/ai"],
    ["7", "Tutup Buku", "Atur periode & Excel", "/admin/payroll/finance/closing"],
  ];

  return (
    <>
      <PageHeader title="Beranda" description="Mulai dari Order Harian untuk melihat pekerjaan per tanggal, lalu gunakan Mutasi untuk mengubah status dan menyelesaikan Gaji." />

      <div className="cp-grid sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Uang masuk" value={formatMoney(cash)} />
        <KpiCard label="Belum masuk" value={formatMoney(outstanding)} />
        <KpiCard label="Gaji bersih" value={formatMoney(payrollTotal)} note="Persentase berbeda per karyawan" />
        <KpiCard label="Belum selesai" value={String(unfinished)} note="Order yang masih dikerjakan/dicek" />
        <KpiCard label="Perlu dicek" value={String(openIssues)} note="Masalah data atau pembayaran" />
      </div>

      <section className="cp-card mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Alur kerja</h2><p className="mt-1 text-sm text-zinc-400">Ikuti dari kiri ke kanan.</p></div><Link href="/admin/payroll/guide" className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-black">Buka Panduan</Link></div>
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          {steps.map(([number, title, text, href]) => <Link key={number} href={href} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 transition hover:border-yellow-500/40"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 font-bold text-black">{number}</div><div className="mt-3 font-semibold">{title}</div><div className="mt-1 text-sm leading-5 text-zinc-500">{text}</div></Link>)}
        </div>
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Link href="/admin/payroll/daily" className="cp-card p-4"><div className="font-semibold">📅 Order Harian</div><div className="mt-1 text-sm text-zinc-500">Lihat baris pekerjaan, progres hari, dan pembagian karyawan tanpa filter rumit.</div></Link>
        <Link href="/admin/payroll/boosting" className="cp-card p-4"><div className="font-semibold">⚡ Daftar Boosting</div><div className="mt-1 text-sm text-zinc-500">Kelola harga default paket boosting untuk form Pesanan manual.</div></Link>
        <Link href="/admin/payroll/mutations" className="cp-card p-4"><div className="font-semibold">🔄 Mutasi</div><div className="mt-1 text-sm text-zinc-500">Klik selesai supaya otomatis masuk Gaji.</div></Link>
        <Link href="/admin/payroll/gaji" className="cp-card p-4"><div className="font-semibold">💰 Gaji</div><div className="mt-1 text-sm text-zinc-500">Pendapatan pesanan selesai dihitung otomatis.</div></Link>
        <Link href="/admin/payroll/ai" className="cp-card p-4"><div className="font-semibold">🤖 Asisten AI</div><div className="mt-1 text-sm text-zinc-500">Cek Mutasi, Gaji, dan kesiapan Tutup Buku.</div></Link>
        <Link href="/admin/payroll/finance/closing" className="cp-card p-4"><div className="font-semibold">📕 Tutup Buku</div><div className="mt-1 text-sm text-zinc-500">Atur periode sendiri & download Excel.</div></Link>
        <Link href="/admin/payroll/inventory" className="cp-card p-4"><div className="font-semibold">📦 Stok / Gudang</div><div className="mt-1 text-sm text-zinc-500">Gabungan gudang permainan.</div></Link>
      </section>
    </>
  );
}

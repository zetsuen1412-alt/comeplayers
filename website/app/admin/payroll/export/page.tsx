"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/features/payroll/components/page-header";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoInventory } from "@/features/payroll/lib/demo-inventory-store";
import { useDemoPayrollSettings } from "@/features/payroll/lib/demo-payroll-settings-store";
import { useDemoAdvances } from "@/features/payroll/lib/demo-advance-store";
import { useDemoClosings } from "@/features/payroll/lib/demo-closing-store";
import { buildLivePayrollRows } from "@/features/payroll/lib/payroll-live";
import { exportAllDataSpreadsheet } from "@/features/payroll/lib/spreadsheet-export";

export default function ExportSpreadsheetPage() {
  const { allOrders } = useDemoOrders();
  const { employees } = useDemoEmployees();
  const { inventory } = useDemoInventory();
  const { settings } = useDemoPayrollSettings();
  const { outstandingByEmployee } = useDemoAdvances();
  const { closings } = useDemoClosings();
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const payroll = useMemo(() => buildLivePayrollRows(allOrders, {
    defaultSharePercent: settings.defaultSharePercent,
    employeeSharePercent: settings.employeeSharePercent,
    employees,
    adjustments: settings.adjustments,
    kasbonByEmployee: outstandingByEmployee,
  }), [allOrders, employees, outstandingByEmployee, settings]);

  async function handleExport() {
    setExporting(true);
    setMessage(null);
    try {
      await exportAllDataSpreadsheet({
        orders: allOrders,
        inventory,
        employees,
        payroll,
        closings,
        defaultSharePercent: settings.defaultSharePercent,
        employeeSharePercent: settings.employeeSharePercent,
      });
      setMessage("✓ Spreadsheet berhasil dibuat. File Excel berisi snapshot data EVO COMEPLAYERS saat ini.");
    } catch (error) {
      console.error(error);
      setMessage("Gagal membuat spreadsheet. Silakan coba lagi.");
    } finally {
      setExporting(false);
    }
  }

  const activePayrollEmployees = payroll.filter((row) => row.orderRefs.length > 0).length;

  return (
    <>
      <PageHeader
        eyebrow="Cadangan data"
        title="Export Spreadsheet"
        description="Simpan data operasional saat ini menjadi satu file Excel. Export hanya membaca data dan tidak mengubah sistem."
      />

      <section className="cp-card p-5 sm:p-6">
        <div className="text-sm font-semibold text-yellow-300">Satu tombol → satu file Excel</div>
        <h2 className="mt-2 text-2xl font-semibold">Export Semua Data</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          File Excel akan berisi sheet Mutasi, Stok, Penjualan, Payroll Gaji, Tutup Buku, dan Karyawan. Fitur ini tetap boleh digunakan ketika sistem dikunci karena tidak mengedit data.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl bg-zinc-950/70 p-4"><div className="text-xs text-zinc-500">Mutasi / Penjualan</div><div className="mt-1 text-2xl font-semibold">{allOrders.length}</div></div>
          <div className="rounded-xl bg-zinc-950/70 p-4"><div className="text-xs text-zinc-500">Data Stok</div><div className="mt-1 text-2xl font-semibold">{inventory.length}</div></div>
          <div className="rounded-xl bg-zinc-950/70 p-4"><div className="text-xs text-zinc-500">Karyawan</div><div className="mt-1 text-2xl font-semibold">{employees.length}</div></div>
          <div className="rounded-xl bg-zinc-950/70 p-4"><div className="text-xs text-zinc-500">Payroll aktif</div><div className="mt-1 text-2xl font-semibold">{activePayrollEmployees}</div></div>
          <div className="rounded-xl bg-zinc-950/70 p-4"><div className="text-xs text-zinc-500">Riwayat Tutup Buku</div><div className="mt-1 text-2xl font-semibold">{closings.length}</div></div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={handleExport} disabled={exporting} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
            {exporting ? "Membuat Spreadsheet..." : "⬇ Export Spreadsheet (.xlsx)"}
          </button>
          <span className="text-xs text-zinc-500">Nama file otomatis memakai waktu export.</span>
        </div>
        {message ? <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}
      </section>

      <section className="cp-card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Isi file Excel</h2>
        <div className="mt-4 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-3">
          {["RINGKASAN", "MUTASI", "STOK", "PENJUALAN", "PAYROLL GAJI", "TUTUP BUKU", "KARYAWAN"].map((name) => (
            <div key={name} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 font-semibold">{name}</div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-zinc-500">Catatan: sheet PAYROLL GAJI adalah payroll aktif yang belum masuk Closing. Data Closing lama tetap tercatat pada sheet TUTUP BUKU dan pada order yang sudah memiliki Closing ID.</p>
      </section>
    </>
  );
}

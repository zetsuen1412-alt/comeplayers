import Link from "next/link";
import { OrderEntryForm } from "@/features/payroll/components/order-entry-form";
import { PageHeader } from "@/features/payroll/components/page-header";

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        title="Tambah Pesanan"
        description={"Kode, tanggal dan jam pesanan dipilih manual dalam WIB. Tanggal lama dapat digunakan sesuai data spreadsheet. Permainan, Wilayah, dan Server dipilih dari daftar Produk / Permainan. Gold/Item wajib mengambil stok Gudang yang sesuai."}
      />
      <div className="mb-5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
        <p className="text-sm text-slate-300">Data lama dari spreadsheet EVO GAMING 2026 dan arsip impor MUTASI FH.</p>
        <Link href="/admin/payroll/imports" className="mt-2 inline-flex rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-black">Lihat / Impor MUTASI FH</Link>
      </div>
      <OrderEntryForm />
    </>
  );
}

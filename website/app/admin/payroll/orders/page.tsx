import Link from 'next/link';
import { OrderEntryForm } from '@/features/payroll/components/order-entry-form';
import { PageHeader } from '@/features/payroll/components/page-header';

export default function OrdersPage() {
  return <>
    <PageHeader title="Tambah Pesanan" description="Kode order diisi manual; tanggal mengikuti server. Game, Region, dan Server dipilih dari daftar Produk / Game. Gold/Item wajib mengambil stok Gudang yang sesuai." />
    <div className="mb-5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
      <p className="text-sm text-slate-300">Memindahkan data lama dari spreadsheet EVO GAMING 2026?</p>
      <Link href="/admin/payroll/imports" className="mt-2 inline-flex rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-black">Impor MUTASI FH · Versi 2</Link>
    </div>
    <OrderEntryForm />
  </>;
}

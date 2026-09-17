import { OrderEntryForm } from "@/features/payroll/components/order-entry-form";
import { PageHeader } from "@/features/payroll/components/page-header";

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        title="Tambah Pesanan"
        description="Kode order diisi manual; tanggal mengikuti server. Game, Region, dan Server dipilih dari daftar Produk / Game. Gold/Item wajib mengambil stok Gudang yang sesuai."
      />
      <OrderEntryForm />
    </>
  );
}

import { OrderEntryForm } from "@/components/order-entry-form";
import { PageHeader } from "@/components/page-header";

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        title="Tambah Pesanan"
        description="Tanggal & kode otomatis. Game, Region, dan Server dipilih dari daftar Produk / Game. Gold/Item wajib mengambil stok Gudang yang sesuai."
      />
      <OrderEntryForm />
    </>
  );
}

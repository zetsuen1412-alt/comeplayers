import { OrderEntryForm } from "@/features/payroll/components/order-entry-form";
import { PageHeader } from "@/features/payroll/components/page-header";

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        title="Tambah Pesanan"
        description={"Kode, tanggal dan jam pesanan dipilih manual dalam WIB. Tanggal lama dapat digunakan sesuai data spreadsheet. Permainan, Wilayah, dan Server dipilih dari daftar Produk / Permainan. Gold/Item wajib mengambil stok Gudang yang sesuai."}
      />
      <OrderEntryForm />
    </>
  );
}

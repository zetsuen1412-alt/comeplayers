import { OrderEntryForm } from "@/features/payroll/components/order-entry-form";
import { PageHeader } from "@/features/payroll/components/page-header";

export default function NewOrderPage() {
  return <><PageHeader title="Tambah Pesanan" description="Tanggal & kode otomatis. Game, Region, dan Server dipilih dari daftar Produk / Game. Gold/Item wajib mengambil stok Gudang yang sesuai." /><OrderEntryForm /></>;
}

import { OrderEntryForm } from "@/features/payroll/components/order-entry-form";
import { PageHeader } from "@/features/payroll/components/page-header";

export default function NewOrderPage() {
  return <><PageHeader title="Tambah Pesanan" description={"Kode pesanan diisi manual; tanggal mengikuti server. Permainan, Wilayah, dan Server dipilih dari daftar Produk / Permainan. Gold/Item wajib mengambil stok Gudang yang sesuai."} /><OrderEntryForm /></>;
}

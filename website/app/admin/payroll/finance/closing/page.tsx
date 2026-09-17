import { PageHeader } from "@/features/payroll/components/page-header";
import { FortnightClosing } from "@/features/payroll/components/fortnight-closing";

export default function ClosingPage() {
  return <><PageHeader title={"Tutup Buku"} description={"Pilih tanggal & jam, kunci sistem, lalu Tutup Buku. Saat terkunci semua pengguna hanya bisa membaca data; pesanan bermasalah tetap ditunda."} /><FortnightClosing /></>;
}

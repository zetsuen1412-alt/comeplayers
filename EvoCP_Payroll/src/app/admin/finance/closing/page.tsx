import { PageHeader } from "@/components/page-header";
import { FortnightClosing } from "@/components/fortnight-closing";

export default function ClosingPage() {
  return <><PageHeader title="Tutup Buku / Closing" description="Pilih tanggal & jam, kunci sistem, lalu Closing. Saat terkunci semua user hanya bisa membaca data; order bermasalah tetap ditunda." /><FortnightClosing /></>;
}

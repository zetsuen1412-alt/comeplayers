import { KasbonManager } from "@/components/kasbon-manager";
import { PageHeader } from "@/components/page-header";

export default function AdvancesPage() {
  return <><PageHeader title="Kasbon" description="Catat kasbon karyawan. Saldo yang belum lunas otomatis menjadi potongan di menu Gaji." /><KasbonManager /></>;
}

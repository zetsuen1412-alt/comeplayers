import { InventoryManager } from "@/features/payroll/components/inventory-manager";
import { PageHeader } from "@/features/payroll/components/page-header";

export default function InventoryPage() {
  return <>
    <PageHeader title="Stok / Gudang" description={"Kelola stok per karyawan, FH, Permainan, Wilayah, dan Server. Nama karyawan menjadi identitas gudang."} />
    <InventoryManager />
  </>;
}

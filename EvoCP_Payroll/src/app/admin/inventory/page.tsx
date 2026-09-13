import { InventoryManager } from "@/components/inventory-manager";
import { PageHeader } from "@/components/page-header";

export default function InventoryPage() {
  return <>
    <PageHeader title="Stok / Gudang" description="Kelola stok per karyawan, FH, Game, Region, dan Server. Nama karyawan menjadi identitas gudang." />
    <InventoryManager />
  </>;
}

import { PageHeader } from "@/features/payroll/components/page-header";
import { ProductCatalogManager } from "@/features/payroll/components/product-catalog-manager";

export default function ProductsPage() {
  return (
    <>
      <PageHeader title={"Produk / Permainan"} description={"Atur permainan, Wilayah, dan Server yang boleh dipilih saat membuat Pesanan."} />
      <ProductCatalogManager />
    </>
  );
}

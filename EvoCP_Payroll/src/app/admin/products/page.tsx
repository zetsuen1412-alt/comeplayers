import { PageHeader } from "@/components/page-header";
import { ProductCatalogManager } from "@/components/product-catalog-manager";

export default function ProductsPage() {
  return (
    <>
      <PageHeader title="Produk / Game" description="Atur game, Region, dan Server yang boleh dipilih saat membuat Pesanan." />
      <ProductCatalogManager />
    </>
  );
}

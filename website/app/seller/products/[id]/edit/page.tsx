import { Suspense } from "react";
import ProductUploadClient from "../../new/ProductUploadClient";

export default function EditProductPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
          <p className="text-xl font-black text-cyan-300">
            Loading product editor...
          </p>
        </main>
      }
    >
      <ProductUploadClient />
    </Suspense>
  );
}

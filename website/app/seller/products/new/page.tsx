import { Suspense } from "react";
import ProductUploadClient from "./ProductUploadClient";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProductUploadClient />
    </Suspense>
  );
}
import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    product?: string | string[];
    variant?: string | string[];
  }>;
};

export default async function CheckoutRedirect({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const requestedProduct = Array.isArray(query.product)
    ? query.product[0]
    : query.product;
  const requestedVariant = Array.isArray(query.variant)
    ? query.variant[0]
    : query.variant;
  const productKey = requestedProduct || id;
  const destination = new URLSearchParams();

  if (requestedVariant && /^\d+$/.test(requestedVariant)) {
    destination.set("variant", requestedVariant);
  }

  const queryString = destination.toString();
  redirect(
    `/product/${encodeURIComponent(productKey)}${queryString ? `?${queryString}` : ""}#checkout`
  );
}

import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LegacyProductRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/product/${encodeURIComponent(id)}`);
}

import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LegacyOrderDetailRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/orders/${id}`);
}

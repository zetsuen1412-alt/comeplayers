import { redirect } from "next/navigation";

export default async function ServerInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  redirect(`/cpcommunity?invite=${encodeURIComponent(String(code || ""))}`);
}

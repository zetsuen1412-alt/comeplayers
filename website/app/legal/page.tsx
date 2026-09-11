import type { Metadata } from "next";
import LegalCenterClient from "./LegalCenterClient";
import { legalPages } from "@/lib/legalContent";

export const metadata: Metadata = {
  title: "Legal Center",
  description:
    "ComePlayers agreements, marketplace rules, privacy standards, seller policies, payment guidance, refunds, and PlayerGuard protection.",
  alternates: { canonical: "/legal" },
};

export default function LegalCenterPage() {
  const items = legalPages.map((page) => ({
    slug: page.slug,
    title: page.title,
    eyebrow: page.eyebrow,
    updatedAt: page.updatedAt,
    summary: page.summary,
    status: page.status || "Current policy",
  }));

  return (
    <main className="min-h-screen">
      <LegalCenterClient items={items} />
    </main>
  );
}

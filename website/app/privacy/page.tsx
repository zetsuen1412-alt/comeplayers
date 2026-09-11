import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalArticlePage from "@/components/legal/LegalArticlePage";
import { getLegalPage } from "@/lib/legalContent";

export const metadata: Metadata = {
  title: "Privacy Policy | ComePlayers",
  description:
    "How ComePlayers collects, uses, shares, protects, and retains personal data across accounts, marketplace transactions, payments, messages, livestreams, seller verification, support, and security.",
};

export default function PrivacyPage() {
  const page = getLegalPage("privacy-policy");

  if (!page) notFound();

  return <LegalArticlePage page={page} />;
}

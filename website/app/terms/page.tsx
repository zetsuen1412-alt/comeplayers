import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalArticlePage from "@/components/legal/LegalArticlePage";
import { getLegalPage } from "@/lib/legalContent";

export const metadata: Metadata = {
  title: "Terms Of Service | ComePlayers",
  description:
    "ComePlayers terms for accounts, marketplace transactions, seller conduct, fees, disputes, and enforcement.",
};

export default function TermsPage() {
  const page = getLegalPage("terms-of-service");

  if (!page) notFound();

  return <LegalArticlePage page={page} />;
}

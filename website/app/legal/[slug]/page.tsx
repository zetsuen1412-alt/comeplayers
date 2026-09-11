import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalArticlePage from "@/components/legal/LegalArticlePage";
import { getLegalPage, legalPages } from "@/lib/legalContent";

type LegalRouteProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return legalPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: LegalRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getLegalPage(slug);

  if (!page) {
    return {
      title: "Legal Policy | ComePlayers",
    };
  }

  return {
    title: `${page.title} | ComePlayers Legal`,
    description: page.summary,
  };
}

export default async function LegalPolicyPage({ params }: LegalRouteProps) {
  const { slug } = await params;
  const page = getLegalPage(slug);

  if (!page) notFound();

  return <LegalArticlePage page={page} />;
}

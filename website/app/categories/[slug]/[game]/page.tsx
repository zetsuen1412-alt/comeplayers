import { notFound, redirect } from "next/navigation";
import { canonicalMarketplaceCategory } from "@/lib/marketplaceTaxonomy";

type PageProps = { params: Promise<{ slug: string; game: string }> };

function removeCategorySuffix(gameParam: string, categorySlug: string) {
  const suffix = `-${categorySlug}`;
  if (gameParam.endsWith(suffix)) return gameParam.slice(0, -suffix.length);
  return gameParam;
}

export default async function CategoryGameShortcutPage({ params }: PageProps) {
  const { slug, game } = await params;
  const category = canonicalMarketplaceCategory(slug);
  if (!category) notFound();
  const gameSlug = removeCategorySuffix(game, slug);
  if (category === "coin") redirect(`/games/${encodeURIComponent(gameSlug)}?category=coin`);
  redirect(`/games/${encodeURIComponent(gameSlug)}/offers?category=${encodeURIComponent(category)}`);
}

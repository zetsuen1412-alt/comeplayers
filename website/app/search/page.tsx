import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import MarketplaceSearch from "@/components/marketplace/MarketplaceSearch";
import { getServerCurrencyFormatter } from "@/lib/serverCurrency";
import { formatDeliveryEta } from "@/lib/sellerServiceLevel";
import { supabase } from "@/lib/supabase";

type SearchGame = {
  id: number;
  name: string;
  href: string;
  offer_count: number | null;
  rating: number | null;
};

type SearchProduct = {
  id: number;
  title: string;
  href: string;
  price: number | string | null;
  category: string | null;
  game_name: string | null;
  relevance_score?: number;
  offer_region?: string | null;
  offer_platform?: string | null;
  delivery_eta_minutes?: number | null;
  stock?: number | null;
};

type SearchCategory = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  href: string;
};

type PageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
  }>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = params.q?.trim() || "";
  const category = params.category?.trim() || "";
  const title = query
    ? `Search ${query} | ComePlayers Marketplace`
    : "Search Marketplace | ComePlayers";
  const description = category
    ? `Search ${category} offers, games, and products on ComePlayers.`
    : "Search games, products, and categories across the ComePlayers marketplace.";
  const canonicalParams = new URLSearchParams();

  if (query) canonicalParams.set("q", query);
  if (category) canonicalParams.set("category", category);

  const canonical = `/search${
    canonicalParams.toString() ? `?${canonicalParams.toString()}` : ""
  }`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "ComePlayers",
      type: "website",
    },
  };
}

function getSearchBadge(product: SearchProduct) {
  const score = Number(product.relevance_score || 0);

  if (score >= 80) return "🔥 Best Match";
  if (score >= 45) return "⭐ Recommended";
  if (score >= 25) return "🎮 Related";
  return null;
}

export default async function MarketplaceSearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q?.trim() || "";
  const category = params.category?.trim() || "";

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ||
    requestHeaders.get("host") ||
    "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || "http";
  const origin = `${protocol}://${host}`;

  const [{ data: categories }, searchResponse, formatPrice] = await Promise.all([
    supabase.from("categories").select("id,name,slug,icon").order("id", {
      ascending: true,
    }),
    query.length >= 2 || category.length >= 2
      ? fetch(
          `${origin}/api/marketplace/search?q=${encodeURIComponent(
            query
          )}&category=${encodeURIComponent(category)}&limit=20`,
          { cache: "no-store" }
        ).catch(() => null)
      : Promise.resolve(null),
    getServerCurrencyFormatter(),
  ]);

  const searchJson = searchResponse
    ? await searchResponse.json().catch(() => null)
    : null;
  const games = (searchJson?.games || []) as SearchGame[];
  const products = (searchJson?.products || []) as SearchProduct[];
  const resultCategories = (searchJson?.categories || []) as SearchCategory[];
  const totalResults = games.length + products.length + resultCategories.length;

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,#155e75,transparent_35%),linear-gradient(180deg,#08111f,#050816)] px-4 py-12">
        <div className="mx-auto max-w-7xl">
          <p className="w-fit rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
            🔎 Unified Marketplace Search
          </p>

          <h1 className="mt-5 text-4xl font-black md:text-6xl">
            Search ComePlayers
          </h1>

          <p className="mt-4 max-w-2xl text-slate-300">
            Find games, products, and marketplace categories from one search page.
          </p>

          <div className="mt-8 max-w-3xl">
            <MarketplaceSearch
              categories={categories || []}
              initialQuery={query}
              initialCategory={category}
              placeholder="Search Valorant points, Mobile Legends account, boosting..."
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black">
              {query ? `Results for “${query}”` : "Marketplace Results"}
            </h2>

            <p className="mt-1 text-slate-400">{totalResults} results found</p>
          </div>

          <Link
            href="/games"
            className="rounded-xl border border-white/10 px-4 py-3 font-bold text-slate-200 hover:border-cyan-400"
          >
            Browse Games
          </Link>
        </div>

        {totalResults === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-slate-400">
            Type at least 2 characters to search games, products, and categories.
          </div>
        ) : (
          <div className="space-y-10">
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-2xl font-black text-cyan-300">Games</h3>
                <span className="text-sm text-slate-400">
                  {games.length} results
                </span>
              </div>

              {games.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {games.map((game) => (
                    <Link
                      key={game.id}
                      href={game.href}
                      className="rounded-2xl border border-white/10 bg-[#0b1220] p-5 transition hover:border-cyan-400"
                    >
                      <p className="text-xl font-black text-white">{game.name}</p>

                      <p className="mt-2 text-sm text-slate-400">
                        {game.offer_count || 0} offers
                        {game.rating
                          ? ` • ★ ${Number(game.rating).toFixed(1)}`
                          : ""}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-slate-400">
                  No games found.
                </p>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-2xl font-black text-emerald-300">
                  Products
                </h3>
                <span className="text-sm text-slate-400">
                  {products.length} results
                </span>
              </div>

              {products.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {products.map((product) => {
                    const badge = getSearchBadge(product);

                    return (
                      <Link
                        key={product.id}
                        href={product.href}
                        className="rounded-2xl border border-white/10 bg-[#0b1220] p-5 transition hover:border-cyan-400"
                      >
                        <div className="flex flex-wrap gap-2">
                          {badge ? (
                            <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300">
                              {badge}
                            </span>
                          ) : null}

                          {product.category ? (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-300">
                              {product.category}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-4 line-clamp-2 text-lg font-black text-white">
                          {product.title}
                        </p>

                        <p className="mt-2 text-sm text-slate-400">
                          {product.game_name || "Game"}
                          {product.category ? ` • ${product.category}` : ""}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                          <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                            {product.offer_region || "Global"}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                            {product.offer_platform || "Any platform"}
                          </span>
                          {product.delivery_eta_minutes ? (
                            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                              {formatDeliveryEta(product.delivery_eta_minutes)} delivery
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-4 text-xl font-black text-cyan-300">
                          {formatPrice(product.price)}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-slate-400">
                  No products found.
                </p>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-2xl font-black text-purple-300">
                  Categories
                </h3>

                <span className="text-sm text-slate-400">
                  {resultCategories.length} results
                </span>
              </div>

              {resultCategories.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {resultCategories.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 font-bold text-slate-200 transition hover:border-cyan-400"
                    >
                      {item.icon ? `${item.icon} ` : ""}
                      {item.name}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-slate-400">
                  No categories found.
                </p>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

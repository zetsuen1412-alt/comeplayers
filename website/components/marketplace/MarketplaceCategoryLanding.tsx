"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FaBoxOpen, FaCoins, FaSearch, FaUserAstronaut, FaUserNinja } from "react-icons/fa";
import type { IconType } from "react-icons";
import { useCurrency } from "@/components/CurrencyProvider";
import type { MarketplaceCategoryCode } from "@/lib/marketplaceTaxonomy";

export type MarketplaceCategoryGame = {
  id: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  offerCount: number;
  sellerCount: number;
  minimumPrice: number;
  featured: boolean;
  trending: boolean;
};

type Props = {
  category: MarketplaceCategoryCode;
  title: string;
  description: string;
  games: MarketplaceCategoryGame[];
};

const ICONS: Record<MarketplaceCategoryCode, IconType> = {
  coin: FaCoins,
  boosting: FaUserNinja,
  item: FaBoxOpen,
  account: FaUserAstronaut,
};

const ACCENTS: Record<MarketplaceCategoryCode, string> = {
  coin: "from-yellow-300/35 via-amber-300/12 to-transparent text-yellow-300",
  boosting: "from-yellow-300/35 via-amber-300/12 to-transparent text-yellow-300",
  item: "from-yellow-300/35 via-amber-300/12 to-transparent text-yellow-300",
  account: "from-yellow-300/35 via-amber-300/12 to-transparent text-yellow-300",
};

export default function MarketplaceCategoryLanding({ category, title, description, games }: Props) {
  const { formatPrice } = useCurrency();
  const [query, setQuery] = useState("");
  const Icon = ICONS[category];
  const filteredGames = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return games;
    return games.filter((game) => game.name.toLowerCase().includes(search));
  }, [games, query]);
  const popularGames = useMemo(
    () => [...filteredGames].sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (a.trending !== b.trending) return a.trending ? -1 : 1;
      if (b.offerCount !== a.offerCount) return b.offerCount - a.offerCount;
      return a.name.localeCompare(b.name);
    }).slice(0, 8),
    [filteredGames]
  );

  function gameHref(gameSlug: string) {
    if (category === "coin") return `/games/${encodeURIComponent(gameSlug)}?category=coin`;
    return `/games/${encodeURIComponent(gameSlug)}/offers?category=${category}`;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,196,0,0.055),transparent_30%),linear-gradient(180deg,#050606_0%,#080806_48%,#050505_100%)] text-white">
      <section className="border-b border-yellow-300/20 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.11),transparent_38%),linear-gradient(180deg,#0b0b08,#050505)]">
        <div className="mx-auto max-w-[1440px] px-4 py-10 md:px-8 md:py-14">
          <div className="flex items-center gap-4">
            <span className={`flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-300/35 bg-gradient-to-br ${ACCENTS[category]} text-3xl shadow-[0_0_26px_rgba(250,204,21,0.1)]`}><Icon aria-hidden="true" /></span>
            <div>
              <h1 className="text-3xl font-black md:text-4xl">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-neutral-400 md:text-base">{description}</p>
            </div>
          </div>
          <div className="mt-9 grid overflow-hidden rounded-[22px] border border-yellow-300/25 bg-black/45 shadow-[0_18px_60px_rgba(0,0,0,.34)] md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <FaSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-yellow-300/70" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search games..." className="w-full bg-transparent py-5 pl-14 pr-5 text-base text-white outline-none placeholder:text-neutral-500 focus:bg-yellow-300/[0.025]" />
            </label>
            <div className="flex items-center border-t border-yellow-300/20 bg-yellow-300/[0.035] px-6 font-bold text-yellow-100 md:border-l md:border-t-0">All games</div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1440px] px-4 py-12 md:px-8">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300">ComePlayers Marketplace</p><h2 className="mt-2 text-2xl font-black md:text-3xl">Popular Products</h2></div>
          <p className="text-sm text-neutral-400">{new Intl.NumberFormat("en-US").format(filteredGames.length)} games</p>
        </div>
        {popularGames.length ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {popularGames.map((game) => (
              <Link key={game.id} href={gameHref(game.slug)} className="group relative min-h-40 overflow-hidden rounded-2xl border border-yellow-300/20 bg-[#0a0a08] transition duration-300 hover:-translate-y-1 hover:border-yellow-300/65 hover:shadow-[0_20px_48px_rgba(0,0,0,.42),0_0_24px_rgba(250,204,21,0.08)]">
                {game.imageUrl ? <div className="absolute inset-0 bg-cover bg-center opacity-35 transition group-hover:scale-105 group-hover:opacity-50" style={{ backgroundImage: `url(${game.imageUrl})` }} /> : null}
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-300/22 via-[#090907]/76 to-[#050505]" />
                <div className="relative flex min-h-40 flex-col items-center justify-center p-5 text-center">
                  <h3 className="line-clamp-2 text-lg font-black text-white">{game.name}</h3>
                  <span className="mt-3 rounded-lg border border-yellow-300/20 bg-black/45 px-3 py-1.5 text-sm font-bold text-neutral-200">{new Intl.NumberFormat("en-US").format(game.offerCount)} products</span>
                  {game.minimumPrice > 0 ? <span className="mt-2 text-xs font-bold text-yellow-300">from {formatPrice(game.minimumPrice)}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-yellow-300/25 bg-yellow-300/[0.025] p-12 text-center"><h3 className="text-xl font-black">No games found</h3><p className="mt-2 text-neutral-400">Try another search or add the first offer in this category.</p>{query ? <button type="button" onClick={() => setQuery("")} className="mt-5 rounded-xl border border-yellow-300/45 bg-yellow-300/[0.06] px-5 py-3 font-black text-yellow-200 transition hover:bg-yellow-300 hover:text-black">Clear search</button> : null}</div>
        )}
      </section>
    </main>
  );
}

"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GameCard from "@/components/games/GameCard";
import { useCurrency } from "@/components/CurrencyProvider";
import {
  getCuratedCategoryMeta,
  isCuratedMarketplaceCategory,
  normalizeCategorySlug,
} from "@/lib/marketplaceCatalog";

type Game = {
  id: number;
  name: string;
  slug: string;
  first_letter: string;
  image_url: string | null;
  cover_image_url: string | null;
  background_image: string | null;
  offer_count: number;
  is_trending: boolean;
  is_featured: boolean;
  rating: number;
  metacritic: number | null;
  description?: string | null;
  badge?: string | null;
  catalog_type?: string | null;
  category_slug?: string | null;
  category_name?: string | null;
  cta_label?: string | null;
};

type Category = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
};

function normalizeCategoryValue(value: string) {
  return normalizeCategorySlug(decodeURIComponent(value));
}

function gameHref(game: Game, activeCategory: Category | null) {
  const catalogCategory = game.catalog_type || game.category_slug;

  if (catalogCategory && isCuratedMarketplaceCategory(catalogCategory)) {
    const params = new URLSearchParams({
      q: game.name,
      category: catalogCategory,
    });

    return `/search?${params.toString()}`;
  }

  if (!activeCategory) return `/games/${game.slug}`;

  const params = new URLSearchParams({
    category: activeCategory.name,
  });

  return `/games/${game.slug}/offers?${params.toString()}`;
}

const LETTERS = [
  "All",
  "0-9",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

export default function BrowseGamesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t, translateCategory } = useCurrency();

  const initialQuery = searchParams.get("q") || "";
  const initialLetter = searchParams.get("letter") || "";
  const initialCategory = searchParams.get("category") || "";

  const [games, setGames] = useState<Game[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const query = initialQuery;
  const [letter, setLetter] = useState(initialLetter);
  const [category, setCategory] = useState(initialCategory);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apiCuratedCategory, setApiCuratedCategory] = useState(
    Boolean(getCuratedCategoryMeta(initialCategory))
  );

  const activeCategory = useMemo(() => {
    const normalizedCategory = normalizeCategoryValue(category);

    return (
      categories.find((item) => {
        return (
          normalizeCategoryValue(item.slug) === normalizedCategory ||
          normalizeCategoryValue(item.name) === normalizedCategory
        );
      }) || null
    );
  }, [categories, category]);

  function syncUrl(nextQuery: string, nextLetter: string, nextCategory: string) {
    const params = new URLSearchParams();

    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextLetter && nextLetter !== "All") params.set("letter", nextLetter);
    if (nextCategory) params.set("category", nextCategory);

    const nextUrl = params.toString() ? `/games?${params.toString()}` : "/games";
    router.replace(nextUrl, { scroll: false });
  }

  async function loadCategories() {
    try {
      const res = await fetch("/api/game-categories");
      const json = await res.json();

      if (!res.ok) {
        console.error("Load game categories error:", json.error || res.statusText);
        setCategories([]);
        return;
      }

      setCategories(json.categories || []);
    } catch (error) {
      console.error("Load game categories error:", error);
      setCategories([]);
    }
  }

  async function loadGames(
    nextPage = 1,
    nextQuery = query,
    nextLetter = letter,
    nextCategory = category
  ) {
    setLoading(true);

    const params = new URLSearchParams({
      page: String(nextPage),
      limit: "48",
    });

    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextLetter && nextLetter !== "All") params.set("letter", nextLetter);
    if (nextCategory) params.set("category", nextCategory);

    const res = await fetch(`/api/games?${params.toString()}`);
    const json = await res.json();

    setGames(json.games || []);
    setCount(json.count || 0);
    setApiCuratedCategory(Boolean(json.isCuratedCategory));
    setPage(nextPage);
    setLoading(false);
  }

  useEffect(() => {
    loadCategories();
    loadGames(1, initialQuery, initialLetter, initialCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLiveRefresh(async () => { await loadCategories(); await loadGames(page, query, letter, category); }, { topics: 'catalog' });

  useEffect(() => {
    if (!category || categories.length === 0) return;

    if (!activeCategory) {
      if (getCuratedCategoryMeta(category)) return;

      setCategory("");
      syncUrl(query, letter, "");
      loadGames(1, query, letter, "");
      return;
    }

    if (category !== activeCategory.slug) {
      setCategory(activeCategory.slug);
      syncUrl(query, letter, activeCategory.slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, activeCategory, category]);

  const totalPages = Math.max(Math.ceil(count / 48), 1);
  const curatedMeta = getCuratedCategoryMeta(activeCategory?.slug || category);
  const isCuratedView = Boolean(
    curatedMeta &&
      (apiCuratedCategory ||
        isCuratedMarketplaceCategory(activeCategory?.slug || category))
  );
  const isGiftCardView = isCuratedView && curatedMeta?.slug === "gift-cards";
  const isSoftwareView = isCuratedView && curatedMeta?.slug === "software";
  const sectionTitle = isGiftCardView
    ? t("browse.giftCardsHeading")
    : isSoftwareView
      ? t("browse.softwareHeading")
      : activeCategory
        ? t("browse.categoryGames", {
            category: translateCategory(activeCategory.name),
          })
        : t("browse.allGames");
  const countLabel = isGiftCardView
    ? t("browse.giftCardsCount")
    : isSoftwareView
      ? t("browse.softwareCount")
      : t("browse.gamesFound");
  const loadingLabel = isGiftCardView
    ? t("browse.giftCardsLoading")
    : isSoftwareView
      ? t("browse.softwareLoading")
      : t("browse.loadingGames");
  const emptyLabel = isGiftCardView
    ? t("browse.giftCardsEmpty")
    : isSoftwareView
      ? t("browse.softwareEmpty")
      : t("browse.noGames");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,196,0,0.055),transparent_28%),linear-gradient(180deg,#050606_0%,#080806_48%,#050505_100%)] text-white">
      <section className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 border-l-4 border-yellow-400 pl-4">
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            {sectionTitle}
          </h1>
          <p className="mt-1 text-neutral-400">
            {count.toLocaleString(locale)} {countLabel}
          </p>
        </div>

        <div className="mb-8 rounded-2xl border border-yellow-400/25 bg-[linear-gradient(145deg,rgba(255,196,0,0.055),rgba(255,255,255,0.018)_40%,rgba(0,0,0,0.28))] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.28)]">
          <p className="mb-4 text-xs font-black uppercase tracking-[0.24em] text-yellow-300">
            {t("browse.marketplaceCategories")}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setCategory("");
                syncUrl(query, letter, "");
                loadGames(1, query, letter, "");
              }}
              className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                !category
                  ? "border-yellow-300 bg-gradient-to-r from-yellow-300 to-amber-400 text-black shadow-[0_0_24px_rgba(250,204,21,0.18)]"
                  : "border-yellow-300/20 bg-black/45 text-neutral-200 hover:border-yellow-300/65 hover:bg-yellow-300/[0.055] hover:text-yellow-100"
              }`}
            >
              {t("common.all")}
            </button>

            {categories.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCategory(item.slug);
                  syncUrl(query, letter, item.slug);
                  loadGames(1, query, letter, item.slug);
                }}
                className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                  activeCategory?.id === item.id
                    ? "border-yellow-300 bg-gradient-to-r from-yellow-300 to-amber-400 text-black shadow-[0_0_24px_rgba(250,204,21,0.18)]"
                    : "border-yellow-300/20 bg-black/45 text-neutral-200 hover:border-yellow-300/65 hover:bg-yellow-300/[0.055] hover:text-yellow-100"
                }`}
              >
                {item.icon ? `${item.icon} ` : ""}
                {translateCategory(item.name)}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {LETTERS.map((item) => {
            const active = item === "All" ? !letter : letter === item;

            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  const nextLetter = item === "All" ? "" : item;
                  setLetter(nextLetter);
                  syncUrl(query, nextLetter, category);
                  loadGames(1, query, nextLetter, category);
                }}
                className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
                  active
                    ? "border-yellow-300 bg-gradient-to-r from-yellow-300 to-amber-400 text-black shadow-[0_0_24px_rgba(250,204,21,0.18)]"
                    : "border-yellow-300/20 bg-black/45 text-neutral-300 hover:border-yellow-300/65 hover:bg-yellow-300/[0.055] hover:text-yellow-100"
                }`}
              >
                {item === "All" ? t("common.all") : item}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-yellow-300/20 bg-black/45 p-10 text-center text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            {loadingLabel}
          </div>
        ) : games.length === 0 ? (
          <div className="rounded-2xl border border-yellow-300/20 bg-black/45 p-10 text-center text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            {emptyLabel}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {games.map((game) => (
              <GameCard key={game.id} game={game} href={gameHref(game, activeCategory)} />
            ))}
          </div>
        )}

        <div className="mt-10 grid gap-3 sm:flex sm:items-center sm:justify-center">
          <button
            disabled={page <= 1}
            onClick={() => loadGames(page - 1, query, letter, category)}
            className="rounded-xl border border-yellow-300/25 bg-black/45 px-5 py-3 font-bold text-white transition hover:border-yellow-300/70 hover:bg-yellow-300/[0.07] hover:text-yellow-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("common.previous")}
          </button>

          <span className="text-center text-sm font-semibold text-neutral-400">
            {t("common.pageOf", { page, total: totalPages })}
          </span>

          <button
            disabled={page >= totalPages}
            onClick={() => loadGames(page + 1, query, letter, category)}
            className="rounded-xl border border-yellow-300/25 bg-black/45 px-5 py-3 font-bold text-white transition hover:border-yellow-300/70 hover:bg-yellow-300/[0.07] hover:text-yellow-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("common.next")}
          </button>
        </div>
      </section>
    </main>
  );
}

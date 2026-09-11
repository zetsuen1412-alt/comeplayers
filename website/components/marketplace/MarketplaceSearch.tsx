"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrency } from "@/components/CurrencyProvider";

type SearchCategory = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  href?: string;
};

type SearchGame = {
  id: number;
  name: string;
  slug: string;
  offer_count: number | null;
  is_trending: boolean | null;
  rating: number | null;
  href: string;
};

type SearchProduct = {
  id: number;
  title: string;
  slug: string | null;
  price: number | string | null;
  image_url: string | null;
  category: string | null;
  game_name: string | null;
  seller_name: string | null;
  href: string;
};

type SearchResponse = {
  games: SearchGame[];
  products: SearchProduct[];
  categories: SearchCategory[];
};

type MarketplaceSearchProps = {
  categories?: SearchCategory[];
  initialQuery?: string;
  initialCategory?: string;
  placeholder?: string;
  compact?: boolean;
  tone?: "dark" | "light";
};

export default function MarketplaceSearch({
  categories = [],
  initialQuery = "",
  initialCategory = "",
  placeholder,
  compact = false,
  tone = "dark",
}: MarketplaceSearchProps) {
  const { formatPrice, t, translateCategory } = useCurrency();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const resultsId = useId();
  const effectivePlaceholder = placeholder || t("search.placeholder");

  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [results, setResults] = useState<SearchResponse>({
    games: [],
    products: [],
    categories: [],
  });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const hasResults =
    results.games.length > 0 ||
    results.products.length > 0 ||
    results.categories.length > 0;

  const quickLinks = [
    ...results.games.map((game) => game.href),
    ...results.products.map((product) => product.href),
    ...results.categories.map(
      (category) => category.href || `/games?category=${category.slug}`
    ),
  ];

  function searchHref() {
    const params = new URLSearchParams();

    if (query.trim()) params.set("q", query.trim());
    if (selectedCategory) params.set("category", selectedCategory);

    const qs = params.toString();

    return qs ? `/search?${qs}` : "/search";
  }

  function submitSearch() {
    setOpen(false);
    setActiveIndex(-1);
    router.push(searchHref());
  }

  useEffect(() => {
    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2 && selectedCategory.length < 2) {
        setResults({ games: [], products: [], categories: [] });
        setActiveIndex(-1);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const params = new URLSearchParams({
          q: query.trim(),
          limit: "6",
        });

        if (selectedCategory) params.set("category", selectedCategory);

        const response = await fetch(
          `/api/marketplace/search?${params.toString()}`,
          {
            signal: controller.signal,
          }
        );

        const json = await response.json();

        if (!response.ok) {
          console.error(
            "Marketplace search error:",
            json.error || response.statusText
          );
          setResults({ games: [], products: [], categories: [] });
          setActiveIndex(-1);
          return;
        }

        setResults({
          games: json.games || [],
          products: json.products || [],
          categories: json.categories || [],
        });
        setActiveIndex(-1);
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;

        console.error("Marketplace search error:", error);
        setResults({ games: [], products: [], categories: [] });
        setActiveIndex(-1);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedCategory]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function resultIndex(
    section: "games" | "products" | "categories",
    index: number
  ) {
    if (section === "games") return index;
    if (section === "products") return results.games.length + index;
    return results.games.length + results.products.length + index;
  }

  function activeResultClass(index: number) {
    return activeIndex === index
      ? "bg-white/10 ring-1 ring-amber-400/50"
      : "hover:bg-white/10";
  }

  const isLightTone = tone === "light";

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div
        className={
          compact
            ? isLightTone
              ? "flex w-full min-w-0 items-center overflow-hidden rounded-full border border-slate-300 bg-white shadow-sm focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-100"
              : "flex w-full min-w-0 items-center overflow-hidden rounded-lg border border-slate-700/90 bg-[#0b0b0c] shadow-xl shadow-black/25 focus-within:border-amber-400"
            : isLightTone
              ? "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-100 sm:flex-row sm:items-center sm:rounded-lg"
              : "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-black/50 shadow-xl shadow-black/30 focus-within:border-cyan-400 sm:flex-row sm:items-center"
        }
      >
        {categories.length > 0 ? (
          <select
            value={selectedCategory}
            onChange={(event) => {
              setSelectedCategory(event.target.value);
              setOpen(false);
              setActiveIndex(-1);
            }}
            className={
              compact
                ? isLightTone
                  ? "w-24 shrink-0 border-r border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-900 outline-none sm:w-40 sm:px-4 sm:text-sm"
                  : "w-24 shrink-0 border-r border-slate-700 bg-[#070707] px-2 py-2 text-xs font-bold text-slate-100 outline-none sm:w-40 sm:px-4 sm:text-sm"
                : isLightTone
                  ? "w-full border-b border-slate-200 bg-slate-50 px-4 py-4 text-base font-bold text-slate-900 outline-none sm:w-48 sm:rounded-l-lg sm:border-b-0 sm:border-r sm:text-sm"
                  : "w-full border-b border-slate-700 bg-[#020617] px-4 py-4 text-base font-bold text-white outline-none sm:w-48 sm:rounded-l-2xl sm:border-b-0 sm:border-r sm:text-sm"
            }
          >
            <option value="">{t("search.allCategories")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.icon ? `${category.icon} ` : ""}
                {translateCategory(category.name)}
              </option>
            ))}
          </select>
        ) : null}

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && quickLinks.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => (current + 1) % quickLinks.length);
              return;
            }

            if (event.key === "ArrowUp" && quickLinks.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) =>
                current <= 0 ? quickLinks.length - 1 : current - 1
              );
              return;
            }

            if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
              return;
            }

            if (event.key === "Enter") {
              if (open && activeIndex >= 0 && quickLinks[activeIndex]) {
                event.preventDefault();
                setOpen(false);
                router.push(quickLinks[activeIndex]);
                return;
              }

              submitSearch();
            }
          }}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={resultsId}
          aria-expanded={open}
          aria-label={t("search.ariaLabel")}
          placeholder={effectivePlaceholder}
          className={
            compact
              ? isLightTone
                ? "min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 sm:px-4"
                : "min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 sm:px-4"
              : isLightTone
                ? "w-full min-w-0 bg-transparent px-5 py-4 text-base text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
                : "w-full min-w-0 bg-transparent px-5 py-4 text-base text-white outline-none placeholder:text-slate-500 sm:text-sm"
          }
        />

        <button
          type="button"
          onClick={submitSearch}
          className={
            compact
              ? "m-1 shrink-0 rounded-md border border-amber-300 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-3 py-2 text-sm font-black text-black shadow-[0_0_16px_rgba(250,204,21,0.18)] transition hover:brightness-110 sm:px-4"
              : "m-2 shrink-0 rounded-xl bg-cyan-400 px-6 py-3 font-black text-black transition hover:bg-cyan-300 sm:ml-0"
          }
        >
          {t("common.search")}
        </button>
      </div>

      {open && (query.trim().length >= 2 || selectedCategory) ? (
        <div
          id={resultsId}
          className="absolute left-0 right-0 top-full z-[9999] mt-3 overflow-hidden rounded-xl border border-amber-400/20 bg-[#0b0b0c] shadow-2xl shadow-black"
        >
          {loading ? (
            <div className="p-5 text-sm text-slate-400">
              {t("search.loading")}
            </div>
          ) : hasResults ? (
            <div className="max-h-[70vh] overflow-y-auto">
              {results.games.length > 0 ? (
                <div className="border-b border-white/10 p-3">
                  <p className="px-2 pb-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                    {t("search.games")}
                  </p>

                  {results.games.map((game, index) => (
                    <Link
                      key={`game-${game.id}`}
                      href={game.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition ${activeResultClass(
                        resultIndex("games", index)
                      )}`}
                    >
                      <div>
                        <p className="font-bold text-white">{game.name}</p>

                        <p className="text-xs text-slate-400">
                          {game.offer_count || 0} {t("search.offers")}
                          {game.rating
                            ? ` • ★ ${Number(game.rating).toFixed(1)}`
                            : ""}
                        </p>
                      </div>

                      {game.is_trending ? (
                        <span className="rounded-full bg-yellow-400 px-2 py-1 text-xs font-black text-black">
                          {t("search.hot")}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ) : null}

              {results.products.length > 0 ? (
                <div className="border-b border-white/10 p-3">
                  <p className="px-2 pb-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                    {t("search.products")}
                  </p>

                  {results.products.map((product, index) => (
                    <Link
                      key={`product-${product.id}`}
                      href={product.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition ${activeResultClass(
                        resultIndex("products", index)
                      )}`}
                    >
                      <div className="min-w-0">
                        <p className="line-clamp-1 font-bold text-white">
                          {product.title}
                        </p>

                        <p className="line-clamp-1 text-xs text-slate-400">
                          {product.game_name || t("search.game")}
                          {product.category ? ` • ${product.category}` : ""}
                          {product.seller_name
                            ? ` • ${product.seller_name}`
                            : ""}
                        </p>
                      </div>

                      <span className="shrink-0 text-sm font-black text-cyan-300">
                        {formatPrice(product.price)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}

              {results.categories.length > 0 ? (
                <div className="p-3">
                  <p className="px-2 pb-2 text-xs font-black uppercase tracking-[0.2em] text-purple-300">
                    {t("search.categories")}
                  </p>

                  <div className="flex flex-wrap gap-2 px-2 pb-1">
                    {results.categories.map((category, index) => (
                      <Link
                        key={`category-${category.id}`}
                        href={
                          category.href || `/games?category=${category.slug}`
                        }
                        onClick={() => setOpen(false)}
                        className={`rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-400 ${activeResultClass(
                          resultIndex("categories", index)
                        )}`}
                      >
                        {category.icon ? `${category.icon} ` : ""}
                        {translateCategory(category.name)}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="border-t border-white/10 p-3">
                <Link
                  href={searchHref()}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl bg-cyan-400 px-4 py-3 text-center font-black text-black transition hover:bg-cyan-300"
                >
                  {t("search.viewAllResults")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm text-slate-400">
              {t("search.noResults")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

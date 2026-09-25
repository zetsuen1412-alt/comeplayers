"use client";
import { useLiveQuery } from '@/lib/live/use-live-query';

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FaCheckCircle,
  FaClock,
  FaGlobeAsia,
  FaSearch,
  FaShieldAlt,
  FaSignal,
  FaStar,
  FaStore,
  FaTags,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import GameMarketplaceCategoryTabs from "@/components/marketplace/GameMarketplaceCategoryTabs";
import MarketplaceBreadcrumbs from "@/components/marketplace/MarketplaceBreadcrumbs";
import type { TranslationKey } from "@/lib/localization";
import type { MarketplaceCategoryCode } from "@/lib/marketplaceTaxonomy";
import { serviceLevelLabel } from "@/lib/sellerServiceLevel";

type Game = {
  id: number;
  name: string;
  slug: string;
  background_image?: string | null;
  cover_image_url?: string | null;
  image_url?: string | null;
  offer_count?: number | null;
  rating?: number | null;
};

type FacetItem = { value: string; label: string; count: number };

type Product = {
  id: number;
  title: string;
  slug?: string | null;
  image_url?: string | null;
  category?: string | null;
  seller_display_name: string;
  seller_avatar_url: string | null;
  seller_rating: number;
  seller_review_count: number;
  seller_completed_orders: number;
  seller_on_time_rate: number;
  seller_service_level: string;
  seller_presence: "online" | "away" | "offline";
  seller_verified: boolean;
  effective_price: number;
  effective_max_price: number;
  effective_stock: number;
  delivery_eta: number;
  regions: string[];
  platforms: string[];
  servers: string[];
  factions: string[];
  ranking_score: number;
  ranking_label: string;
  ranking_reasons: string[];
  href: string;
};

type OfferResponse = {
  products: Product[];
  facets: {
    categories: FacetItem[];
    regions: FacetItem[];
    servers: FacetItem[];
    factions: FacetItem[];
    platforms: FacetItem[];
    serviceLevels: FacetItem[];
    price: { min: number; max: number; median: number };
  };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  error?: string;
};

type Filters = {
  q: string;
  category: MarketplaceCategoryCode;
  server: string;
  region: string;
  faction: string;
  platform: string;
  maxPrice: string;
  onlineOnly: boolean;
  sort: string;
  page: number;
};

type Props = {
  game: Game;
  activeCategory: MarketplaceCategoryCode;
  categoryCounts: Record<MarketplaceCategoryCode, number>;
};

const EMPTY_RESPONSE: OfferResponse = {
  products: [],
  facets: {
    categories: [],
    regions: [],
    servers: [],
    factions: [],
    platforms: [],
    serviceLevels: [],
    price: { min: 0, max: 0, median: 0 },
  },
  pagination: { page: 1, pageSize: 24, total: 0, totalPages: 0 },
};

type Translate = (
  key: TranslationKey,
  values?: Record<string, string | number>,
) => string;

const CATEGORY_KEYS: Record<MarketplaceCategoryCode, TranslationKey> = {
  coin: "offers.category.coin",
  boosting: "offers.category.boosting",
  item: "offers.category.item",
  account: "offers.category.account",
};

function number(value: number | null | undefined, locale: string) {
  return new Intl.NumberFormat(locale).format(Number(value || 0));
}

function titleFor(
  category: MarketplaceCategoryCode,
  gameName: string,
  t: Translate,
) {
  switch (category) {
    case "boosting":
      return t("offers.title.boosting", { game: gameName });
    case "item":
      return t("offers.title.item", { game: gameName });
    case "account":
      return t("offers.title.account", { game: gameName });
    default:
      return t("offers.title.coin", { game: gameName });
  }
}

function deliveryEta(minutesValue: unknown, t: Translate) {
  const minutes = Math.max(0, Number(minutesValue || 0));
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return t("offers.deliveryNotConfigured");
  }
  if (minutes < 60) {
    return t("offers.deliveryMinutes", { count: Math.round(minutes) });
  }

  const hours = minutes / 60;
  if (hours < 24) {
    const value = Number.isInteger(hours) ? hours : hours.toFixed(1);
    return t(hours === 1 ? "offers.deliveryHour" : "offers.deliveryHours", {
      count: value,
    });
  }

  const days = hours / 24;
  const value = Number.isInteger(days) ? days : days.toFixed(1);
  return t(days === 1 ? "offers.deliveryDay" : "offers.deliveryDays", {
    count: value,
  });
}

function initialFilters(
  searchParams: ReturnType<typeof useSearchParams>,
  activeCategory: MarketplaceCategoryCode
): Filters {
  return {
    q: searchParams.get("q") || "",
    category: activeCategory,
    server: searchParams.get("server") || "",
    region: searchParams.get("region") || "",
    faction: searchParams.get("faction") || "",
    platform: searchParams.get("platform") || "",
    maxPrice: searchParams.get("maxPrice") || "",
    onlineOnly: searchParams.get("onlineOnly") === "true",
    sort: searchParams.get("sort") || "recommended",
    page: Math.max(1, Number(searchParams.get("page") || 1)),
  };
}

function sellerCreateUrl(gameSlug: string, category: MarketplaceCategoryCode) {
  return `/seller/products/new?game=${encodeURIComponent(gameSlug)}&category=${category}`;
}

function SellerAvatar({ product }: { product: Product }) {
  return (
    <span
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-800 bg-cover bg-center text-lg font-black"
      style={
        product.seller_avatar_url
          ? { backgroundImage: `url(${product.seller_avatar_url})` }
          : undefined
      }
    >
      {!product.seller_avatar_url
        ? product.seller_display_name.charAt(0).toUpperCase()
        : null}
      <span
        className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#0b0d11] ${
          product.seller_presence === "online"
            ? "bg-emerald-400"
            : product.seller_presence === "away"
              ? "bg-yellow-300"
              : "bg-slate-500"
        }`}
      />
    </span>
  );
}

function SellerRow({ product }: { product: Product }) {
  const { formatPrice, locale, t } = useCurrency();
  const ratingPercent = product.seller_rating
    ? Math.round((product.seller_rating / 5) * 10000) / 100
    : 0;
  return (
    <Link
      href={product.href}
      className="group grid gap-4 border-b border-white/10 bg-[#0b0d11] px-5 py-4 transition last:border-b-0 hover:bg-[#12151b] lg:grid-cols-[220px_210px_minmax(290px,1fr)_150px] lg:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <SellerAvatar product={product} />
        <div className="min-w-0">
          <p className="truncate font-black text-white group-hover:text-yellow-200">
            {product.seller_display_name}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {t("offers.sellerLevel", {
              level: serviceLevelLabel(product.seller_service_level),
            })}
          </p>
        </div>
      </div>

      <div>
        <p className="inline-flex items-center gap-2 font-black text-emerald-300">
          <FaStar /> {ratingPercent > 0 ? `${ratingPercent}%` : t("offers.newSeller")}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {t("offers.sold", {
            count: number(product.seller_completed_orders, locale),
          })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-300">
        <span className="rounded-lg bg-white/[0.07] px-2.5 py-2">Min. 1</span>
        <span className="rounded-lg bg-white/[0.07] px-2.5 py-2">
          {t("offers.stock", { count: number(product.effective_stock, locale) })}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 py-2">
          <FaClock /> {deliveryEta(product.delivery_eta, t)}
        </span>
        {product.factions[0] ? (
          <span className="rounded-lg bg-white/[0.07] px-2.5 py-2">
            {product.factions[0]}
          </span>
        ) : null}
      </div>

      <div className="text-left lg:text-right">
        <p className="text-xl font-black text-yellow-300">
          {formatPrice(product.effective_price)}
        </p>
        <p className="mt-1 text-xs text-slate-500">{t("offers.perUnit")}</p>
      </div>
    </Link>
  );
}

function ProductCard({ product, category }: { product: Product; category: MarketplaceCategoryCode }) {
  const { formatPrice, locale, t } = useCurrency();
  const metadata = [
    product.regions[0],
    product.servers[0],
    product.factions[0],
    product.platforms[0],
  ].filter(Boolean);
  return (
    <Link
      href={product.href}
      className="group flex min-h-[255px] flex-col rounded-lg border border-white/15 bg-[#0b0d11] p-5 transition hover:-translate-y-1 hover:border-yellow-400/70 hover:shadow-[0_16px_38px_rgba(0,0,0,.32)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full border border-yellow-400/25 bg-yellow-400/[0.06] px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-yellow-200">
          {t(CATEGORY_KEYS[category])}
        </span>
        {product.seller_verified ? (
          <FaCheckCircle
            className="text-emerald-400"
            aria-label={t("offers.verifiedSeller")}
          />
        ) : null}
      </div>
      <h3 className="mt-4 line-clamp-3 text-base font-black leading-snug text-white group-hover:text-yellow-200">
        {product.title}
      </h3>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
        {metadata.slice(0, 3).map((item) => (
          <span key={item} className="rounded-md bg-white/[0.07] px-2 py-1.5">
            {item}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.07] px-2 py-1.5">
          <FaClock /> {deliveryEta(product.delivery_eta, t)}
        </span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-white/10 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <SellerAvatar product={product} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{product.seller_display_name}</p>
            <p className="text-xs text-slate-500">
              {t("offers.sold", {
                count: number(product.seller_completed_orders, locale),
              })}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-right text-lg font-black text-yellow-300">
          {formatPrice(product.effective_price)}
        </p>
      </div>
    </Link>
  );
}

export default function GameOffersClient({ game, activeCategory, categoryCounts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useCurrency();
  const [filters, setFilters] = useState(() => initialFilters(searchParams, activeCategory));
  const [response, setResponse] = useState<OfferResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isCoinSellerList = filters.category === "coin" && Boolean(filters.server);

  const requestParams = useMemo(() => {
    const params = new URLSearchParams({
      game: game.slug,
      category: filters.category,
      sort: filters.sort,
      page: String(filters.page),
      pageSize: isCoinSellerList ? "24" : "20",
      inStockOnly: "true",
    });
    if (filters.q) params.set("q", filters.q);
    if (filters.server) params.set("server", filters.server);
    if (filters.region) params.set("region", filters.region);
    if (filters.faction) params.set("faction", filters.faction);
    if (filters.platform) params.set("platform", filters.platform);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    if (filters.onlineOnly) params.set("onlineOnly", "true");
    return params;
  }, [filters, game.slug, isCoinSellerList]);

  useLiveQuery((background) => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (!background) setLoading(true);
      setError("");
      try {
        const result = await fetch(`/api/products/by-game?${requestParams.toString()}`, {
          signal: controller.signal,
        });
        const payload = (await result.json()) as OfferResponse;
        if (!result.ok) throw new Error(t("offers.loadError"));
        setResponse(payload);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : t("offers.loadError"));
        setResponse(EMPTY_RESPONSE);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestParams, t], { topics: 'catalog' });

  const updateUrl = useCallback(
    (next: Filters) => {
      const params = new URLSearchParams();
      params.set("category", next.category);
      if (next.q) params.set("q", next.q);
      if (next.server) params.set("server", next.server);
      if (next.region) params.set("region", next.region);
      if (next.faction) params.set("faction", next.faction);
      if (next.platform) params.set("platform", next.platform);
      if (next.maxPrice) params.set("maxPrice", next.maxPrice);
      if (next.onlineOnly) params.set("onlineOnly", "true");
      if (next.sort !== "recommended") params.set("sort", next.sort);
      if (next.page > 1) params.set("page", String(next.page));
      router.replace(`/games/${encodeURIComponent(game.slug)}/offers?${params.toString()}`, {
        scroll: false,
      });
    },
    [game.slug, router]
  );

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => {
      const next = { ...current, [key]: value, page: key === "page" ? Number(value) : 1 };
      updateUrl(next);
      return next;
    });
  }

  const popularTags = useMemo(() => {
    const values = [
      ...response.facets.servers.map((item) => item.label),
      ...response.facets.factions.map((item) => item.label),
      ...response.facets.regions.map((item) => item.label),
    ];
    return Array.from(new Set(values.filter(Boolean))).slice(0, 5);
  }, [response.facets]);

  const sorting = isCoinSellerList
    ? [
        { label: t("offers.sort.recommended"), value: "recommended" },
        { label: t("offers.sort.lowestPrice"), value: "price_asc" },
      ]
    : [
        { label: t("offers.sort.recommended"), value: "recommended" },
        { label: t("offers.sort.newest"), value: "newest" },
        { label: t("offers.sort.lowestPrice"), value: "price_asc" },
        { label: t("offers.sort.highestPrice"), value: "price_desc" },
      ];

  return (
    <main className="min-h-screen bg-[#07090c] text-white">
      <section className="mx-auto max-w-[1540px] px-4 pb-8 pt-8 md:px-8 md:pb-10 md:pt-10">
        <MarketplaceBreadcrumbs
          items={[
            { label: t("offers.home"), href: "/" },
            {
              label: t(CATEGORY_KEYS[filters.category]),
              href: `/categories/${filters.category === "coin" ? "game-coins" : filters.category}`,
            },
            { label: game.name },
          ]}
        />
        <p className="mt-7 text-xs font-black uppercase tracking-[0.22em] text-yellow-400">
          {t(CATEGORY_KEYS[filters.category])}
        </p>
        <h1 className="mt-3 max-w-6xl text-3xl font-black leading-tight md:text-5xl">
          {titleFor(filters.category, game.name, t)}
          {filters.server ? ` — ${filters.server}` : ""}
        </h1>
        <p className="mt-3 max-w-3xl text-base text-slate-400 md:text-lg">
          {isCoinSellerList
            ? t("offers.compareSellers", {
                server: filters.server,
                faction: filters.faction ? ` ${filters.faction}` : "",
              })
            : t("offers.compareOffers")}
        </p>
        <div className="mt-8">
          <GameMarketplaceCategoryTabs
            gameSlug={game.slug}
            activeCategory={filters.category}
            counts={categoryCounts}
          />
        </div>
      </section>

      <section className="mx-auto max-w-[1540px] px-4 pb-12 md:px-8 md:pb-14">
        {filters.category === "coin" && !filters.server ? (
          <div className="rounded-lg border border-yellow-400/35 bg-yellow-400/[0.05] p-8 text-center">
            <FaGlobeAsia className="mx-auto text-4xl text-yellow-300" />
            <h2 className="mt-4 text-2xl font-black">
              {t("offers.selectCoinServerTitle")}
            </h2>
            <p className="mt-2 text-slate-300">
              {t("offers.selectCoinServerCopy")}
            </p>
            <Link href={`/games/${game.slug}?category=coin`} className="mt-6 inline-flex rounded-xl bg-yellow-300 px-6 py-3 font-black text-black">
              {t("offers.viewServers")}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid overflow-hidden rounded-lg border border-white/15 bg-[#0a0c10] md:grid-cols-[minmax(0,1fr)_220px_200px_auto]">
              <label className="relative block">
                <FaSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={filters.q}
                  onChange={(event) => update("q", event.target.value)}
                  placeholder={t("offers.filterPlaceholder")}
                  className="w-full bg-transparent py-5 pl-14 pr-5 outline-none placeholder:text-slate-500"
                />
              </label>
              <select
                value={filters.region}
                onChange={(event) => update("region", event.target.value)}
                className="border-t border-white/10 bg-transparent px-5 py-5 font-bold outline-none md:border-l md:border-t-0"
              >
                <option value="" className="bg-slate-900">
                  {t("offers.allRegions")}
                </option>
                {response.facets.regions.map((item) => (
                  <option key={item.value} value={item.label} className="bg-slate-900">{item.label}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={filters.maxPrice}
                onChange={(event) => update("maxPrice", event.target.value)}
                placeholder={t("offers.maxBudget")}
                className="border-t border-white/10 bg-transparent px-5 py-5 outline-none placeholder:text-slate-500 md:border-l md:border-t-0"
              />
              <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-white/10 px-5 py-5 md:border-l md:border-t-0">
                <span className="whitespace-nowrap text-sm font-bold">
                  {t("offers.onlineSellers")}
                </span>
                <input
                  type="checkbox"
                  checked={filters.onlineOnly}
                  onChange={(event) => update("onlineOnly", event.target.checked)}
                  className="h-5 w-5 accent-yellow-400"
                />
              </label>
            </div>

            {popularTags.length ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-400">{t("offers.popularSearches")}</span>
                {popularTags.map((tag) => (
                  <button key={tag} type="button" onClick={() => update("q", tag)} className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1.5 font-bold text-yellow-200 hover:bg-yellow-300 hover:text-black">
                    {tag.toLowerCase()}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-10 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <h2 className="text-lg font-black text-slate-200">
                {isCoinSellerList ? t("offers.otherSellers") : t("offers.offers")} ({number(response.pagination.total, locale)})
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-400">{t("offers.sortBy")}</span>
                {sorting.map((item) => {
                  const active = filters.sort === item.value;
                  return (
                    <button key={item.value} type="button" onClick={() => update("sort", item.value)} className="inline-flex items-center gap-2 font-bold" aria-pressed={active}>
                      <span className={`h-4 w-4 rounded-full border-2 ${active ? "border-yellow-400 bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,.35)]" : "border-slate-500"}`} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? (
              <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">{error}</div>
            ) : null}

            <div className="mt-5">
              {loading ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="h-60 animate-pulse rounded-2xl bg-white/[0.05]" />
                  ))}
                </div>
              ) : response.products.length === 0 ? (
                <div className="rounded-lg border border-white/15 bg-[#0a0c10] p-12 text-center">
                  <FaStore className="mx-auto text-4xl text-slate-600" />
                  <h3 className="mt-4 text-2xl font-black">
                    {t("offers.noOffersTitle")}
                  </h3>
                  <p className="mt-2 text-slate-400">{t("offers.noOffersCopy")}</p>
                  <Link href={sellerCreateUrl(game.slug, filters.category)} className="mt-6 inline-flex rounded-md bg-yellow-400 px-6 py-3 font-black text-black">
                    {t("offers.createOffer")}
                  </Link>
                </div>
              ) : isCoinSellerList ? (
                <div className="overflow-hidden rounded-lg border border-white/15">
                  {response.products.map((product) => <SellerRow key={product.id} product={product} />)}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {response.products.map((product) => (
                    <ProductCard key={product.id} product={product} category={filters.category} />
                  ))}
                </div>
              )}
            </div>

            {response.pagination.totalPages > 1 ? (
              <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
                <button type="button" disabled={response.pagination.page <= 1} onClick={() => update("page", response.pagination.page - 1)} className="rounded-md border border-white/15 px-4 py-2 font-bold transition hover:border-yellow-400/60 disabled:opacity-40">
                  {t("common.previous")}
                </button>
                <span className="text-sm text-slate-400">
                  {t("offers.pageOf", {
                    page: response.pagination.page,
                    total: response.pagination.totalPages,
                  })}
                </span>
                <button type="button" disabled={response.pagination.page >= response.pagination.totalPages} onClick={() => update("page", response.pagination.page + 1)} className="rounded-md border border-white/15 px-4 py-2 font-bold transition hover:border-yellow-400/60 disabled:opacity-40">
                  {t("common.next")}
                </button>
              </nav>
            ) : null}
          </>
        )}

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { icon: FaShieldAlt, title: t("offers.escrowTitle"), text: t("offers.escrowCopy") },
            { icon: FaSignal, title: t("offers.sellerStatusTitle"), text: t("offers.sellerStatusCopy") },
            { icon: FaTags, title: t("offers.transparentPriceTitle"), text: t("offers.transparentPriceCopy") },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-white/15 bg-[#0b0d11] p-5">
              <Icon className="text-yellow-300" />
              <h3 className="mt-3 font-black">{title}</h3>
              <p className="mt-1 text-sm text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

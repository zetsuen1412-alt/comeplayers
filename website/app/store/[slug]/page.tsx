/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */
"use client";
import { useLiveQuery } from '@/lib/live/use-live-query';

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useCurrency } from "@/components/CurrencyProvider";
import {
  effectivePresence,
  formatDeliveryEta,
  serviceLevelClass,
  serviceLevelLabel,
} from "@/lib/sellerServiceLevel";

type StorePolicies = {
  delivery?: string;
  refund?: string;
  support?: string;
};

type Store = {
  id: string;
  username: string | null;
  seller_name: string | null;
  seller_status: string | null;
  avatar_url: string | null;
  created_at: string | null;
  seller_presence_mode: string | null;
  seller_last_seen_at: string | null;
  seller_delivery_sla_minutes: number | null;
  seller_avg_delivery_minutes: number | string | null;
  seller_on_time_rate: number | string | null;
  seller_total_deliveries: number | null;
  seller_late_deliveries: number | null;
  seller_service_level: string | null;
  seller_rating: number | string | null;
  seller_review_count: number | null;
  seller_response_rate: number | string | null;
  store_slug: string;
  store_name: string | null;
  store_tagline: string | null;
  store_description: string | null;
  store_banner_url: string | null;
  store_logo_url: string | null;
  store_accent_color: string | null;
  store_announcement: string | null;
  store_policies: StorePolicies | null;
  store_vacation_mode: boolean | null;
  store_vacation_message: string | null;
  store_reopens_at: string | null;
  store_is_published: boolean | null;
};

type Product = {
  id: number;
  title: string | null;
  slug: string | null;
  description: string | null;
  image_url: string | null;
  game_name: string | null;
  category: string | null;
  price: number | string | null;
  stock: number | null;
  status: string | null;
  delivery_eta_minutes: number | null;
  offer_region: string | null;
  offer_platform: string | null;
  offer_server: string | null;
  has_variants: boolean | null;
  variant_count: number | null;
  min_variant_price: number | string | null;
  max_variant_price: number | string | null;
  product_rating: number | string | null;
  product_review_count: number | null;
  created_at: string;
};

type StorefrontPayload = {
  store: Store;
  products: Product[];
  featuredProducts: Product[];
  stats: {
    followers: number;
    completedOrders: number;
    activeProducts: number;
  };
};

type SortMode = "recommended" | "price_low" | "price_high" | "rating" | "newest";

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayPrice(product: Product) {
  if (product.has_variants && numberValue(product.min_variant_price) > 0) {
    return numberValue(product.min_variant_price);
  }
  return numberValue(product.price);
}

function productUrl(product: Product) {
  return `/product/${product.slug || product.id}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PublicSellerStorefrontPage() {
  const params = useParams();
  const slug = String(params.slug || "");
  const { formatPrice } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<StorefrontPayload | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortMode>("recommended");

  const loadStorefront = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/storefront/${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as StorefrontPayload & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Storefront not found.");
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load storefront.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useLiveQuery(() => {
    if (!slug) return;
    return loadStorefront();
  }, [slug, loadStorefront], { topics: 'catalog' });

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const product of data?.products || []) {
      const value = product.category || product.game_name;
      if (value) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [data?.products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const products = [...(data?.products || [])].filter((product) => {
      const matchesCategory =
        category === "all" || product.category === category || product.game_name === category;
      const haystack = [
        product.title,
        product.description,
        product.game_name,
        product.category,
        product.offer_region,
        product.offer_platform,
        product.offer_server,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesCategory && (!query || haystack.includes(query));
    });

    products.sort((a, b) => {
      if (sort === "price_low") return displayPrice(a) - displayPrice(b);
      if (sort === "price_high") return displayPrice(b) - displayPrice(a);
      if (sort === "rating") {
        return numberValue(b.product_rating) - numberValue(a.product_rating);
      }
      if (sort === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      const aScore =
        numberValue(a.product_rating) * 20 +
        numberValue(a.product_review_count) * 2 +
        (numberValue(a.stock) > 0 ? 10 : 0) -
        Math.min(displayPrice(a) / 100_000, 20);
      const bScore =
        numberValue(b.product_rating) * 20 +
        numberValue(b.product_review_count) * 2 +
        (numberValue(b.stock) > 0 ? 10 : 0) -
        Math.min(displayPrice(b) / 100_000, 20);
      return bScore - aScore;
    });

    return products;
  }, [data?.products, search, category, sort]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading seller storefront...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-5 text-white">
        <div className="max-w-lg rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-200">Storefront unavailable</h1>
          <p className="mt-4 text-red-100/70">{error || "This seller storefront is not published."}</p>
          <Link href="/" className="mt-6 inline-flex rounded-full bg-cyan-400 px-6 py-3 font-black text-black">
            Back to Marketplace
          </Link>
        </div>
      </main>
    );
  }

  const store = data.store;
  const accent = /^#[0-9a-fA-F]{6}$/.test(store.store_accent_color || "")
    ? String(store.store_accent_color)
    : "#22d3ee";
  const displayName = store.store_name || store.seller_name || store.username || "ComePlayers Store";
  const logo = store.store_logo_url || store.avatar_url;
  const presence = effectivePresence(store.seller_presence_mode, store.seller_last_seen_at);
  const rating = numberValue(store.seller_rating);
  const onTimeRate = numberValue(store.seller_on_time_rate || 100);

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative min-h-[430px] overflow-hidden border-b border-white/10">
        {store.store_banner_url ? (
          <img
            src={store.store_banner_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#020617]/65 to-[#020617]" />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background: `radial-gradient(circle at 20% 15%, ${accent}66, transparent 35%), radial-gradient(circle at 85% 20%, ${accent}33, transparent 30%)`,
          }}
        />

        <div className="relative z-10 mx-auto flex min-h-[430px] max-w-7xl flex-col justify-end px-5 pb-10 pt-24 md:px-10">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-5 md:flex-row md:items-center">
              <div
                className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-2 bg-black/50 shadow-2xl"
                style={{ borderColor: accent }}
              >
                {logo ? (
                  <img src={logo} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-5xl font-black" style={{ color: accent }}>
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
                    ✓ Verified Seller
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${
                      presence === "online"
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : presence === "away"
                          ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-300"
                          : "border-slate-400/30 bg-slate-400/10 text-slate-300"
                    }`}
                  >
                    {presence}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${serviceLevelClass(store.seller_service_level)}`}>
                    {serviceLevelLabel(store.seller_service_level)} Service
                  </span>
                </div>
                <h1 className="mt-4 text-4xl font-black md:text-7xl">{displayName}</h1>
                {store.store_tagline && <p className="mt-3 max-w-3xl text-lg text-slate-300">{store.store_tagline}</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/seller-profile/${store.id}`}
                className="rounded-2xl border border-white/20 bg-black/30 px-5 py-3 font-black hover:border-white/40"
              >
                Seller Profile
              </Link>
              <Link
                href={
                  data.products[0]
                    ? `/chat?seller=${store.id}&product=${data.products[0].id}`
                    : `/seller-profile/${store.id}`
                }
                className="rounded-2xl px-5 py-3 font-black text-black"
                style={{ backgroundColor: accent }}
              >
                {data.products[0] ? "Chat Seller" : "Seller Profile"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {store.store_announcement && (
        <div className="border-b border-white/10 bg-white/[0.03]">
          <div className="mx-auto max-w-7xl px-5 py-4 text-sm font-bold md:px-10">
            <span style={{ color: accent }}>Store announcement:</span> {store.store_announcement}
          </div>
        </div>
      )}

      {store.store_vacation_mode && (
        <div className="border-b border-yellow-400/20 bg-yellow-400/10">
          <div className="mx-auto max-w-7xl px-5 py-5 md:px-10">
            <p className="font-black text-yellow-200">🏖️ This store is currently in vacation mode.</p>
            <p className="mt-1 text-sm text-yellow-100/75">
              {store.store_vacation_message || "Delivery and replies may be delayed."}
              {store.store_reopens_at ? ` Reopens ${formatDate(store.store_reopens_at)}.` : ""}
            </p>
          </div>
        </div>
      )}

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Seller rating" value={`${rating.toFixed(1)} / 5`} />
          <Metric label="Verified reviews" value={String(store.seller_review_count || 0)} />
          <Metric label="Completed orders" value={String(data.stats.completedOrders)} />
          <Metric label="On-time delivery" value={`${onTimeRate.toFixed(1)}%`} />
          <Metric label="Followers" value={String(data.stats.followers)} />
        </div>

        {store.store_description && (
          <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-7">
            <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: accent }}>About this store</p>
            <p className="mt-4 max-w-4xl whitespace-pre-line leading-8 text-slate-300">{store.store_description}</p>
            <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-500">
              <span>Joined {formatDate(store.created_at)}</span>
              <span>Default delivery: {formatDeliveryEta(store.seller_delivery_sla_minutes)}</span>
              <span>Response rate: {numberValue(store.seller_response_rate).toFixed(0)}%</span>
            </div>
          </section>
        )}

        {data.featuredProducts.length > 0 && (
          <section className="mt-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: accent }}>Curated by seller</p>
                <h2 className="mt-2 text-3xl font-black">Featured Offers</h2>
              </div>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {data.featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} formatPrice={formatPrice} accent={accent} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-12">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: accent }}>Complete catalog</p>
              <h2 className="mt-2 text-3xl font-black">All Store Offers</h2>
              <p className="mt-2 text-slate-400">{filteredProducts.length} matching offers</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search this store..."
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-cyan-400"
              />
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="rounded-2xl border border-white/10 bg-[#071124] px-4 py-3 outline-none"
              >
                <option value="all">All categories</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className="rounded-2xl border border-white/10 bg-[#071124] px-4 py-3 outline-none"
              >
                <option value="recommended">Recommended</option>
                <option value="price_low">Lowest price</option>
                <option value="price_high">Highest price</option>
                <option value="rating">Best rating</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center text-slate-400">
              No offers match the selected filters.
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} formatPrice={formatPrice} accent={accent} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 grid gap-5 lg:grid-cols-3">
          <PolicyCard title="Delivery Policy" text={store.store_policies?.delivery} fallback="Delivery follows the ETA shown on each listing and uses protected order chat." />
          <PolicyCard title="Refund & Replacement" text={store.store_policies?.refund} fallback="Refund and replacement requests follow ComePlayers escrow and dispute rules." />
          <PolicyCard title="Support Policy" text={store.store_policies?.support} fallback="Keep all communication inside ComePlayers protected chat for buyer protection." />
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function ProductCard({
  product,
  formatPrice,
  accent,
}: {
  product: Product;
  formatPrice: (value: number | string | null | undefined) => string;
  accent: string;
}) {
  const price = displayPrice(product);
  const rating = numberValue(product.product_rating);
  const stock = Number(product.stock || 0);

  return (
    <Link
      href={productUrl(product)}
      className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition hover:-translate-y-1 hover:border-white/25"
    >
      <div className="aspect-[16/10] overflow-hidden bg-black/30">
        {product.image_url ? (
          <img src={product.image_url} alt={product.title || "Product"} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl">🎮</div>
        )}
      </div>
      <div className="p-5">
        <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wide text-slate-400">
          <span>{product.game_name || product.category || "Gaming"}</span>
          {product.offer_region && product.offer_region !== "Global" && <span>· {product.offer_region}</span>}
        </div>
        <h3 className="mt-3 line-clamp-2 min-h-12 text-lg font-black">{product.title || `Product #${product.id}`}</h3>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{product.has_variants ? "Starting from" : "Price"}</p>
            <p className="mt-1 text-xl font-black" style={{ color: accent }}>{formatPrice(price)}</p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <p>★ {rating.toFixed(1)} ({product.product_review_count || 0})</p>
            <p className="mt-1">{stock > 0 || product.has_variants ? "In stock" : "Out of stock"}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
          {product.delivery_eta_minutes && <span>{formatDeliveryEta(product.delivery_eta_minutes)}</span>}
          {product.offer_platform && product.offer_platform !== "Any" && <span>· {product.offer_platform}</span>}
          {product.has_variants && <span>· {product.variant_count || 0} options</span>}
        </div>
      </div>
    </Link>
  );
}

function PolicyCard({ title, text, fallback }: { title: string; text?: string | null; fallback: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-400">{text || fallback}</p>
    </div>
  );
}

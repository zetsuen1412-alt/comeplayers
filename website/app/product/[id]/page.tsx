import type { Metadata } from "next";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FaBolt,
  FaBoxOpen,
  FaCheckCircle,
  FaClock,
  FaGamepad,
  FaGem,
  FaShieldAlt,
  FaStar,
  FaStore,
  FaTag,
  FaUserShield,
  FaWallet,
} from "react-icons/fa";
import MarketplaceBreadcrumbs from "@/components/marketplace/MarketplaceBreadcrumbs";
import MarketplaceEventTracker from "@/components/marketplace/MarketplaceEventTracker";
import ProductVariantPurchase from "@/components/marketplace/ProductVariantPurchase";
import RecentlyViewedTracker from "@/components/marketplace/RecentlyViewedTracker";
import { convertFromBaseCurrency } from "@/lib/localization";
import { calculateSellerReputation } from "@/lib/sellerReputation";
import { effectivePresence, formatDeliveryEta } from "@/lib/sellerServiceLevel";
import { supabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    variant?: string | string[];
  }>;
};

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://comeplayers.com"
).replace(/\/$/, "");

function absoluteUrl(path: string) {
  if (!path) return SITE_URL;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

function fallbackImage(title: string) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    title || "ComePlayers Product"
  )}`;
}

function CategoryIcon({ category }: { category?: string | null }) {
  const value = (category || "").toLowerCase();

  if (value.includes("coin")) return <FaGem />;
  if (value.includes("account")) return <FaGamepad />;
  if (value.includes("boost")) return <FaBolt />;
  if (value.includes("top")) return <FaWallet />;
  if (value.includes("item")) return <FaBoxOpen />;

  return <FaTag />;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const productId = Number(id);
  const productQueryKey = decodeURIComponent(id);

  let productQuery = supabase
    .from("products")
    .select("id,title,description,category,slug,image_url,status,game_name,price")
    .limit(1);

  if (Number.isFinite(productId) && productId > 0) {
    productQuery = productQuery.eq("id", productId);
  } else {
    productQuery = productQuery.eq("slug", productQueryKey);
  }

  const { data: product } = await productQuery.maybeSingle();

  if (!product || product.status !== "active") {
    return {
      title: "Product Not Found | ComePlayers",
      robots: { index: false, follow: false },
    };
  }

  const title = `${product.title} | ComePlayers`;
  const description = product.description
    ? String(product.description).slice(0, 155)
    : `Buy ${product.title}${
        product.game_name ? ` for ${product.game_name}` : ""
      } on ComePlayers.`;
  const canonicalKey = product.slug || String(product.id);
  const canonical = `/product/${canonicalKey}`;
  const image = product.image_url || fallbackImage(product.title);

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
      images: [{ url: image, alt: product.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const cookieStore = await cookies();
  const currency = cookieStore.get("cp_currency")?.value || "IDR";

  const { id } = await params;
  const productSearchParams = await searchParams;
  const requestedVariantValue = Array.isArray(productSearchParams.variant)
    ? productSearchParams.variant[0]
    : productSearchParams.variant;
  const requestedVariantId = Number(requestedVariantValue || 0);
  const productId = Number(id);
  const productQueryKey = decodeURIComponent(id);

  let productQuery = supabase.from("products").select(`
      id,
      created_at,
      title,
      price,
      seller,
      seller_id,
      seller_name,
      description,
      category,
      slug,
      image_url,
      stock,
      status,
      category_id,
      game_category_id,
      game_name,
      delivery_eta_minutes,
      offer_region,
      offer_platform,
      offer_server,
      offer_tags,
      has_variants,
      variant_count,
      min_variant_price,
      max_variant_price
    `);

  if (Number.isFinite(productId) && productId > 0) {
    productQuery = productQuery.eq("id", productId);
  } else {
    productQuery = productQuery.eq("slug", productQueryKey);
  }

  const { data: product } = await productQuery.maybeSingle();

  if (!product || product.status !== "active") {
    notFound();
  }

  const { data: productVariants } = product.has_variants
    ? await supabase
        .from("product_variants")
        .select("id,sku,name,attributes,price,stock,status,sort_order")
        .eq("product_id", product.id)
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
    : { data: [] };

  const [
    { data: sellerProfile },
    { data: sellerCompletedOrdersData },
    { data: sellerFollowerRows },
    { data: sellerActiveProducts },
  ] = product.seller_id
    ? await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,username,seller_name,seller_rating,seller_review_count,seller_status,seller_presence_mode,seller_last_seen_at,seller_delivery_sla_minutes,seller_on_time_rate"
          )
          .eq("id", product.seller_id)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("id")
          .eq("seller_id", product.seller_id)
          .eq("status", "completed"),
        supabase
          .from("seller_followers")
          .select("id")
          .eq("seller_id", product.seller_id),
        supabase
          .from("products")
          .select("id")
          .eq("seller_id", product.seller_id)
          .eq("status", "active"),
      ])
    : [{ data: null }, { data: [] }, { data: [] }, { data: [] }];

  const sellerAverageRating = Number(sellerProfile?.seller_rating || 0);
  const sellerReviewCount = Number(sellerProfile?.seller_review_count || 0);
  const sellerCompletedOrdersCount = sellerCompletedOrdersData?.length || 0;
  const sellerFollowersCount = sellerFollowerRows?.length || 0;
  const sellerActiveProductsCount = sellerActiveProducts?.length || 0;
  const sellerReputation = calculateSellerReputation({
    averageRating: sellerAverageRating,
    reviewCount: sellerReviewCount,
    completedOrders: sellerCompletedOrdersCount,
    followersCount: sellerFollowersCount,
    activeProducts: sellerActiveProductsCount,
    sellerStatus: sellerProfile?.seller_status || null,
  });
  const sellerPresence = effectivePresence(
    sellerProfile?.seller_presence_mode,
    sellerProfile?.seller_last_seen_at
  );
  const deliveryEtaMinutes = Number(
    product.delivery_eta_minutes ||
      sellerProfile?.seller_delivery_sla_minutes ||
      60
  );
  const sellerOnTimeRate = Number(sellerProfile?.seller_on_time_rate || 100);

  const gameSlug = product.game_name ? slugify(product.game_name) : "";
  const categorySlug = product.category ? slugify(product.category) : "";
  const gameOffersHref = gameSlug
    ? `/games/${gameSlug}/offers${
        categorySlug ? `?category=${categorySlug}` : ""
      }`
    : "";

  const imageUrl = product.image_url || fallbackImage(product.title);
  const sellerName =
    sellerProfile?.seller_name ||
    sellerProfile?.username ||
    product.seller_name ||
    product.seller ||
    "Verified Seller";
  const stock = Number(product.stock ?? 1);
  const productCanonicalPath = `/product/${product.slug || product.id}`;
  const structuredPrice = Number(convertFromBaseCurrency(product.price, currency).toFixed(2));

  const productStructuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Games",
          item: absoluteUrl("/games"),
        },
        ...(product.game_name
          ? [
              {
                "@type": "ListItem",
                position: 3,
                name: product.game_name,
                item: absoluteUrl(`/games/${gameSlug}`),
              },
            ]
          : []),
        {
          "@type": "ListItem",
          position: product.game_name ? 4 : 3,
          name: product.title,
          item: absoluteUrl(productCanonicalPath),
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.title,
      description: product.description || `Buy ${product.title} on ComePlayers.`,
      image: absoluteUrl(imageUrl),
      sku: String(product.id),
      category: product.category || "Game Product",
      brand: product.game_name
        ? {
            "@type": "Brand",
            name: product.game_name,
          }
        : undefined,
      offers: {
        "@type": "Offer",
        url: absoluteUrl(productCanonicalPath),
        priceCurrency: currency,
        price: structuredPrice,
        availability:
          stock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: {
          "@type": "Organization",
          name: sellerName,
        },
      },
    },
  ];

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <MarketplaceEventTracker
        event_type="product_view"
        product_id={product.id}
        seller_id={product.seller_id}
        game_slug={gameSlug || null}
        game_name={product.game_name || null}
        category_slug={categorySlug || null}
        category_name={product.category || null}
      />

      <RecentlyViewedTracker productId={product.id} />

      <JsonLd data={productStructuredData} />

      <section className="border-b border-white/10 bg-[#070b18]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          <div className="hidden sm:block">
            <MarketplaceBreadcrumbs
              items={[
                { label: "Home", href: "/" },
                { label: "Games", href: "/games" },
                ...(product.game_name
                  ? [{ label: product.game_name, href: `/games/${gameSlug}` }]
                  : []),
                ...(product.category && gameOffersHref
                  ? [{ label: product.category, href: gameOffersHref }]
                  : []),
                { label: product.title },
              ]}
            />
          </div>

          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
              <div className="relative h-64 bg-black sm:h-80">
                <Image
                  src={imageUrl}
                  alt={product.title}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 760px, 100vw"
                  unoptimized
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-3 py-1.5 text-xs font-black text-black">
                    <CategoryIcon category={product.category} />
                    {product.category || "Game Product"}
                  </span>

                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-black/60 px-3 py-1.5 text-xs font-black text-emerald-300 backdrop-blur">
                    <FaShieldAlt />
                    Secure
                  </span>
                </div>
              </div>

              <div className="p-5">
                <h1 className="text-2xl font-black leading-tight sm:text-3xl">
                  {product.title}
                </h1>

                <div className="mt-4 flex flex-wrap gap-2">
                  {product.game_name ? (
                    <Link
                      href={gameOffersHref || `/games/${gameSlug}/offers`}
                      className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:border-cyan-300"
                    >
                      {product.game_name}
                    </Link>
                  ) : null}

                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-300">
                    Stock {stock}
                  </span>

                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-300">
                    {formatDeliveryEta(deliveryEtaMinutes)} delivery
                  </span>

                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-300">
                    {product.offer_region || "Global"}
                  </span>

                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-300">
                    {product.offer_platform || "Any platform"}
                  </span>

                  {product.offer_server ? (
                    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-300">
                      {product.offer_server}
                    </span>
                  ) : null}

                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-300">
                    {currency}
                  </span>
                </div>
              </div>
              </article>

              <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <h2 className="text-xl font-black">Product Description</h2>
                <div className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-300 sm:text-base">
                  {product.description || "No description provided by seller."}
                </div>
              </article>
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] p-5">
                <ProductVariantPurchase
                  productId={Number(product.id)}
                  sellerId={product.seller_id || null}
                  basePrice={product.price}
                  baseStock={Number(product.stock || 0)}
                  initialVariantId={
                    Number.isInteger(requestedVariantId) && requestedVariantId > 0
                      ? requestedVariantId
                      : null
                  }
                  variants={(productVariants || []).map((variant) => ({
                    id: Number(variant.id),
                    sku: String(variant.sku || ""),
                    name: String(variant.name || "Variant"),
                    attributes: (variant.attributes || {}) as Record<string, unknown>,
                    price: variant.price,
                    stock: Number(variant.stock || 0),
                  }))}
                />

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
                    <FaShieldAlt className="text-emerald-300" />
                    <p className="font-bold">Escrow Protected</p>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
                    <FaClock className="text-yellow-300" />
                    <p className="font-bold">{formatDeliveryEta(deliveryEtaMinutes)} ETA</p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-400">
                  Payment stays protected until delivery is confirmed.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-400 font-black text-black">
                    {sellerName.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-black">{sellerName}</h2>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                          sellerPresence === "online"
                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                            : sellerPresence === "away"
                              ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-300"
                              : "border-slate-400/30 bg-slate-400/10 text-slate-400"
                        }`}
                      >
                        {sellerPresence}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-yellow-300">
                      <FaStar />
                      {sellerAverageRating > 0
                        ? `${sellerAverageRating.toFixed(1)} · ${sellerReviewCount} reviews`
                        : "New seller"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-y border-white/10 py-3 text-center text-xs">
                  <div>
                    <p className="font-black text-white">{sellerReputation.score}</p>
                    <p className="mt-1 text-slate-500">Reputation</p>
                  </div>
                  <div>
                    <p className="font-black text-white">{sellerCompletedOrdersCount}</p>
                    <p className="mt-1 text-slate-500">Completed</p>
                  </div>
                  <div>
                    <p className="font-black text-white">{sellerOnTimeRate.toFixed(0)}%</p>
                    <p className="mt-1 text-slate-500">On time</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                  <FaCheckCircle className="text-emerald-300" />
                  <span>{sellerReputation.badge} {sellerReputation.tierLabel}</span>
                  <span className="text-slate-600">•</span>
                  <FaUserShield className="text-cyan-300" />
                  <span>Protected seller</span>
                </div>

                {product.seller_id ? (
                  <Link
                    href={`/seller-profile/${product.seller_id}`}
                    className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-300"
                  >
                    <FaStore />
                    Seller Profile
                  </Link>
                ) : null}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <h3 className="font-black">Product Info</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                    <dt className="text-slate-400">Game</dt>
                    <dd className="text-right font-bold">{product.game_name || "-"}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                    <dt className="text-slate-400">Category</dt>
                    <dd className="text-right font-bold">{product.category || "-"}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                    <dt className="text-slate-400">Stock</dt>
                    <dd className="font-bold">{stock}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-400">Delivery</dt>
                    <dd className="font-bold text-emerald-300">
                      {formatDeliveryEta(deliveryEtaMinutes)}
                    </dd>
                  </div>
                </dl>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

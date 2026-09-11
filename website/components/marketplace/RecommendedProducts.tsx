"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaMagic, FaShoppingCart, FaStar } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";
import { calculateSellerReputation } from "@/lib/sellerReputation";

type Product = {
  id: number;
  title: string | null;
  slug: string | null;
  price: string | number | null;
  image_url: string | null;
  category: string | null;
  game_name: string | null;
  stock: number | null;
  status: string | null;
  seller_id: string | null;
  seller_name: string | null;
  seller: string | null;
  created_at: string | null;
};

type RecentlyViewedRow = {
  product_id: number;
  viewed_at: string;
  products: Product | null;
};

type SellerProfile = {
  id: string;
  username: string | null;
  seller_name: string | null;
  seller_rating: number | string | null;
  seller_review_count: number | string | null;
  seller_status: string | null;
};

type RecommendedProduct = Product & {
  recommendation_score: number;
  recommendation_reason: string;
  seller_reputation_score: number;
  seller_reputation_tier: string;
  seller_reputation_badge: string;
};

type RecommendedProductsProps = {
  currentProductId?: number;
  title?: string;
  subtitle?: string;
  compact?: boolean;
};


function fallbackImage(title: string | null) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    title || "ComePlayers Product"
  )}`;
}

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function incrementCounter(counter: Map<string, number>, key: string) {
  if (!key) return;
  counter.set(key, (counter.get(key) || 0) + 1);
}

export default function RecommendedProducts({
  currentProductId,
  title = "Recommended For You",
  subtitle = "Personalized products based on your recently viewed games and categories.",
  compact = false,
}: RecommendedProductsProps) {
  const { formatPrice } = useCurrency();
  const [recentRows, setRecentRows] = useState<RecentlyViewedRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sellerProfiles, setSellerProfiles] = useState<Record<string, SellerProfile>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRecommendations() {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        if (!cancelled) {
          setRecentRows([]);
          setProducts([]);
          setLoading(false);
        }
        return;
      }

      const { data: recentData, error: recentError } = await supabase
        .from("recently_viewed")
        .select(
          `
          product_id,
          viewed_at,
          products:product_id (
            id,
            title,
            slug,
            price,
            image_url,
            category,
            game_name,
            stock,
            status,
            seller_id,
            seller_name,
            seller,
            created_at
          )
        `
        )
        .eq("user_id", user.id)
        .order("viewed_at", { ascending: false })
        .limit(24);

      if (cancelled) return;

      if (recentError) {
        console.warn("Failed to load recent history for recommendations:", recentError.message);
        setRecentRows([]);
        setProducts([]);
        setLoading(false);
        return;
      }

      const viewedRows = (recentData || []) as unknown as RecentlyViewedRow[];
      const viewedProducts = viewedRows
        .map((row) => row.products)
        .filter((product): product is Product => Boolean(product));

      const gameNames = Array.from(
        new Set(viewedProducts.map((product) => product.game_name).filter(Boolean) as string[])
      ).slice(0, 8);
      const categoryNames = Array.from(
        new Set(viewedProducts.map((product) => product.category).filter(Boolean) as string[])
      ).slice(0, 8);

      let productQuery = supabase
        .from("products")
        .select(
          `
          id,
          title,
          slug,
          price,
          image_url,
          category,
          game_name,
          stock,
          status,
          seller_id,
          seller_name,
          seller,
          created_at
        `
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(100);

      const orFilters = [
        ...gameNames.map((gameName) => `game_name.eq.${gameName}`),
        ...categoryNames.map((categoryName) => `category.eq.${categoryName}`),
      ];

      if (orFilters.length > 0) {
        productQuery = productQuery.or(orFilters.join(","));
      }

      const { data: productData, error: productError } = await productQuery;

      if (cancelled) return;

      if (productError) {
        console.warn("Failed to load recommended products:", productError.message);
        setRecentRows(viewedRows);
        setProducts([]);
        setLoading(false);
        return;
      }

      const loadedProducts = (productData || []) as Product[];
      const sellerIds = Array.from(
        new Set(
          loadedProducts
            .map((product) => product.seller_id)
            .filter((sellerId): sellerId is string => Boolean(sellerId))
        )
      );

      let profilesById: Record<string, SellerProfile> = {};

      if (sellerIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id,username,seller_name,seller_rating,seller_review_count,seller_status")
          .in("id", sellerIds);

        if (!profileError) {
          profilesById = Object.fromEntries(
            ((profileData || []) as SellerProfile[]).map((profile) => [profile.id, profile])
          );
        }
      }

      setRecentRows(viewedRows);
      setProducts(loadedProducts);
      setSellerProfiles(profilesById);
      setLoading(false);
    }

    loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, []);

  const recommendations = useMemo(() => {
    const viewedIds = new Set<number>();
    const gameCounter = new Map<string, number>();
    const categoryCounter = new Map<string, number>();
    const sellerCounter = new Map<string, number>();

    for (const row of recentRows) {
      viewedIds.add(row.product_id);

      const product = row.products;
      if (!product) continue;

      incrementCounter(gameCounter, normalize(product.game_name));
      incrementCounter(categoryCounter, normalize(product.category));
      incrementCounter(sellerCounter, normalize(product.seller_name || product.seller));
    }

    const scoredProducts = products
      .filter((product) => {
        if (product.status !== "active") return false;
        if (currentProductId && product.id === currentProductId) return false;
        if (viewedIds.has(product.id)) return false;
        return true;
      })
      .map((product) => {
        const gameScore = gameCounter.get(normalize(product.game_name)) || 0;
        const categoryScore = categoryCounter.get(normalize(product.category)) || 0;
        const sellerScore = sellerCounter.get(normalize(product.seller_name || product.seller)) || 0;
        const inStock = Number(product.stock ?? 1) > 0;
        const sellerProfile = product.seller_id ? sellerProfiles[product.seller_id] : null;
        const sellerReputation = calculateSellerReputation({
          averageRating: Number(sellerProfile?.seller_rating || 0),
          reviewCount: Number(sellerProfile?.seller_review_count || 0),
          sellerStatus: sellerProfile?.seller_status || null,
        });
        const reputationBonus = sellerReputation.score >= 85 ? 32 : sellerReputation.score >= 70 ? 22 : sellerReputation.score >= 45 ? 10 : 0;

        const score = gameScore * 40 + categoryScore * 28 + sellerScore * 14 + reputationBonus + (inStock ? 8 : -12);

        let reason = "Popular marketplace product";
        if (gameScore > 0 && product.game_name) {
          reason = `Because you viewed ${product.game_name}`;
        } else if (categoryScore > 0 && product.category) {
          reason = `More ${product.category} offers`;
        } else if (sellerScore > 0) {
          reason = "Seller you recently viewed";
        }

        return {
          ...product,
          recommendation_score: score,
          recommendation_reason: reason,
          seller_reputation_score: sellerReputation.score,
          seller_reputation_tier: sellerReputation.tierLabel,
          seller_reputation_badge: sellerReputation.badge,
        };
      })
      .filter((product) => product.recommendation_score > 0)
      .sort((a, b) => b.recommendation_score - a.recommendation_score)
      .slice(0, compact ? 4 : 8);

    return scoredProducts;
  }, [compact, currentProductId, products, recentRows, sellerProfiles]);

  if (loading) return null;
  if (recommendations.length === 0) return null;

  return (
    <section
      className={
        compact ? "mt-8" : "px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16"
      }
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-4 py-2 text-sm font-black text-fuchsia-300">
            <FaMagic /> Personalized
          </p>

          <h2
            className={
              compact ? "text-2xl font-black" : "text-3xl font-black sm:text-4xl"
            }
          >
            {title}
          </h2>

          <p className="mt-2 text-gray-300">{subtitle}</p>
        </div>

        {!compact ? (
          <Link
            href="/games"
            className="inline-flex w-full justify-center rounded-full border border-fuchsia-400 px-5 py-3 font-black text-fuchsia-300 transition hover:bg-fuchsia-400 hover:text-black sm:w-auto"
          >
            Explore More
          </Link>
        ) : null}
      </div>

      <div
        className={
          compact
            ? "grid gap-4 md:grid-cols-2"
            : "grid gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-4"
        }
      >
        {recommendations.map((product) => {
          const productHref = `/product/${product.slug || product.id}`;
          const imageUrl = product.image_url || fallbackImage(product.title);
          const sellerName = product.seller_name || product.seller || "Verified Seller";
          const stock = Number(product.stock ?? 1);

          return (
            <Link
              key={product.id}
              href={productHref}
              className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-fuchsia-400 hover:bg-fuchsia-950/20"
            >
              <div className={compact ? "relative h-36 bg-black" : "relative h-44 bg-black"}>
                <Image
                  src={imageUrl}
                  alt={product.title || "Recommended product"}
                  fill
                  className="object-cover transition group-hover:scale-105"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                <span className="absolute left-4 top-4 rounded-full bg-fuchsia-400 px-3 py-1 text-xs font-black text-black">
                  Recommended
                </span>

                {product.seller_reputation_score >= 70 ? (
                  <span className="absolute right-4 top-4 rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-black">
                    {product.seller_reputation_badge} {product.seller_reputation_tier}
                  </span>
                ) : null}
              </div>

              <div className="p-5">
                <p className="text-xs font-black text-fuchsia-300">
                  {product.game_name || "Game Product"}
                  {product.category ? ` / ${product.category}` : ""}
                </p>

                <h3 className="mt-2 line-clamp-2 text-xl font-black group-hover:text-fuchsia-300">
                  {product.title || "Untitled Product"}
                </h3>

                <p className="mt-3 line-clamp-1 text-sm text-gray-400">
                  {product.recommendation_reason}
                </p>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-2xl font-black text-cyan-300">
                    {formatPrice(product.price)}
                  </p>

                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-gray-300">
                    <FaShoppingCart /> {stock}
                  </span>
                </div>

                <p className="mt-3 inline-flex items-center gap-2 text-sm text-gray-400">
                  <FaStar className="text-yellow-300" /> {sellerName}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

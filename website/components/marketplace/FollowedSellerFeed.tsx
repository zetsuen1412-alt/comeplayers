"use client";
import { useLiveQuery } from '@/lib/live/use-live-query';

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaBell, FaShoppingCart, FaStar, FaStore } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";
import { calculateSellerReputation } from "@/lib/sellerReputation";

type FollowRow = {
  seller_id: string;
};

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

type SellerProfile = {
  id: string;
  username: string | null;
  seller_name: string | null;
  seller_rating: number | string | null;
  seller_review_count: number | string | null;
  seller_status: string | null;
};

type FeedProduct = Product & {
  seller_display_name: string;
  seller_rating: number | null;
  seller_review_count: number;
  seller_reputation_score: number;
  seller_reputation_tier: string;
  seller_reputation_badge: string;
};


function fallbackImage(title: string | null) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    title || "ComePlayers Product"
  )}`;
}

function parseRating(value: number | string | null | undefined) {
  const rating = Number(value || 0);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return Number(rating.toFixed(1));
}

export default function FollowedSellerFeed() {
  const { formatPrice } = useCurrency();
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasFollowedSellers, setHasFollowedSellers] = useState(false);
  const [loading, setLoading] = useState(true);

  useLiveQuery((background) => {
    let cancelled = false;

    async function loadFeed() {
      if (!background) setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        if (!cancelled) {
          setIsLoggedIn(false);
          setHasFollowedSellers(false);
          setProducts([]);
          setLoading(false);
        }
        return;
      }

      setIsLoggedIn(true);

      const { data: followData, error: followError } = await supabase
        .from("seller_followers")
        .select("seller_id")
        .eq("follower_id", user.id)
        .order("id", { ascending: false })
        .limit(50);

      if (cancelled) return;

      if (followError) {
        console.warn("Failed to load followed sellers:", followError.message);
        setHasFollowedSellers(false);
        setProducts([]);
        setLoading(false);
        return;
      }

      const sellerIds = Array.from(
        new Set(((followData || []) as FollowRow[]).map((row) => row.seller_id).filter(Boolean))
      );

      setHasFollowedSellers(sellerIds.length > 0);

      if (sellerIds.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      const [{ data: productData, error: productError }, { data: profileData }] =
        await Promise.all([
          supabase
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
            .in("seller_id", sellerIds)
            .order("created_at", { ascending: false })
            .limit(8),
          supabase
            .from("profiles")
            .select("id,username,seller_name,seller_rating,seller_review_count,seller_status")
            .in("id", sellerIds),
        ]);

      if (cancelled) return;

      if (productError) {
        console.warn("Failed to load followed seller products:", productError.message);
        setProducts([]);
        setLoading(false);
        return;
      }

      const profiles = new Map<string, SellerProfile>();
      for (const profile of (profileData || []) as SellerProfile[]) {
        profiles.set(profile.id, profile);
      }

      const feedProducts = ((productData || []) as Product[]).map((product) => {
        const profile = product.seller_id ? profiles.get(product.seller_id) : null;
        const sellerName =
          profile?.seller_name ||
          profile?.username ||
          product.seller_name ||
          product.seller ||
          "Verified Seller";

        const reputation = calculateSellerReputation({
          averageRating: Number(profile?.seller_rating || 0),
          reviewCount: Number(profile?.seller_review_count || 0),
          sellerStatus: profile?.seller_status || null,
        });

        return {
          ...product,
          seller_display_name: sellerName,
          seller_rating: parseRating(profile?.seller_rating),
          seller_review_count: Number(profile?.seller_review_count || 0),
          seller_reputation_score: reputation.score,
          seller_reputation_tier: reputation.tierLabel,
          seller_reputation_badge: reputation.badge,
        };
      });

      setProducts(feedProducts);
      setLoading(false);
    }

    loadFeed();

    return () => {
      cancelled = true;
    };
  }, [], { topics: 'catalog,account' });

  const activeProducts = useMemo(() => {
    return products.filter((product) => product.status === "active").slice(0, 8);
  }, [products]);

  if (loading) return null;

  if (!isLoggedIn) return null;

  if (!hasFollowedSellers) {
    return (
      <section className="px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-300">
            <FaBell /> Seller Feed
          </p>

          <h2 className="text-2xl font-black sm:text-3xl">
            From Sellers You Follow
          </h2>

          <p className="mt-3 max-w-2xl text-gray-300">
            Follow trusted sellers to get their newest listings directly on your homepage.
          </p>

          <Link
            href="/sellers/leaderboard"
            className="mt-6 inline-flex w-full justify-center rounded-full border border-emerald-400 px-5 py-3 font-black text-emerald-300 transition hover:bg-emerald-400 hover:text-black sm:w-auto"
          >
            Browse Seller Leaderboard
          </Link>
        </div>
      </section>
    );
  }

  if (activeProducts.length === 0) {
    return (
      <section className="px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-300">
            <FaBell /> Seller Feed
          </p>

          <h2 className="text-2xl font-black sm:text-3xl">
            From Sellers You Follow
          </h2>

          <p className="mt-3 max-w-2xl text-gray-300">
            Sellers you follow have no active listings yet. Check back later for new offers.
          </p>

          <Link
            href="/following"
            className="mt-6 inline-flex w-full justify-center rounded-full border border-emerald-400 px-5 py-3 font-black text-emerald-300 transition hover:bg-emerald-400 hover:text-black sm:w-auto"
          >
            Manage Following
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-300">
            <FaBell /> Seller Feed
          </p>

          <h2 className="text-3xl font-black sm:text-4xl">
            From Sellers You Follow
          </h2>

          <p className="mt-2 text-gray-300">
            Newest active listings from sellers you already follow.
          </p>
        </div>

        <Link
          href="/following"
          className="inline-flex w-full justify-center rounded-full border border-emerald-400 px-5 py-3 font-black text-emerald-300 transition hover:bg-emerald-400 hover:text-black sm:w-auto"
        >
          Manage Following
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-4">
        {activeProducts.map((product) => {
          const productHref = `/product/${product.slug || product.id}`;
          const imageUrl = product.image_url || fallbackImage(product.title);
          const sellerRating = product.seller_rating;
          const stock = Number(product.stock ?? 1);

          return (
            <Link
              key={product.id}
              href={productHref}
              className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-emerald-400 hover:bg-emerald-950/20"
            >
              <div className="relative h-44 bg-black">
                <Image
                  src={imageUrl}
                  alt={product.title || "Followed seller product"}
                  fill
                  className="object-cover transition group-hover:scale-105"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                <span className="absolute left-4 top-4 rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-black">
                  Followed Seller
                </span>

                {product.seller_reputation_score >= 70 ? (
                  <span className="absolute right-4 top-4 rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-black">
                    {product.seller_reputation_badge} {product.seller_reputation_tier}
                  </span>
                ) : null}
              </div>

              <div className="p-5">
                <p className="text-xs font-black text-emerald-300">
                  {product.game_name || "Game Product"}
                  {product.category ? ` / ${product.category}` : ""}
                </p>

                <h3 className="mt-2 line-clamp-2 text-xl font-black group-hover:text-emerald-300">
                  {product.title || "Untitled Product"}
                </h3>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-2xl font-black text-cyan-300">
                    {formatPrice(product.price)}
                  </p>

                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-gray-300">
                    <FaShoppingCart /> {stock}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-gray-400">
                  <span className="inline-flex items-center gap-2">
                    <FaStore className="text-emerald-300" /> {product.seller_display_name}
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <FaStar className="text-yellow-300" />
                    {sellerRating
                      ? `${sellerRating} rating`
                      : "Followed seller"}
                    {product.seller_review_count > 0
                      ? ` • ${product.seller_review_count} reviews`
                      : ""}
                  </span>

                  <span className="inline-flex items-center gap-2 text-yellow-300">
                    {product.seller_reputation_badge} Seller Score {product.seller_reputation_score} • {product.seller_reputation_tier}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

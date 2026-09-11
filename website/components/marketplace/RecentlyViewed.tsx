"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaClock, FaShoppingCart, FaStar } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

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
  seller_name: string | null;
  seller: string | null;
};

type RecentlyViewedRow = {
  id: number;
  product_id: number;
  viewed_at: string;
  products: Product | null;
};


function fallbackImage(title: string | null) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    title || "ComePlayers Product"
  )}`;
}

export default function RecentlyViewed() {
  const { formatPrice } = useCurrency();
  const [rows, setRows] = useState<RecentlyViewedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentlyViewed() {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("recently_viewed")
        .select(
          `
          id,
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
            seller_name,
            seller
          )
        `
        )
        .eq("user_id", user.id)
        .order("viewed_at", { ascending: false })
        .limit(8);

      if (cancelled) return;

      if (error) {
        console.warn("Failed to load recently viewed:", error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data || []) as unknown as RecentlyViewedRow[]);
      setLoading(false);
    }

    loadRecentlyViewed();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeRows = useMemo(() => {
    return rows.filter((row) => row.products?.status === "active").slice(0, 4);
  }, [rows]);

  if (loading) {
    return null;
  }

  if (activeRows.length === 0) {
    return null;
  }

  return (
    <section className="px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
            <FaClock /> Buyer Personalization
          </p>

          <h2 className="text-3xl font-black sm:text-4xl">
            Recently Viewed
          </h2>

          <p className="mt-2 text-gray-300">
            Continue browsing products you checked recently.
          </p>
        </div>

        <Link
          href="/games"
          className="inline-flex w-full justify-center rounded-full border border-cyan-400 px-5 py-3 font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black sm:w-auto"
        >
          Browse More
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-4">
        {activeRows.map((row) => {
          const product = row.products;
          if (!product) return null;

          const productHref = `/product/${product.slug || product.id}`;
          const imageUrl = product.image_url || fallbackImage(product.title);
          const sellerName = product.seller_name || product.seller || "Verified Seller";
          const stock = Number(product.stock ?? 1);

          return (
            <Link
              key={row.id}
              href={productHref}
              className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-cyan-400 hover:bg-cyan-950/20"
            >
              <div className="relative h-44 bg-black">
                <Image
                  src={imageUrl}
                  alt={product.title || "Recently viewed product"}
                  fill
                  className="object-cover transition group-hover:scale-105"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                <span className="absolute left-4 top-4 rounded-full bg-cyan-400 px-3 py-1 text-xs font-black text-black">
                  {product.category || "Marketplace"}
                </span>
              </div>

              <div className="p-5">
                <p className="text-xs font-black text-cyan-300">
                  {product.game_name || "Game Product"}
                </p>

                <h3 className="mt-2 line-clamp-2 text-xl font-black group-hover:text-cyan-300">
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

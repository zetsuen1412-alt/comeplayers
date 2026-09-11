"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type Product = {
  id: number;
  title: string | null;
  description: string | null;
  price: string | number | null;
  image_url: string | null;
  seller: string | null;
  seller_id: string | null;
  seller_name: string | null;
  category: string | null;
  category_id: number | null;
  game_name: string | null;
  game_category_id: number | null;
  stock: number | null;
  status: string | null;
  created_at: string;
};

type WishlistRow = {
  id: number;
  user_id: string;
  product_id: number;
  created_at: string;
  products: Product | null;
};

function formatPrice(value: string | number | null) {
  const price = Number(value || 0);
  if (!Number.isFinite(price)) return "Rp 0";
  return `Rp ${price.toLocaleString("id-ID")}`;
}

export default function WishlistPageV1() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [wishlistRows, setWishlistRows] = useState<WishlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filteredWishlist = useMemo(() => {
    const query = search.trim().toLowerCase();

    return wishlistRows.filter((row) => {
      const product = row.products;

      if (!product) return false;

      return (
        !query ||
        (product.title || "").toLowerCase().includes(query) ||
        (product.category || "").toLowerCase().includes(query) ||
        (product.game_name || "").toLowerCase().includes(query) ||
        (product.seller_name || "").toLowerCase().includes(query) ||
        (product.seller || "").toLowerCase().includes(query)
      );
    });
  }, [wishlistRows, search]);

  async function loadWishlist(currentUser: User) {
    const { data, error } = await supabase
      .from("wishlists")
      .select(
        `
        id,
        user_id,
        product_id,
        created_at,
        products:product_id (
          id,
          title,
          description,
          price,
          image_url,
          seller,
          seller_id,
          seller_name,
          category,
          category_id,
          game_name,
          game_category_id,
          stock,
          status,
          created_at
        )
      `
      )
      .eq("user_id", currentUser.id)
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setWishlistRows((data || []) as unknown as WishlistRow[]);
  }

  useEffect(() => {
    async function initializePage() {
      setLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError) {
        alert(userError.message);
        setLoading(false);
        return;
      }

      if (!userData.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(userData.user);
      await loadWishlist(userData.user);
      setLoading(false);
    }

    initializePage();
  }, []);

  async function removeWishlist(wishlistId: number) {
    if (!user) return;

    setRemovingId(wishlistId);

    const { error } = await supabase
      .from("wishlists")
      .delete()
      .eq("id", wishlistId)
      .eq("user_id", user.id);

    if (error) {
      alert(error.message);
      setRemovingId(null);
      return;
    }

    await loadWishlist(user);
    setRemovingId(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading wishlist...
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-3xl font-black text-cyan-300">Login Required</h1>

          <p className="mt-4 text-gray-400">
            Please login first to view your wishlist.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(244,63,94,.16),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-pink-400/30 bg-pink-400/10 px-4 py-2 text-sm font-black text-pink-300">
              Buyer Wishlist
            </p>

            <h1 className="text-5xl font-black md:text-7xl">Wishlist</h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Save your favorite products and come back later when you are ready
              to buy.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            Browse Products
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-[1fr_260px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search wishlist by product, category, game, or seller..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
            <p className="text-sm text-gray-400">Saved Products</p>
            <p className="text-2xl font-black text-pink-300">
              {wishlistRows.length}
            </p>
          </div>
        </div>

        {filteredWishlist.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">No wishlist products found.</h2>

            <p className="mt-3 text-gray-400">
              Add products to your wishlist from product detail pages.
            </p>

            <Link
              href="/"
              className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
            >
              Browse Marketplace
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filteredWishlist.map((row) => {
              const product = row.products;
              if (!product) return null;

              const isAvailable =
                product.status === "active" && Number(product.stock || 0) > 0;

              return (
                <div
                  key={row.id}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20"
                >
                  <Link href={`/product/${product.id}`} className="block">
                    <div className="flex h-52 items-center justify-center bg-black">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.title || "Product"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-6xl">🎮</span>
                      )}
                    </div>

                    <div className="p-5">
                      <p className="text-xs font-black text-cyan-300">
                        {product.category || "Marketplace"} /{" "}
                        {product.game_name || "Game"}
                      </p>

                      <h2 className="mt-2 line-clamp-2 text-xl font-black hover:text-cyan-300">
                        {product.title || "Untitled Product"}
                      </h2>

                      <p className="mt-3 text-2xl font-black text-cyan-300">
                        {formatPrice(product.price)}
                      </p>

                      <p className="mt-2 text-sm text-gray-400">
                        Seller:{" "}
                        {product.seller_name || product.seller || "Unknown"}
                      </p>

                      <p
                        className={`mt-2 text-sm font-bold ${
                          isAvailable ? "text-green-300" : "text-red-300"
                        }`}
                      >
                        {isAvailable ? "Available" : "Unavailable"}
                      </p>
                    </div>
                  </Link>

                  <div className="grid grid-cols-2 gap-3 p-5 pt-0">
                    <Link
                      href={`/product/${product.id}`}
                      className="rounded-2xl border border-cyan-400 px-4 py-3 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
                    >
                      View
                    </Link>

                    <button
                      onClick={() => removeWishlist(row.id)}
                      disabled={removingId === row.id}
                      className="rounded-2xl border border-red-400/40 px-4 py-3 font-black text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-60"
                    >
                      {removingId === row.id ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
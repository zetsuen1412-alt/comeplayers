"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type SellerProfile = {
  id: string;
  email: string | null;
  username: string | null;
  seller_name: string | null;
  seller_status: string | null;
  avatar_url: string | null;
  bio: string | null;
  discord: string | null;
  created_at: string;
};

type FollowRow = {
  id: number;
  follower_id: string;
  seller_id: string;
  created_at: string;
  profiles: SellerProfile | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FollowingPageV1() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [followingRows, setFollowingRows] = useState<FollowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unfollowingId, setUnfollowingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filteredFollowing = useMemo(() => {
    const query = search.trim().toLowerCase();

    return followingRows.filter((row) => {
      const seller = row.profiles;

      if (!seller) return false;

      return (
        !query ||
        (seller.seller_name || "").toLowerCase().includes(query) ||
        (seller.username || "").toLowerCase().includes(query) ||
        (seller.email || "").toLowerCase().includes(query) ||
        (seller.bio || "").toLowerCase().includes(query) ||
        (seller.discord || "").toLowerCase().includes(query)
      );
    });
  }, [followingRows, search]);

  async function loadFollowing(currentUser: User) {
    const { data, error } = await supabase
      .from("seller_followers")
      .select(
        `
        id,
        follower_id,
        seller_id,
        created_at,
        profiles:seller_id (
          id,
          email,
          username,
          seller_name,
          seller_status,
          avatar_url,
          bio,
          discord,
          created_at
        )
      `
      )
      .eq("follower_id", currentUser.id)
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setFollowingRows((data || []) as unknown as FollowRow[]);
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
      await loadFollowing(userData.user);
      setLoading(false);
    }

    initializePage();
  }, []);

  async function unfollowSeller(followId: number) {
    if (!user) return;

    if (!confirm("Unfollow this seller?")) return;

    setUnfollowingId(followId);

    const { error } = await supabase
      .from("seller_followers")
      .delete()
      .eq("id", followId)
      .eq("follower_id", user.id);

    if (error) {
      alert(error.message);
      setUnfollowingId(null);
      return;
    }

    await loadFollowing(user);
    setUnfollowingId(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading following sellers...
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
            Please login first to view followed sellers.
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,197,94,.16),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-green-400/30 bg-green-400/10 px-4 py-2 text-sm font-black text-green-300">
              Followed Sellers
            </p>

            <h1 className="text-5xl font-black md:text-7xl">Following</h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Track your favorite sellers and quickly return to their products,
              reviews, and profile.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            Browse Marketplace
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-[1fr_260px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search followed sellers by name, email, discord, or bio..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
            <p className="text-sm text-gray-400">Following</p>
            <p className="text-2xl font-black text-green-300">
              {followingRows.length}
            </p>
          </div>
        </div>

        {filteredFollowing.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">No followed sellers found.</h2>

            <p className="mt-3 text-gray-400">
              Follow sellers from their seller profile page.
            </p>

            <Link
              href="/"
              className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
            >
              Browse Marketplace
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredFollowing.map((row) => {
              const seller = row.profiles;
              if (!seller) return null;

              const sellerDisplayName =
                seller.seller_name ||
                seller.username ||
                seller.email ||
                "Seller";

              return (
                <div
                  key={row.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/20"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-cyan-400/30 bg-cyan-400/10">
                      {seller.avatar_url ? (
                        <img
                          src={seller.avatar_url}
                          alt={sellerDisplayName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-3xl font-black text-cyan-300">
                          {sellerDisplayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div>
                      <h2 className="text-2xl font-black">
                        {sellerDisplayName}
                      </h2>

                      <p className="mt-1 text-sm text-green-300">
                        {seller.seller_status === "approved"
                          ? "Verified Seller"
                          : "Seller"}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        Following since {formatDate(row.created_at)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 line-clamp-3 text-sm leading-6 text-gray-300">
                    {seller.bio ||
                      "Trusted ComePlayers seller offering gaming products and services."}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Link
                      href={`/seller-profile/${seller.id}`}
                      className="rounded-2xl border border-cyan-400 px-4 py-3 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
                    >
                      View Seller
                    </Link>

                    <button
                      onClick={() => unfollowSeller(row.id)}
                      disabled={unfollowingId === row.id}
                      className="rounded-2xl border border-red-400/40 px-4 py-3 font-black text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-60"
                    >
                      {unfollowingId === row.id ? "Removing..." : "Unfollow"}
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
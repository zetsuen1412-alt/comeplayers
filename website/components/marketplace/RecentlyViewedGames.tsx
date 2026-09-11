"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaGamepad, FaHistory, FaShoppingBag } from "react-icons/fa";
import { supabase } from "@/lib/supabase";

type RecentlyViewedGameRow = {
  id: number;
  game_id: number | null;
  game_slug: string;
  game_name: string;
  image_url: string | null;
  viewed_at: string;
};

function fallbackImage(gameName: string) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    gameName || "ComePlayers Game"
  )}`;
}

export default function RecentlyViewedGames() {
  const [rows, setRows] = useState<RecentlyViewedGameRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentlyViewedGames() {
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
        .from("recently_viewed_games")
        .select("id,game_id,game_slug,game_name,image_url,viewed_at")
        .eq("user_id", user.id)
        .order("viewed_at", { ascending: false })
        .limit(8);

      if (cancelled) return;

      if (error) {
        console.warn("Failed to load recently viewed games:", error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data || []) as RecentlyViewedGameRow[]);
      setLoading(false);
    }

    loadRecentlyViewedGames();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleRows = useMemo(() => rows.slice(0, 4), [rows]);

  if (loading) return null;
  if (visibleRows.length === 0) return null;

  return (
    <section className="px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-black text-violet-300">
            <FaHistory /> Game History
          </p>

          <h2 className="text-3xl font-black sm:text-4xl">
            Recently Viewed Games
          </h2>

          <p className="mt-2 text-gray-300">
            Jump back into game marketplaces you checked recently.
          </p>
        </div>

        <Link
          href="/games"
          className="inline-flex w-full justify-center rounded-full border border-cyan-400 px-5 py-3 font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black sm:w-auto"
        >
          Browse Games
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-4">
        {visibleRows.map((row) => {
          const imageUrl = row.image_url || fallbackImage(row.game_name);
          const gameHref = `/games/${row.game_slug}`;
          const offersHref = `/games/${row.game_slug}/offers`;

          return (
            <div
              key={row.id}
              className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-violet-400 hover:bg-violet-950/20"
            >
              <Link href={gameHref} className="block">
                <div className="relative h-44 bg-black">
                  <Image
                    src={imageUrl}
                    alt={row.game_name}
                    fill
                    className="object-cover transition group-hover:scale-105"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />

                  <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-violet-400 px-3 py-1 text-xs font-black text-black">
                    <FaGamepad /> Game
                  </span>
                </div>

                <div className="p-5">
                  <h3 className="line-clamp-2 text-xl font-black group-hover:text-violet-300 sm:text-2xl">
                    {row.game_name}
                  </h3>

                  <p className="mt-2 text-sm text-gray-400">
                    Continue browsing this marketplace.
                  </p>
                </div>
              </Link>

              <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
                <Link
                  href={gameHref}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-center text-sm font-black text-white transition hover:border-violet-400 hover:text-violet-300"
                >
                  Game Page
                </Link>

                <Link
                  href={offersHref}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-black transition hover:bg-cyan-300"
                >
                  <FaShoppingBag /> Offers
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

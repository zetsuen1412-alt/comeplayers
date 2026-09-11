"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Game = {
  id: number;
  name: string;
  slug: string;
  offer_count: number;
  is_trending: boolean;
  rating: number;
};

export default function GameSearchAutocomplete() {
  const [query, setQuery] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setGames([]);
        return;
      }

      const res = await fetch(`/api/games/search?q=${encodeURIComponent(query)}`);
      const json = await res.json();

      setGames(json.games || []);
      setOpen(true);
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search 5.000+ games..."
        className="w-full rounded-full border border-cyan-400/30 bg-black/50 px-5 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
      />

      {open && games.length > 0 ? (
        <div className="absolute left-0 right-0 top-14 z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl shadow-black">
          {games.map((game) => (
            <Link
              key={game.id}
              href={`/games/${game.slug}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/10"
            >
              <div>
                <p className="font-bold text-white">{game.name}</p>
                <p className="text-xs text-slate-400">
                  {game.offer_count || 0} offers
                  {game.rating ? ` • ★ ${Number(game.rating).toFixed(1)}` : ""}
                </p>
              </div>

              {game.is_trending ? (
                <span className="rounded-full bg-cyan-400 px-2 py-1 text-xs font-black text-black">
                  Trending
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import GameCard from "./GameCard";

type Game = {
  id: number;
  name: string;
  slug: string;
  image_url?: string | null;
  cover_image_url?: string | null;
  background_image?: string | null;
  offer_count: number;
  is_trending: boolean;
  rating?: number | null;
  trend_score?: number | null;
};

export default function TrendingGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadTrending = async () => {
      try {
        setError("");
        const response = await fetch("/api/games/trending", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load trending games.");
        }

        const payload = await response.json();
        setGames(payload.games || []);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }

        console.error("Trending games error:", requestError);
        setError("Trending games are unavailable right now.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadTrending();

    return () => controller.abort();
  }, []);

  if (loading) return <p className="text-slate-400">Loading trending games...</p>;
  if (error) return <p className="text-slate-400">{error}</p>;
  if (games.length === 0) return <p className="text-slate-400">No trending games yet.</p>;

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {games.map((game) => (
        <GameCard key={game.id} game={game} />
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type GameMasterSelectProps = {
  value: string;
  onChange: (slug: string, name: string) => void;
};

type Game = {
  id: number;
  name: string;
  slug: string;
};

export default function GameMasterSelect({ value, onChange }: GameMasterSelectProps) {
  const [query, setQuery] = useState("");
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setGames([]);
        return;
      }
      const response = await fetch(`/api/games/search?q=${encodeURIComponent(query)}`);
      const payload = await response.json();
      setGames(payload.games || []);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <input value={query || value} onChange={(event) => setQuery(event.target.value)} placeholder="Search master game..." className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-cyan-400" />
      {games.length > 0 ? (
        <div className="absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-white/10 bg-[#0b1220] shadow-2xl">
          {games.map((game) => (
            <button key={game.id} type="button" onClick={() => { onChange(game.slug, game.name); setQuery(game.name); setGames([]); }} className="block w-full px-4 py-3 text-left text-white hover:bg-white/10">
              {game.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

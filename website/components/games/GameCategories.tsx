"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Category = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
};

export default function GameCategories() {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const loadCategories = async () => {
      const response = await fetch("/api/game-categories");
      const payload = await response.json();
      setCategories(payload.categories || []);
    };
    void loadCategories();
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => (
        <Link key={category.id} href={`/games?category=${category.slug}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-cyan-400 hover:bg-cyan-400/10">
          <div className="text-3xl">{category.icon || "🎮"}</div>
          <h3 className="mt-4 text-xl font-black text-white">{category.name}</h3>
          <p className="mt-2 text-sm text-slate-400">{category.description}</p>
        </Link>
      ))}
    </div>
  );
}

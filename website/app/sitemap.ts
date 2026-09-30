import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://comeplayers.com"
).replace(/\/$/, "");

const NOW = new Date();

function absoluteUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

type SitemapEntry = MetadataRoute.Sitemap[number];

type GameSitemapRow = {
  slug: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type ProductSitemapRow = {
  id: number;
  slug: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type CategorySitemapRow = {
  slug: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function lastModified(row?: { updated_at?: string | null; created_at?: string | null }) {
  const rawDate = row?.updated_at || row?.created_at;
  return rawDate ? new Date(rawDate) : NOW;
}

function staticRoutes(): SitemapEntry[] {
  return [
    {
      url: absoluteUrl("/"),
      lastModified: NOW,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/games"),
      lastModified: NOW,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: absoluteUrl("/search"),
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];
}

async function gameRoutes(): Promise<SitemapEntry[]> {
  const { data, error } = await supabase
    .from("game_master")
    .select("slug,updated_at,created_at")
    .eq("status", "active")
    .eq("is_active", true)
    .not("slug", "is", null)
    .order("offer_count", { ascending: false })
    .limit(5000);

  if (error || !data) return [];

  return (data as GameSitemapRow[])
    .filter((game) => Boolean(game.slug))
    .flatMap((game) => [
      {
        url: absoluteUrl(`/games/${game.slug}`),
        lastModified: lastModified(game),
        changeFrequency: "daily" as const,
        priority: 0.85,
      },
      {
        url: absoluteUrl(`/games/${game.slug}/offers`),
        lastModified: lastModified(game),
        changeFrequency: "daily" as const,
        priority: 0.8,
      },
    ]);
}

async function productRoutes(): Promise<SitemapEntry[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id,slug,updated_at,created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error || !data) return [];

  return (data as ProductSitemapRow[]).map((product) => ({
    url: absoluteUrl(`/product/${product.slug || product.id}`),
    lastModified: lastModified(product),
    changeFrequency: "daily" as const,
    priority: 0.75,
  }));
}

async function categoryRoutes(): Promise<SitemapEntry[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("slug,updated_at,created_at")
    .eq("is_active", true)
    .not("slug", "is", null)
    .order("id", { ascending: true });

  if (error || !data) return [];

  return (data as CategorySitemapRow[])
    .filter((category) => Boolean(category.slug))
    .map((category) => ({
      url: absoluteUrl(`/games?category=${encodeURIComponent(category.slug || "")}`),
      lastModified: lastModified(category),
      changeFrequency: "daily" as const,
      priority: 0.75,
    }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [games, products, categories] = await Promise.all([
    gameRoutes(),
    productRoutes(),
    categoryRoutes(),
  ]);

  return [...staticRoutes(), ...categories, ...games, ...products];
}

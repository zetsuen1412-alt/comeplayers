import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

type SteamApp = {
  appid: number;
  name: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeName(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function getFirstLetter(value: string) {
  const first = value.trim().charAt(0).toUpperCase();
  return /^[A-Z0-9]$/.test(first) ? first : "#";
}

function isLikelyGame(name: string) {
  const lower = name.toLowerCase();

  if (name.length < 2) return false;

  const blocked = [
    " dedicated server",
    " soundtrack",
    " ost",
    " music pack",
    " trailer",
    " demo",
    " beta",
    " test server",
    " editor",
    " sdk",
    " tool",
    " wallpaper",
    " artbook",
    " art book",
    " manual",
    " guide",
    " preorder",
    " pre-order",
    " playtest",
    " server",
    " dlc",
    " expansion pass",
    " season pass",
    " bonus content",
  ];

  return !blocked.some((word) => lower.includes(word));
}

async function main() {
  console.log("Fetching Steam app list...");

  const response = await fetch(
    "https://api.steampowered.com/ISteamApps/GetAppList/v0002/?format=json"
  );

  if (!response.ok) {
    throw new Error(`Steam API failed: ${response.status}`);
  }

  const payload = await response.json();
  const apps: SteamApp[] = payload?.applist?.apps || [];

  const seen = new Set<string>();

  const rows = apps
    .filter((app) => app.name && isLikelyGame(app.name))
    .map((app) => {
      const name = app.name.trim();
      const slug = slugify(name);
      const firstLetter = getFirstLetter(name);

      return {
        name,
        slug,
        first_letter: firstLetter,
        status: "active",

        image_url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.appid}/header.jpg`,
        icon_url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.appid}/capsule_184x69.jpg`,
        logo_url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.appid}/logo.png`,

        normalized_name: normalizeName(name),

        steam_app_id: app.appid,
        cover_image_url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.appid}/header.jpg`,
        banner_image_url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.appid}/library_hero.jpg`,

        source: "steam",
        source_url: `https://store.steampowered.com/app/${app.appid}`,

        offer_count: 0,
        search_count: 0,
        is_trending: false,
        is_featured: false,
        is_active: true,

        metadata: {
          steam_app_id: app.appid,
          imported_from: "steam_app_list",
        },
      };
    })
    .filter((row) => {
      if (!row.slug || seen.has(row.slug)) return false;
      seen.add(row.slug);
      return true;
    })
    .slice(0, Number(process.env.GAME_SEED_LIMIT || 5000));

  console.log(`Prepared ${rows.length} rows.`);

  const batchSize = 500;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);

    const { error } = await supabase.from("game_master").upsert(batch, {
      onConflict: "slug",
    });

    if (error) {
      console.error("Batch failed:", index, error.message);
      throw error;
    }

    console.log(
      `Imported ${Math.min(index + batchSize, rows.length)} / ${rows.length}`
    );
  }

  const trendingNames = [
    "Counter-Strike 2",
    "Dota 2",
    "Apex Legends",
    "PUBG: BATTLEGROUNDS",
    "Grand Theft Auto V",
    "Warframe",
    "Team Fortress 2",
    "Rust",
    "ELDEN RING",
    "Baldur's Gate 3",
  ];

  for (const trendingName of trendingNames) {
    const { data } = await supabase
      .from("game_master")
      .select("id, offer_count")
      .ilike("name", trendingName)
      .limit(1)
      .maybeSingle();

    if (!data?.id) continue;

    const offerCount =
      data.offer_count && data.offer_count > 0
        ? data.offer_count
        : Math.floor(Math.random() * 900) + 100;

    await supabase
      .from("game_master")
      .update({
        is_trending: true,
        is_featured: true,
        offer_count: offerCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    await supabase.from("game_trending_snapshots").insert({
      game_id: data.id,
      score: offerCount,
      source: "steam_seed",
    });
  }

  console.log("Done importing Steam games.");
}

void main();
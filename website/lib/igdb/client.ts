import type { IgdbGame } from "@/lib/igdb/types";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_BASE_URL = "https://api.igdb.com/v4";
const MIN_REQUEST_INTERVAL_MS = 275;
const MAX_RETRIES = 3;

let cachedToken: { value: string; expiresAt: number } | null = null;
let lastRequestAt = 0;
let requestChain: Promise<void> = Promise.resolve();

function requiredEnv(name: "TWITCH_CLIENT_ID" | "TWITCH_CLIENT_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  const previous = requestChain;
  let release: (() => void) | undefined;

  requestChain = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  const waitMs = Math.max(
    0,
    MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt)
  );

  if (waitMs > 0) await sleep(waitMs);
  lastRequestAt = Date.now();
  release?.();
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const clientId = requiredEnv("TWITCH_CLIENT_ID");
  const clientSecret = requiredEnv("TWITCH_CLIENT_SECRET");
  const url = new URL(TWITCH_TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    message?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.message || `Twitch token request failed with ${response.status}.`
    );
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
  };

  return cachedToken.value;
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after") || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return Math.min(4_000, 500 * 2 ** attempt);
}

export async function igdbRequest<T>(endpoint: string, query: string): Promise<T> {
  if (process.env.IGDB_SYNC_ENABLED?.trim().toLowerCase() !== "true") {
    throw new Error("IGDB sync is disabled. Set IGDB_SYNC_ENABLED=true.");
  }

  const clientId = requiredEnv("TWITCH_CLIENT_ID");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await waitForRateLimit();
    const token = await getAccessToken();
    const response = await fetch(`${IGDB_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
      },
      body: query,
      cache: "no-store",
    });

    if (response.status === 401 && attempt < MAX_RETRIES) {
      cachedToken = null;
      continue;
    }

    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      await sleep(retryDelay(response, attempt));
      continue;
    }

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `IGDB ${endpoint} request failed with ${response.status}: ${text.slice(0, 500)}`
      );
    }

    return JSON.parse(text) as T;
  }

  throw new Error(`IGDB ${endpoint} request exhausted all retries.`);
}

const GAME_FIELDS = [
  "id",
  "name",
  "slug",
  "summary",
  "storyline",
  "first_release_date",
  "updated_at",
  "checksum",
  "game_type",
  "game_status",
  "rating",
  "rating_count",
  "aggregated_rating",
  "aggregated_rating_count",
  "total_rating",
  "total_rating_count",
  "hypes",
  "cover.image_id",
  "artworks.image_id",
  "screenshots.image_id",
  "genres.id",
  "genres.name",
  "genres.slug",
  "platforms.id",
  "platforms.name",
  "platforms.slug",
  "platforms.abbreviation",
  "involved_companies.developer",
  "involved_companies.publisher",
  "involved_companies.company.id",
  "involved_companies.company.name",
  "external_games.external_game_source.id",
  "external_games.external_game_source.name",
  "external_games.uid",
  "external_games.url",
  "websites.type.id",
  "websites.type.name",
  "websites.url",
].join(",");

export async function fetchPopularIgdbGames(input: {
  limit: number;
  offset?: number;
  gameTypes?: number[];
}) {
  const limit = Math.max(1, Math.min(500, Math.floor(input.limit)));
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const gameTypes = input.gameTypes?.length ? input.gameTypes : [0];
  const typeFilter = gameTypes.length === 1
    ? `game_type = ${gameTypes[0]}`
    : `game_type = (${gameTypes.join(",")})`;

  const query = [
    `fields ${GAME_FIELDS};`,
    `where version_parent = null & cover != null & ${typeFilter};`,
    "sort total_rating_count desc;",
    `limit ${limit};`,
    `offset ${offset};`,
  ].join("\n");

  return igdbRequest<IgdbGame[]>("games", query);
}

export async function fetchIgdbGamesByIds(ids: number[]) {
  const uniqueIds = Array.from(
    new Set(ids.filter((id) => Number.isInteger(id) && id > 0))
  ).slice(0, 500);

  if (uniqueIds.length === 0) return [];

  const query = [
    `fields ${GAME_FIELDS};`,
    `where id = (${uniqueIds.join(",")});`,
    `limit ${uniqueIds.length};`,
  ].join("\n");

  return igdbRequest<IgdbGame[]>("games", query);
}

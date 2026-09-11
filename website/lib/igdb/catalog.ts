import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchIgdbGamesByIds, fetchPopularIgdbGames } from "@/lib/igdb/client";
import type {
  GameMasterProviderRow,
  IgdbCandidate,
  IgdbGame,
  IgdbImportCandidateRow,
  IgdbMatch,
  IgdbNamedEntity,
} from "@/lib/igdb/types";

const MANAGED_FIELDS = [
  "name",
  "slug",
  "description",
  "image_url",
  "cover_image_url",
  "background_image",
  "released",
  "rating",
  "genres",
  "platforms",
] as const;

type ManagedField = (typeof MANAGED_FIELDS)[number];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function normalizeGameName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function namedEntity(value: IgdbNamedEntity | number): IgdbNamedEntity | null {
  if (!value || typeof value === "number") return null;
  if (!Number.isInteger(value.id) || !value.name) return null;
  return value;
}

function imageId(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { image_id?: unknown };
  return typeof candidate.image_id === "string" && candidate.image_id
    ? candidate.image_id
    : null;
}

export function igdbImageUrl(
  image: unknown,
  size: "cover_big" | "1080p" = "cover_big"
) {
  const id = imageId(image);
  return id
    ? `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`
    : null;
}

function unixDate(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString().slice(0, 10);
}

function unixTimestamp(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function firstImage(values: unknown[] | null | undefined, size: "cover_big" | "1080p") {
  for (const value of values || []) {
    const url = igdbImageUrl(value, size);
    if (url) return url;
  }
  return null;
}

function entityReference(value: number | IgdbNamedEntity | null | undefined) {
  if (typeof value === "number") {
    return { id: value, name: null as string | null };
  }
  if (value && typeof value === "object") {
    return {
      id: Number(value.id) || null,
      name: value.name || null,
    };
  }
  return { id: null, name: null as string | null };
}

export function mapIgdbGame(game: IgdbGame): IgdbCandidate {
  const name = String(game.name || "").trim();
  if (!name || !Number.isInteger(game.id)) {
    throw new Error("Invalid IGDB game payload.");
  }

  const coverUrl = igdbImageUrl(game.cover, "cover_big");
  const backgroundUrl =
    firstImage(game.artworks as unknown[] | null, "1080p") ||
    firstImage(game.screenshots as unknown[] | null, "1080p") ||
    coverUrl;

  const genres = (game.genres || [])
    .map(namedEntity)
    .filter((value): value is IgdbNamedEntity => Boolean(value))
    .map((genre) => ({
      id: genre.id,
      name: genre.name,
      slug: genre.slug || slugify(genre.name),
    }));

  const platforms = (game.platforms || [])
    .map(namedEntity)
    .filter((value): value is IgdbNamedEntity => Boolean(value))
    .map((platform) => ({
      id: platform.id,
      name: platform.name,
      slug: platform.slug || slugify(platform.name),
      abbreviation: platform.abbreviation || null,
    }));

  const developers: Array<{ id: number; name: string }> = [];
  const publishers: Array<{ id: number; name: string }> = [];

  for (const involvement of game.involved_companies || []) {
    if (!involvement || typeof involvement === "number") continue;
    const company = involvement.company;
    if (!company || typeof company === "number" || !company.name) continue;
    const mapped = { id: company.id, name: company.name };
    if (involvement.developer) developers.push(mapped);
    if (involvement.publisher) publishers.push(mapped);
  }

  const externalGames = (game.external_games || [])
    .filter(
      (value): value is Exclude<typeof value, number> =>
        Boolean(value) && typeof value !== "number"
    )
    .map((value) => {
      const source = entityReference(value.external_game_source);
      return {
        sourceId: source.id,
        sourceName: source.name,
        uid: value.uid || null,
        url: value.url || null,
      };
    });

  const websites = (game.websites || [])
    .filter(
      (value): value is Exclude<typeof value, number> =>
        Boolean(value) && typeof value !== "number" && Boolean(value.url)
    )
    .map((value) => {
      const type = entityReference(value.type);
      return {
        typeId: type.id,
        typeName: type.name,
        url: String(value.url),
      };
    });

  const providerRating = Number(game.total_rating ?? game.rating ?? 0);
  const marketplaceRating = Math.max(0, Math.min(5, providerRating / 20));

  return {
    igdbId: game.id,
    name,
    slug: slugify(game.slug || name),
    normalizedName: normalizeGameName(name),
    summary: game.summary?.trim() || game.storyline?.trim() || null,
    coverUrl,
    backgroundUrl,
    releaseDate: unixDate(game.first_release_date),
    providerUpdatedAt: unixTimestamp(game.updated_at),
    checksum: game.checksum || null,
    rating: marketplaceRating,
    providerRating,
    ratingCount: Number(game.total_rating_count ?? game.rating_count ?? 0),
    genres,
    platforms,
    developers,
    publishers,
    externalGames,
    websites,
    payload: game,
  };
}

function releaseYear(value: string | null | undefined) {
  const year = Number(String(value || "").slice(0, 4));
  return Number.isInteger(year) && year > 1900 ? year : null;
}

function platformNames(value: unknown) {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(
    value
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const row = item as { name?: unknown; abbreviation?: unknown };
        return normalizeGameName(
          String(row.abbreviation || row.name || "")
        );
      })
      .filter(Boolean)
  );
}

export function findBestIgdbMatch(
  candidate: IgdbCandidate,
  existingGames: GameMasterProviderRow[]
): IgdbMatch {
  let best: IgdbMatch = { gameId: null, score: 0, reason: "no_match" };
  const candidatePlatforms = platformNames(candidate.platforms);

  for (const game of existingGames) {
    if (Number(game.igdb_id) === candidate.igdbId) {
      return { gameId: game.id, score: 100, reason: "igdb_id" };
    }

    let score = 0;
    const reasons: string[] = [];
    const gameNormalized = normalizeGameName(
      game.normalized_name || game.name || ""
    );

    if (game.slug === candidate.slug) {
      score += 70;
      reasons.push("slug");
    }

    if (gameNormalized === candidate.normalizedName) {
      score += 65;
      reasons.push("normalized_name");
    }

    const currentYear = releaseYear(game.released);
    const candidateYear = releaseYear(candidate.releaseDate);
    if (currentYear && candidateYear && currentYear === candidateYear) {
      score += 12;
      reasons.push("release_year");
    }

    const existingPlatforms = platformNames(game.platforms);
    if (
      candidatePlatforms.size > 0 &&
      Array.from(candidatePlatforms).some((platform) =>
        existingPlatforms.has(platform)
      )
    ) {
      score += 10;
      reasons.push("platform");
    }

    if (score > best.score) {
      best = {
        gameId: score >= 65 ? game.id : null,
        score,
        reason: reasons.join("+") || "weak_match",
      };
    }
  }

  return best;
}

function isBlank(value: unknown) {
  return value === null || value === undefined || value === "";
}

function shouldFill(
  existing: GameMasterProviderRow,
  field: ManagedField,
  overrides: Set<string>
) {
  return !overrides.has(field) && isBlank(existing[field]);
}

export function buildProviderUpdate(
  existing: GameMasterProviderRow,
  candidate: IgdbCandidate
) {
  const overrides = new Set(existing.local_override_fields || []);
  const update: Record<string, unknown> = {
    igdb_id: candidate.igdbId,
    provider_source: "igdb",
    provider_name: candidate.name,
    provider_slug: candidate.slug,
    provider_summary: candidate.summary,
    provider_cover_url: candidate.coverUrl,
    provider_background_url: candidate.backgroundUrl,
    provider_release_date: candidate.releaseDate,
    provider_rating: candidate.providerRating,
    provider_checksum: candidate.checksum,
    provider_payload: candidate.payload,
    provider_updated_at: candidate.providerUpdatedAt,
    last_synced_at: new Date().toISOString(),
    sync_status: "matched",
    updated_at: new Date().toISOString(),
  };

  const liveValues: Record<ManagedField, unknown> = {
    name: candidate.name,
    slug: candidate.slug,
    description: candidate.summary,
    image_url: candidate.coverUrl,
    cover_image_url: candidate.coverUrl,
    background_image: candidate.backgroundUrl,
    released: candidate.releaseDate,
    rating: candidate.rating,
    genres: candidate.genres,
    platforms: candidate.platforms,
  };

  for (const field of MANAGED_FIELDS) {
    if (shouldFill(existing, field, overrides) && !isBlank(liveValues[field])) {
      update[field] = liveValues[field];
    }
  }

  if (shouldFill(existing, "name", overrides)) {
    update.normalized_name = candidate.normalizedName;
    update.first_letter = /^[A-Z0-9]$/.test(candidate.name.charAt(0).toUpperCase())
      ? candidate.name.charAt(0).toUpperCase()
      : "#";
  }

  return update;
}

export function buildNewGameInsert(candidate: IgdbCandidate) {
  return {
    igdb_id: candidate.igdbId,
    name: candidate.name,
    slug: candidate.slug,
    normalized_name: candidate.normalizedName,
    first_letter: /^[A-Z0-9]$/.test(candidate.name.charAt(0).toUpperCase())
      ? candidate.name.charAt(0).toUpperCase()
      : "#",
    status: "inactive",
    is_active: false,
    source: "igdb",
    source_url: `https://www.igdb.com/games/${candidate.slug}`,
    description: candidate.summary,
    image_url: candidate.coverUrl,
    cover_image_url: candidate.coverUrl,
    background_image: candidate.backgroundUrl,
    released: candidate.releaseDate,
    rating: candidate.rating,
    rating_top: 5,
    genres: candidate.genres,
    platforms: candidate.platforms,
    stores: [],
    offer_count: 0,
    search_count: 0,
    is_trending: false,
    is_featured: false,
    provider_source: "igdb",
    provider_name: candidate.name,
    provider_slug: candidate.slug,
    provider_summary: candidate.summary,
    provider_cover_url: candidate.coverUrl,
    provider_background_url: candidate.backgroundUrl,
    provider_release_date: candidate.releaseDate,
    provider_rating: candidate.providerRating,
    provider_checksum: candidate.checksum,
    provider_payload: candidate.payload,
    provider_updated_at: candidate.providerUpdatedAt,
    last_synced_at: new Date().toISOString(),
    sync_status: "imported",
    local_override_fields: [],
    metadata: {
      igdb_id: candidate.igdbId,
      igdb_developers: candidate.developers,
      igdb_publishers: candidate.publishers,
      igdb_external_games: candidate.externalGames,
      igdb_websites: candidate.websites,
      imported_from: "igdb",
    },
    updated_at: new Date().toISOString(),
  };
}

async function loadPotentialMatches(
  supabaseAdmin: SupabaseClient,
  candidates: IgdbCandidate[]
) {
  const igdbIds = candidates.map((candidate) => candidate.igdbId);
  const slugs = candidates.map((candidate) => candidate.slug);
  const names = candidates.map((candidate) => candidate.normalizedName);
  const result = new Map<number, GameMasterProviderRow>();

  const queries = [
    supabaseAdmin
      .from("game_master")
      .select("id,name,slug,normalized_name,source,igdb_id,rawg_id,description,image_url,cover_image_url,background_image,released,rating,genres,platforms,local_override_fields")
      .in("igdb_id", igdbIds),
    supabaseAdmin
      .from("game_master")
      .select("id,name,slug,normalized_name,source,igdb_id,rawg_id,description,image_url,cover_image_url,background_image,released,rating,genres,platforms,local_override_fields")
      .in("slug", slugs),
    supabaseAdmin
      .from("game_master")
      .select("id,name,slug,normalized_name,source,igdb_id,rawg_id,description,image_url,cover_image_url,background_image,released,rating,genres,platforms,local_override_fields")
      .in("normalized_name", names),
  ];

  const responses = await Promise.all(queries);
  for (const response of responses) {
    if (response.error) throw new Error(response.error.message);
    for (const row of (response.data || []) as GameMasterProviderRow[]) {
      result.set(row.id, row);
    }
  }

  return Array.from(result.values());
}

async function createRun(
  supabaseAdmin: SupabaseClient,
  action: string,
  requestedLimit: number,
  metadata: Record<string, unknown> = {}
) {
  const { data, error } = await supabaseAdmin
    .from("igdb_sync_runs")
    .insert({
      action,
      status: "running",
      requested_limit: requestedLimit,
      metadata,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return Number(data.id);
}

async function finishRun(
  supabaseAdmin: SupabaseClient,
  runId: number,
  input: {
    status: "completed" | "failed";
    fetched?: number;
    staged?: number;
    matched?: number;
    imported?: number;
    failed?: number;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabaseAdmin
    .from("igdb_sync_runs")
    .update({
      status: input.status,
      fetched_count: input.fetched || 0,
      staged_count: input.staged || 0,
      matched_count: input.matched || 0,
      imported_count: input.imported || 0,
      failed_count: input.failed || 0,
      error_message: input.errorMessage || null,
      metadata: input.metadata || {},
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) throw new Error(error.message);
}

export async function stagePopularIgdbGames(input: {
  supabaseAdmin: SupabaseClient;
  limit: number;
  offset?: number;
  gameTypes?: number[];
}) {
  const runId = await createRun(
    input.supabaseAdmin,
    "stage",
    input.limit,
    { offset: input.offset || 0, gameTypes: input.gameTypes || [0] }
  );

  try {
    const payloads = await fetchPopularIgdbGames({
      limit: input.limit,
      offset: input.offset,
      gameTypes: input.gameTypes,
    });
    const candidates = payloads.map(mapIgdbGame);
    const matches = await loadPotentialMatches(input.supabaseAdmin, candidates);
    const igdbIds = candidates.map((candidate) => candidate.igdbId);
    const { data: existingCandidateRows, error: existingCandidateError } =
      await input.supabaseAdmin
        .from("igdb_import_candidates")
        .select("igdb_id,status")
        .in("igdb_id", igdbIds);

    if (existingCandidateError) throw new Error(existingCandidateError.message);

    const existingStatuses = new Map<number, string>(
      (existingCandidateRows || []).map((row) => [Number(row.igdb_id), String(row.status)])
    );

    const rows = candidates.map((candidate) => {
      const match = findBestIgdbMatch(candidate, matches);
      const previousStatus = existingStatuses.get(candidate.igdbId);
      const preservedStatus = ["approved", "rejected", "imported"].includes(
        previousStatus || ""
      )
        ? previousStatus
        : "pending";

      return {
        igdb_id: candidate.igdbId,
        status: preservedStatus,
        proposed_name: candidate.name,
        proposed_slug: candidate.slug,
        proposed_summary: candidate.summary,
        proposed_cover_url: candidate.coverUrl,
        proposed_background_url: candidate.backgroundUrl,
        proposed_release_date: candidate.releaseDate,
        proposed_rating: candidate.rating,
        proposed_genres: candidate.genres,
        proposed_platforms: candidate.platforms,
        match_game_id: match.gameId,
        match_score: match.score,
        match_reason: match.reason,
        provider_checksum: candidate.checksum,
        provider_updated_at: candidate.providerUpdatedAt,
        payload: candidate.payload,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await input.supabaseAdmin
      .from("igdb_import_candidates")
      .upsert(rows, { onConflict: "igdb_id" });

    if (error) throw new Error(error.message);

    const matched = rows.filter((row) => row.match_game_id).length;
    await finishRun(input.supabaseAdmin, runId, {
      status: "completed",
      fetched: candidates.length,
      staged: rows.length,
      matched,
    });

    return { runId, fetched: candidates.length, staged: rows.length, matched };
  } catch (error) {
    await finishRun(input.supabaseAdmin, runId, {
      status: "failed",
      failed: 1,
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

function rowToCandidate(row: IgdbImportCandidateRow) {
  return mapIgdbGame(row.payload);
}

export async function setIgdbCandidateStatus(input: {
  supabaseAdmin: SupabaseClient;
  candidateIds: number[];
  status: "approved" | "rejected";
  adminId: string;
  note?: string | null;
}) {
  const ids = Array.from(new Set(input.candidateIds.filter(Number.isInteger)));
  if (ids.length === 0) throw new Error("At least one candidate is required.");

  const { error } = await input.supabaseAdmin
    .from("igdb_import_candidates")
    .update({
      status: input.status,
      review_note: input.note?.trim() || null,
      reviewed_by: input.adminId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", ids)
    .in("status", ["pending", "approved", "rejected"]);

  if (error) throw new Error(error.message);
  return { updated: ids.length };
}

export async function applyApprovedIgdbCandidates(input: {
  supabaseAdmin: SupabaseClient;
  limit: number;
}) {
  const limit = Math.max(1, Math.min(250, Math.floor(input.limit)));
  const runId = await createRun(input.supabaseAdmin, "apply", limit);

  try {
    const { data, error } = await input.supabaseAdmin
      .from("igdb_import_candidates")
      .select("*")
      .eq("status", "approved")
      .order("id", { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    let imported = 0;
    let matched = 0;
    let failed = 0;

    for (const row of (data || []) as IgdbImportCandidateRow[]) {
      try {
        const candidate = rowToCandidate(row);
        let gameId = row.match_game_id;

        if (gameId) {
          const { data: existing, error: existingError } = await input.supabaseAdmin
            .from("game_master")
            .select("id,name,slug,normalized_name,source,igdb_id,rawg_id,description,image_url,cover_image_url,background_image,released,rating,genres,platforms,local_override_fields")
            .eq("id", gameId)
            .maybeSingle();

          if (existingError) throw new Error(existingError.message);
          if (!existing) throw new Error("Matched game no longer exists.");

          const { error: updateError } = await input.supabaseAdmin
            .from("game_master")
            .update(buildProviderUpdate(existing as GameMasterProviderRow, candidate))
            .eq("id", gameId);

          if (updateError) throw new Error(updateError.message);
          matched += 1;
        } else {
          const { data: inserted, error: insertError } = await input.supabaseAdmin
            .from("game_master")
            .insert(buildNewGameInsert(candidate))
            .select("id")
            .single();

          if (insertError) throw new Error(insertError.message);
          gameId = Number(inserted.id);
          imported += 1;
        }

        const { error: candidateUpdateError } = await input.supabaseAdmin
          .from("igdb_import_candidates")
          .update({
            status: "imported",
            imported_game_id: gameId,
            imported_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        if (candidateUpdateError) throw new Error(candidateUpdateError.message);
      } catch (rowError) {
        failed += 1;
        await input.supabaseAdmin
          .from("igdb_import_candidates")
          .update({
            status: "error",
            last_error:
              rowError instanceof Error ? rowError.message : String(rowError),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    }

    await finishRun(input.supabaseAdmin, runId, {
      status: "completed",
      fetched: (data || []).length,
      imported,
      matched,
      failed,
    });

    return { runId, processed: (data || []).length, imported, matched, failed };
  } catch (error) {
    await finishRun(input.supabaseAdmin, runId, {
      status: "failed",
      failed: 1,
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

export async function syncExistingIgdbGames(input: {
  supabaseAdmin: SupabaseClient;
  limit: number;
}) {
  const limit = Math.max(1, Math.min(500, Math.floor(input.limit)));
  const runId = await createRun(input.supabaseAdmin, "sync", limit);

  try {
    const { data: games, error } = await input.supabaseAdmin
      .from("game_master")
      .select("id,name,slug,normalized_name,source,igdb_id,rawg_id,description,image_url,cover_image_url,background_image,released,rating,genres,platforms,local_override_fields")
      .not("igdb_id", "is", null)
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    const ids = (games || []).map((game) => Number(game.igdb_id));
    const payloads = await fetchIgdbGamesByIds(ids);
    const candidates = new Map(
      payloads.map((game) => {
        const candidate = mapIgdbGame(game);
        return [candidate.igdbId, candidate] as const;
      })
    );

    let matched = 0;
    let failed = 0;

    for (const game of (games || []) as GameMasterProviderRow[]) {
      const candidate = candidates.get(Number(game.igdb_id));
      if (!candidate) {
        failed += 1;
        await input.supabaseAdmin
          .from("game_master")
          .update({ sync_status: "error", last_sync_error: "IGDB record not found." })
          .eq("id", game.id);
        continue;
      }

      const { error: updateError } = await input.supabaseAdmin
        .from("game_master")
        .update({
          ...buildProviderUpdate(game, candidate),
          last_sync_error: null,
        })
        .eq("id", game.id);

      if (updateError) {
        failed += 1;
        await input.supabaseAdmin
          .from("game_master")
          .update({ sync_status: "error", last_sync_error: updateError.message })
          .eq("id", game.id);
      } else {
        matched += 1;
      }
    }

    await finishRun(input.supabaseAdmin, runId, {
      status: "completed",
      fetched: payloads.length,
      matched,
      failed,
    });

    return { runId, requested: games?.length || 0, fetched: payloads.length, synced: matched, failed };
  } catch (error) {
    await finishRun(input.supabaseAdmin, runId, {
      status: "failed",
      failed: 1,
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

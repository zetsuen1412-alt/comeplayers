import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

type ImportRow = Record<string, unknown>;

type CategoryRow = {
  id: number;
  name: string;
  slug: string;
};

type ImportedGameRow = {
  id: number;
  slug: string;
  category_id: number | null;
};

type ExistingGame = {
  id: number;
  name: string;
  slug: string;
  category_id: number | null;
  status: string;
  image_url: string | null;
  icon_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  mobile_banner_url: string | null;
  background_url: string | null;
  hero_url: string | null;
  description: string | null;
  source: string;
  source_url: string | null;
  steam_app_id: number | null;
  is_featured: boolean;
  is_trending: boolean;
  sync_status: string;
  local_override_fields: string[];
};

const MAX_IMPORT_ROWS = 1000;
const CLEAR_TOKEN = "[CLEAR]";

const editableFields = [
  "name",
  "slug",
  "category_id",
  "status",
  "description",
  "image_url",
  "icon_url",
  "logo_url",
  "banner_url",
  "mobile_banner_url",
  "background_url",
  "hero_url",
  "source_url",
  "steam_app_id",
  "is_featured",
  "is_trending",
] as const;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function unprotectSpreadsheetFormula(value: unknown) {
  const valueText = text(value);
  return /^'[=+\-@]/.test(valueText) ? valueText.slice(1) : valueText;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function nullableText(value: unknown, previous: string | null) {
  const valueText = unprotectSpreadsheetFormula(value);
  if (!valueText) return previous;
  if (valueText.toUpperCase() === CLEAR_TOKEN) return null;
  return valueText;
}

function parseBoolean(value: unknown, previous: boolean) {
  const valueText = text(value).toLowerCase();
  if (!valueText) return previous;
  if (["true", "1", "yes", "y", "active"].includes(valueText)) return true;
  if (["false", "0", "no", "n", "inactive"].includes(valueText)) return false;
  throw new Error(`Invalid boolean value: ${text(value)}`);
}

function parseInteger(value: unknown, previous: number | null) {
  const valueText = text(value);
  if (!valueText) return previous;
  if (valueText.toUpperCase() === CLEAR_TOKEN) return null;
  const numberValue = Number(valueText);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`Invalid numeric value: ${valueText}`);
  }
  return numberValue;
}

function normalizeStatus(value: unknown, previous = "active") {
  const status = text(value).toLowerCase() || previous;
  if (!new Set(["active", "inactive"]).has(status)) {
    throw validationError(`Status must be active or inactive, not ${status}.`);
  }
  return status;
}

function validationError(message: string) {
  const error = new Error(message);
  Object.assign(error, { status: 400 });
  return error;
}

function publicError(error: unknown, fallback: string) {
  const status = adminErrorStatus(error);
  if (status < 500 && error instanceof Error) return error.message;
  console.error(fallback, error);
  return fallback;
}

async function fetchAllGames(
  supabaseAdmin: Awaited<ReturnType<typeof requireAdmin>>["supabaseAdmin"]
) {
  const pageSize = 1000;
  const result: Record<string, unknown>[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("game_master")
      .select(
        "id,name,slug,category_id,status,description,image_url,icon_url,logo_url,banner_url,mobile_banner_url,background_url,hero_url,source_url,steam_app_id,is_featured,is_trending"
      )
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    result.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return result;
}

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);

    const [{ data: categories, error: categoryError }, games] = await Promise.all([
      supabaseAdmin.from("categories").select("id,name,slug").order("name"),
      fetchAllGames(supabaseAdmin),
    ]);

    if (categoryError) throw new Error(categoryError.message);

    const categoryRows = (categories || []) as CategoryRow[];
    const categoryMap = new Map(
      categoryRows.map((category) => [Number(category.id), category])
    );

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      games: games.map((game) => {
        const category = categoryMap.get(Number(game.category_id || 0));
        return {
          ...game,
          category_slug: category?.slug || "",
          category_name: category?.name || "",
          description: game.description || "",
          image_url: game.image_url || "",
          icon_url: game.icon_url || "",
          logo_url: game.logo_url || "",
          banner_url: game.banner_url || "",
          mobile_banner_url: game.mobile_banner_url || "",
          background_url: game.background_url || "",
          hero_url: game.hero_url || "",
          source_url: game.source_url || "",
        };
      }),
    });
  } catch (error) {
    const status = adminErrorStatus(error);
    return NextResponse.json(
      { error: publicError(error, "The game catalog could not be exported.") },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as { rows?: ImportRow[] };
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "The CSV does not contain any data rows." }, { status: 400 });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_IMPORT_ROWS} games can be imported at once.` },
        { status: 400 }
      );
    }

    const { data: categories, error: categoryError } = await supabaseAdmin
      .from("categories")
      .select("id,name,slug");
    if (categoryError) throw new Error(categoryError.message);

    const categoryBySlug = new Map<string, number>();
    const categoryByName = new Map<string, number>();
    for (const category of categories || []) {
      categoryBySlug.set(String(category.slug).toLowerCase(), Number(category.id));
      categoryByName.set(String(category.name).toLowerCase(), Number(category.id));
    }

    const normalizedRows = rows.map((rawRow, index) => {
      const name = unprotectSpreadsheetFormula(rawRow.name || rawRow.game_name);
      if (!name) throw validationError(`Row ${index + 2}: name is required.`);

      const slug = slugify(
        unprotectSpreadsheetFormula(rawRow.slug || rawRow.game_slug) || name
      );
      if (!slug) throw validationError(`Row ${index + 2}: slug is invalid.`);

      const categoryValue = text(
        rawRow.category_slug || rawRow.category || rawRow.category_name
      );
      let importedCategoryIds: number[] | null | undefined;
      if (categoryValue) {
        if (categoryValue.toUpperCase() === CLEAR_TOKEN) {
          importedCategoryIds = null;
        } else {
          const categoryValues = Array.from(
            new Set(
              categoryValue
                .split(/[|;,]+/)
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean)
            )
          );

          importedCategoryIds = categoryValues.map((value) => {
            const categoryId =
              categoryBySlug.get(slugify(value)) ||
              categoryByName.get(value);
            if (!categoryId) {
              throw validationError(
                `Row ${index + 2}: category "${value}" was not found.`
              );
            }
            return categoryId;
          });

          if (importedCategoryIds.length === 0) {
            importedCategoryIds = undefined;
          }
        }
      }

      return { rawRow, name, slug, importedCategoryIds, rowNumber: index + 2 };
    });

    const duplicateSlugs = normalizedRows
      .map((row) => row.slug)
      .filter((slug, index, all) => all.indexOf(slug) !== index);
    if (duplicateSlugs.length > 0) {
      throw validationError(
        `CSV memiliki slug duplikat: ${Array.from(new Set(duplicateSlugs)).join(", ")}.`
      );
    }

    const existingGames = new Map<string, ExistingGame>();
    const slugs = normalizedRows.map((row) => row.slug);
    const chunkSize = 150;

    for (let start = 0; start < slugs.length; start += chunkSize) {
      const chunk = slugs.slice(start, start + chunkSize);
      const { data, error } = await supabaseAdmin
        .from("game_master")
        .select(
          "id,name,slug,category_id,status,image_url,icon_url,logo_url,banner_url,mobile_banner_url,background_url,hero_url,description,source,source_url,steam_app_id,is_featured,is_trending,sync_status,local_override_fields"
        )
        .in("slug", chunk);
      if (error) throw new Error(error.message);
      for (const game of data || []) {
        existingGames.set(String(game.slug), game as ExistingGame);
      }
    }

    const now = new Date().toISOString();
    const upsertRows = normalizedRows.map(({ rawRow, name, slug, importedCategoryIds, rowNumber }) => {
      const previous = existingGames.get(slug);
      const status = normalizeStatus(rawRow.status, previous?.status || "active");
      const categoryId =
        importedCategoryIds === undefined
          ? previous?.category_id ?? null
          : importedCategoryIds === null
            ? null
            : importedCategoryIds[0] ?? previous?.category_id ?? null;

      let steamAppId: number | null;
      let isFeatured: boolean;
      let isTrending: boolean;

      try {
        steamAppId = parseInteger(rawRow.steam_app_id, previous?.steam_app_id ?? null);
        isFeatured = parseBoolean(rawRow.is_featured, previous?.is_featured ?? false);
        isTrending = parseBoolean(rawRow.is_trending, previous?.is_trending ?? false);
      } catch (error) {
        throw validationError(
          `Row ${rowNumber}: ${error instanceof Error ? error.message : "invalid value"}`
        );
      }

      const overrideFields = new Set(previous?.local_override_fields || []);
      for (const field of editableFields) {
        if (text(rawRow[field]) || field === "name" || field === "slug") {
          overrideFields.add(field);
        }
      }
      if (importedCategoryIds !== undefined) overrideFields.add("category_id");

      return {
        name,
        slug,
        normalized_name: name.toLowerCase().trim(),
        first_letter: name.charAt(0).toUpperCase(),
        category_id: categoryId,
        status,
        is_active: status === "active",
        description: nullableText(rawRow.description, previous?.description ?? null),
        image_url: nullableText(rawRow.image_url, previous?.image_url ?? null),
        icon_url: nullableText(rawRow.icon_url, previous?.icon_url ?? null),
        logo_url: nullableText(rawRow.logo_url, previous?.logo_url ?? null),
        banner_url: nullableText(rawRow.banner_url, previous?.banner_url ?? null),
        mobile_banner_url: nullableText(
          rawRow.mobile_banner_url,
          previous?.mobile_banner_url ?? null
        ),
        background_url: nullableText(
          rawRow.background_url,
          previous?.background_url ?? null
        ),
        hero_url: nullableText(rawRow.hero_url, previous?.hero_url ?? null),
        source: previous?.source || "manual",
        source_url: nullableText(rawRow.source_url, previous?.source_url ?? null),
        steam_app_id: steamAppId,
        is_featured: isFeatured,
        is_trending: isTrending,
        sync_status: previous?.sync_status || "manual",
        local_override_fields: Array.from(overrideFields),
        updated_at: now,
      };
    });

    const { data: importedGames, error: importError } = await supabaseAdmin
      .from("game_master")
      .upsert(upsertRows, { onConflict: "slug" })
      .select("id,slug,category_id");
    if (importError) throw new Error(importError.message);

    const importedGameRows = (importedGames || []) as ImportedGameRow[];
    const importedGameBySlug = new Map(
      importedGameRows.map((game) => [game.slug, game])
    );
    const categoryMappings = normalizedRows.flatMap((row) => {
      const game = importedGameBySlug.get(row.slug);
      if (!game) return [];

      const categoryIds =
        row.importedCategoryIds === undefined
          ? game.category_id
            ? [Number(game.category_id)]
            : []
          : row.importedCategoryIds === null
            ? []
            : row.importedCategoryIds;

      return categoryIds.map((categoryId) => ({
        category_id: Number(categoryId),
        game_master_id: Number(game.id),
        status: "active",
        sort_order: 0,
      }));
    });

    if (categoryMappings.length > 0) {
      const { error: mappingError } = await supabaseAdmin
        .from("category_game_master")
        .upsert(categoryMappings, {
          onConflict: "category_id,game_master_id",
        });
      if (mappingError) throw new Error(mappingError.message);
    }

    const updated = normalizedRows.filter((row) => existingGames.has(row.slug)).length;
    const inserted = normalizedRows.length - updated;

    await recordAdminAudit({
      adminId: user.id,
      action: "game.catalog.csv.import",
      entityType: "game_master",
      metadata: {
        total: normalizedRows.length,
        inserted,
        updated,
        mapped_categories: categoryMappings.length,
        slugs: normalizedRows.slice(0, 50).map((row) => row.slug),
      },
    });

    return NextResponse.json({
      ok: true,
      total: normalizedRows.length,
      inserted,
      updated,
      mappedCategories: categoryMappings.length,
    });
  } catch (error) {
    const status = adminErrorStatus(error);
    return NextResponse.json(
      { error: publicError(error, "The game catalog import failed.") },
      { status }
    );
  }
}

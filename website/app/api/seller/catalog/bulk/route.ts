import { NextResponse } from "next/server";
import { createCsv } from "@/lib/csv";
import { createSimpleXlsx } from "@/lib/simpleXlsx";
import { parseDeliveryEtaMinutes, resolveBulkListingStatus } from "@/lib/bulkListingSpreadsheet";
import {
  convertCurrencyToUsd,
  fallbackExchangeRateMap,
  fetchFrankfurterRates,
  type ExchangeRateMap,
} from "@/lib/frankfurter";
import {
  CURRENCY_OPTIONS,
  type SupportedCurrency,
} from "@/lib/localization";
import { formatDeliveryEta, SELLER_SLA_OPTIONS } from "@/lib/sellerServiceLevel";
import { evaluateProductPolicy, type ProductPolicyResult } from "@/lib/prohibitedProducts";
import {
  createProductPolicyReview,
  loadProductPolicyRules,
  supersedePendingProductPolicyReviews,
} from "@/lib/productPolicyServer";
import {
  requireApprovedSeller,
  sellerErrorStatus,
} from "@/lib/sellerSecurity";

const BULK_LIMIT = 200;
export const runtime = "nodejs";
const CATEGORY_OPTIONS = [
  "Game Accounts",
  "Game Coins",
  "Game Items",
  "Boosting",
  "Top Up",
  "Gift Cards",
  "Skins",
  "Software",
] as const;
const PLATFORM_OPTIONS = ["Any", "PC", "XBOX", "Nintendo", "Playstation"] as const;
const DELIVERY_ETA_OPTIONS = SELLER_SLA_OPTIONS.map(formatDeliveryEta);
const DELIVERY_ETA_MINUTES = new Set<number>(SELLER_SLA_OPTIONS);
const CURRENCY_CODES = new Set<SupportedCurrency>(
  CURRENCY_OPTIONS.map((option) => option.currency)
);
const CURRENCY_INPUT_OPTIONS = CURRENCY_OPTIONS.map(
  (option) => `${option.label} (${option.currency})`
);
const CSV_HEADERS = [
  "category",
  "game",
  "product_title",
  "currency",
  "price",
  "stock",
  "delivery_eta",
  "region",
  "platform",
  "server_realm",
  "description",
];

const XLSX_COLUMNS = [
  { header: "Category", width: 20 },
  { header: "Game", width: 26 },
  { header: "Product Title", width: 34 },
  { header: "Currency", width: 24 },
  { header: "Price", width: 16 },
  { header: "Stock", width: 12 },
  { header: "Delivery ETA", width: 18 },
  { header: "Region", width: 16 },
  { header: "Platform", width: 16 },
  { header: "Server / Realm", width: 20 },
  { header: "Description", width: 58 },
];

type BulkAction = "create" | "update";
type ListingStatus = "active" | "inactive";

type ExistingProduct = {
  id: number;
  has_variants: boolean | null;
  price: string | number | null;
  stock: number | null;
  status: string | null;
};

type NormalizedRow = {
  rowNumber: number;
  action: BulkAction;
  requestedAction: string;
  productId: number | null;
  title: string;
  description: string;
  priceCurrency: SupportedCurrency | null;
  enteredPrice: number;
  price: number;
  stock: number;
  status: ListingStatus;
  deliveryEtaMinutes: number;
  categoryId: number | null;
  category: string;
  gameId: number | null;
  gameName: string;
  imageUrl: string;
  offerRegion: string;
  offerPlatform: string;
  offerServer: string;
  offerFaction: string;
  offerTags: string[];
  slug: string;
};

type PreparedRow = {
  input: NormalizedRow;
  existing: ExistingProduct | null;
  policy: ProductPolicyResult;
  valid: boolean;
  errors: string[];
  warnings: string[];
};

function clean(value: unknown, maxLength = 5000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanSourceFilename(value: unknown) {
  const filename = clean(value, 255)
    .replace(/[\\/<>:"|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ");
  return filename || "bulk-listing-import";
}

function cleanSourceFormat(value: unknown): "csv" | "xlsx" {
  return clean(value, 12).toLowerCase() === "xlsx" ? "xlsx" : "csv";
}

function normalizeUuid(value: unknown) {
  const candidate = clean(value, 64).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    candidate
  )
    ? candidate
    : null;
}

function isMissingImportHistoryTable(
  error: { code?: string | null; message?: string | null } | null | undefined
) {
  return (
    error?.code === "42P01" ||
    String(error?.message || "")
      .toLowerCase()
      .includes("seller_catalog_imports")
  );
}

function importHistoryStatus(failed: number, total: number) {
  if (failed <= 0) return "completed";
  if (failed >= total) return "failed";
  return "partial";
}

function integer(value: unknown, fallback = 0) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numeric(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return Number.NaN;
  }
  return Number(value);
}

function spreadsheetCurrency(value: unknown): SupportedCurrency | null {
  const source = clean(value || "USD", 80).toUpperCase();
  const match = source.match(/(?:^|\()([A-Z]{3})\)?$/);
  const currency = (match?.[1] || source) as SupportedCurrency;
  return CURRENCY_CODES.has(currency) ? currency : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function readField(row: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    if (name in row) return row[name];
  }
  return undefined;
}

function cleanTags(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[|,]/)
        .map((item) => item.trim());
  const tags = new Map<string, string>();

  for (const raw of source) {
    const tag = clean(raw, 40).replace(/\s+/g, " ");
    const key = tag.toLowerCase();
    if (!key || tags.has(key)) continue;
    tags.set(key, tag);
    if (tags.size >= 12) break;
  }

  return Array.from(tags.values());
}

async function loadActiveGameNames(
  supabaseAdmin: Awaited<ReturnType<typeof requireApprovedSeller>>["supabaseAdmin"]
) {
  const pageSize = 1000;
  const games: string[] = [];

  for (let start = 0; start < 20_000; start += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("game_master")
      .select("name")
      .eq("status", "active")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .range(start, start + pageSize - 1);

    if (error) throw new Error(error.message);
    const page = (data || [])
      .map((game) => clean(game.name, 160))
      .filter(Boolean);
    games.push(...page);
    if (page.length < pageSize) break;
  }

  return Array.from(
    new Map(games.map((game) => [game.toLocaleLowerCase(), game])).values()
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeRows(value: unknown): NormalizedRow[] {
  if (!Array.isArray(value)) throw new Error("Spreadsheet rows are required.");
  if (value.length < 1) throw new Error("The spreadsheet has no product rows.");
  if (value.length > BULK_LIMIT) {
    throw new Error(`A bulk operation can contain at most ${BULK_LIMIT} rows.`);
  }

  return value.map((raw, index) => {
    const row = (raw || {}) as Record<string, unknown>;
    const productIdValue = integer(
      readField(row, "listing_id", "product_id", "productId"),
      0
    );
    const requestedAction = clean(readField(row, "action"), 20).toLowerCase();
    const action: BulkAction =
      requestedAction === "update" || (!requestedAction && productIdValue > 0)
        ? "update"
        : "create";
    const rawStatus = clean(readField(row, "status"), 20).toLowerCase();

    return {
      rowNumber: Math.max(
        integer(readField(row, "row_number", "rowNumber"), index + 2),
        2
      ),
      action,
      requestedAction,
      productId: productIdValue > 0 ? productIdValue : null,
      title: clean(readField(row, "product_title", "title"), 180),
      description: clean(readField(row, "description"), 10000),
      priceCurrency: spreadsheetCurrency(
        readField(row, "currency", "price_currency", "priceCurrency")
      ),
      enteredPrice: numeric(readField(row, "price")),
      price: numeric(readField(row, "price")),
      stock: integer(readField(row, "stock"), -1),
      status: rawStatus === "inactive" ? "inactive" : "active",
      deliveryEtaMinutes: parseDeliveryEtaMinutes(
        readField(
          row,
          "delivery_minutes",
          "delivery_eta",
          "delivery_eta_minutes",
          "deliveryEtaMinutes"
        )
      ),
      categoryId:
        integer(readField(row, "category_id", "categoryId"), 0) || null,
      category: clean(readField(row, "listing_type", "category"), 120),
      gameId: integer(readField(row, "game_id", "gameId"), 0) || null,
      gameName: clean(readField(row, "game_name", "game", "gameName"), 160),
      imageUrl: clean(readField(row, "image_url", "imageUrl"), 1000),
      offerRegion:
        clean(readField(row, "region", "offer_region", "offerRegion"), 80) ||
        "Global",
      offerPlatform:
        clean(readField(row, "platform", "offer_platform", "offerPlatform"), 80) ||
        "Any",
      offerServer: clean(
        readField(row, "server_realm", "offer_server", "offerServer"),
        100
      ),
      offerFaction: clean(
        readField(row, "faction", "offer_faction", "offerFaction"),
        80
      ),
      offerTags: cleanTags(readField(row, "tags", "offer_tags", "offerTags")),
      slug: clean(readField(row, "slug"), 220),
    };
  });
}

async function uniqueSlug(
  supabaseAdmin: Awaited<ReturnType<typeof requireApprovedSeller>>["supabaseAdmin"],
  requested: string,
  productId?: number
) {
  const base = slugify(requested) || `listing-${Date.now()}`;
  let candidate = base;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    let query = supabaseAdmin.from("products").select("id").eq("slug", candidate);
    if (productId) query = query.neq("id", productId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function prepareRows(
  supabaseAdmin: Awaited<ReturnType<typeof requireApprovedSeller>>["supabaseAdmin"],
  sellerId: string,
  rawRows: unknown
) {
  const rows = normalizeRows(rawRows);
  let priceRates: ExchangeRateMap;
  try {
    priceRates = (await fetchFrankfurterRates()).rates;
  } catch {
    priceRates = fallbackExchangeRateMap();
  }
  const policyRules = await loadProductPolicyRules(supabaseAdmin);
  const categoryResult = await supabaseAdmin
    .from("categories")
    .select("id,name,slug");
  if (categoryResult.error) throw new Error(categoryResult.error.message);

  const gameIds = Array.from(
    new Set(rows.map((row) => row.gameId).filter((id): id is number => Boolean(id)))
  );
  const gameSlugs = Array.from(
    new Set(rows.map((row) => slugify(row.gameName)).filter(Boolean))
  );
  const updateIds = Array.from(
    new Set(
      rows
        .filter((row) => row.action === "update")
        .map((row) => row.productId)
        .filter((id): id is number => Boolean(id))
    )
  );

  const [gamesByIdResult, gamesBySlugResult, existingResult] = await Promise.all([
    gameIds.length
      ? supabaseAdmin
          .from("game_master")
          .select("id,name,slug,status,is_active")
          .in("id", gameIds)
      : Promise.resolve({ data: [], error: null }),
    gameSlugs.length
      ? supabaseAdmin
          .from("game_master")
          .select("id,name,slug,status,is_active")
          .in("slug", gameSlugs)
      : Promise.resolve({ data: [], error: null }),
    updateIds.length
      ? supabaseAdmin
          .from("products")
          .select("id,has_variants,price,stock,status,seller_price_currency,seller_price_amount")
          .eq("seller_id", sellerId)
          .in("id", updateIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (gamesByIdResult.error) throw new Error(gamesByIdResult.error.message);
  if (gamesBySlugResult.error) throw new Error(gamesBySlugResult.error.message);
  if (existingResult.error) throw new Error(existingResult.error.message);

  const categoryById = new Map<number, { id: number; name: string; slug: string }>();
  const categoryBySlug = new Map<string, { id: number; name: string; slug: string }>();
  for (const item of categoryResult.data || []) {
    const category = {
      id: Number(item.id),
      name: String(item.name || ""),
      slug: String(item.slug || ""),
    };
    categoryById.set(category.id, category);
    categoryBySlug.set(category.slug || slugify(category.name), category);
  }

  const gameById = new Map<number, { id: number; name: string; slug: string }>();
  const gameBySlug = new Map<string, { id: number; name: string; slug: string }>();
  for (const item of [
    ...(gamesByIdResult.data || []),
    ...(gamesBySlugResult.data || []),
  ]) {
    if (String(item.status || "active") !== "active" || item.is_active === false) {
      continue;
    }
    const game = {
      id: Number(item.id),
      name: String(item.name || ""),
      slug: String(item.slug || ""),
    };
    gameById.set(game.id, game);
    gameBySlug.set(game.slug || slugify(game.name), game);
  }

  const existingById = new Map<number, ExistingProduct>();
  for (const item of existingResult.data || []) {
    existingById.set(Number(item.id), item as ExistingProduct);
  }

  const seenUpdateIds = new Set<number>();
  const prepared: PreparedRow[] = rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const existing = row.productId ? existingById.get(row.productId) || null : null;

    if (row.requestedAction && !["create", "update"].includes(row.requestedAction)) {
      errors.push("action must be create or update.");
    }

    if (row.action === "update") {
      if (!row.productId) errors.push("Listing ID is required for update rows.");
      else if (seenUpdateIds.has(row.productId)) {
        errors.push("The same Listing ID appears more than once in this file.");
      } else {
        seenUpdateIds.add(row.productId);
      }
      if (row.productId && !existing) {
        errors.push("Product was not found or is not owned by this seller.");
      }
    } else if (row.productId) {
      errors.push("Listing ID must be empty for new listings.");
    }

    if (row.title.length < 4) errors.push("Title must contain at least 4 characters.");
    if (row.description.length < 20) {
      errors.push("Description must contain at least 20 characters.");
    }
    if (!row.priceCurrency) {
      errors.push("Choose a valid Currency from the spreadsheet dropdown.");
    }
    if (
      !Number.isFinite(row.enteredPrice) ||
      row.enteredPrice <= 0 ||
      row.enteredPrice > 1_000_000_000
    ) {
      errors.push("Price must be greater than 0 and at most 1,000,000,000.");
    } else if (row.priceCurrency) {
      row.price = convertCurrencyToUsd(
        row.enteredPrice,
        row.priceCurrency,
        priceRates
      );
      if (!Number.isFinite(row.price) || row.price <= 0 || row.price > 1_000_000_000) {
        errors.push(
          "The product price is outside the supported range."
        );
      }
    }
    if (!Number.isInteger(row.stock) || row.stock < 0 || row.stock > 1_000_000) {
      errors.push("Stock must be a whole number between 0 and 1,000,000.");
    }
    if (
      row.deliveryEtaMinutes < 15 ||
      row.deliveryEtaMinutes > 10080
    ) {
      errors.push("Delivery ETA must be between 15 and 10,080 minutes.");
    } else if (!DELIVERY_ETA_MINUTES.has(row.deliveryEtaMinutes)) {
      errors.push("Choose a Delivery ETA from the spreadsheet dropdown.");
    }

    const normalizedPlatform = PLATFORM_OPTIONS.find(
      (platform) => platform.toLowerCase() === row.offerPlatform.toLowerCase()
    );
    if (!normalizedPlatform) {
      errors.push("Choose a valid Platform from the spreadsheet dropdown.");
    } else {
      row.offerPlatform = normalizedPlatform;
    }

    const category = row.categoryId
      ? categoryById.get(row.categoryId)
      : categoryBySlug.get(slugify(row.category));
    if (!category) {
      errors.push("Select a valid listing type.");
    } else {
      if (row.category && slugify(row.category) !== slugify(category.name)) {
        warnings.push(`Category name normalized to “${category.name}”.`);
      }
      row.categoryId = category.id;
      row.category = category.name;
    }

    const game = row.gameId
      ? gameById.get(row.gameId)
      : gameBySlug.get(slugify(row.gameName));
    if (!game) {
      errors.push("Use the exact name of an active game.");
    } else {
      if (row.gameName && slugify(row.gameName) !== slugify(game.name)) {
        warnings.push(`Game name normalized to “${game.name}”.`);
      }
      row.gameId = game.id;
      row.gameName = game.name;
    }

    if (row.imageUrl) {
      try {
        const imageUrl = new URL(row.imageUrl);
        if (!['http:', 'https:'].includes(imageUrl.protocol)) throw new Error();
      } catch {
        errors.push("image_url must be a valid HTTP or HTTPS URL.");
      }
    }

    if (row.stock === 0 && row.status === "active") {
      row.status = "inactive";
      warnings.push("Status changed to inactive because stock is 0.");
    }

    if (existing?.has_variants) {
      warnings.push(
        "This listing has variants; price and stock will remain controlled by its SKU rows."
      );
    }

    const policy = evaluateProductPolicy({
      title: row.title,
      description: row.description,
      category: row.category,
      gameName: row.gameName,
      tags: row.offerTags,
      rules: policyRules,
    });
    if (policy.decision === "block") {
      errors.push(...policy.reasons);
    } else if (policy.decision === "review") {
      row.status = "inactive";
      warnings.push("Listing will remain inactive until compliance review is approved.");
      warnings.push(...policy.reasons);
    }

    return {
      input: row,
      existing,
      policy,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  });

  return prepared;
}

function publicPreview(rows: PreparedRow[]) {
  const previewRows = rows.map(({ input, policy, valid, errors, warnings }) => ({
    ...input,
    policy,
    valid,
    errors,
    warnings,
  }));

  return {
    rows: previewRows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => row.valid).length,
      invalid: rows.filter((row) => !row.valid).length,
      creates: rows.filter((row) => row.valid && row.input.action === "create").length,
      updates: rows.filter((row) => row.valid && row.input.action === "update").length,
      warnings: rows.reduce((sum, row) => sum + row.warnings.length, 0),
    },
  };
}

async function notifyFollowersOfBulkCreate({
  supabaseAdmin,
  sellerId,
  sellerName,
  created,
}: {
  supabaseAdmin: Awaited<ReturnType<typeof requireApprovedSeller>>["supabaseAdmin"];
  sellerId: string;
  sellerName: string;
  created: number;
}) {
  if (created < 1) return;

  const { data: followerRows } = await supabaseAdmin
    .from("seller_followers")
    .select("user_id")
    .eq("seller_id", sellerId);
  const userIds = Array.from(
    new Set((followerRows || []).map((row) => String(row.user_id || "")).filter(Boolean))
  );
  if (userIds.length === 0) return;

  await supabaseAdmin.from("notifications").insert(
    userIds.map((userId) => ({
      user_id: userId,
      type: "seller_new_product",
      title: "New Seller Listings",
      message: `${sellerName} added ${created} new listing${created === 1 ? "" : "s"}.`,
      link_url: `/seller-profile/${sellerId}`,
      is_read: false,
    }))
  );
}

export async function GET(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") || "export";
    const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
    const gameFilter = clean(url.searchParams.get("game"), 160);
    const categoryFilter = clean(url.searchParams.get("category"), 120);

    if (mode === "options") {
      const [productsResult, categoriesResult] = await Promise.all([
        supabaseAdmin
          .from("products")
          .select("game_name,category")
          .eq("seller_id", user.id)
          .range(0, 9999),
        supabaseAdmin.from("categories").select("id,name,slug").order("name"),
      ]);
      if (productsResult.error) throw new Error(productsResult.error.message);
      if (categoriesResult.error) throw new Error(categoriesResult.error.message);

      const countOptions = (field: "game_name" | "category") => {
        const counts = new Map<string, { label: string; count: number }>();
        for (const product of productsResult.data || []) {
          const label = clean(product[field], field === "game_name" ? 160 : 120);
          if (!label) continue;
          const key = label.toLowerCase();
          const current = counts.get(key);
          counts.set(key, {
            label: current?.label || label,
            count: (current?.count || 0) + 1,
          });
        }
        return Array.from(counts.values()).sort((a, b) =>
          a.label.localeCompare(b.label)
        );
      };

      return NextResponse.json({
        total: (productsResult.data || []).length,
        games: countOptions("game_name"),
        catalogCategories: countOptions("category"),
        categories: categoriesResult.data || [],
      });
    }

    if (mode === "history") {
      const { data, error } = await supabaseAdmin
        .from("seller_catalog_imports")
        .select(
          "id,request_token,source_filename,source_format,source_sheet,source_size_bytes,status,total_rows,valid_rows,invalid_rows,created_rows,updated_rows,pending_review_rows,failed_rows,warning_count,started_at,completed_at"
        )
        .eq("seller_id", user.id)
        .order("started_at", { ascending: false })
        .limit(30);

      if (error) {
        if (isMissingImportHistoryTable(error)) {
          return NextResponse.json({
            available: false,
            migration: "v23_7",
            imports: [],
          });
        }
        throw new Error(error.message);
      }

      return NextResponse.json({
        available: true,
        imports: data || [],
      });
    }

    if (mode === "report") {
      const importId = normalizeUuid(url.searchParams.get("id"));
      if (!importId) throw new Error("A valid import history ID is required.");

      const { data, error } = await supabaseAdmin
        .from("seller_catalog_imports")
        .select(
          "id,source_filename,status,total_rows,created_rows,updated_rows,pending_review_rows,failed_rows,warning_count,result_rows,started_at,completed_at"
        )
        .eq("id", importId)
        .eq("seller_id", user.id)
        .maybeSingle();

      if (error) {
        if (isMissingImportHistoryTable(error)) {
          throw new Error("Import history migration V23.7 has not been applied.");
        }
        throw new Error(error.message);
      }
      if (!data) throw new Error("Import history entry was not found.");

      const resultRows = Array.isArray(data.result_rows) ? data.result_rows : [];
      const report = createCsv(
        ["row_number", "action", "product_id", "title", "result", "published", "error"],
        resultRows.map((item) => {
          const row = (item || {}) as Record<string, unknown>;
          return [
            integer(row.rowNumber, 0),
            clean(row.action, 20),
            integer(row.productId, 0) || "",
            clean(row.title, 180),
            row.ok === true ? "success" : "failed",
            row.published === true ? "yes" : row.published === false ? "no" : "",
            clean(row.error, 1000),
          ];
        })
      );

      return new Response(`\uFEFF${report}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="comeplayers-import-report-${String(
            data.id
          ).slice(0, 8)}.csv"`,
        },
      });
    }

    if (mode === "template") {
      if (format === "xlsx") {
        const gameOptions = await loadActiveGameNames(supabaseAdmin);
        if (gameOptions.length === 0) {
          throw new Error("No active games are available for the product spreadsheet.");
        }
        const workbook = createSimpleXlsx({
          sheetName: "Listings",
          title: "ComePlayers bulk product template",
          columns: XLSX_COLUMNS,
          rows: [],
          maxDataRows: BULK_LIMIT,
          listValidations: [
            {
              column: 0,
              name: "CategoryOptions",
              values: [...CATEGORY_OPTIONS],
              allowBlank: false,
              inputTitle: "Category",
              inputMessage: "Choose a category from the dropdown.",
              errorTitle: "Invalid category",
              errorMessage: "Choose one of the available ComePlayers categories.",
            },
            {
              column: 1,
              name: "GameOptions",
              values: gameOptions,
              allowBlank: false,
              inputTitle: "Game",
              inputMessage: "Type a game name to search, then choose it from the dropdown.",
              errorTitle: "Invalid game",
              errorMessage: "Choose an active game from the dropdown list.",
            },
            {
              column: 3,
              name: "CurrencyOptions",
              values: CURRENCY_INPUT_OPTIONS,
              allowBlank: false,
              inputTitle: "Currency",
              inputMessage: "Choose the currency used for the Price amount.",
              errorTitle: "Invalid currency",
              errorMessage: "Choose one of the supported ComePlayers currencies.",
            },
            {
              column: 6,
              name: "DeliveryEtaOptions",
              values: DELIVERY_ETA_OPTIONS,
              allowBlank: false,
              inputTitle: "Delivery ETA",
              inputMessage: "Choose the promised delivery time.",
              errorTitle: "Invalid Delivery ETA",
              errorMessage: "Choose a Delivery ETA from the dropdown list.",
            },
            {
              column: 8,
              name: "PlatformOptions",
              values: [...PLATFORM_OPTIONS],
              allowBlank: false,
              inputTitle: "Platform",
              inputMessage: "Choose the supported platform.",
              errorTitle: "Invalid platform",
              errorMessage: "Choose Any, PC, XBOX, Nintendo, or Playstation.",
            },
          ],
        });
        return new Response(Buffer.from(workbook), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition":
              'attachment; filename="comeplayers-product-template.xlsx"',
            "Cache-Control": "private, no-store",
          },
        });
      }

      const template = createCsv(CSV_HEADERS, []);
      return new Response(`\uFEFF${template}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="comeplayers-product-template.csv"',
        },
      });
    }

    let productQuery = supabaseAdmin
      .from("products")
      .select(
        "title,description,price,seller_price_currency,seller_price_amount,stock,delivery_eta_minutes,category,game_name,offer_region,offer_platform,offer_server"
      )
      .eq("seller_id", user.id);
    if (gameFilter) productQuery = productQuery.eq("game_name", gameFilter);
    if (categoryFilter) productQuery = productQuery.eq("category", categoryFilter);
    const { data, error } = await productQuery.order("created_at", {
      ascending: false,
    });
    if (error) throw new Error(error.message);

    const spreadsheetRows = (data || []).map((product) => [
      product.category,
      product.game_name,
      product.title,
      product.seller_price_currency || "USD",
      product.seller_price_amount ?? product.price,
      product.stock,
      product.delivery_eta_minutes,
      product.offer_region || "Global",
      product.offer_platform || "Any",
      product.offer_server,
      product.description,
    ]);

    const scope = slugify(gameFilter || "all-games") || "all-games";
    if (format === "xlsx") {
      const workbook = createSimpleXlsx({
        sheetName: "Listings",
        title: `ComePlayers seller listings - ${gameFilter || "All Games"}`,
        columns: XLSX_COLUMNS,
        rows: spreadsheetRows,
      });
      return new Response(Buffer.from(workbook), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="comeplayers-listings-${scope}-${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx"`,
          "X-Exported-Rows": String((data || []).length),
        },
      });
    }

    const csv = createCsv(CSV_HEADERS, spreadsheetRows);
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="comeplayers-listings-${scope}-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
        "X-Exported-Rows": String((data || []).length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected bulk export error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { user, profile, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const mode = clean(body.mode || "preview", 20).toLowerCase();
    if (!["preview", "commit"].includes(mode)) throw new Error("Invalid bulk operation mode.");

    const prepared = await prepareRows(supabaseAdmin, user.id, body.rows);
    const preview = publicPreview(prepared);

    if (mode === "preview") return NextResponse.json(preview);
    if (preview.summary.invalid > 0) {
      return NextResponse.json(
        {
          error: "Fix all invalid spreadsheet rows before importing.",
          ...preview,
        },
        { status: 400 }
      );
    }

    const suppliedToken = body.requestToken;
    const requestToken = normalizeUuid(suppliedToken) || crypto.randomUUID();
    if (suppliedToken && !normalizeUuid(suppliedToken)) {
      throw new Error("Invalid bulk import request token.");
    }

    const sourceFilename = cleanSourceFilename(body.fileName);
    const sourceFormat = cleanSourceFormat(body.fileFormat);
    const sourceSheet = clean(body.sheetName, 120) || null;
    const sourceSizeBytes = Math.max(
      0,
      Math.min(integer(body.fileSize, 0), 8 * 1024 * 1024)
    );

    let historyId: string | null = null;
    let historyRecorded = false;
    let historyWarning: string | null = null;

    const existingHistoryResult = await supabaseAdmin
      .from("seller_catalog_imports")
      .select(
        "id,status,total_rows,created_rows,updated_rows,pending_review_rows,failed_rows,result_rows"
      )
      .eq("seller_id", user.id)
      .eq("request_token", requestToken)
      .maybeSingle();

    if (existingHistoryResult.error) {
      if (isMissingImportHistoryTable(existingHistoryResult.error)) {
        historyWarning =
          "Import completed without history because migration V23.7 has not been applied.";
      } else {
        historyWarning = `Import history could not be checked: ${existingHistoryResult.error.message}`;
      }
    } else if (existingHistoryResult.data) {
      const prior = existingHistoryResult.data;
      if (prior.status === "processing") {
        return NextResponse.json(
          { error: "This import is already being processed." },
          { status: 409 }
        );
      }

      const priorResults = Array.isArray(prior.result_rows)
        ? prior.result_rows
        : [];
      return NextResponse.json({
        ok: Number(prior.failed_rows || 0) === 0,
        idempotent: true,
        summary: {
          total: Number(prior.total_rows || 0),
          created: Number(prior.created_rows || 0),
          updated: Number(prior.updated_rows || 0),
          pendingReview: Number(prior.pending_review_rows || 0),
          failed: Number(prior.failed_rows || 0),
        },
        results: priorResults,
        history: {
          id: prior.id,
          recorded: true,
          warning: null,
        },
      });
    } else {
      const historyInsert = await supabaseAdmin
        .from("seller_catalog_imports")
        .insert({
          seller_id: user.id,
          request_token: requestToken,
          source_filename: sourceFilename,
          source_format: sourceFormat,
          source_sheet: sourceSheet,
          source_size_bytes: sourceSizeBytes,
          status: "processing",
          total_rows: preview.summary.total,
          valid_rows: preview.summary.valid,
          invalid_rows: preview.summary.invalid,
          warning_count: preview.summary.warnings,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (historyInsert.error) {
        if (historyInsert.error.code === "23505") {
          return NextResponse.json(
            { error: "This import is already being processed." },
            { status: 409 }
          );
        }
        if (isMissingImportHistoryTable(historyInsert.error)) {
          historyWarning =
            "Import completed without history because migration V23.7 has not been applied.";
        } else {
          historyWarning = `Import history could not be created: ${historyInsert.error.message}`;
        }
      } else {
        historyId = String(historyInsert.data.id);
        historyRecorded = true;
      }
    }

    const sellerName = clean(
      profile.seller_name || profile.username || user.email || "Seller",
      160
    );
    const results: Array<{
      rowNumber: number;
      action: BulkAction;
      productId: number | null;
      title: string;
      ok: boolean;
      published?: boolean;
      pendingReview?: boolean;
      error?: string;
    }> = [];

    for (const preparedRow of prepared) {
      const row = preparedRow.input;
      try {
        const slug = await uniqueSlug(
          supabaseAdmin,
          row.slug || row.title,
          row.productId || undefined
        );

        if (row.action === "create") {
          const nextStatus = resolveBulkListingStatus(
            preparedRow.policy.decision,
            row.status,
            row.stock
          );
          const { data, error } = await supabaseAdmin
            .from("products")
            .insert({
              title: row.title,
              description: row.description,
              price: row.price,
              seller_price_currency: row.priceCurrency,
              seller_price_amount: row.enteredPrice,
              stock: row.stock,
              status: nextStatus,
              policy_status:
                preparedRow.policy.decision === "allow"
                  ? "allowed"
                  : "pending_review",
              policy_reasons: preparedRow.policy.reasons,
              policy_checked_at: new Date().toISOString(),
              delivery_eta_minutes: row.deliveryEtaMinutes,
              category_id: row.categoryId,
              category: row.category,
              game_category_id: row.gameId,
              game_name: row.gameName,
              image_url: row.imageUrl || null,
              offer_region: row.offerRegion,
              offer_platform: row.offerPlatform,
              offer_server: row.offerServer || null,
              offer_faction: row.offerFaction || null,
              offer_tags: row.offerTags,
              slug,
              seller: sellerName,
              seller_name: sellerName,
              seller_id: user.id,
              updated_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (error || !data) throw new Error(error?.message || "Failed to create listing.");
          if (preparedRow.policy.decision === "review") {
            await createProductPolicyReview({
              supabaseAdmin,
              productId: Number(data.id),
              sellerId: user.id,
              decision: "review",
              severity:
                preparedRow.policy.severity === "info"
                  ? "medium"
                  : preparedRow.policy.severity,
              matchedRules: preparedRow.policy.matchedRules,
              reasons: preparedRow.policy.reasons,
              listingSnapshot: { ...row, id: data.id },
            });
          }

          results.push({
            rowNumber: row.rowNumber,
            action: row.action,
            productId: Number(data.id),
            title: row.title,
            ok: true,
            published: nextStatus === "active",
            pendingReview: preparedRow.policy.decision === "review",
          });
          continue;
        }

        const existing = preparedRow.existing;
        if (!existing || !row.productId) throw new Error("Product was not found.");
        const effectivePrice = existing.has_variants
          ? Number(existing.price || 0)
          : row.price;
        const effectiveStock = existing.has_variants
          ? Number(existing.stock || 0)
          : row.stock;
        const nextStatus = resolveBulkListingStatus(
          preparedRow.policy.decision,
          row.status,
          effectiveStock
        );

        const { data: updatedProduct, error } = await supabaseAdmin
          .from("products")
          .update({
            title: row.title,
            description: row.description,
            price: effectivePrice,
            ...(!existing.has_variants
              ? {
                  seller_price_currency: row.priceCurrency,
                  seller_price_amount: row.enteredPrice,
                }
              : {}),
            stock: effectiveStock,
            status: nextStatus,
            policy_status:
              preparedRow.policy.decision === "allow"
                ? "allowed"
                : "pending_review",
            policy_reasons: preparedRow.policy.reasons,
            policy_checked_at: new Date().toISOString(),
            ...(preparedRow.policy.decision === "allow"
              ? { policy_review_id: null }
              : {}),
            delivery_eta_minutes: row.deliveryEtaMinutes,
            category_id: row.categoryId,
            category: row.category,
            game_category_id: row.gameId,
            game_name: row.gameName,
            image_url: row.imageUrl || null,
            offer_region: row.offerRegion,
            offer_platform: row.offerPlatform,
            offer_server: row.offerServer || null,
            offer_faction: row.offerFaction || null,
            offer_tags: row.offerTags,
            slug,
            seller: sellerName,
            seller_name: sellerName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.productId)
          .eq("seller_id", user.id)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!updatedProduct) throw new Error("Product no longer exists or is no longer owned by this seller.");
        if (preparedRow.policy.decision === "review") {
          await createProductPolicyReview({
            supabaseAdmin,
            productId: row.productId,
            sellerId: user.id,
            decision: "review",
            severity:
              preparedRow.policy.severity === "info"
                ? "medium"
                : preparedRow.policy.severity,
            matchedRules: preparedRow.policy.matchedRules,
            reasons: preparedRow.policy.reasons,
            listingSnapshot: { ...row, id: row.productId },
          });
        } else {
          await supersedePendingProductPolicyReviews({
            supabaseAdmin,
            productId: row.productId,
          });
        }

        results.push({
          rowNumber: row.rowNumber,
          action: row.action,
          productId: row.productId,
          title: row.title,
          ok: true,
          published: nextStatus === "active",
          pendingReview: preparedRow.policy.decision === "review",
        });
      } catch (rowError) {
        results.push({
          rowNumber: row.rowNumber,
          action: row.action,
          productId: row.productId,
          title: row.title,
          ok: false,
          error: rowError instanceof Error ? rowError.message : "Unexpected row error.",
        });
      }
    }

    const created = results.filter((row) => row.ok && row.action === "create").length;
    const updated = results.filter((row) => row.ok && row.action === "update").length;
    const publishedCreates = results.filter(
      (row) => row.ok && row.action === "create" && row.published
    ).length;
    const pendingReview = results.filter((row) => row.ok && row.pendingReview).length;
    const failed = results.filter((row) => !row.ok).length;

    if (historyId) {
      const historyUpdate = await supabaseAdmin
        .from("seller_catalog_imports")
        .update({
          status: importHistoryStatus(failed, results.length),
          created_rows: created,
          updated_rows: updated,
          pending_review_rows: pendingReview,
          failed_rows: failed,
          result_rows: results,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", historyId)
        .eq("seller_id", user.id);

      if (historyUpdate.error) {
        historyWarning = `Catalog changes were applied, but import history could not be finalized: ${historyUpdate.error.message}`;
        historyRecorded = false;
      }
    }

    try {
      await notifyFollowersOfBulkCreate({
        supabaseAdmin,
        sellerId: user.id,
        sellerName,
        created: publishedCreates,
      });
    } catch {
      // The catalog operation must not fail because a follower notification failed.
    }

    return NextResponse.json({
      ok: failed === 0,
      summary: {
        total: results.length,
        created,
        updated,
        pendingReview,
        failed,
      },
      results,
      history: {
        id: historyId,
        recorded: historyRecorded,
        warning: historyWarning,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected bulk catalog error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

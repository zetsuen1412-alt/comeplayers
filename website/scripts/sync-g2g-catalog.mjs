import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const websiteRoot = path.resolve(__dirname, "..");

const seedsFile = path.join(__dirname, "g2g-category-seeds.json");
const resultFile = path.join(__dirname, "g2g-catalog-result.json");
const debugDirectory = path.join(__dirname, "g2g-catalog-debug");

/**
 * Memuat .env.local dari folder website.
 */
config({
  path: path.join(websiteRoot, ".env.local"),
});

config({
  path: path.join(websiteRoot, ".env"),
  override: false,
});

const argumentsSet = new Set(process.argv.slice(2));

const commitChanges = argumentsSet.has("--commit");
const headedMode = argumentsSet.has("--headed");

const requestedCategoryArgument = process.argv.find((argument) =>
  argument.startsWith("--category="),
);

const requestedCategory = requestedCategoryArgument
  ? requestedCategoryArgument.split("=", 2)[1]?.trim()
  : null;

const allowedCategories = new Set([
  "coin",
  "boosting",
  "item",
  "account",
]);

const excludedSourceSlugs = new Set([
  "game-coins",
  "boosting",
  "accounts",
  "items",
  "all",
  "categories",
  "trending",
]);

const blockedPagePatterns = [
  /captcha/i,
  /verify you are human/i,
  /access denied/i,
  /unusual traffic/i,
  /temporarily blocked/i,
  /too many requests/i,
  /permintaan terlalu banyak/i,
  /checking your browser/i,
  /cloudflare ray id/i,
];

const genericTextPatterns = [
  /^produk populer$/i,
  /^popular products$/i,
  /^lihat lainnya$/i,
  /^lihat semua$/i,
  /^view all$/i,
  /^show more$/i,
  /^load more$/i,
  /^muat lainnya$/i,
  /^semua kategori$/i,
  /^all categories$/i,
  /^koin game$/i,
  /^game coins?$/i,
  /^jasa joki$/i,
  /^boosting$/i,
  /^items?$/i,
  /^akun game$/i,
  /^game accounts?$/i,
];

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY;

let supabase = null;

if (commitChanges) {
  if (!supabaseUrl) {
    throw new Error(
      "Mode --commit membutuhkan SUPABASE_URL atau " +
        "NEXT_PUBLIC_SUPABASE_URL di website/.env.local.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Mode --commit membutuhkan SUPABASE_SERVICE_ROLE_KEY " +
        "atau SUPABASE_SECRET_KEY di website/.env.local.",
    );
  }

  supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

class BlockedPageError extends Error {
  constructor(message) {
    super(message);
    this.name = "BlockedPageError";
  }
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}

/**
 * Menghasilkan nilai untuk kolom game_master.first_letter.
 *
 * Contoh:
 * - World of Warcraft -> W
 * - Aion 2 -> A
 * - 7 Days to Die -> 0-9
 * - #Me -> M
 */
function getFirstLetter(gameName) {
  const normalizedName = normalizeWhitespace(gameName)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const firstAlphaNumeric = normalizedName.match(/[A-Za-z0-9]/)?.[0];

  if (!firstAlphaNumeric) {
    return "#";
  }

  if (/\d/.test(firstAlphaNumeric)) {
    return "0-9";
  }

  return firstAlphaNumeric.toUpperCase();
}

function getNormalizedName(gameName) {
  return normalizeWhitespace(gameName).toLowerCase();
}

function humanizeSourceSlug(sourceSlug) {
  const cleanedSlug = String(sourceSlug ?? "")
    .replace(
      /-(?:game-coins?|gold-coins?|boosting-service|boosting|items?|accounts?)$/i,
      "",
    )
    .replace(/-/g, " ");

  return normalizeWhitespace(
    cleanedSlug.replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    ),
  );
}

function isGenericText(value) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return true;
  }

  return genericTextPatterns.some((pattern) =>
    pattern.test(normalized),
  );
}

function cleanGameName(rawValue) {
  const lines = String(rawValue ?? "")
    .split(/\r?\n/)
    .map(normalizeWhitespace)
    .filter(Boolean)
    .filter((line) => {
      if (isGenericText(line)) {
        return false;
      }

      if (
        /^\d[\d.,]*\s*(produk|product|products|offer|offers)$/i.test(
          line,
        )
      ) {
        return false;
      }

      if (
        /^(sekitar\s+)?\d[\d.,]*\s*(hasil|produk|products?|offers?)$/i.test(
          line,
        )
      ) {
        return false;
      }

      if (
        /^(dari|from|mulai dari|starting from)\s+/i.test(line)
      ) {
        return false;
      }

      if (
        /^(rp|idr|usd|eur|\$|€)\s*[\d.,]+/i.test(line)
      ) {
        return false;
      }

      if (/^\d[\d.,]*$/.test(line)) {
        return false;
      }

      return true;
    });

  return lines.find(
    (line) => line.length >= 2 && line.length <= 160,
  ) ?? "";
}

function chooseGameName(entry, sourceSlug) {
  const candidates = [
    entry.title,
    entry.ariaLabel,
    entry.imageAlt,
    entry.headingText,
    entry.text,
  ];

  for (const candidate of candidates) {
    const cleaned = cleanGameName(candidate);

    if (cleaned && !isGenericText(cleaned)) {
      return cleaned;
    }
  }

  return humanizeSourceSlug(sourceSlug);
}

function isBlockedPage(bodyText) {
  return blockedPagePatterns.some((pattern) =>
    pattern.test(bodyText),
  );
}

function buildPaginatedUrl(baseUrl, pageNumber) {
  const url = new URL(baseUrl);

  if (pageNumber > 1) {
    url.searchParams.set("page", String(pageNumber));
  } else {
    url.searchParams.delete("page");
  }

  return url.toString();
}

function safeFileName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function validateSeed(seed, index) {
  if (!seed || typeof seed !== "object") {
    throw new Error(
      `Seed nomor ${index + 1} bukan object JSON yang valid.`,
    );
  }

  if (!allowedCategories.has(seed.code)) {
    throw new Error(
      `Seed nomor ${index + 1} memiliki code tidak valid: ` +
        `${String(seed.code)}.`,
    );
  }

  if (typeof seed.url !== "string" || !seed.url.trim()) {
    throw new Error(
      `Seed ${seed.code} belum memiliki URL.`,
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(seed.url);
  } catch {
    throw new Error(
      `URL seed ${seed.code} tidak valid: ${seed.url}`,
    );
  }

  if (parsedUrl.hostname !== "www.g2g.com") {
    throw new Error(
      `URL seed ${seed.code} harus berasal dari www.g2g.com.`,
    );
  }

  const parsedMaxPage = Number.parseInt(
    String(seed.maxPage ?? 1),
    10,
  );

  return {
    code: seed.code,
    url: parsedUrl.toString(),
    maxPage:
      Number.isFinite(parsedMaxPage) && parsedMaxPage > 0
        ? Math.min(parsedMaxPage, 100)
        : 1,
  };
}

async function readSeeds() {
  const fileContents = await fs.readFile(seedsFile, "utf8");

  // Menghapus BOM bila file dibuat menggunakan beberapa versi
  // Windows PowerShell atau Notepad.
  const cleanContents = fileContents.replace(/^\uFEFF/, "");

  let parsed;

  try {
    parsed = JSON.parse(cleanContents);
  } catch (error) {
    throw new Error(
      "g2g-category-seeds.json tidak valid. " +
        `Detail: ${
          error instanceof Error ? error.message : String(error)
        }`,
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      "g2g-category-seeds.json harus berupa array dan tidak boleh kosong.",
    );
  }

  const validated = parsed.map(validateSeed);

  if (!requestedCategory) {
    return validated;
  }

  if (!allowedCategories.has(requestedCategory)) {
    throw new Error(
      `Nilai --category tidak valid: ${requestedCategory}`,
    );
  }

  const filtered = validated.filter(
    (seed) => seed.code === requestedCategory,
  );

  if (filtered.length === 0) {
    throw new Error(
      `Kategori ${requestedCategory} tidak ditemukan dalam file seed.`,
    );
  }

  return filtered;
}

async function dismissCookieDialog(page) {
  const buttonNames = [
    /terima semua/i,
    /accept all/i,
    /^setuju$/i,
    /^accept$/i,
    /^allow all$/i,
  ];

  for (const buttonName of buttonNames) {
    const button = page
      .getByRole("button", {
        name: buttonName,
      })
      .first();

    const visible = await button
      .isVisible({
        timeout: 1_000,
      })
      .catch(() => false);

    if (!visible) {
      continue;
    }

    await button.click().catch(() => {});
    await page.waitForTimeout(500);
    return;
  }
}

async function clickLoadMoreButtons(page) {
  const buttonPattern =
    /load more|show more|lihat lainnya|tampilkan lebih banyak|muat lainnya/i;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const buttons = page.getByRole("button", {
      name: buttonPattern,
    });

    const count = await buttons.count();

    if (count === 0) {
      return;
    }

    const button = buttons.last();

    const visible = await button
      .isVisible()
      .catch(() => false);

    if (!visible) {
      return;
    }

    await button.click().catch(() => {});
    await page.waitForTimeout(1_200);
  }
}

async function autoScroll(page) {
  let previousHeight = 0;
  let unchangedRounds = 0;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const currentHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );

    await page.evaluate(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "auto",
      });
    });

    await page.waitForTimeout(800);

    if (currentHeight === previousHeight) {
      unchangedRounds += 1;
    } else {
      unchangedRounds = 0;
    }

    if (unchangedRounds >= 3) {
      break;
    }

    previousHeight = currentHeight;
  }

  await page.evaluate(() => {
    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  });
}

async function saveDebugFiles(
  page,
  categoryCode,
  pageNumber,
) {
  await fs.mkdir(debugDirectory, {
    recursive: true,
  });

  const baseName = safeFileName(
    `${categoryCode}-page-${pageNumber}`,
  );

  const htmlPath = path.join(
    debugDirectory,
    `${baseName}.html`,
  );

  const screenshotPath = path.join(
    debugDirectory,
    `${baseName}.png`,
  );

  const html = await page.content().catch(() => "");

  await fs.writeFile(htmlPath, html, "utf8");

  await page
    .screenshot({
      path: screenshotPath,
      fullPage: true,
    })
    .catch(() => {});

  console.log(
    `File debug disimpan: scripts/g2g-catalog-debug/${baseName}.*`,
  );
}

async function navigateWithRetry(
  page,
  url,
  categoryCode,
  pageNumber,
) {
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });

      const status = response?.status() ?? 0;

      if (status === 403 || status === 429) {
        throw new BlockedPageError(
          `G2G mengembalikan HTTP ${status} pada ` +
            `${categoryCode} halaman ${pageNumber}.`,
        );
      }

      if (status >= 500) {
        throw new Error(
          `G2G mengembalikan HTTP ${status}.`,
        );
      }

      await page.waitForTimeout(2_500);

      const bodyText = await page
        .locator("body")
        .innerText()
        .catch(() => "");

      if (isBlockedPage(bodyText)) {
        throw new BlockedPageError(
          `Proteksi situs terdeteksi pada ${categoryCode} ` +
            `halaman ${pageNumber}. Proses tidak mencoba melewatinya.`,
        );
      }

      return;
    } catch (error) {
      lastError = error;

      if (error instanceof BlockedPageError) {
        throw error;
      }

      console.warn(
        `Percobaan ${attempt}/2 gagal untuk ${url}: ` +
          `${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
      );

      if (attempt < 2) {
        await page.waitForTimeout(3_000);
      }
    }
  }

  throw lastError ?? new Error(`Gagal membuka ${url}`);
}

async function extractCategoryGames(
  page,
  seed,
  pageNumber,
) {
  const paginatedUrl = buildPaginatedUrl(
    seed.url,
    pageNumber,
  );

  console.log(
    `Membuka ${seed.code} halaman ` +
      `${pageNumber}/${seed.maxPage}: ${paginatedUrl}`,
  );

  await navigateWithRetry(
    page,
    paginatedUrl,
    seed.code,
    pageNumber,
  );

  await dismissCookieDialog(page);
  await clickLoadMoreButtons(page);
  await autoScroll(page);
  await clickLoadMoreButtons(page);

  const selector = 'a[href*="/categories/"]';

  await page
    .waitForSelector(selector, {
      timeout: 15_000,
    })
    .catch(() => {});

  const extractedLinks = await page
    .locator(selector)
    .evaluateAll((anchors) =>
      anchors.map((anchor) => {
        const heading = anchor.querySelector(
          [
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "[data-testid*='title']",
            "[class*='title']",
            "[class*='name']",
          ].join(","),
        );

        const image = anchor.querySelector("img");

        return {
          href: anchor.href,
          text:
            anchor.innerText ||
            anchor.textContent ||
            "",
          title:
            anchor.getAttribute("title") || "",
          ariaLabel:
            anchor.getAttribute("aria-label") || "",
          imageAlt:
            image?.getAttribute("alt") || "",
          headingText:
            heading?.textContent || "",
        };
      }),
    );

  const discovered = new Map();

  for (const entry of extractedLinks) {
    let parsedUrl;

    try {
      parsedUrl = new URL(entry.href);
    } catch {
      continue;
    }

    if (parsedUrl.hostname !== "www.g2g.com") {
      continue;
    }

    const segments = parsedUrl.pathname
      .split("/")
      .filter(Boolean);

    const categoriesIndex =
      segments.indexOf("categories");

    if (categoriesIndex < 0) {
      continue;
    }

    // URL harus berakhir dengan /categories/<slug-game>.
    if (categoriesIndex !== segments.length - 2) {
      continue;
    }

    const sourceSlug = decodeURIComponent(
      segments[categoriesIndex + 1] ?? "",
    )
      .trim()
      .toLowerCase();

    if (
      !sourceSlug ||
      excludedSourceSlugs.has(sourceSlug)
    ) {
      continue;
    }

    if (
      /^(offer|group|seller|search|checkout|login|account)$/i.test(
        sourceSlug,
      )
    ) {
      continue;
    }

    const name = chooseGameName(
      entry,
      sourceSlug,
    );

    if (
      name.length < 2 ||
      name.length > 160 ||
      isGenericText(name)
    ) {
      continue;
    }

    const slug = slugify(name);

    if (
      !slug ||
      slug.length < 2 ||
      excludedSourceSlugs.has(slug)
    ) {
      continue;
    }

    const cleanSourceUrl =
      `${parsedUrl.origin}${parsedUrl.pathname}`;

    const identity = `${seed.code}:${slug}`;

    if (!discovered.has(identity)) {
      discovered.set(identity, {
        name,
        slug,
        categoryCode: seed.code,
        sourceSlug,
        sourceUrl: cleanSourceUrl,
        sourcePage: pageNumber,
      });
    }
  }

  const games = [...discovered.values()];

  if (games.length === 0) {
    console.warn(
      `Tidak ada game terbaca pada ${seed.code} halaman ${pageNumber}.`,
    );

    await saveDebugFiles(
      page,
      seed.code,
      pageNumber,
    );
  }

  return games;
}

async function upsertInBatches(
  tableName,
  rows,
  options,
  batchSize = 200,
) {
  if (!supabase) {
    throw new Error(
      "Supabase client belum tersedia.",
    );
  }

  if (rows.length === 0) {
    return;
  }

  for (
    let index = 0;
    index < rows.length;
    index += batchSize
  ) {
    const batch = rows.slice(
      index,
      index + batchSize,
    );

    const { error } = await supabase
      .from(tableName)
      .upsert(batch, options);

    if (error) {
      throw new Error(
        `Gagal upsert ${tableName}: ` +
          `${error.message}. ` +
          `Code: ${error.code ?? "tidak tersedia"}.`,
      );
    }

    console.log(
      `${tableName}: ${Math.min(
        index + batch.length,
        rows.length,
      )}/${rows.length}`,
    );
  }
}

async function readSavedGameIds(slugs) {
  if (!supabase) {
    throw new Error(
      "Supabase client belum tersedia.",
    );
  }

  const savedGames = [];

  for (
    let index = 0;
    index < slugs.length;
    index += 200
  ) {
    const batch = slugs.slice(
      index,
      index + 200,
    );

    const { data, error } = await supabase
      .from("game_master")
      .select("id, slug")
      .in("slug", batch);

    if (error) {
      throw new Error(
        `Gagal membaca game_master: ${error.message}`,
      );
    }

    savedGames.push(...(data ?? []));
  }

  return savedGames;
}

async function main() {
  const seeds = await readSeeds();

  console.log(
    commitChanges
      ? "Mode COMMIT: hasil akan disimpan ke Supabase."
      : "Mode PREVIEW: database tidak akan diubah.",
  );

  console.log(
    headedMode
      ? "Browser akan ditampilkan."
      : "Browser berjalan dalam mode headless.",
  );

  const browser = await chromium.launch({
    headless: !headedMode,
  });

  try {
    const context = await browser.newContext({
      locale: "id-ID",
      viewport: {
        width: 1440,
        height: 1000,
      },
    });

    const page = await context.newPage();

    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(90_000);

    const allDiscovered = [];
    const categorySummaries = {};
    const pageSummaries = [];

    for (const seed of seeds) {
      const categoryGamesBySlug = new Map();
      let consecutiveEmptyPages = 0;
      let stoppedBecauseBlocked = false;

      console.log(
        `\n========================================`,
      );
      console.log(
        `Kategori ${seed.code}: halaman 1–${seed.maxPage}`,
      );
      console.log(
        `========================================`,
      );

      for (
        let pageNumber = 1;
        pageNumber <= seed.maxPage;
        pageNumber += 1
      ) {
        let pageGames;

        try {
          pageGames =
            await extractCategoryGames(
              page,
              seed,
              pageNumber,
            );
        } catch (error) {
          if (error instanceof BlockedPageError) {
            console.error(error.message);
            stoppedBecauseBlocked = true;
            break;
          }

          console.error(
            `Gagal memproses ${seed.code} halaman ` +
              `${pageNumber}: ${
                error instanceof Error
                  ? error.message
                  : String(error)
              }`,
          );

          await saveDebugFiles(
            page,
            seed.code,
            pageNumber,
          );

          break;
        }

        let newGamesCount = 0;

        for (const game of pageGames) {
          const existing =
            categoryGamesBySlug.get(game.slug);

          if (!existing) {
            categoryGamesBySlug.set(
              game.slug,
              game,
            );

            newGamesCount += 1;
          }
        }

        pageSummaries.push({
          categoryCode: seed.code,
          pageNumber,
          url: buildPaginatedUrl(
            seed.url,
            pageNumber,
          ),
          linksFound: pageGames.length,
          newUniqueGames: newGamesCount,
        });

        console.log(
          `${pageGames.length} tautan valid, ` +
            `${newGamesCount} game baru.`,
        );

        if (newGamesCount === 0) {
          consecutiveEmptyPages += 1;
        } else {
          consecutiveEmptyPages = 0;
        }

        if (
          pageNumber > 1 &&
          consecutiveEmptyPages >= 2
        ) {
          console.log(
            `Dua halaman berturut-turut tidak memiliki game baru. ` +
              `Kategori ${seed.code} dihentikan.`,
          );

          break;
        }

        if (pageNumber < seed.maxPage) {
          await page.waitForTimeout(2_500);
        }
      }

      const categoryGames = [
        ...categoryGamesBySlug.values(),
      ];

      allDiscovered.push(...categoryGames);

      categorySummaries[seed.code] = {
        requestedMaxPage: seed.maxPage,
        uniqueGames: categoryGames.length,
        stoppedBecauseBlocked,
      };

      console.log(
        `Kategori ${seed.code} selesai: ` +
          `${categoryGames.length} game unik.`,
      );

      await page.waitForTimeout(2_500);
    }

    const gamesBySlug = new Map();

    for (const discovered of allDiscovered) {
      const existing =
        gamesBySlug.get(discovered.slug);

      if (!existing) {
        gamesBySlug.set(discovered.slug, {
          name: discovered.name,
          slug: discovered.slug,
          categories: new Set([
            discovered.categoryCode,
          ]),
          sources: [
            {
              categoryCode:
                discovered.categoryCode,
              sourceUrl:
                discovered.sourceUrl,
              sourceSlug:
                discovered.sourceSlug,
              sourcePage:
                discovered.sourcePage,
            },
          ],
        });

        continue;
      }

      existing.categories.add(
        discovered.categoryCode,
      );

      const alreadyHasSource =
        existing.sources.some(
          (source) =>
            source.categoryCode ===
              discovered.categoryCode &&
            source.sourceUrl ===
              discovered.sourceUrl,
        );

      if (!alreadyHasSource) {
        existing.sources.push({
          categoryCode:
            discovered.categoryCode,
          sourceUrl:
            discovered.sourceUrl,
          sourceSlug:
            discovered.sourceSlug,
          sourcePage:
            discovered.sourcePage,
        });
      }
    }

    const generatedAt =
      new Date().toISOString();

    const previewResult = {
      generatedAt,
      commitMode: commitChanges,
      requestedCategory:
        requestedCategory ?? "all",
      totalUniqueGames: gamesBySlug.size,
      totalCategoryRelations:
        allDiscovered.length,
      categories: categorySummaries,
      pages: pageSummaries,
      games: [...gamesBySlug.values()]
        .map((game) => ({
          name: game.name,
          slug: game.slug,
          firstLetter: getFirstLetter(game.name),
          categories: [
            ...game.categories,
          ].sort(),
          sources: game.sources,
        }))
        .sort((first, second) =>
          first.name.localeCompare(
            second.name,
            "id",
          ),
        ),
    };

    await fs.writeFile(
      resultFile,
      JSON.stringify(
        previewResult,
        null,
        2,
      ),
      "utf8",
    );

    console.log(
      "\n========================================",
    );
    console.log("RINGKASAN");
    console.log(
      "========================================",
    );
    console.log(
      JSON.stringify(
        {
          totalUniqueGames:
            previewResult.totalUniqueGames,
          totalCategoryRelations:
            previewResult.totalCategoryRelations,
          categories:
            previewResult.categories,
        },
        null,
        2,
      ),
    );

    console.log(
      "\nPreview tersimpan di:",
    );
    console.log(
      "scripts/g2g-catalog-result.json",
    );

    if (!commitChanges) {
      console.log(
        "\nDatabase belum diubah.",
      );
      console.log(
        "Periksa g2g-catalog-result.json, lalu jalankan mode commit.",
      );

      return;
    }

    if (gamesBySlug.size === 0) {
      throw new Error(
        "Tidak ada game yang ditemukan. Commit dibatalkan.",
      );
    }

    const gamesToUpsert = [
      ...gamesBySlug.values(),
    ].map((game) => ({
      name: game.name,
      slug: game.slug,
      first_letter: getFirstLetter(game.name),
      normalized_name: getNormalizedName(game.name),
      status: "active",
      is_active: true,
    }));

    console.log(
      `\nMenyimpan ${gamesToUpsert.length} game ke game_master...`,
    );

    await upsertInBatches(
      "game_master",
      gamesToUpsert,
      {
        onConflict: "slug",
        ignoreDuplicates: false,
      },
    );

    const savedGames =
      await readSavedGameIds(
        gamesToUpsert.map(
          (game) => game.slug,
        ),
      );

    const gameIdBySlug = new Map(
      savedGames.map((game) => [
        game.slug,
        game.id,
      ]),
    );

    const categoryRelations = [];

    for (
      const [slug, game]
      of gamesBySlug.entries()
    ) {
      const gameId =
        gameIdBySlug.get(slug);

      if (!gameId) {
        console.warn(
          `ID game tidak ditemukan setelah upsert: ${slug}`,
        );

        continue;
      }

      for (
        const categoryCode
        of game.categories
      ) {
        const source = game.sources.find(
          (item) =>
            item.categoryCode ===
            categoryCode,
        );

        categoryRelations.push({
          game_id: gameId,
          category_code: categoryCode,
          source_provider: "g2g",
          source_url:
            source?.sourceUrl ?? null,
          last_seen_at: generatedAt,
        });
      }
    }

    console.log(
      `\nMenyimpan ${categoryRelations.length} relasi kategori...`,
    );

    await upsertInBatches(
      "game_marketplace_categories",
      categoryRelations,
      {
        onConflict:
          "game_id,category_code",
        ignoreDuplicates: false,
      },
    );

    const committedResult = {
      ...previewResult,
      commitCompletedAt:
        new Date().toISOString(),
      committedGames:
        gamesToUpsert.length,
      committedCategoryRelations:
        categoryRelations.length,
    };

    await fs.writeFile(
      resultFile,
      JSON.stringify(
        committedResult,
        null,
        2,
      ),
      "utf8",
    );

    console.log(
      "\n========================================",
    );
    console.log("COMMIT SELESAI");
    console.log(
      "========================================",
    );
    console.log(
      `${gamesToUpsert.length} game disimpan ke game_master.`,
    );
    console.log(
      `${categoryRelations.length} relasi kategori disimpan.`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("\nIMPORT GAGAL");
  console.error(
    error instanceof Error
      ? error.stack || error.message
      : String(error),
  );

  process.exitCode = 1;
});

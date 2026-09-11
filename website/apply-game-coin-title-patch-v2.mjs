import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".turbo",
  "coverage",
]);

function findWebsiteRoot() {
  const cwd = process.cwd();

  const candidates = [
    cwd,
    path.resolve(cwd, "website"),
    path.resolve(cwd, ".."),
  ];

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "package.json")) &&
      (
        fs.existsSync(path.join(candidate, "app")) ||
        fs.existsSync(path.join(candidate, "src"))
      )
    ) {
      return candidate;
    }
  }

  throw new Error(
    [
      "Folder website Next.js tidak ditemukan.",
      "Ekstrak ZIP ke C:\\Comeplayers-new\\website lalu jalankan APPLY_PATCH_V2.bat.",
    ].join("\n"),
  );
}

function walk(directory, results = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, results);
      continue;
    }

    if (!/\.(tsx|jsx)$/.test(entry.name)) continue;

    let content = "";

    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }

    const looksLikeProductForm =
      content.includes("Product Information") &&
      content.includes("Product Title") &&
      content.includes("selectedCategory") &&
      content.includes("selectedGame") &&
      content.includes("setTitle");

    if (looksLikeProductForm) {
      results.push({ fullPath, content });
    }
  }

  return results;
}

function insertAfterSelectedGame(source) {
  const marker = "GAME_COIN_TITLE_AUTO_PATCH_V2";

  if (source.includes(marker)) {
    return source;
  }

  const pattern =
    /(const selectedGame\s*=\s*games\.find\([\s\S]*?\);\s*)/;

  if (!pattern.test(source)) {
    throw new Error(
      'Tidak menemukan deklarasi "const selectedGame = games.find(...)".',
    );
  }

  const addition = `$1

  // ${marker}
  const isGameCoinCategoryV2 = useMemo(() => {
    const categoryText = \`\${selectedCategory?.name ?? ""} \${selectedCategory?.slug ?? ""}\`
      .trim()
      .toLowerCase();

    return categoryText.includes("coin");
  }, [selectedCategory?.name, selectedCategory?.slug]);

  useEffect(() => {
    if (isGameCoinCategoryV2 && selectedGame?.name) {
      setTitle(\`\${selectedGame.name} Coins\`);
    }
  }, [isGameCoinCategoryV2, selectedGame?.name]);
`;

  return source.replace(pattern, addition);
}

function hideProductTitleBlock(source) {
  if (source.includes("GAME_COIN_TITLE_FIELD_PATCH_V2")) {
    return source;
  }

  const pattern =
    /(<div(?:\s+[^>]*)?>\s*<label[^>]*>\s*Product Title\s*<\/label>\s*<input[\s\S]*?\/>\s*<\/div>)/;

  const match = source.match(pattern);

  if (!match) {
    throw new Error(
      "Blok input Product Title tidak ditemukan.",
    );
  }

  const wrapped = `{/* GAME_COIN_TITLE_FIELD_PATCH_V2 */}
            {!isGameCoinCategoryV2 ? (
              ${match[1]}
            ) : null}`;

  return source.replace(pattern, wrapped);
}

function widenPriceBlock(source) {
  if (source.includes("GAME_COIN_PRICE_WIDTH_PATCH_V2")) {
    return source;
  }

  const pattern =
    /<div>\s*(<label[^>]*>\s*Price\s*<\/label>\s*<input[\s\S]*?\/>\s*<\/div>)/;

  if (!pattern.test(source)) {
    return source;
  }

  return source.replace(
    pattern,
    `<div
              /* GAME_COIN_PRICE_WIDTH_PATCH_V2 */
              className={isGameCoinCategoryV2 ? "md:col-span-2" : ""}
            >
              $1`,
  );
}

function patchFile(filePath, original) {
  let updated = original;

  updated = insertAfterSelectedGame(updated);
  updated = hideProductTitleBlock(updated);
  updated = widenPriceBlock(updated);

  if (updated === original) {
    return {
      changed: false,
      backup: null,
    };
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const backup = `${filePath}.backup-${stamp}`;

  fs.copyFileSync(filePath, backup);
  fs.writeFileSync(filePath, updated, "utf8");

  return {
    changed: true,
    backup,
  };
}

const websiteRoot = findWebsiteRoot();
const candidates = walk(websiteRoot);

if (candidates.length === 0) {
  throw new Error(
    [
      "Tidak menemukan file form seller yang memuat Product Information dan Product Title.",
      "Pastikan ZIP diekstrak ke folder website yang benar.",
    ].join("\n"),
  );
}

console.log(`Folder website: ${websiteRoot}`);
console.log(`Kandidat ditemukan: ${candidates.length}`);
console.log("");

let successCount = 0;

for (const candidate of candidates) {
  try {
    const result = patchFile(candidate.fullPath, candidate.content);

    if (result.changed) {
      successCount += 1;
      console.log("PATCH BERHASIL");
      console.log(`File   : ${candidate.fullPath}`);
      console.log(`Backup : ${result.backup}`);
      console.log("");
    } else {
      console.log(`Sudah terpasang: ${candidate.fullPath}`);
    }
  } catch (error) {
    console.log(`Dilewati: ${candidate.fullPath}`);
    console.log(
      error instanceof Error ? error.message : String(error),
    );
    console.log("");
  }
}

if (successCount === 0) {
  const alreadyPatched = candidates.some(({ content }) =>
    content.includes("GAME_COIN_TITLE_AUTO_PATCH_V2"),
  );

  if (!alreadyPatched) {
    throw new Error(
      "Tidak ada file yang berhasil dipatch. Tidak ada file proyek yang diubah.",
    );
  }
}

console.log("========================================");
console.log("SELESAI");
console.log("========================================");
console.log("Khusus Game Coins:");
console.log("- Product Title disembunyikan.");
console.log("- Judul otomatis menjadi <Nama Game> Coins.");
console.log("- Preview dan penyimpanan tetap memakai state title yang sudah ada.");
console.log("- Price melebar penuh pada desktop.");
console.log("");
console.log("Selanjutnya jalankan:");
console.log("Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue");
console.log("npm.cmd run dev");

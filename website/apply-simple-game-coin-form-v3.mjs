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
      "Ekstrak ZIP ke C:\\Comeplayers-new\\website lalu jalankan APPLY_PATCH_V3.bat.",
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
      content.includes("Faction / Side") &&
      content.includes("Search Tags") &&
      content.includes("Product Image URL");

    if (looksLikeProductForm) {
      results.push({ fullPath, content });
    }
  }

  return results;
}

function detectGameCoinCondition(source) {
  if (source.includes("isGameCoinCategoryV2")) {
    return "isGameCoinCategoryV2";
  }

  if (source.includes("isGameCoin")) {
    return "isGameCoin";
  }

  throw new Error(
    [
      "Variabel pendeteksi Game Coins tidak ditemukan.",
      "Pasang patch Product Title V2 terlebih dahulu.",
    ].join("\n"),
  );
}

function wrapField(source, conditionName, labelPattern, marker) {
  if (source.includes(marker)) {
    return source;
  }

  const pattern = new RegExp(
    `(<div(?:\\s+[^>]*)?>\\s*<label[^>]*>\\s*${labelPattern}\\s*<\\/label>[\\s\\S]*?<\\/div>)`,
    "i",
  );

  const match = source.match(pattern);

  if (!match) {
    throw new Error(`Field ${labelPattern} tidak ditemukan.`);
  }

  const wrapped = `{/* ${marker} */}
            {!${conditionName} ? (
              ${match[1]}
            ) : null}`;

  return source.replace(pattern, wrapped);
}

function patchFile(filePath, original) {
  const conditionName = detectGameCoinCondition(original);

  let updated = original;

  updated = wrapField(
    updated,
    conditionName,
    "Faction\\s*\\/\\s*Side",
    "GAME_COIN_HIDE_FACTION_SIDE_V3",
  );

  updated = wrapField(
    updated,
    conditionName,
    "Search\\s+Tags",
    "GAME_COIN_HIDE_SEARCH_TAGS_V3",
  );

  updated = wrapField(
    updated,
    conditionName,
    "Product\\s+Image\\s+URL",
    "GAME_COIN_HIDE_IMAGE_URL_V3",
  );

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
      "Tidak menemukan file form seller yang berisi:",
      "- Faction / Side",
      "- Search Tags",
      "- Product Image URL",
      "",
      "Pastikan ZIP diekstrak ke folder website yang benar.",
    ].join("\n"),
  );
}

console.log(`Folder website: ${websiteRoot}`);
console.log(`Kandidat ditemukan: ${candidates.length}`);
console.log("");

let successCount = 0;
let alreadyPatchedCount = 0;

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
      alreadyPatchedCount += 1;
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

if (successCount === 0 && alreadyPatchedCount === 0) {
  throw new Error(
    "Tidak ada file yang berhasil dipatch. Tidak ada file proyek yang diubah.",
  );
}

console.log("========================================");
console.log("SELESAI");
console.log("========================================");
console.log("Khusus kategori Game Coins:");
console.log("- Product Title tetap tersembunyi.");
console.log("- Faction / Side disembunyikan.");
console.log("- Search Tags disembunyikan.");
console.log("- Product Image URL disembunyikan.");
console.log("- Region, Platform, Server / Realm tetap tersedia.");
console.log("");
console.log("Selanjutnya jalankan:");
console.log("Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue");
console.log("npm.cmd run dev");

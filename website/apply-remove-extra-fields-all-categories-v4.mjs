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
      "Ekstrak ZIP ke C:\\Comeplayers-new\\website lalu jalankan APPLY_PATCH_V4.bat.",
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

    const looksLikeSellerProductForm =
      content.includes("Product Information") &&
      content.includes("Offer Discovery") &&
      (
        content.includes("Faction / Side") ||
        content.includes("Search Tags") ||
        content.includes("Product Image URL") ||
        content.includes("GAME_COIN_HIDE_FACTION_SIDE_V3") ||
        content.includes("GAME_COIN_HIDE_SEARCH_TAGS_V3") ||
        content.includes("GAME_COIN_HIDE_IMAGE_URL_V3")
      );

    if (looksLikeSellerProductForm) {
      results.push({ fullPath, content });
    }
  }

  return results;
}

function removeMarkedConditionalBlock(source, marker) {
  const pattern = new RegExp(
    `\\{\\/\\*\\s*${marker}\\s*\\*\\/\\}\\s*\\{![\\w$]+\\s*\\?\\s*\\(\\s*[\\s\\S]*?\\s*\\)\\s*:\\s*null\\s*\\}`,
    "g",
  );

  return source.replace(pattern, "");
}

function removeFieldBlockByLabel(source, labelPattern) {
  const patterns = [
    new RegExp(
      `<div(?:\\s+[^>]*)?>\\s*<label[^>]*>\\s*${labelPattern}\\s*<\\/label>[\\s\\S]*?<\\/div>`,
      "gi",
    ),
    new RegExp(
      `<section(?:\\s+[^>]*)?>\\s*<label[^>]*>\\s*${labelPattern}\\s*<\\/label>[\\s\\S]*?<\\/section>`,
      "gi",
    ),
  ];

  let updated = source;

  for (const pattern of patterns) {
    updated = updated.replace(pattern, "");
  }

  return updated;
}

function simplifyOfferDiscoveryGrid(source) {
  let updated = source;

  // Jika sebelumnya 4 kolom karena ada Faction/Side, ubah menjadi 3 kolom.
  updated = updated.replace(
    /lg:grid-cols-4/g,
    "lg:grid-cols-3",
  );

  updated = updated.replace(
    /xl:grid-cols-4/g,
    "xl:grid-cols-3",
  );

  return updated;
}

function patchFile(filePath, original) {
  let updated = original;

  // Hapus wrapper bersyarat dari patch V3 jika sudah pernah dipasang.
  updated = removeMarkedConditionalBlock(
    updated,
    "GAME_COIN_HIDE_FACTION_SIDE_V3",
  );
  updated = removeMarkedConditionalBlock(
    updated,
    "GAME_COIN_HIDE_SEARCH_TAGS_V3",
  );
  updated = removeMarkedConditionalBlock(
    updated,
    "GAME_COIN_HIDE_IMAGE_URL_V3",
  );

  // Hapus field mentah agar berlaku untuk SEMUA kategori.
  updated = removeFieldBlockByLabel(
    updated,
    "Faction\\s*\\/\\s*Side",
  );
  updated = removeFieldBlockByLabel(
    updated,
    "Search\\s+Tags",
  );
  updated = removeFieldBlockByLabel(
    updated,
    "Product\\s+Image\\s+URL",
  );

  updated = simplifyOfferDiscoveryGrid(updated);

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
      "Tidak menemukan file form seller yang sesuai.",
      "Pastikan ZIP diekstrak ke folder website yang benar.",
    ].join("\n"),
  );
}

console.log(`Folder website: ${websiteRoot}`);
console.log(`Kandidat ditemukan: ${candidates.length}`);
console.log("");

let changedCount = 0;
let unchangedCount = 0;

for (const candidate of candidates) {
  const result = patchFile(candidate.fullPath, candidate.content);

  if (result.changed) {
    changedCount += 1;
    console.log("PATCH BERHASIL");
    console.log(`File   : ${candidate.fullPath}`);
    console.log(`Backup : ${result.backup}`);
    console.log("");
  } else {
    unchangedCount += 1;
    console.log(`Tidak perlu diubah: ${candidate.fullPath}`);
  }
}

if (changedCount === 0) {
  throw new Error(
    "Tidak ada file yang berubah. Kemungkinan field sudah dihapus.",
  );
}

console.log("========================================");
console.log("SELESAI");
console.log("========================================");
console.log("Berlaku untuk SEMUA kategori:");
console.log("- Faction / Side dihapus.");
console.log("- Search Tags dihapus.");
console.log("- Product Image URL dihapus.");
console.log("- Offer Discovery disederhanakan menjadi Region, Platform, Server / Realm.");
console.log("");
console.log("Selanjutnya jalankan:");
console.log("Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue");
console.log("npm.cmd run dev");

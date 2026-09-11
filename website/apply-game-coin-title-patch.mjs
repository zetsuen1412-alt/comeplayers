import fs from "node:fs";
import path from "node:path";

function findTarget() {
  const candidates = [
    path.resolve(process.cwd(), "components/seller/ProductUploadClient.tsx"),
    path.resolve(process.cwd(), "website/components/seller/ProductUploadClient.tsx"),
    path.resolve(process.cwd(), "../website/components/seller/ProductUploadClient.tsx"),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }

  throw new Error(
    "ProductUploadClient.tsx tidak ditemukan. Ekstrak ZIP ini ke folder website."
  );
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Bagian ${label} tidak ditemukan. Patch dibatalkan.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const target = findTarget();
const original = fs.readFileSync(target, "utf8");

if (
  original.includes("const isGameCoin =") &&
  original.includes("const resolvedTitle =")
) {
  console.log("Patch sudah terpasang.");
  console.log(target);
  process.exit(0);
}

let updated = original;

updated = replaceRequired(
  updated,
  /(const selectedGame\s*=\s*games\.find\([\s\S]*?\);\s*)/,
  `$1

  const normalizedCategoryName = String(selectedCategory?.name || "")
    .trim()
    .toLowerCase();

  const normalizedCategorySlug = String(selectedCategory?.slug || "")
    .trim()
    .toLowerCase();

  const isGameCoin =
    ["game coins", "game coin", "coin", "coins"].includes(
      normalizedCategoryName,
    ) ||
    ["game-coins", "game-coin", "coin", "coins"].includes(
      normalizedCategorySlug,
    );

  const automaticGameCoinTitle = selectedGame
    ? \`\${selectedGame.name} Coins\`
    : "";

  const resolvedTitle = isGameCoin
    ? automaticGameCoinTitle
    : title.trim();
`,
  "selectedGame",
);

updated = updated.replaceAll("createSlug(title)", "createSlug(resolvedTitle)");

updated = updated.replace(
  /(\[[^\]]*existingProduct\?\.slug[^\]]*selectedGame[^\]]*),\s*title(\s*\])/,
  "$1, resolvedTitle$2",
);

updated = updated.replace(
  /(\[[^\]]*selectedGame[^\]]*),\s*title(\s*\])/,
  "$1, resolvedTitle$2",
);

updated = replaceRequired(
  updated,
  /if\s*\(\s*!title\.trim\(\)\s*\)\s*\{/,
  "if (!isGameCoin && !title.trim()) {",
  "validasi title",
);

const titleRows = /title:\s*title\.trim\(\),/g;
if (!titleRows.test(updated)) {
  throw new Error('Baris "title: title.trim()," tidak ditemukan.');
}
titleRows.lastIndex = 0;
updated = updated.replace(titleRows, "title: resolvedTitle,");

updated = updated.replace(
  /(\bparsedStock,\s*)title\.trim\(\)(\s*\))/,
  "$1resolvedTitle$2",
);

updated = updated.replaceAll(
  'alt={title || "Product preview"}',
  'alt={resolvedTitle || "Product preview"}',
);

updated = updated.replaceAll(
  '{title || "Product Title"}',
  '{resolvedTitle || "Product Title"}',
);

updated = replaceRequired(
  updated,
  /<div>\s*(<label[^>]*>\s*Product Title\s*<\/label>)/,
  '<div className={isGameCoin ? "hidden" : ""}>\n              $1',
  "kolom Product Title",
);

updated = updated.replace(
  /<div>\s*(<label[^>]*>\s*Price\s*<\/label>)/,
  '<div className={isGameCoin ? "md:col-span-2" : ""}>\n              $1',
);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${target}.backup-${stamp}`;

fs.copyFileSync(target, backup);
fs.writeFileSync(target, updated, "utf8");

console.log("");
console.log("PATCH BERHASIL");
console.log("========================================");
console.log(`File   : ${target}`);
console.log(`Backup : ${backup}`);
console.log("");
console.log("Product Title sekarang disembunyikan khusus Game Coins.");
console.log("Judul otomatis: <Nama Game> Coins.");
console.log("Fitur Delivery ETA dan Offer Discovery tetap dipertahankan.");

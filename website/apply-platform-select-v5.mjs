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
      "Ekstrak ZIP ke C:\\Comeplayers-new\\website lalu jalankan APPLY_PATCH_V5.bat.",
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
      content.includes("Platform") &&
      content.includes("Server / Realm");

    if (looksLikeSellerProductForm) {
      results.push({ fullPath, content });
    }
  }

  return results;
}

function patchPlatformField(source) {
  if (source.includes("PLATFORM_SELECT_PATCH_V5")) {
    return source;
  }

  if (!source.includes("setPlatform")) {
    throw new Error(
      'State setter "setPlatform" tidak ditemukan. Patch dibatalkan.',
    );
  }

  const blockPattern =
    /<div(?:\s+[^>]*)?>\s*<label[^>]*>\s*Platform\s*<\/label>\s*(?:<input[\s\S]*?\/>|<select[\s\S]*?<\/select>)\s*<\/div>/i;

  const match = source.match(blockPattern);

  if (!match) {
    throw new Error(
      "Blok field Platform tidak ditemukan.",
    );
  }

  const originalBlock = match[0];

  const outerDivMatch = originalBlock.match(
    /^<div(?:\s+[^>]*)?>/,
  );

  const labelMatch = originalBlock.match(
    /<label[^>]*>\s*Platform\s*<\/label>/i,
  );

  const classNameMatch = originalBlock.match(
    /(?:<input|<select)[\s\S]*?\bclassName=(\{[\s\S]*?\}|"[^"]*"|'[^']*')/i,
  );

  const outerDiv = outerDivMatch?.[0] ?? "<div>";
  const label = labelMatch?.[0] ?? (
    '<label className="mb-2 block text-sm font-bold text-gray-300">' +
    "Platform</label>"
  );

  const classNameAttribute = classNameMatch
    ? `className=${classNameMatch[1]}`
    : 'className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"';

  const replacement = `${outerDiv}
              ${label}

              {/* PLATFORM_SELECT_PATCH_V5 */}
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                ${classNameAttribute}
              >
                <option value="Any">Any</option>
                <option value="PC">PC</option>
                <option value="PlayStation">PlayStation</option>
                <option value="XBOX">XBOX</option>
              </select>
            </div>`;

  return source.replace(originalBlock, replacement);
}

function patchFile(filePath, original) {
  const updated = patchPlatformField(original);

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
let alreadyPatchedCount = 0;

for (const candidate of candidates) {
  try {
    const result = patchFile(candidate.fullPath, candidate.content);

    if (result.changed) {
      changedCount += 1;
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

if (changedCount === 0 && alreadyPatchedCount === 0) {
  throw new Error(
    "Tidak ada file yang berhasil dipatch. Tidak ada file proyek yang diubah.",
  );
}

console.log("========================================");
console.log("SELESAI");
console.log("========================================");
console.log("Platform sekarang berupa pilihan:");
console.log("- Any");
console.log("- PC");
console.log("- PlayStation");
console.log("- XBOX");
console.log("");
console.log("Selanjutnya jalankan:");
console.log("Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue");
console.log("npm.cmd run dev");

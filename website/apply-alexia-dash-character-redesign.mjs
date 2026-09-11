import fs from "node:fs";
import path from "node:path";

const websiteRoot = process.cwd();
const pagePath = path.join(websiteRoot, "app", "messages", "page.tsx");
const markerPath = path.join(websiteRoot, "PATCH_APPLIED_ALEXIA_DASH_V44.txt");

if (!fs.existsSync(pagePath)) {
  console.error(`Tidak menemukan file: ${pagePath}`);
  process.exit(1);
}

let source = fs.readFileSync(pagePath, "utf8");
const importLine =
  'import { useAlexiaDashCharacterRedesign } from "@/components/messages/useAlexiaDashCharacterRedesign";';

if (!source.includes(importLine)) {
  const importMatches = [...source.matchAll(/^import .*;\s*$/gm)];
  if (importMatches.length === 0) {
    console.error("Bagian import tidak ditemukan di app/messages/page.tsx");
    process.exit(1);
  }
  const lastImport = importMatches[importMatches.length - 1];
  const insertAt = (lastImport.index || 0) + lastImport[0].length;
  source = `${source.slice(0, insertAt)}\n${importLine}${source.slice(insertAt)}`;
}

if (!source.includes("useAlexiaDashCharacterRedesign();")) {
  const exportIndex = source.indexOf("export default function");
  if (exportIndex < 0) {
    console.error("Komponen export default function tidak ditemukan.");
    process.exit(1);
  }

  const openingBrace = source.indexOf("{", exportIndex);
  if (openingBrace < 0 || openingBrace - exportIndex > 800) {
    console.error("Pembuka fungsi halaman Messages tidak ditemukan.");
    process.exit(1);
  }

  source = `${source.slice(0, openingBrace + 1)}\n  useAlexiaDashCharacterRedesign();${source.slice(openingBrace + 1)}`;
}

const backupPath = `${pagePath}.alexia-dash-v44.bak`;
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(pagePath, backupPath);
}

fs.writeFileSync(pagePath, source, "utf8");
fs.writeFileSync(
  markerPath,
  [
    "ComePlayers Alexia Dash Character Redesign V44",
    `Applied: ${new Date().toISOString()}`,
    "Character assets: public/arcade/alexia-dash-v44/",
    "Runtime hook: components/messages/useAlexiaDashCharacterRedesign.ts",
  ].join("\n"),
  "utf8",
);

console.log("Berhasil menerapkan Alexia Dash Character Redesign V44.");
console.log("Backup:", backupPath);

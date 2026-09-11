#!/usr/bin/env node
/**
 * ComePlayers logo home-link fixer
 *
 * Run from the project root:
 *   node apply-logo-home-fix.mjs
 *
 * This script changes only logo elements that point to /marketplace,
 * making them point to the ComePlayers root page (/).
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXCLUDED_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".vercel",
  "out",
]);

const ALLOWED_EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".js"]);
const BACKUP_SUFFIX = ".before-logo-home-fix.bak";

function walk(directory) {
  const output = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      output.push(...walk(fullPath));
      continue;
    }

    if (ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
      output.push(fullPath);
    }
  }

  return output;
}

function isLogoMarker(fragment) {
  return (
    /alt\s*=\s*["']ComePlayers["']/i.test(fragment) ||
    /src\s*=\s*["'][^"']*(?:comeplayers[^"']*logo|logo(?:-transparent)?\.(?:png|webp|svg|jpg|jpeg))[^"']*["']/i.test(fragment)
  );
}

function replaceLogoOpeningTag(source) {
  let changed = false;
  let output = source;

  // Find Link/a opening tags. Inspect a nearby block to ensure the tag wraps
  // the ComePlayers logo before modifying its destination.
  const tagPattern = /<(Link|a)\b[\s\S]{0,900}?>/g;
  const matches = [...output.matchAll(tagPattern)].reverse();

  for (const match of matches) {
    const start = match.index;
    if (start == null) continue;

    const openingTag = match[0];
    const nearby = output.slice(start, Math.min(output.length, start + 1400));

    if (!isLogoMarker(nearby)) continue;

    let replacement = openingTag;

    replacement = replacement.replace(
      /\bhref\s*=\s*["']\/marketplace\/?["']/i,
      'href="/"'
    );

    replacement = replacement.replace(
      /\bhref\s*=\s*\{\s*["']\/marketplace\/?["']\s*\}/i,
      'href="/"'
    );

    replacement = replacement.replace(
      /router\.push\(\s*["']\/marketplace\/?["']\s*\)/i,
      'router.push("/")'
    );

    replacement = replacement.replace(
      /window\.location(?:\.href)?\s*=\s*["']\/marketplace\/?["']/i,
      'window.location.href = "/"'
    );

    if (replacement !== openingTag) {
      output =
        output.slice(0, start) +
        replacement +
        output.slice(start + openingTag.length);
      changed = true;
    }
  }

  return { output, changed };
}

function replaceClickableLogoContainer(source) {
  let changed = false;
  let output = source;

  // Handles a clickable div/button containing the logo.
  const containerPattern = /<(button|div)\b[\s\S]{0,1100}?>/g;
  const matches = [...output.matchAll(containerPattern)].reverse();

  for (const match of matches) {
    const start = match.index;
    if (start == null) continue;

    const openingTag = match[0];
    const nearby = output.slice(start, Math.min(output.length, start + 1600));

    if (!isLogoMarker(nearby)) continue;

    let replacement = openingTag
      .replace(
        /router\.push\(\s*["']\/marketplace\/?["']\s*\)/i,
        'router.push("/")'
      )
      .replace(
        /window\.location(?:\.href)?\s*=\s*["']\/marketplace\/?["']/i,
        'window.location.href = "/"'
      );

    if (replacement !== openingTag) {
      output =
        output.slice(0, start) +
        replacement +
        output.slice(start + openingTag.length);
      changed = true;
    }
  }

  return { output, changed };
}

const files = walk(ROOT);
const updated = [];

for (const filePath of files) {
  const original = fs.readFileSync(filePath, "utf8");

  if (!isLogoMarker(original)) continue;
  if (!/\/marketplace\/?/.test(original)) continue;

  const linkResult = replaceLogoOpeningTag(original);
  const containerResult = replaceClickableLogoContainer(linkResult.output);
  const next = containerResult.output;

  if (!linkResult.changed && !containerResult.changed) continue;
  if (next === original) continue;

  const backupPath = `${filePath}${BACKUP_SUFFIX}`;
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, original, "utf8");
  }

  fs.writeFileSync(filePath, next, "utf8");
  updated.push(path.relative(ROOT, filePath));
}

console.log("");
console.log("ComePlayers logo home-link fix");
console.log("--------------------------------");

if (updated.length === 0) {
  console.log("Tidak ada file yang diubah.");
  console.log("");
  console.log("Kemungkinan:");
  console.log('1. Logo sudah menggunakan href="/".');
  console.log("2. Komponen logo memakai struktur yang berbeda.");
  console.log("3. Script dijalankan bukan dari folder utama proyek.");
  console.log("");
  console.log("Gunakan patch contoh di patches/MainHeader-logo-home.patch");
  process.exit(0);
}

console.log(`Berhasil mengubah ${updated.length} file:`);
for (const file of updated) {
  console.log(`- ${file}`);
}
console.log("");
console.log('Tujuan logo sekarang: "/"');
console.log("Selanjutnya jalankan: npm run build");

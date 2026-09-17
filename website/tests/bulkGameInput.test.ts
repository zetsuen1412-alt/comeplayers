import assert from "node:assert/strict";
import test from "node:test";
import { effectiveGameCategoryIds, parseBulkGameNames, adminCategoryLabel } from "../lib/bulkGameInput";

test("accepts the requested comma-separated batch", () => {
  assert.deepEqual(parseBulkGameNames("GTA 5, Naruto, Dragonball").names, ["GTA 5", "Naruto", "Dragonball"]);
});
test("accepts newlines, Windows newlines, and semicolons", () => {
  assert.deepEqual(parseBulkGameNames("GTA 5\r\nNaruto;Dragonball").names, ["GTA 5", "Naruto", "Dragonball"]);
});
test("normalizes repeated whitespace and deduplicates case-insensitively", () => {
  const result = parseBulkGameNames(" GTA   5, gta 5,\nNARUTO;Naruto ");
  assert.deepEqual(result.names, ["GTA 5", "NARUTO"]);
  assert.equal(result.duplicates, 2);
});
test("preserves punctuation in one-game-per-line mode", () => {
  assert.deepEqual(parseBulkGameNames("Papers, Please\nGame; Subtitle", "lines").names, ["Papers, Please", "Game; Subtitle"]);
});
test("ignores empty entries without producing a blank game", () => {
  assert.deepEqual(parseBulkGameNames(" , ; \r\n ").names, []);
});
test("retains Unicode and apostrophes", () => {
  assert.deepEqual(parseBulkGameNames("龍が如く\nBaldur's Gate 3").names, ["龍が如く", "Baldur's Gate 3"]);
});
test("allows exactly 100 distinct games", () => {
  assert.equal(parseBulkGameNames(Array.from({ length: 100 }, (_, i) => `Game ${i}`).join(",")).errors.length, 0);
});
test("rejects over-limit batches rather than silently truncating", () => {
  const result = parseBulkGameNames(Array.from({ length: 101 }, (_, i) => `Game ${i}`).join(","));
  assert.equal(result.names.length, 101);
  assert.equal(result.errors.length, 1);
});
test("rejects oversized names and text", () => {
  assert.equal(parseBulkGameNames("A".repeat(201)).errors.length, 1);
  assert.equal(parseBulkGameNames("A".repeat(30001)).errors.length, 1);
});
test("allows 200 Unicode code points", () => {
  assert.equal(parseBulkGameNames("🎮".repeat(200)).errors.length, 0);
});
test("does not silently equate aliases or similar punctuation", () => {
  assert.deepEqual(parseBulkGameNames("GTA 5,Grand Theft Auto V,Foo Bar,Foo-Bar").names, ["GTA 5", "Grand Theft Auto V", "Foo Bar", "Foo-Bar"]);
});
test("shows every active category on one game", () => {
  assert.deepEqual(effectiveGameCategoryIds({ category_id: 8, category_links: [1, 2, 3, 4].map((id) => ({ category_id: id, status: "active" })) }, [1, 2, 3, 4, 8]), [1, 2, 3, 4]);
});
test("does not resurrect an explicitly removed legacy category", () => {
  assert.deepEqual(effectiveGameCategoryIds({ category_id: 1, category_links: [{ category_id: 1, status: "inactive" }] }, [1]), []);
});
test("preserves unmapped legacy rows and ignores unknown categories", () => {
  assert.deepEqual(effectiveGameCategoryIds({ category_id: 1 }, [1, 2]), [1]);
  assert.deepEqual(effectiveGameCategoryIds({ category_id: 999 }, [1, 2]), []);
});
test("translates known labels while preserving custom category names", () => {
  assert.equal(adminCategoryLabel({ name: "Game Accounts", slug: "game-accounts" }), "Akun Game");
  assert.equal(adminCategoryLabel({ name: "Kategori Kustom", slug: "custom" }), "Kategori Kustom");
});

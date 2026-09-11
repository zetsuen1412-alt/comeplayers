import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETPLACE_CATEGORY_DEFINITIONS,
  canonicalMarketplaceCategory,
  marketplaceCategoryLabel,
  marketplaceCategoryMatches,
  normalizeMarketplaceValue,
} from "@/lib/marketplaceTaxonomy";

test("marketplace taxonomy always exposes the four buyer categories", () => {
  assert.deepEqual(
    MARKETPLACE_CATEGORY_DEFINITIONS.map((category) => category.code),
    ["coin", "boosting", "item", "account"]
  );
});

test("legacy and localized category names map to canonical category codes", () => {
  assert.equal(canonicalMarketplaceCategory("Game Coins"), "coin");
  assert.equal(canonicalMarketplaceCategory("Koin Game"), "coin");
  assert.equal(canonicalMarketplaceCategory("Power Leveling"), "boosting");
  assert.equal(canonicalMarketplaceCategory("Jasa Joki"), "boosting");
  assert.equal(canonicalMarketplaceCategory("Game Items"), "item");
  assert.equal(canonicalMarketplaceCategory("Akun Game"), "account");
});

test("category filters accept canonical URL values and legacy database values", () => {
  assert.equal(marketplaceCategoryMatches("Game Coins", "coin"), true);
  assert.equal(marketplaceCategoryMatches("Koin Game", "game-coins"), true);
  assert.equal(marketplaceCategoryMatches("Jasa Joki", "boosting"), true);
  assert.equal(marketplaceCategoryMatches("Game Accounts", "item"), false);
  assert.equal(marketplaceCategoryMatches("Unmapped Service", ""), true);
});

test("category labels and slugs are stable for marketplace URLs", () => {
  assert.equal(marketplaceCategoryLabel("coin"), "Game Coins");
  assert.equal(marketplaceCategoryLabel("game accounts"), "Game Accounts");
  assert.equal(normalizeMarketplaceValue("Aquilla 2 [NA/SA]"), "aquilla-2-na-sa");
});

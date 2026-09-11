import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("category landing opens games before offers", () => {
  const page = source("app/categories/[slug]/page.tsx");
  const landing = source("components/marketplace/MarketplaceCategoryLanding.tsx");
  assert.match(page, /MarketplaceCategoryLanding/);
  assert.match(page, /game_master/);
  assert.match(landing, /Popular Products/);
  assert.match(landing, /category === "coin"/);
  assert.match(landing, /\/games\/\$\{encodeURIComponent\(gameSlug\)\}\?category=coin/);
});

test("game detail has category tabs and faction-aware coin server grouping", () => {
  const page = source("app/games/[slug]/page.tsx");
  const browser = source("components/marketplace/GameCategoryServerBrowser.tsx");
  assert.match(page, /GameMarketplaceCategoryTabs/);
  assert.match(page, /groupCoinServers/);
  assert.match(page, /offer_faction/);
  assert.match(browser, /params\.set\("faction", server\.faction\)/);
  assert.match(browser, /Lowest price/);
});

test("offer API filters faction and performs stable price sorting", () => {
  const route = source("app/api/products/by-game/route.ts");
  assert.match(route, /searchParams\.get\("faction"\)/);
  assert.match(route, /containsNormalized\(offer\.factions, faction\)/);
  assert.match(route, /factions: buildFacet/);
  assert.match(route, /case "price_asc"/);
  assert.match(route, /stableOfferId/);
});

test("seller and product views keep sorting and filters in the URL", () => {
  const client = source("app/games/[slug]/offers/GameOffersClient.tsx");
  const localization = source("lib/localization.ts");
  assert.match(client, /isCoinSellerList/);
  assert.match(client, /SellerRow/);
  assert.match(client, /ProductCard/);
  assert.match(client, /params\.set\("faction", next\.faction\)/);
  assert.match(client, /t\("offers\.sort\.recommended"\)/);
  assert.match(client, /t\("offers\.sort\.lowestPrice"\)/);
  assert.match(localization, /"offers\.sort\.recommended": "Recommended"/);
  assert.match(localization, /"offers\.sort\.lowestPrice": "Lowest price"/);
  assert.match(client, /router\.replace/);
});

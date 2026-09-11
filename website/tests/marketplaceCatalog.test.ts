import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCuratedOfferCounts,
  filterCuratedMarketplaceCatalog,
  getCuratedCategoryMeta,
  getCuratedMarketplaceCatalog,
  isCuratedMarketplaceCategory,
} from "../lib/marketplaceCatalog";

test("gift cards and software are curated marketplace categories", () => {
  assert.equal(isCuratedMarketplaceCategory("gift-cards"), true);
  assert.equal(isCuratedMarketplaceCategory("Gift Cards"), true);
  assert.equal(isCuratedMarketplaceCategory("software"), true);
  assert.equal(isCuratedMarketplaceCategory("game-coins"), false);

  assert.equal(getCuratedCategoryMeta("gift-cards")?.heading, "Gift Cards");
  assert.equal(getCuratedCategoryMeta("software")?.heading, "Software");
});

test("curated gift cards include common entertainment and wallet products", () => {
  const names = getCuratedMarketplaceCatalog("gift-cards").map((entry) => entry.name);

  assert.ok(names.includes("Google Play Gift Card"));
  assert.ok(names.includes("Spotify Premium"));
  assert.ok(names.includes("Netflix Gift Card"));
  assert.ok(names.includes("Steam Wallet Code"));
});

test("curated software includes productivity, security, and operating system items", () => {
  const names = getCuratedMarketplaceCatalog("software").map((entry) => entry.name);

  assert.ok(names.includes("Microsoft 365"));
  assert.ok(names.includes("Windows 11 License"));
  assert.ok(names.includes("Adobe Creative Cloud"));
  assert.ok(names.includes("NordVPN"));
});

test("curated catalog search and letter filters stay category-local", () => {
  const giftCards = getCuratedMarketplaceCatalog("gift-cards");
  const spotify = filterCuratedMarketplaceCatalog(giftCards, "spotify", "");
  const letterN = filterCuratedMarketplaceCatalog(giftCards, "", "N");

  assert.deepEqual(
    spotify.map((entry) => entry.name),
    ["Spotify Premium"]
  );
  assert.ok(letterN.every((entry) => entry.first_letter === "N"));
});

test("curated offer counts only include active matching products", () => {
  const googlePlay = getCuratedMarketplaceCatalog("gift-cards").filter(
    (entry) => entry.name === "Google Play Gift Card"
  );

  const counted = applyCuratedOfferCounts(googlePlay, [
    {
      title: "Google Play Gift Card IDR 100K",
      game_name: null,
      category: "Gift Cards",
      stock: 5,
    },
    {
      title: "Google Play Gift Card Sold Out",
      game_name: null,
      category: "Gift Cards",
      stock: 0,
    },
    {
      title: "Spotify Premium 12 Months",
      game_name: null,
      category: "Gift Cards",
      stock: 3,
    },
  ]);

  assert.equal(counted[0]?.offer_count, 1);
});

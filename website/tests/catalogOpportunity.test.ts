import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogOpportunity,
  type CatalogOpportunityCategoryCode,
} from "../lib/catalogOpportunity";

const cases: Array<[CatalogOpportunityCategoryCode, string]> = [
  ["boosting", "Jasa Joki & Boosting"],
  ["coin", "Mata Uang Game"],
  ["item", "Item Game"],
  ["account", "Akun Game"],
];

for (const [categoryCode, expectedTitle] of cases) {
  test(`builds original ${categoryCode} idea with ComePlayers checkout`, () => {
    const idea = buildCatalogOpportunity({
      gameId: 42,
      gameName: "  Aion   Classic  ",
      gameSlug: "aion-classic",
      categoryCode,
      sourceUrl: "https://www.g2g.com/id/categories/aion-classic-boosting-service",
    });

    assert.match(idea.title, new RegExp(`^${expectedTitle} Aion Classic`));
    assert.match(idea.description, /EVO GAMING FARMING HOUSE/);
    assert.match(idea.description, /ditangani langsung oleh tim EVO GAMING/);
    assert.match(idea.description, /Permintaan untuk game lain dapat diajukan/);
    assert.match(idea.description, /cakupan dan harga dapat didiskusikan/);
    assert.match(idea.description, /checkout ComePlayers/);
    assert.doesNotMatch(idea.description, /payment only in g2g|trusted 100%|anti-cheat guarantee|all are personal stock|5 to 10 minutes/i);
    assert.doesNotMatch(idea.description, /g2g\.com/i);
    assert.equal(idea.gameName, "Aion Classic");
    assert.equal(idea.sourceUrl, "https://www.g2g.com/id/categories/aion-classic-boosting-service");
    if (categoryCode === "boosting") {
      assert.match(idea.description, /VPN atau siaran progres dapat dibahas jika tersedia/);
    }
  });
}

test("title remains valid for a long game name", () => {
  const idea = buildCatalogOpportunity({
    gameId: 1,
    gameName: "Very Long Game Name ".repeat(12),
    gameSlug: "long-game",
    categoryCode: "boosting",
  });

  assert.ok(idea.title.length <= 180);
  assert.equal(idea.sourceUrl, null);
});

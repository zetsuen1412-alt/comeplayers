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
    assert.match(idea.description, /handled directly by the EVO GAMING team/);
    assert.match(idea.description, /Requests for other games are welcome/);
    assert.match(idea.description, /Scope and price can be discussed/);
    assert.match(idea.description, /5–10 minutes.*when a service slot is available/);
    assert.match(idea.description, /ComePlayers checkout only/);
    assert.doesNotMatch(idea.description, /payment only in g2g|trusted 100%|anti-cheat guarantee|all are personal stock/i);
    assert.doesNotMatch(idea.description, /g2g\.com/i);
    assert.equal(idea.gameName, "Aion Classic");
    assert.equal(idea.sourceUrl, "https://www.g2g.com/id/categories/aion-classic-boosting-service");
    if (categoryCode === "boosting") {
      assert.match(idea.description, /VPN and progress streaming can be arranged where available/);
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

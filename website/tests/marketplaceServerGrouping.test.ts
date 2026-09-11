import assert from "node:assert/strict";
import test from "node:test";
import {
  groupCoinServers,
  sortCoinServerGroups,
  type MarketplaceServerProduct,
  type MarketplaceServerVariant,
} from "@/lib/marketplaceServerGrouping";

const products: MarketplaceServerProduct[] = [
  {
    id: 1,
    category: "Game Coins",
    seller_id: "seller-a",
    offer_server: "Spineshatter",
    offer_region: "EU Anniversary",
    offer_faction: "Alliance",
    price: 200,
    stock: 100,
  },
  {
    id: 2,
    category: "coin",
    seller_id: "seller-b",
    offer_server: "Spineshatter",
    offer_region: "EU Anniversary",
    offer_faction: "Horde",
    price: 150,
    stock: 100,
  },
  {
    id: 3,
    category: "coin",
    seller_id: "seller-c",
    offer_server: "Nightslayer",
    offer_region: "US Anniversary",
    price: 180,
    stock: 100,
  },
];

const variants: MarketplaceServerVariant[] = [
  {
    product_id: 1,
    attributes: {
      server: "Spineshatter",
      region: "EU Anniversary",
      faction: "Alliance",
    },
    price: 121,
    stock: 20,
    status: "active",
  },
  {
    product_id: 1,
    attributes: {
      server: "Spineshatter",
      region: "EU Anniversary",
      faction: "Alliance",
    },
    price: 130,
    stock: 0,
    status: "active",
  },
];

test("server grouping keeps Alliance and Horde separate", () => {
  const groups = groupCoinServers(products, variants);
  const spineshatter = groups.filter((group) => group.name === "Spineshatter");
  assert.equal(spineshatter.length, 2);
  assert.deepEqual(
    new Set(spineshatter.map((group) => group.faction)),
    new Set(["Alliance", "Horde"])
  );
});

test("server grouping uses the minimum active in-stock variant price", () => {
  const groups = groupCoinServers(products, variants);
  const alliance = groups.find((group) => group.faction === "Alliance");
  assert.equal(alliance?.minimumPrice, 121);
});

test("lowest price sorting is stable and ascending", () => {
  const groups = groupCoinServers(products, variants);
  const sorted = sortCoinServerGroups(groups, "price_asc");
  assert.deepEqual(
    sorted.map((group) => group.minimumPrice),
    [...sorted.map((group) => group.minimumPrice)].sort((a, b) => a - b)
  );
});

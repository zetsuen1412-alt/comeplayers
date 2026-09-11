import {
  canonicalMarketplaceCategory,
  normalizeMarketplaceValue,
} from "@/lib/marketplaceTaxonomy";

export type MarketplaceServerProduct = {
  id: number;
  category?: string | null;
  seller_id?: string | null;
  offer_server?: string | null;
  offer_region?: string | null;
  offer_platform?: string | null;
  offer_faction?: string | null;
  price?: number | string | null;
  min_variant_price?: number | string | null;
  stock?: number | null;
};

export type MarketplaceServerVariant = {
  product_id: number;
  attributes?: Record<string, unknown> | null;
  price?: number | string | null;
  stock?: number | null;
  status?: string | null;
};

export type MarketplaceServerGroup = {
  key: string;
  name: string;
  slug: string;
  region: string;
  faction: string;
  platform: string;
  offerCount: number;
  sellerCount: number;
  minimumPrice: number;
};

type MutableGroup = MarketplaceServerGroup & { sellers: Set<string> };

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function activeVariant(variant: MarketplaceServerVariant) {
  return String(variant.status || "active").toLowerCase() === "active";
}

function attribute(
  attributes: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  if (!attributes) return "";
  const normalizedKeys = new Set(keys.map(normalizeMarketplaceValue));
  for (const [key, value] of Object.entries(attributes)) {
    if (!normalizedKeys.has(normalizeMarketplaceValue(key))) continue;
    if (Array.isArray(value)) {
      const first = value.find((item) => String(item || "").trim());
      return String(first || "").trim();
    }
    return String(value || "").trim();
  }
  return "";
}

function effectiveProductPrice(product: MarketplaceServerProduct) {
  const candidates = [product.min_variant_price, product.price]
    .map(numberValue)
    .filter((value) => value > 0);
  return candidates.length ? Math.min(...candidates) : 0;
}

function groupKey(input: {
  server: string;
  region: string;
  faction: string;
  platform: string;
}) {
  return [input.server, input.region, input.faction, input.platform]
    .map((value) => normalizeMarketplaceValue(value || "global") || "global")
    .join(":");
}

export function groupCoinServers(
  products: MarketplaceServerProduct[],
  variants: MarketplaceServerVariant[]
): MarketplaceServerGroup[] {
  const variantsByProduct = new Map<number, MarketplaceServerVariant[]>();
  for (const variant of variants.filter(activeVariant)) {
    const productId = Number(variant.product_id);
    if (!Number.isFinite(productId)) continue;
    const current = variantsByProduct.get(productId) || [];
    current.push(variant);
    variantsByProduct.set(productId, current);
  }

  const groups = new Map<string, MutableGroup>();

  function add(input: {
    product: MarketplaceServerProduct;
    server: string;
    region: string;
    faction: string;
    platform: string;
    price: number;
  }) {
    const server = input.server.trim() || "Global";
    const region = input.region.trim() || "Global";
    const faction = input.faction.trim();
    const platform = input.platform.trim();
    const key = groupKey({ server, region, faction, platform });
    const existing = groups.get(key);
    if (existing) {
      existing.offerCount += 1;
      if (input.product.seller_id) existing.sellers.add(input.product.seller_id);
      if (
        input.price > 0 &&
        (existing.minimumPrice <= 0 || input.price < existing.minimumPrice)
      ) {
        existing.minimumPrice = input.price;
      }
      return;
    }

    groups.set(key, {
      key,
      name: server,
      slug: normalizeMarketplaceValue(server) || "global",
      region,
      faction,
      platform,
      offerCount: 1,
      sellerCount: input.product.seller_id ? 1 : 0,
      minimumPrice: input.price,
      sellers: new Set(input.product.seller_id ? [input.product.seller_id] : []),
    });
  }

  for (const product of products) {
    if (canonicalMarketplaceCategory(product.category) !== "coin") continue;
    const productVariants = variantsByProduct.get(Number(product.id)) || [];
    if (productVariants.length) {
      for (const variant of productVariants) {
        if (numberValue(variant.stock) <= 0) continue;
        const attributes = variant.attributes;
        add({
          product,
          server:
            attribute(attributes, ["server", "server name", "realm", "shard"]) ||
            product.offer_server ||
            "Global",
          region:
            attribute(attributes, ["region", "region code", "country"]) ||
            product.offer_region ||
            "Global",
          faction:
            attribute(attributes, ["faction", "side", "team"]) ||
            product.offer_faction ||
            "",
          platform:
            attribute(attributes, ["platform", "device", "store"]) ||
            product.offer_platform ||
            "",
          price: numberValue(variant.price) || effectiveProductPrice(product),
        });
      }
      continue;
    }

    if (numberValue(product.stock) <= 0) continue;
    add({
      product,
      server: product.offer_server || "Global",
      region: product.offer_region || "Global",
      faction: product.offer_faction || "",
      platform: product.offer_platform || "",
      price: effectiveProductPrice(product),
    });
  }

  return Array.from(groups.values())
    .map(({ sellers, ...group }) => ({ ...group, sellerCount: sellers.size }))
    .sort((a, b) => {
      if (b.offerCount !== a.offerCount) return b.offerCount - a.offerCount;
      if (b.sellerCount !== a.sellerCount) return b.sellerCount - a.sellerCount;
      if (a.minimumPrice > 0 && b.minimumPrice > 0) {
        return a.minimumPrice - b.minimumPrice;
      }
      return `${a.name} ${a.region} ${a.faction}`.localeCompare(
        `${b.name} ${b.region} ${b.faction}`
      );
    });
}

export function sortCoinServerGroups(
  groups: MarketplaceServerGroup[],
  sort: "recommended" | "price_asc"
) {
  const list = [...groups];
  if (sort === "price_asc") {
    return list.sort((a, b) => {
      const left = a.minimumPrice > 0 ? a.minimumPrice : Number.MAX_SAFE_INTEGER;
      const right = b.minimumPrice > 0 ? b.minimumPrice : Number.MAX_SAFE_INTEGER;
      if (left !== right) return left - right;
      if (b.offerCount !== a.offerCount) return b.offerCount - a.offerCount;
      return a.key.localeCompare(b.key);
    });
  }
  return list.sort((a, b) => {
    if (b.offerCount !== a.offerCount) return b.offerCount - a.offerCount;
    if (b.sellerCount !== a.sellerCount) return b.sellerCount - a.sellerCount;
    if (a.minimumPrice !== b.minimumPrice) return a.minimumPrice - b.minimumPrice;
    return a.key.localeCompare(b.key);
  });
}

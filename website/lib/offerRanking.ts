import {
  effectivePresence,
  normalizeServiceLevel,
  type SellerPresence,
  type SellerServiceLevel,
} from "@/lib/sellerServiceLevel";

export type OfferProfile = {
  id: string;
  username?: string | null;
  seller_name?: string | null;
  avatar_url?: string | null;
  seller_rating?: number | string | null;
  seller_review_count?: number | null;
  seller_status?: string | null;
  seller_presence_mode?: string | null;
  seller_last_seen_at?: string | null;
  seller_delivery_sla_minutes?: number | null;
  seller_avg_delivery_minutes?: number | string | null;
  seller_on_time_rate?: number | string | null;
  seller_total_deliveries?: number | null;
  seller_service_level?: string | null;
};

export type OfferVariant = {
  product_id: number;
  name?: string | null;
  sku?: string | null;
  attributes?: Record<string, unknown> | null;
  price?: number | string | null;
  stock?: number | null;
  status?: string | null;
};

export type OfferProduct = {
  id: number;
  title: string;
  slug?: string | null;
  price?: number | string | null;
  min_variant_price?: number | string | null;
  max_variant_price?: number | string | null;
  image_url?: string | null;
  category?: string | null;
  seller_id?: string | null;
  seller_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  game_name?: string | null;
  stock?: number | null;
  delivery_eta_minutes?: number | null;
  has_variants?: boolean | null;
  variant_count?: number | null;
  offer_region?: string | null;
  offer_platform?: string | null;
  offer_server?: string | null;
  offer_faction?: string | null;
  offer_tags?: string[] | null;
};

export type OfferRankingInput = {
  product: OfferProduct;
  profile?: OfferProfile | null;
  variants?: OfferVariant[];
  medianPrice: number;
  query?: string;
};

export type RankedOffer = OfferProduct & {
  href: string;
  effective_price: number;
  effective_max_price: number;
  effective_stock: number;
  delivery_eta: number;
  seller_display_name: string;
  seller_avatar_url: string | null;
  seller_rating: number;
  seller_review_count: number;
  seller_completed_orders: number;
  seller_on_time_rate: number;
  seller_average_delivery: number;
  seller_service_level: SellerServiceLevel;
  seller_presence: SellerPresence;
  seller_verified: boolean;
  regions: string[];
  platforms: string[];
  servers: string[];
  factions: string[];
  searchable_tags: string[];
  ranking_score: number;
  ranking_label: string;
  ranking_reasons: string[];
};

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeFacet(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueDisplay(values: unknown[]) {
  const result = new Map<string, string>();

  for (const value of values) {
    const text = String(value || "").trim();
    const key = normalizeFacet(text);
    if (!key || result.has(key)) continue;
    result.set(key, text);
  }

  return Array.from(result.values());
}

function collectAttributeValues(
  variants: OfferVariant[],
  acceptedKeys: string[]
) {
  const accepted = acceptedKeys.map(normalizeFacet);
  const values: unknown[] = [];

  for (const variant of variants) {
    const attributes = variant.attributes || {};
    for (const [key, value] of Object.entries(attributes)) {
      if (!accepted.includes(normalizeFacet(key))) continue;
      if (Array.isArray(value)) values.push(...value);
      else values.push(value);
    }
  }

  return values;
}

function queryRelevance(input: {
  query: string;
  product: OfferProduct;
  sellerName: string;
  regions: string[];
  platforms: string[];
  servers: string[];
  factions: string[];
  tags: string[];
}) {
  const query = input.query.trim().toLowerCase();
  if (!query) return 0;

  const title = String(input.product.title || "").toLowerCase();
  const category = String(input.product.category || "").toLowerCase();
  const game = String(input.product.game_name || "").toLowerCase();
  const seller = input.sellerName.toLowerCase();
  const metadata = [
    ...input.regions,
    ...input.platforms,
    ...input.servers,
    ...input.factions,
    ...input.tags,
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  if (title === query) score += 28;
  else if (title.startsWith(query)) score += 22;
  else if (title.includes(query)) score += 16;

  if (category.includes(query)) score += 8;
  if (game.includes(query)) score += 6;
  if (seller.includes(query)) score += 4;
  if (metadata.includes(query)) score += 8;

  return Math.min(32, score);
}

function serviceLevelBoost(level: SellerServiceLevel) {
  switch (level) {
    case "elite":
      return 12;
    case "trusted":
      return 9;
    case "reliable":
      return 6;
    case "standard":
      return 3;
    default:
      return 0;
  }
}

function deliveryScore(minutes: number) {
  if (minutes <= 15) return 14;
  if (minutes <= 30) return 12;
  if (minutes <= 60) return 10;
  if (minutes <= 120) return 8;
  if (minutes <= 240) return 6;
  if (minutes <= 480) return 4;
  if (minutes <= 1440) return 2;
  return 0;
}

function priceScore(price: number, medianPrice: number) {
  if (price <= 0 || medianPrice <= 0) return 0;
  const ratio = price / medianPrice;
  if (ratio <= 0.75) return 18;
  if (ratio <= 0.9) return 15;
  if (ratio <= 1) return 12;
  if (ratio <= 1.15) return 8;
  if (ratio <= 1.35) return 3;
  return -5;
}

function rankingLabel(input: {
  score: number;
  price: number;
  medianPrice: number;
  deliveryEta: number;
  rating: number;
  completed: number;
  presence: SellerPresence;
}) {
  if (input.presence === "online" && input.score >= 75) return "Online Best Match";
  if (input.deliveryEta <= 30 && input.score >= 65) return "Fast Delivery";
  if (input.price > 0 && input.medianPrice > 0 && input.price <= input.medianPrice * 0.85) {
    return "Best Price";
  }
  if (input.rating >= 4.8 && input.completed >= 25) return "Top Seller";
  if (input.score >= 85) return "Recommended";
  return "Marketplace Offer";
}

export function effectiveProductPrice(product: OfferProduct, variants: OfferVariant[] = []) {
  const activeVariantPrices = variants
    .filter((variant) => String(variant.status || "active").toLowerCase() === "active")
    .map((variant) => numeric(variant.price))
    .filter((price) => price > 0);

  if (activeVariantPrices.length > 0) return Math.min(...activeVariantPrices);

  const summaryPrice = numeric(product.min_variant_price);
  if (summaryPrice > 0) return summaryPrice;
  return numeric(product.price);
}

export function effectiveProductMaxPrice(product: OfferProduct, variants: OfferVariant[] = []) {
  const activeVariantPrices = variants
    .filter((variant) => String(variant.status || "active").toLowerCase() === "active")
    .map((variant) => numeric(variant.price))
    .filter((price) => price > 0);

  if (activeVariantPrices.length > 0) return Math.max(...activeVariantPrices);

  const summaryPrice = numeric(product.max_variant_price);
  if (summaryPrice > 0) return summaryPrice;
  return numeric(product.price);
}

export function rankOffer({
  product,
  profile,
  variants = [],
  medianPrice,
  query = "",
}: OfferRankingInput): RankedOffer {
  const regions = uniqueDisplay([
    product.offer_region,
    ...collectAttributeValues(variants, ["region", "region code", "country"]),
  ]);
  const platforms = uniqueDisplay([
    product.offer_platform,
    ...collectAttributeValues(variants, ["platform", "device", "store"]),
  ]);
  const servers = uniqueDisplay([
    product.offer_server,
    ...collectAttributeValues(variants, ["server", "server name", "shard", "realm"]),
  ]);
  const factions = uniqueDisplay([
    product.offer_faction,
    ...collectAttributeValues(variants, ["faction", "side", "team"]),
  ]);
  const searchableTags = uniqueDisplay([
    ...(product.offer_tags || []),
    ...variants.flatMap((variant) => [variant.name, variant.sku]),
  ]);

  const effectivePrice = effectiveProductPrice(product, variants);
  const effectiveMaxPrice = effectiveProductMaxPrice(product, variants);
  const effectiveStock = variants.length
    ? variants
        .filter((variant) => String(variant.status || "active").toLowerCase() === "active")
        .reduce((total, variant) => total + Math.max(0, numeric(variant.stock)), 0)
    : Math.max(0, numeric(product.stock));

  const sellerName =
    profile?.seller_name ||
    profile?.username ||
    product.seller_name ||
    "Marketplace Seller";
  const rating = Math.max(0, Math.min(5, numeric(profile?.seller_rating)));
  const reviewCount = Math.max(0, numeric(profile?.seller_review_count));
  const completed = Math.max(0, numeric(profile?.seller_total_deliveries));
  const onTimeRate = Math.max(0, Math.min(100, numeric(profile?.seller_on_time_rate, 100)));
  const averageDelivery = Math.max(0, numeric(profile?.seller_avg_delivery_minutes));
  const serviceLevel = normalizeServiceLevel(profile?.seller_service_level);
  const presence = effectivePresence(
    profile?.seller_presence_mode,
    profile?.seller_last_seen_at
  );
  const deliveryEta = Math.max(
    15,
    numeric(product.delivery_eta_minutes || profile?.seller_delivery_sla_minutes, 60)
  );
  const verified = String(profile?.seller_status || "").toLowerCase() === "approved";

  const ratingPoints = rating * 8;
  const reviewConfidence = Math.min(8, Math.log10(reviewCount + 1) * 4);
  const volumePoints = Math.min(18, Math.log10(completed + 1) * 7);
  const onTimePoints = onTimeRate * 0.18;
  const servicePoints = serviceLevelBoost(serviceLevel);
  const presencePoints = presence === "online" ? 8 : presence === "away" ? 3 : 0;
  const speedPoints = deliveryScore(deliveryEta);
  const valuePoints = priceScore(effectivePrice, medianPrice);
  const stockPoints = effectiveStock > 0 ? Math.min(6, 2 + Math.log10(effectiveStock + 1) * 2) : -100;
  const verifiedPoints = verified ? 5 : 0;
  const ageDays = product.created_at
    ? Math.max(0, (Date.now() - Date.parse(product.created_at)) / 86_400_000)
    : 365;
  const recencyPoints = Math.max(0, 4 - ageDays / 30);
  const relevancePoints = queryRelevance({
    query,
    product,
    sellerName,
    regions,
    platforms,
    servers,
    factions,
    tags: searchableTags,
  });

  const score = Math.max(
    0,
    Math.round(
      (ratingPoints +
        reviewConfidence +
        volumePoints +
        onTimePoints +
        servicePoints +
        presencePoints +
        speedPoints +
        valuePoints +
        stockPoints +
        verifiedPoints +
        recencyPoints +
        relevancePoints) *
        10
    ) / 10
  );

  const reasons: string[] = [];
  if (presence === "online") reasons.push("Seller online");
  if (deliveryEta <= 60) reasons.push("Fast delivery");
  if (onTimeRate >= 95) reasons.push("High on-time rate");
  if (rating >= 4.7 && reviewCount >= 3) reasons.push("Strong seller rating");
  if (medianPrice > 0 && effectivePrice <= medianPrice) reasons.push("Competitive price");
  if (serviceLevel === "trusted" || serviceLevel === "elite") {
    reasons.push(`${serviceLevel.charAt(0).toUpperCase()}${serviceLevel.slice(1)} seller`);
  }

  return {
    ...product,
    href: `/product/${product.slug || product.id}`,
    effective_price: effectivePrice,
    effective_max_price: effectiveMaxPrice,
    effective_stock: effectiveStock,
    delivery_eta: deliveryEta,
    seller_display_name: sellerName,
    seller_avatar_url: profile?.avatar_url || null,
    seller_rating: rating,
    seller_review_count: reviewCount,
    seller_completed_orders: completed,
    seller_on_time_rate: onTimeRate,
    seller_average_delivery: averageDelivery,
    seller_service_level: serviceLevel,
    seller_presence: presence,
    seller_verified: verified,
    regions,
    platforms,
    servers,
    factions,
    searchable_tags: searchableTags,
    ranking_score: score,
    ranking_label: rankingLabel({
      score,
      price: effectivePrice,
      medianPrice,
      deliveryEta,
      rating,
      completed,
      presence,
    }),
    ranking_reasons: reasons.slice(0, 3),
  };
}

export function median(values: number[]) {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  return sorted[midpoint];
}

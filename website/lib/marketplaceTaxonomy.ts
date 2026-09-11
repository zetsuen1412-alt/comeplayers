export type MarketplaceCategoryCode = "coin" | "boosting" | "item" | "account";

export type MarketplaceCategoryDefinition = {
  code: MarketplaceCategoryCode;
  label: string;
  shortLabel: string;
  description: string;
  aliases: readonly string[];
};

export const MARKETPLACE_CATEGORY_DEFINITIONS: readonly MarketplaceCategoryDefinition[] = [
  {
    code: "coin",
    label: "Game Coins",
    shortLabel: "Game Coin",
    description: "In-game currencies, gold, credits, and other game funds.",
    aliases: [
      "coin",
      "coins",
      "game coin",
      "game coins",
      "game currency",
      "currency",
      "gold",
      "koin",
      "koin game",
    ],
  },
  {
    code: "boosting",
    label: "Boosting Services",
    shortLabel: "Boosting",
    description: "Rank boosting, leveling, coaching, farming, and quest completion.",
    aliases: [
      "boosting",
      "boost",
      "power leveling",
      "power-leveling",
      "leveling",
      "jasa joki",
      "joki",
      "coaching",
    ],
  },
  {
    code: "item",
    label: "Item",
    shortLabel: "Items",
    description: "Weapons, armor, materials, mounts, cosmetics, and other items.",
    aliases: ["item", "items", "game item", "game items", "equipment", "gear"],
  },
  {
    code: "account",
    label: "Game Accounts",
    shortLabel: "Accounts",
    description: "Game accounts organized by platform, region, level, rank, and character.",
    aliases: ["account", "accounts", "game account", "game accounts", "akun", "akun game"],
  },
] as const;

export function normalizeMarketplaceValue(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const categoryAliasMap = new Map<string, MarketplaceCategoryCode>();

for (const definition of MARKETPLACE_CATEGORY_DEFINITIONS) {
  categoryAliasMap.set(normalizeMarketplaceValue(definition.code), definition.code);
  categoryAliasMap.set(normalizeMarketplaceValue(definition.label), definition.code);
  categoryAliasMap.set(normalizeMarketplaceValue(definition.shortLabel), definition.code);

  for (const alias of definition.aliases) {
    categoryAliasMap.set(normalizeMarketplaceValue(alias), definition.code);
  }
}

export function canonicalMarketplaceCategory(
  value: unknown
): MarketplaceCategoryCode | null {
  const normalized = normalizeMarketplaceValue(value);
  if (!normalized) return null;

  const exact = categoryAliasMap.get(normalized);
  if (exact) return exact;

  if (
    normalized.includes("coin") ||
    normalized.includes("currency") ||
    normalized === "gold" ||
    normalized.startsWith("gold-")
  ) {
    return "coin";
  }

  if (
    normalized.includes("boost") ||
    normalized.includes("joki") ||
    normalized.includes("leveling") ||
    normalized.includes("coaching")
  ) {
    return "boosting";
  }

  if (normalized.includes("account") || normalized.includes("akun")) {
    return "account";
  }

  if (
    normalized.includes("item") ||
    normalized.includes("equipment") ||
    normalized.includes("gear")
  ) {
    return "item";
  }

  return null;
}

export function marketplaceCategoryDefinition(value: unknown) {
  const code = canonicalMarketplaceCategory(value);
  return (
    MARKETPLACE_CATEGORY_DEFINITIONS.find(
      (definition) => definition.code === code
    ) || null
  );
}

export function marketplaceCategoryLabel(value: unknown) {
  return marketplaceCategoryDefinition(value)?.label || String(value || "").trim();
}

export function marketplaceCategoryMatches(
  categoryValue: unknown,
  selectedValue: unknown
) {
  const selected = normalizeMarketplaceValue(selectedValue);
  if (!selected || selected === "all") return true;

  const selectedCanonical = canonicalMarketplaceCategory(selectedValue);
  const categoryCanonical = canonicalMarketplaceCategory(categoryValue);

  if (selectedCanonical && categoryCanonical) {
    return selectedCanonical === categoryCanonical;
  }

  return normalizeMarketplaceValue(categoryValue) === selected;
}

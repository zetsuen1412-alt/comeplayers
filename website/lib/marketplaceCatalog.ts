export type MarketplaceCatalogEntry = {
  id: number;
  name: string;
  slug: string;
  first_letter: string;
  image_url: string;
  cover_image_url: string;
  background_image: string | null;
  offer_count: number;
  is_trending: boolean;
  is_featured: boolean;
  rating: number;
  metacritic: number | null;
  description: string;
  badge: string;
  catalog_type: "gift-cards" | "software";
  category_slug: "gift-cards" | "software";
  category_name: "Gift Cards" | "Software";
  cta_label: string;
  aliases: string[];
};

export type MarketplaceCatalogProduct = {
  title?: string | null;
  game_name?: string | null;
  category?: string | null;
  stock?: number | string | null;
};

type CuratedCategoryMeta = {
  slug: "gift-cards" | "software";
  name: "Gift Cards" | "Software";
  heading: string;
  countLabel: string;
  searchPlaceholder: string;
  loadingLabel: string;
  emptyLabel: string;
  heroTitle: string;
  heroCopy: string;
};

const CURATED_CATEGORY_META: Record<
  "gift-cards" | "software",
  CuratedCategoryMeta
> = {
  "gift-cards": {
    slug: "gift-cards",
    name: "Gift Cards",
    heading: "Gift Cards",
    countLabel: "digital products found",
    searchPlaceholder: "Filter gift cards...",
    loadingLabel: "Loading gift cards...",
    emptyLabel: "No gift cards found.",
    heroTitle: "Gift Cards Catalog",
    heroCopy:
      "Browse prepaid cards, wallet codes, subscriptions, and entertainment vouchers in one dedicated catalog.",
  },
  software: {
    slug: "software",
    name: "Software",
    heading: "Software",
    countLabel: "software products found",
    searchPlaceholder: "Filter software...",
    loadingLabel: "Loading software...",
    emptyLabel: "No software found.",
    heroTitle: "Software Catalog",
    heroCopy:
      "Browse productivity, security, creative, VPN, and developer software offers without mixing them into the game catalog.",
  },
};

function placeholderImage(label: string, color = "22d3ee") {
  return `https://placehold.co/800x450/020617/${color}?text=${encodeURIComponent(
    label
  )}`;
}

function firstLetter(name: string) {
  const first = name.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

function catalogEntry(
  id: number,
  category: "gift-cards" | "software",
  name: string,
  description: string,
  aliases: string[],
  options: {
    color?: string;
    trending?: boolean;
    featured?: boolean;
    badge?: string;
    ctaLabel?: string;
  } = {}
): MarketplaceCatalogEntry {
  const meta = CURATED_CATEGORY_META[category];
  const image = placeholderImage(name, options.color);
  const slug = normalizeCategorySlug(name);

  return {
    id,
    name,
    slug,
    first_letter: firstLetter(name),
    image_url: image,
    cover_image_url: image,
    background_image: null,
    offer_count: 0,
    is_trending: Boolean(options.trending),
    is_featured: options.featured !== false,
    rating: 0,
    metacritic: null,
    description,
    badge: options.badge || meta.name,
    catalog_type: category,
    category_slug: category,
    category_name: meta.name,
    cta_label: options.ctaLabel || "View offers",
    aliases,
  };
}

const GIFT_CARD_CATALOG: MarketplaceCatalogEntry[] = [
  catalogEntry(
    910001,
    "gift-cards",
    "Amazon Gift Card",
    "Retail gift card codes for Amazon balance and regional storefronts.",
    ["amazon", "amazon gift", "amazon voucher"],
    { color: "f59e0b", trending: true }
  ),
  catalogEntry(
    910002,
    "gift-cards",
    "Apple Gift Card",
    "Apple balance for App Store, iTunes, Apple Music, and Apple services.",
    ["apple gift", "itunes", "app store", "apple music"],
    { color: "e5e7eb", trending: true }
  ),
  catalogEntry(
    910003,
    "gift-cards",
    "Battle.net Balance",
    "Wallet balance for Blizzard games and Battle.net purchases.",
    ["battle.net", "battlenet", "blizzard balance"],
    { color: "38bdf8" }
  ),
  catalogEntry(
    910004,
    "gift-cards",
    "EA Gift Card",
    "EA wallet and platform balance for eligible Electronic Arts content.",
    ["ea gift", "electronic arts", "ea wallet", "origin gift"],
    { color: "f97316" }
  ),
  catalogEntry(
    910005,
    "gift-cards",
    "Garena Shells",
    "Garena prepaid codes for supported Garena games and services.",
    ["garena", "garena shells", "shells"],
    { color: "ef4444", trending: true }
  ),
  catalogEntry(
    910006,
    "gift-cards",
    "Google Play Gift Card",
    "Google Play balance for apps, games, books, subscriptions, and media.",
    ["google play", "play store", "google gift"],
    { color: "22c55e", trending: true }
  ),
  catalogEntry(
    910007,
    "gift-cards",
    "iQIYI Gift Card",
    "Streaming subscription vouchers for iQIYI plans and entertainment access.",
    ["iqiyi", "iqiyi vip"],
    { color: "84cc16" }
  ),
  catalogEntry(
    910008,
    "gift-cards",
    "League of Legends RP",
    "Riot Points balance for League of Legends cosmetics and content.",
    ["league of legends", "riot points", "lol rp", "rp code"],
    { color: "0ea5e9" }
  ),
  catalogEntry(
    910009,
    "gift-cards",
    "Netflix Gift Card",
    "Netflix balance and subscription cards for supported regions.",
    ["netflix", "netflix card", "netflix voucher"],
    { color: "dc2626", trending: true }
  ),
  catalogEntry(
    910010,
    "gift-cards",
    "Nintendo eShop Card",
    "Nintendo eShop wallet codes for Switch games and digital content.",
    ["nintendo", "eshop", "nintendo eshop", "switch card"],
    { color: "ef4444", trending: true }
  ),
  catalogEntry(
    910011,
    "gift-cards",
    "PlayStation Store Card",
    "PSN wallet codes for games, add-ons, and subscriptions.",
    ["playstation", "psn", "ps store", "playstation store"],
    { color: "2563eb", trending: true }
  ),
  catalogEntry(
    910012,
    "gift-cards",
    "Razer Gold",
    "Razer Gold wallet reloads for games, services, and entertainment.",
    ["razer", "razer gold", "zgold"],
    { color: "22c55e", trending: true }
  ),
  catalogEntry(
    910013,
    "gift-cards",
    "Riot Games Gift Card",
    "Riot prepaid balance for Valorant, League of Legends, and other Riot titles.",
    ["riot", "riot games", "valorant points", "vp code"],
    { color: "ef4444" }
  ),
  catalogEntry(
    910014,
    "gift-cards",
    "Roblox Gift Card",
    "Robux and Roblox credit cards for avatar items and premium access.",
    ["roblox", "robux", "roblox credit"],
    { color: "94a3b8", trending: true }
  ),
  catalogEntry(
    910015,
    "gift-cards",
    "Spotify Premium",
    "Spotify subscription gift cards for Premium music streaming.",
    ["spotify", "spotify premium", "spotify gift"],
    { color: "22c55e", trending: true }
  ),
  catalogEntry(
    910016,
    "gift-cards",
    "Steam Wallet Code",
    "Steam balance for games, DLC, in-game items, and community market purchases.",
    ["steam", "steam wallet", "steam card"],
    { color: "0f172a", trending: true }
  ),
  catalogEntry(
    910017,
    "gift-cards",
    "TikTok Coins",
    "Digital balance and voucher offers for TikTok coin top-ups.",
    ["tiktok", "tik tok", "tiktok coins"],
    { color: "14b8a6" }
  ),
  catalogEntry(
    910018,
    "gift-cards",
    "Twitch Gift Card",
    "Twitch balance for subscriptions, Bits, and creator support.",
    ["twitch", "twitch card", "twitch gift"],
    { color: "8b5cf6" }
  ),
  catalogEntry(
    910019,
    "gift-cards",
    "Ubisoft Wallet",
    "Ubisoft Store and wallet codes for eligible games and add-ons.",
    ["ubisoft", "ubisoft wallet", "ubisoft connect"],
    { color: "38bdf8" }
  ),
  catalogEntry(
    910020,
    "gift-cards",
    "Xbox Gift Card",
    "Microsoft and Xbox balance for games, Game Pass, and digital content.",
    ["xbox", "microsoft gift", "xbox card", "game pass"],
    { color: "16a34a", trending: true }
  ),
];

const SOFTWARE_CATALOG: MarketplaceCatalogEntry[] = [
  catalogEntry(
    920001,
    "software",
    "Adobe Creative Cloud",
    "Creative apps and subscription access for design, video, photo, and web work.",
    ["adobe", "creative cloud", "photoshop", "illustrator", "premiere"],
    { color: "ef4444", trending: true }
  ),
  catalogEntry(
    920002,
    "software",
    "Bitdefender",
    "Antivirus and internet security licenses for personal and family devices.",
    ["bitdefender", "bit defender", "antivirus"],
    { color: "2563eb" }
  ),
  catalogEntry(
    920003,
    "software",
    "Canva Pro",
    "Design subscription access for templates, brand kits, and premium assets.",
    ["canva", "canva pro"],
    { color: "06b6d4", trending: true }
  ),
  catalogEntry(
    920004,
    "software",
    "CapCut Pro",
    "Video editing subscription access for creator tools and export features.",
    ["capcut", "cap cut", "capcut pro"],
    { color: "14b8a6", trending: true }
  ),
  catalogEntry(
    920005,
    "software",
    "ESET NOD32",
    "Security and antivirus licenses for endpoint and personal protection.",
    ["eset", "nod32", "eset nod32"],
    { color: "22c55e" }
  ),
  catalogEntry(
    920006,
    "software",
    "ExpressVPN",
    "VPN subscription access for privacy, travel, and secure browsing.",
    ["expressvpn", "express vpn"],
    { color: "ef4444" }
  ),
  catalogEntry(
    920007,
    "software",
    "Figma Professional",
    "Design and collaboration plan access for interface and product teams.",
    ["figma", "figma pro", "figma professional"],
    { color: "a855f7" }
  ),
  catalogEntry(
    920008,
    "software",
    "Grammarly Premium",
    "Writing assistant subscription access for grammar, tone, and clarity tools.",
    ["grammarly", "grammarly premium"],
    { color: "22c55e" }
  ),
  catalogEntry(
    920009,
    "software",
    "JetBrains IDE License",
    "Developer tool licenses for IntelliJ IDEA, WebStorm, PyCharm, and more.",
    ["jetbrains", "intellij", "webstorm", "pycharm", "phpstorm"],
    { color: "f97316" }
  ),
  catalogEntry(
    920010,
    "software",
    "Kaspersky",
    "Security software licenses for antivirus and internet protection suites.",
    ["kaspersky", "kaspersky antivirus"],
    { color: "10b981" }
  ),
  catalogEntry(
    920011,
    "software",
    "Malwarebytes",
    "Malware protection and cleanup licenses for personal devices.",
    ["malwarebytes", "malware bytes"],
    { color: "2563eb" }
  ),
  catalogEntry(
    920012,
    "software",
    "Microsoft 365",
    "Office apps, cloud storage, and productivity subscription access.",
    ["microsoft 365", "office 365", "ms office", "word excel"],
    { color: "0ea5e9", trending: true }
  ),
  catalogEntry(
    920013,
    "software",
    "NordVPN",
    "VPN subscription access for privacy, streaming, and secure network use.",
    ["nordvpn", "nord vpn"],
    { color: "38bdf8", trending: true }
  ),
  catalogEntry(
    920014,
    "software",
    "Notion Plus",
    "Workspace subscription access for notes, docs, projects, and collaboration.",
    ["notion", "notion plus", "notion pro"],
    { color: "f8fafc" }
  ),
  catalogEntry(
    920015,
    "software",
    "Visual Studio Subscription",
    "Developer subscription and tooling access for Microsoft development workflows.",
    ["visual studio", "vs subscription", "visual studio subscription"],
    { color: "8b5cf6" }
  ),
  catalogEntry(
    920016,
    "software",
    "Windows 11 License",
    "Windows activation licenses for eligible personal and professional devices.",
    ["windows 11", "windows license", "windows key", "windows pro"],
    { color: "38bdf8", trending: true }
  ),
  catalogEntry(
    920017,
    "software",
    "WinRAR License",
    "Archive utility licenses for compression, extraction, and file management.",
    ["winrar", "rar license", "winrar license"],
    { color: "f59e0b" }
  ),
  catalogEntry(
    920018,
    "software",
    "Zoom Pro",
    "Video meeting subscription access for calls, webinars, and collaboration.",
    ["zoom", "zoom pro", "zoom license"],
    { color: "2563eb" }
  ),
];

export function normalizeCategorySlug(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isCuratedMarketplaceCategory(value: string | null | undefined) {
  const normalized = normalizeCategorySlug(value);
  return normalized === "gift-cards" || normalized === "software";
}

export function getCuratedCategoryMeta(value: string | null | undefined) {
  const normalized = normalizeCategorySlug(value);
  if (!isCuratedMarketplaceCategory(normalized)) return null;

  return CURATED_CATEGORY_META[normalized as "gift-cards" | "software"];
}

export function getCuratedMarketplaceCatalog(value: string | null | undefined) {
  const normalized = normalizeCategorySlug(value);
  const entries =
    normalized === "gift-cards"
      ? GIFT_CARD_CATALOG
      : normalized === "software"
        ? SOFTWARE_CATALOG
        : [];

  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

export function filterCuratedMarketplaceCatalog(
  entries: MarketplaceCatalogEntry[],
  query: string,
  letter: string
) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedLetter = String(letter || "").toUpperCase();

  return entries.filter((entry) => {
    if (normalizedQuery) {
      const haystack = normalizeSearchText(
        [entry.name, entry.slug, entry.description, ...entry.aliases].join(" ")
      );

      if (!haystack.includes(normalizedQuery)) return false;
    }

    if (normalizedLetter && normalizedLetter !== "ALL") {
      if (normalizedLetter === "0-9") {
        if (!/^[0-9]/.test(entry.name)) return false;
      } else if (/^[A-Z]$/.test(normalizedLetter)) {
        if (entry.first_letter !== normalizedLetter) return false;
      }
    }

    return true;
  });
}

export function paginateCuratedMarketplaceCatalog(
  entries: MarketplaceCatalogEntry[],
  page: number,
  limit: number
) {
  const offset = (Math.max(page, 1) - 1) * limit;
  return entries.slice(offset, offset + limit);
}

export function applyCuratedOfferCounts(
  entries: MarketplaceCatalogEntry[],
  products: MarketplaceCatalogProduct[]
) {
  const countBySlug = new Map<string, number>();

  for (const product of products) {
    if (numberValue(product.stock) <= 0) continue;

    const searchableProduct = normalizeSearchText(
      [product.title, product.game_name, product.category].filter(Boolean).join(" ")
    );

    const matchedEntry = entries.find((entry) => {
      const aliases = [entry.name, entry.slug, ...entry.aliases];
      return aliases.some((alias) => {
        const normalizedAlias = normalizeSearchText(alias);
        return normalizedAlias && searchableProduct.includes(normalizedAlias);
      });
    });

    if (!matchedEntry) continue;

    countBySlug.set(matchedEntry.slug, (countBySlug.get(matchedEntry.slug) || 0) + 1);
  }

  return entries.map((entry) => ({
    ...entry,
    offer_count: countBySlug.get(entry.slug) || entry.offer_count,
  }));
}

function normalizeSearchText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberValue(value: number | string | null | undefined) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

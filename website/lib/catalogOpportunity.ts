export type CatalogOpportunityCategoryCode =
  | "account"
  | "boosting"
  | "coin"
  | "item";

export type CatalogOpportunityInput = {
  gameId: number;
  gameName: string;
  gameSlug: string;
  categoryCode: CatalogOpportunityCategoryCode;
  sourceUrl?: string | null;
};

export type CatalogOpportunity = CatalogOpportunityInput & {
  sourceUrl: string | null;
  title: string;
  description: string;
};

const BRAND = "EVO GAMING FARMING HOUSE";
const SERVICE_NOTE = [
  `⚜️ ${BRAND} ⚜️`,
  "⚔️ Orders are handled directly by the EVO GAMING team, without being passed to another seller.",
  "⚔️ We aim to start within 5–10 minutes after the order details are confirmed, when a service slot is available.",
  "⚔️ Requests for other games are welcome.",
  "⏰ You can contact us 24/7; start and delivery times depend on availability.",
  "✴️ VPN and progress streaming can be arranged where available and permitted by the game.",
  "➡️ Delivery timing is confirmed before checkout.",
  "✏️ Scope and price can be discussed before placing an order.",
  "💳 Payment is completed through ComePlayers checkout only.",
].join("\n");

/** Original ComePlayers copy for an internal catalog idea, never a scraped offer. */
export function buildCatalogOpportunity(
  input: CatalogOpportunityInput
): CatalogOpportunity {
  const gameName = input.gameName.replace(/\s+/g, " ").trim();
  if (!gameName) throw new Error("Game name is required.");
  const titleGameName = gameName.slice(0, 125).trimEnd();

  let title: string;
  let description: string;

  switch (input.categoryCode) {
    case "boosting":
      title = `Jasa Joki & Boosting ${titleGameName} | EVO GAMING`;
      description = `${SERVICE_NOTE}\n\nBoosting and farming for ${gameName}: tell us your starting point and target in chat so we can confirm account access, scope, schedule, and the expected delivery time before you order.`;
      break;
    case "coin":
      title = `Mata Uang Game ${titleGameName} | EVO GAMING`;
      description = `${SERVICE_NOTE}\n\nGame currency for ${gameName}: confirm the amount, server, delivery method, stock availability, and expected delivery time in chat before you order.`;
      break;
    case "item":
      title = `Item Game ${titleGameName} | EVO GAMING`;
      description = `${SERVICE_NOTE}\n\nGame items for ${gameName}: confirm the exact item and variant, server, delivery method, stock availability, and expected delivery time in chat before you order.`;
      break;
    case "account":
      title = `Akun Game ${titleGameName} | EVO GAMING`;
      description = `${SERVICE_NOTE}\n\nGame account for ${gameName}: confirm its specifications, proof of lawful ownership, transfer details, stock availability, and expected delivery time in chat before you order.`;
      break;
    default:
      throw new Error("Unsupported catalog category.");
  }

  return {
    gameId: input.gameId,
    gameName,
    gameSlug: input.gameSlug,
    categoryCode: input.categoryCode,
    sourceUrl: input.sourceUrl ?? null,
    title,
    description,
  };
}

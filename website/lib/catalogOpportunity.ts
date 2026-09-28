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
const SERVICE_NOTE =
  "Pesanan ditangani langsung oleh tim EVO GAMING setelah detail disepakati. Permintaan untuk game lain dapat diajukan melalui chat; cakupan dan harga dapat didiskusikan. Pembayaran dilakukan melalui checkout ComePlayers.";

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
      description = `${BRAND} menawarkan layanan joki dan boosting ${gameName}. Jelaskan target dan kondisi awal melalui chat agar kebutuhan akses, jadwal, serta estimasi selesai dapat dikonfirmasi sebelum memesan. Opsi VPN atau siaran progres dapat dibahas jika tersedia dan sesuai ketentuan game. ${SERVICE_NOTE}`;
      break;
    case "coin":
      title = `Mata Uang Game ${titleGameName} | EVO GAMING`;
      description = `${BRAND} menawarkan mata uang untuk ${gameName}. Konfirmasi jumlah, server, metode pengiriman, ketersediaan stok, dan estimasi selesai melalui chat sebelum memesan. ${SERVICE_NOTE}`;
      break;
    case "item":
      title = `Item Game ${titleGameName} | EVO GAMING`;
      description = `${BRAND} menawarkan item untuk ${gameName}. Konfirmasi nama dan varian item, server, metode pengiriman, ketersediaan stok, dan estimasi selesai melalui chat sebelum memesan. ${SERVICE_NOTE}`;
      break;
    case "account":
      title = `Akun Game ${titleGameName} | EVO GAMING`;
      description = `${BRAND} menawarkan akun ${gameName}. Konfirmasi spesifikasi, bukti kepemilikan yang sah, akses yang diserahkan, ketersediaan stok, dan proses pengalihan melalui chat sebelum memesan. ${SERVICE_NOTE}`;
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

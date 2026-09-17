export const MAX_BULK_GAMES = 100;
export const MAX_GAME_NAME_LENGTH = 200;
export const MAX_BULK_INPUT_LENGTH = 30000;

export type GameInputSeparator = "mixed" | "lines";

export function parseBulkGameNames(input: string, separator: GameInputSeparator = "mixed") {
  const names: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  if (input.length > MAX_BULK_INPUT_LENGTH) {
    return { names, duplicates, errors: ["Teks terlalu panjang. Maksimal 30.000 karakter."] };
  }

  for (const value of input.split(separator === "lines" ? /[\r\n]+/ : /[,;\r\n]+/)) {
    const name = value.trim().replace(/\s+/gu, " ");
    if (!name) continue;
    if ([...name].length > MAX_GAME_NAME_LENGTH) {
      errors.push(`Nama terlalu panjang: ${name.slice(0, 40)}… (maksimal 200 karakter).`);
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    names.push(name);
  }

  if (names.length > MAX_BULK_GAMES) {
    errors.push(`Maksimal ${MAX_BULK_GAMES} game berbeda dalam sekali simpan.`);
  }
  return { names, duplicates, errors };
}

const CATEGORY_LABELS: Record<string, string> = {
  "game-accounts": "Akun Game",
  "game-coins": "Koin Game",
  "game-items": "Item Game",
  boosting: "Jasa Boosting",
  "top-up": "Top Up",
  "gift-cards": "Kartu Hadiah",
  skins: "Skin",
  software: "Perangkat Lunak",
};

export function adminCategoryLabel(category: { name: string; slug: string }) {
  return CATEGORY_LABELS[category.slug] || category.name;
}

export function effectiveGameCategoryIds(
  game: { category_id: number | null; category_links?: { category_id: number; status: string }[] },
  availableIds: number[],
): number[] {
  // Existing mapping rows are authoritative, including deliberately inactive rows.
  const links = game.category_links || [];
  if (links.length > 0) {
    return [...new Set(links.filter((link) => link.status === "active").map((link) => link.category_id))]
      .filter((id) => availableIds.includes(id));
  }
  return game.category_id !== null && availableIds.includes(game.category_id) ? [game.category_id] : [];
}

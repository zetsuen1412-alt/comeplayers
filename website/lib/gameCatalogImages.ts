/** Shared image rules for admin previews and public game catalogs. */
export const GAME_IMAGE_BUCKET = "game-catalog-images";
export const GAME_IMAGE_INPUT_LIMIT = 10 * 1024 * 1024;
export const GAME_IMAGE_UPLOAD_LIMIT = 2 * 1024 * 1024;
export const GAME_IMAGE_MAX_EDGE = 1600;
export const GAME_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type GameCatalogImageSource = {
  image_url?: string | null;
  catalog_image_url?: string | null;
  cover_image_url?: string | null;
  banner_image_url?: string | null;
  banner_url?: string | null;
  background_image?: string | null;
  background_url?: string | null;
  hero_url?: string | null;
  provider_cover_url?: string | null;
  provider_background_url?: string | null;
  icon_url?: string | null;
  logo_url?: string | null;
};

export function normalizeGameImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || url.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(url)) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function isPlaceholderGameImage(value: unknown): boolean {
  const url = normalizeGameImageUrl(value);
  if (!url) return true;
  const parsed = new URL(url, "https://comeplayers.com");
  return /(^|\.)(placehold\.co|placeholder\.com|dummyimage\.com|placeimg\.com)$/i.test(parsed.hostname)
    || /\/(?:placeholder(?:[._/-]|$)|game-cover-fallback)/i.test(parsed.pathname);
}

export function getGameImageCandidates(game: GameCatalogImageSource): string[] {
  // An admin's primary image takes precedence over an older provider cover.
  const candidates = [
    game.image_url, game.catalog_image_url, game.cover_image_url,
    game.banner_image_url, game.banner_url, game.background_image,
    game.background_url, game.hero_url, game.provider_cover_url,
    game.provider_background_url, game.icon_url, game.logo_url,
  ];
  return [...new Set(candidates.map(normalizeGameImageUrl)
    .filter((url): url is string => Boolean(url) && !isPlaceholderGameImage(url)))];
}

export function gameImageFileError(file: { type: string; size: number }): string | null {
  if (!(GAME_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Gunakan gambar JPG, PNG, atau WebP. File SVG dan dokumen tidak didukung.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return "File gambar kosong atau tidak valid.";
  if (file.size > GAME_IMAGE_INPUT_LIMIT) return "Ukuran gambar maksimal 10 MB sebelum dioptimalkan.";
  return null;
}

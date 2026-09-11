export function gameImage(game: { image_url?: string | null; cover_image_url?: string | null; background_image?: string | null; name: string }) {
  return game.image_url || game.cover_image_url || game.background_image || `https://placehold.co/640x360/020617/22d3ee?text=${encodeURIComponent(game.name)}`;
}

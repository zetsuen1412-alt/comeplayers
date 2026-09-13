import type { ProductGame } from "@/features/payroll/types/domain";

export function searchGames(rows: ProductGame[], query: string) {
  const q = query.trim().toLocaleLowerCase("id-ID");
  if (!q) return rows.slice(0, 8);
  return rows.filter((row) => {
    const haystack = [row.code, row.name, ...(row.aliases ?? [])].join(" ").toLocaleLowerCase("id-ID");
    return haystack.includes(q);
  }).slice(0, 8);
}

export function regionsForGame(game?: ProductGame | null) {
  return game?.regions ?? [];
}

export function serversForRegion(game: ProductGame | null | undefined, regionName: string) {
  return game?.regions.find((region) => region.name === regionName)?.servers ?? [];
}

/** Request only source-present, missing post-reset CODEs. Preserve normal refresh requests. */
export function mergeResetReimportRefresh(
  refresh: string[], candidates: unknown[], presentSourceReferences: string[],
): string[] {
  const present = new Set(presentSourceReferences.map(ref => ref.trim().toLowerCase()).filter(Boolean));
  const combined = new Map(refresh.map(ref => [ref.trim().toLowerCase(), ref] as const));
  for (const value of candidates) {
    if (typeof value !== "string" || !value.trim() || value.length > 200) continue;
    const code = value.trim();
    const key = code.toLowerCase();
    if (present.has(key) && !combined.has(key)) combined.set(key,code);
    if (combined.size >= 3000) break;
  }
  return [...combined.values()];
}

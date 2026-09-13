const SIMPLE_MAX = 9_999;
const LETTER_BLOCK = 9_999;
const LETTER_COUNT = 26;
const MAX_INDEX = SIMPLE_MAX + LETTER_BLOCK * LETTER_COUNT;

export function orderCodeToIndex(code: string): number | null {
  const clean = code.trim().toUpperCase();
  const simple = clean.match(/^EG([1-9]\d{0,3})$/);
  if (simple) {
    const value = Number(simple[1]);
    return value >= 1 && value <= SIMPLE_MAX ? value : null;
  }

  const extended = clean.match(/^EG([A-Z])(\d{4})$/);
  if (!extended) return null;
  const suffix = Number(extended[2]);
  if (suffix < 1 || suffix > LETTER_BLOCK) return null;
  const letterIndex = extended[1].charCodeAt(0) - 65;
  return SIMPLE_MAX + letterIndex * LETTER_BLOCK + suffix;
}

export function orderIndexToCode(index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > MAX_INDEX) {
    throw new Error("ORDER_CODE_SEQUENCE_EXHAUSTED");
  }
  if (index <= SIMPLE_MAX) return `EG${index}`;

  const offset = index - SIMPLE_MAX - 1;
  const letterIndex = Math.floor(offset / LETTER_BLOCK);
  const suffix = (offset % LETTER_BLOCK) + 1;
  const letter = String.fromCharCode(65 + letterIndex);
  return `EG${letter}${String(suffix).padStart(4, "0")}`;
}

export function nextAutomaticOrderCode(existingCodes: string[], reservedCodes: string[] = []): string {
  const used = new Set([...existingCodes, ...reservedCodes].map((code) => code.trim().toUpperCase()));
  const sequenceHistory = new Set(existingCodes.map((code) => code.trim().toUpperCase()));
  let highest = 0;
  for (const code of sequenceHistory) {
    const index = orderCodeToIndex(code);
    if (index !== null) highest = Math.max(highest, index);
  }

  let nextIndex = highest + 1;
  while (nextIndex <= MAX_INDEX) {
    const candidate = orderIndexToCode(nextIndex);
    if (!used.has(candidate)) return candidate;
    nextIndex += 1;
  }
  throw new Error("ORDER_CODE_SEQUENCE_EXHAUSTED");
}

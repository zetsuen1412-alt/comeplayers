export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) throw new Error("INVALID_NUMBER");
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

export function calculateBps(amountMinor: number, basisPoints: number): number {
  if (!Number.isInteger(amountMinor)) throw new Error("MONEY_MUST_BE_INTEGER_MINOR_UNITS");
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new Error("INVALID_BASIS_POINTS");
  }
  return roundHalfUp((amountMinor * basisPoints) / 10_000);
}

export function formatMoney(amountMinor: number, currency = "IDR"): string {
  const fractionDigits = currency === "IDR" ? 0 : 2;
  const divisor = fractionDigits === 0 ? 1 : 100;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amountMinor / divisor);
}

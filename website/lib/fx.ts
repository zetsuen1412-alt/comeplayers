function amount(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Amount is invalid.");
  return Math.round(number * 100) / 100;
}

export function quoteFx(input: {
  sourceAmount: number;
  sourceCurrency: string;
  payoutCurrency: string;
  rate?: number | null;
}) {
  const sourceAmount = amount(input.sourceAmount);
  if (sourceAmount <= 0) throw new Error("Source amount must be positive.");
  const sourceCurrency = String(input.sourceCurrency || "").trim().toUpperCase();
  const payoutCurrency = String(input.payoutCurrency || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(sourceCurrency) || !/^[A-Z]{3}$/.test(payoutCurrency)) {
    throw new Error("Currencies must use three-letter codes.");
  }
  if (sourceCurrency === payoutCurrency) {
    return { sourceAmount, sourceCurrency, payoutCurrency, rate: 1, payoutAmount: sourceAmount, identity: true };
  }
  const rate = Number(input.rate || 0);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("A positive FX rate is required.");
  return {
    sourceAmount,
    sourceCurrency,
    payoutCurrency,
    rate,
    payoutAmount: Math.round(sourceAmount * rate * 100) / 100,
    identity: false,
  };
}

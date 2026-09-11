export const SELLER_SALES_TAX_RATE_PERCENT = 5;

export type TaxRateRule = {
  countryCode: string;
  regionCode?: string | null;
  productType?: string | null;
  ratePercent: number;
  inclusive?: boolean;
  source?: string | null;
};

export type TaxQuoteInput = {
  subtotal: number;
  discount?: number;
  paymentFee?: number;
  rule?: TaxRateRule | null;
};

export type SellerSaleSettlementInput = {
  subtotal: number;
  discount?: number;
  paymentFee?: number;
  marketplaceFeeRate?: number;
  sellerSalesTaxRatePercent?: number;
};

export type WithdrawalTaxQuoteInput = {
  amount: number;
  ratePercent?: number;
  fixedAmount?: number;
  providerFee?: number;
};

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function rate(value: unknown, maximum = 100) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(0, parsed)) : 0;
}

function roundedCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeCountryCode(value: unknown, fallback = "ID") {
  const code = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return code.length === 2 ? code : fallback;
}

/**
 * Legacy buyer-tax calculator retained for historical invoice verification.
 * New orders use calculateSellerSaleSettlement instead.
 */
export function calculateTaxQuote(input: TaxQuoteInput) {
  const subtotal = money(input.subtotal);
  const discount = Math.min(subtotal, money(input.discount));
  const paymentFee = money(input.paymentFee);
  const taxableAmount = Math.max(0, subtotal - discount);
  const ratePercent = rate(input.rule?.ratePercent);
  const inclusive = Boolean(input.rule?.inclusive);

  const taxAmount = inclusive && ratePercent > 0
    ? roundedCurrency(taxableAmount - taxableAmount / (1 + ratePercent / 100))
    : roundedCurrency(taxableAmount * (ratePercent / 100));
  const totalAmount = inclusive
    ? roundedCurrency(taxableAmount + paymentFee)
    : roundedCurrency(taxableAmount + paymentFee + taxAmount);

  return {
    subtotal: roundedCurrency(subtotal),
    discount: roundedCurrency(discount),
    paymentFee: roundedCurrency(paymentFee),
    taxableAmount: roundedCurrency(taxableAmount),
    taxAmount,
    totalAmount,
    ratePercent,
    inclusive,
    countryCode: normalizeCountryCode(input.rule?.countryCode),
    productType: String(input.rule?.productType || "digital_goods"),
    source: input.rule?.source || "configured_rate",
  };
}

/**
 * ComePlayers V22 settlement model:
 * - buyer pays item amount after discount plus the buyer payment fee;
 * - seller bears marketplace fee and a fixed 5% sales tax;
 * - payment fee and seller tax never enter the seller wallet.
 */
export function calculateSellerSaleSettlement(input: SellerSaleSettlementInput) {
  const subtotal = money(input.subtotal);
  const discount = Math.min(subtotal, money(input.discount));
  const paymentFee = money(input.paymentFee);
  const sellerGross = roundedCurrency(Math.max(0, subtotal - discount));
  const marketplaceFeeRatePercent = rate(
    money(input.marketplaceFeeRate ?? 0.05) * 100,
    50
  );
  const sellerSalesTaxRatePercent = rate(
    input.sellerSalesTaxRatePercent ?? SELLER_SALES_TAX_RATE_PERCENT,
    100
  );
  const marketplaceFee = roundedCurrency(
    sellerGross * (marketplaceFeeRatePercent / 100)
  );
  const sellerSalesTax = roundedCurrency(
    sellerGross * (sellerSalesTaxRatePercent / 100)
  );
  const sellerNet = roundedCurrency(
    Math.max(0, sellerGross - marketplaceFee - sellerSalesTax)
  );
  const buyerTotal = roundedCurrency(sellerGross + paymentFee);

  return {
    subtotal: roundedCurrency(subtotal),
    discount: roundedCurrency(discount),
    paymentFee: roundedCurrency(paymentFee),
    buyerTax: 0,
    buyerTotal,
    sellerGross,
    marketplaceFeeRatePercent,
    marketplaceFee,
    sellerSalesTaxRatePercent,
    sellerSalesTax,
    sellerNet,
  };
}

export function calculateWithdrawalTaxQuote(input: WithdrawalTaxQuoteInput) {
  const amount = roundedCurrency(money(input.amount));
  const ratePercent = rate(input.ratePercent);
  const fixedAmount = roundedCurrency(money(input.fixedAmount));
  const providerFee = roundedCurrency(money(input.providerFee));
  const taxAmount = roundedCurrency(
    Math.min(amount, amount * (ratePercent / 100) + fixedAmount)
  );
  const netAmount = roundedCurrency(
    Math.max(0, amount - taxAmount - providerFee)
  );

  return {
    amount,
    ratePercent,
    fixedAmount,
    taxAmount,
    providerFee,
    netAmount,
  };
}

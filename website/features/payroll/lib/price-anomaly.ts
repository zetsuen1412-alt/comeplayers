import type { Order } from "../types/domain";

export type PriceTier = "10" | "20" | "30";
export type PriceDirection = "down" | "up";

export type OrderPriceAssessment = {
  groupKey: string;
  basis: "order" | "unit" | "day";
  priceMinor: number;
  lowestMinor: number;
  highestMinor: number;
  sampleCount: number;
  groupAverageMinor: number;
  averageMinor?: number;
  peerCount: number;
  dropPercent?: number;
  risePercent?: number;
  direction?: PriceDirection;
  tier?: PriceTier;
};

type Rational = { numerator: bigint; denominator: bigint };
type Observation = {
  orderId: string;
  parentIdentity: string;
  groupKey: string;
  exactPrice: Rational;
  assessment: Omit<OrderPriceAssessment, "lowestMinor" | "highestMinor" | "sampleCount" | "groupAverageMinor">;
};
type ParentPrice = { exactPrice: Rational; conflicting: boolean };
type PriceGroup = {
  parents: Map<string, ParentPrice>;
  total: Rational;
  count: number;
  sampleCount: number;
  sampleTotal: Rational;
  lowest?: Rational;
  highest?: Rational;
};

const MINIMUM_PEERS = 3;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const ZERO_PRICE: Rational = { numerator: ZERO, denominator: ONE };

function reduced(numerator: bigint, denominator: bigint): Rational {
  if (numerator === ZERO) return ZERO_PRICE;
  let left = numerator < ZERO ? -numerator : numerator;
  let right = denominator;
  while (right !== ZERO) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return { numerator: numerator / left, denominator: denominator / left };
}

/** Preserve the stored decimal quantity exactly, including scientific notation. */
function rationalNumber(value: number): Rational {
  const [mantissa, exponentText] = value.toString().split(/[eE]/);
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = BigInt(whole + fraction);
  const scale = fraction.length - Number(exponentText ?? 0);
  return scale >= 0 ? reduced(digits, TEN ** BigInt(scale)) : reduced(digits * TEN ** BigInt(-scale), ONE);
}

function add(left: Rational, right: Rational): Rational {
  return reduced(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator);
}

function subtract(left: Rational, right: Rational): Rational {
  return add(left, { numerator: -right.numerator, denominator: right.denominator });
}

function times(value: Rational, multiplier: number): Rational {
  return reduced(value.numerator * BigInt(multiplier), value.denominator);
}

function dividedBy(value: Rational, divisor: Rational): Rational {
  return reduced(value.numerator * divisor.denominator, value.denominator * divisor.numerator);
}

function compare(left: Rational, right: Rational): bigint {
  return left.numerator * right.denominator - right.numerator * left.denominator;
}

function displayNumber(value: Rational): number {
  const numerator = Number(value.numerator);
  const denominator = Number(value.denominator);
  if (Number.isFinite(numerator) && Number.isFinite(denominator)) return numerator / denominator;
  // Large rational integers can still represent a finite price. Only display
  // conversion uses approximation; classification always uses integer ratios.
  const numeratorText = value.numerator.toString();
  const denominatorText = value.denominator.toString();
  const leadingNumerator = numeratorText.slice(0, 17);
  const leadingDenominator = denominatorText.slice(0, 17);
  const exponent = (numeratorText.length - leadingNumerator.length) - (denominatorText.length - leadingDenominator.length);
  return Number(`${Number(leadingNumerator) / Number(leadingDenominator)}e${exponent}`);
}

/** Normalize display differences without combining different scopes or quantities. */
function normalizeText(value: string | undefined): string {
  return String(value ?? "").normalize("NFKC")
    .replace(/[⭐☑✅\uFE0F]/gu, " ")
    .replace(/[–—]/g, "-")
    .toLocaleLowerCase("en-US")
    .replace(/(\d)(?=hours?\b)/g, "$1 ")
    .replace(/\bhours?\b/g, "hour")
    .replace(/\bweeks?\b/g, "week")
    .replace(/\bmonths?\b/g, "month")
    .replace(/(?:\bx|×)\s*(\d+)\b/g, "x$1")
    .replace(/\s*([/()-])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function preciseService(order: Order): string | null {
  const service = normalizeText(order.orderName?.trim() || order.service);
  if (!service || /^[\s-]+$/.test(service)) return null;
  const generic = service.replace(/[\s_-]+/g, "");
  if (/^(?:custom(?:order)?|ordercustom|order|pesanan|lainnya|other|boost(?:ing)?|joki|gold|item)\d*$/.test(generic)) return null;

  if (order.orderType === "gold") {
    // Keep location/currency suffixes. K/M/B/G are distinct units, never scaled.
    const stated = service.match(/^(\d+(?:[.,]\d+)?)\s*([kmbg])(?:\s+([\p{L}\p{N} ._/-]+))?$/u);
    if (stated) {
      // Thousands separators, package durations and multipliers are ambiguous.
      if (/[.,]\d{3}$/.test(stated[1]) || /\b(?:hour|day|week|month|package|level|jam|hari|paket|x\d+)\b/.test(stated[3] ?? "")) return service;
      const statedQuantity = Number(stated[1].replace(",", "."));
      if (Math.abs(statedQuantity - order.quantity) > 0.000001) return null;
      return `${stated[2]}${stated[3] ? ` ${stated[3]}` : ""}`;
    }
  }
  return service;
}

function observation(order: Order): Observation | null {
  if (order.sheetDeletedAt || order.operationalStatus === "cancelled") return null;
  if (!["boosting", "gold", "item"].includes(order.orderType ?? "")) return null;
  if (!Number.isFinite(order.grossMinor) || order.grossMinor < 0) return null;
  const service = preciseService(order);
  const game = normalizeText(order.gameId || order.game || order.gameName);
  if (!service || !game || /^-+$/.test(game)) return null;

  let basis: OrderPriceAssessment["basis"] = "order";
  let exactPrice = rationalNumber(order.grossMinor);
  let dailyScope: (string | number)[] = [];
  if (order.scheduleMode === "daily") {
    const days = order.dailyWork;
    if (!days?.length || days.some(day => !Number.isFinite(day.grossMinor) || day.grossMinor < 0)) return null;
    const hours = order.dailyHours ?? days[0].hours;
    if (hours !== undefined && (!Number.isFinite(hours) || hours <= 0)) return null;
    if (days.some(day => day.hours !== undefined && day.hours !== hours)) return null;
    const totalDays = order.scheduleTotalDays ?? days.length;
    if (!Number.isInteger(totalDays) || totalDays <= 0) return null;
    basis = "day";
    exactPrice = dividedBy(days.reduce((sum, day) => add(sum, rationalNumber(day.grossMinor)), ZERO_PRICE), rationalNumber(days.length));
    dailyScope = [hours ?? "unknown-hours", totalDays];
  } else if (order.orderType === "gold" || order.orderType === "item") {
    if (!Number.isFinite(order.quantity) || order.quantity <= 0) return null;
    basis = "unit";
    exactPrice = dividedBy(exactPrice, rationalNumber(order.quantity));
  }
  // Boosting JUMLAH can count workers. Its TOTAL remains the package price.
  // Raw sheet week/month/xN titles are not evidence of a daily price basis.
  const priceMinor = displayNumber(exactPrice);
  if (!Number.isFinite(priceMinor) || priceMinor < 0) return null;
  const groupKey = JSON.stringify([game, order.orderType, normalizeText(order.region), normalizeText(order.server), service, basis, ...dailyScope]);
  return {
    orderId: order.id,
    parentIdentity: normalizeText(order.externalReference || order.orderNumber) || order.id,
    groupKey,
    exactPrice,
    assessment: { groupKey, basis, priceMinor, peerCount: 0 },
  };
}

function dropTier(price: Rational, peerTotal: Rational, peerCount: number): PriceTier | undefined {
  // Exact cross-products protect 10/20/30 boundaries for unit and daily prices.
  const candidateTotal = times(price, peerCount * 100);
  const below = (percent: number) => compare(candidateTotal, times(peerTotal, 100 - percent)) <= ZERO;
  if (below(30)) return "30";
  if (below(20)) return "20";
  if (below(10)) return "10";
  return undefined;
}

function riseTier(price: Rational, peerTotal: Rational, peerCount: number): PriceTier | undefined {
  const candidateTotal = times(price, peerCount * 100);
  const above = (percent: number) => compare(candidateTotal, times(peerTotal, 100 + percent)) >= ZERO;
  if (above(30)) return "30";
  if (above(20)) return "20";
  if (above(10)) return "10";
  return undefined;
}

/**
 * Assess all active orders before applying table filters. Each parent/KODE is
 * one reference price, and its own price never contributes to its average.
 * No financial data or stored import issues are changed.
 */
export function buildOrderPriceAssessments(orders: readonly Order[]): Map<string, OrderPriceAssessment> {
  const observationsById = new Map<string, Observation>();
  const conflictingIds = new Set<string>();
  const groups = new Map<string, PriceGroup>();
  for (const order of orders) {
    const item = observation(order);
    if (!item) continue;
    const existing = observationsById.get(order.id);
    if (!existing) observationsById.set(order.id, item);
    else if (existing.groupKey !== item.groupKey || existing.parentIdentity !== item.parentIdentity || compare(existing.exactPrice, item.exactPrice) !== ZERO) conflictingIds.add(order.id);
  }
  const observations = [...observationsById.values()].filter(item => !conflictingIds.has(item.orderId));
  for (const item of observations) {
    let group = groups.get(item.groupKey);
    if (!group) {
      group = { parents: new Map(), total: ZERO_PRICE, count: 0, sampleCount: 0, sampleTotal: ZERO_PRICE };
      groups.set(item.groupKey, group);
    }
    const parent = group.parents.get(item.parentIdentity);
    if (!parent) group.parents.set(item.parentIdentity, { exactPrice: item.exactPrice, conflicting: false });
    else if (compare(parent.exactPrice, item.exactPrice) !== ZERO) parent.conflicting = true;
  }
  for (const group of groups.values()) {
    for (const parent of group.parents.values()) {
      if (parent.conflicting) continue;
      group.sampleCount += 1;
      group.sampleTotal = add(group.sampleTotal, parent.exactPrice);
      if (!group.lowest || compare(parent.exactPrice, group.lowest) < ZERO) group.lowest = parent.exactPrice;
      if (!group.highest || compare(parent.exactPrice, group.highest) > ZERO) group.highest = parent.exactPrice;
      if (parent.exactPrice.numerator <= ZERO) continue;
      group.total = add(group.total, parent.exactPrice);
      group.count += 1;
    }
  }

  const result = new Map<string, OrderPriceAssessment>();
  for (const item of observations) {
    const group = groups.get(item.groupKey)!;
    const ownParent = group.parents.get(item.parentIdentity);
    if (!ownParent || ownParent.conflicting) continue;
    const ownPrice = ownParent.exactPrice.numerator > ZERO ? ownParent.exactPrice : undefined;
    const peerCount = group.count - (ownPrice ? 1 : 0);
    const peerTotal = subtract(group.total, ownPrice ?? ZERO_PRICE);
    const assessment: OrderPriceAssessment = {
      ...item.assessment, peerCount,
      lowestMinor: displayNumber(group.lowest!),
      highestMinor: displayNumber(group.highest!),
      sampleCount: group.sampleCount,
      groupAverageMinor: displayNumber(dividedBy(group.sampleTotal, rationalNumber(group.sampleCount))),
    };
    if (peerCount > 0 && peerTotal.numerator > ZERO) {
      assessment.averageMinor = displayNumber(dividedBy(peerTotal, rationalNumber(peerCount)));
    }
    if (peerCount >= MINIMUM_PEERS && peerTotal.numerator > ZERO) {
      const difference = subtract(peerTotal, times(item.exactPrice, peerCount));
      assessment.dropPercent = difference.numerator > ZERO ? displayNumber(times(dividedBy(difference, peerTotal), 100)) : 0;
      const increase = subtract(times(item.exactPrice, peerCount), peerTotal);
      assessment.risePercent = increase.numerator > ZERO ? displayNumber(times(dividedBy(increase, peerTotal), 100)) : 0;
      if (difference.numerator > ZERO) {
        assessment.tier = dropTier(item.exactPrice, peerTotal, peerCount);
        if (assessment.tier) assessment.direction = "down";
      } else if (increase.numerator > ZERO) {
        assessment.tier = riseTier(item.exactPrice, peerTotal, peerCount);
        if (assessment.tier) assessment.direction = "up";
      }
    }
    result.set(item.orderId, assessment);
  }
  return result;
}

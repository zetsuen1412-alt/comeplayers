import type { Order, OrderDailyWork } from "../types/domain";

export type PriceTier = "10" | "20" | "30";
export type PriceDirection = "down" | "up";

export type OrderPriceAssessment = {
  groupKey: string;
  basis: "rate";
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
  sourceOrderId: string;
  parentIdentity: string;
  groupKey: string;
  exactPrice: Rational;
  referencePrice: Rational;
  referenceSamplePrice: Rational;
  referenceLowest: Rational;
  referenceHighest: Rational;
  assessment: Omit<OrderPriceAssessment, "lowestMinor" | "highestMinor" | "sampleCount" | "groupAverageMinor">;
};
type ParentPrice = { exactPrice: Rational; samplePrice: Rational; lowest: Rational; highest: Rational; conflicting: boolean };
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

/** Preserve the stored decimal rate exactly, including scientific notation. */
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
  const [mantissa, ratioExponent] = (Number(leadingNumerator) / Number(leadingDenominator)).toExponential(16).split("e");
  return Number(`${mantissa}e${exponent + Number(ratioExponent)}`);
}

/** Normalize display differences without combining different scopes or quantities. */
function normalizeText(value: string | undefined): string {
  return String(value ?? "").normalize("NFKC")
    .replace(/[⭐☑✅\uFE0F]/gu, " ")
    .replace(/[–—]/g, "-")
    .toLocaleLowerCase("en-US")
    .replace(/(\d)(?=hours?\b)/g, "$1 ")
    .replace(/\bhours?\b/g, "hour")
    .replace(/\bdays?\b/g, "day")
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
      return `${stated[2]}${stated[3] ? ` ${stated[3]}` : ""}`;
    }
  }
  return service;
}

/** Read only the stored Sheet RATE. Missing values never fall back to TOTAL. */
export function getOrderRateMinor(order: Pick<Order, "rateMinor">, day?: Pick<OrderDailyWork, "rateMinor">): number | undefined {
  const rate = day?.rateMinor === undefined ? order.rateMinor : day.rateMinor;
  return typeof rate === "number" && Number.isFinite(rate) && rate >= 0 ? rate : undefined;
}

export function getOrderPriceAssessmentKey(order: Pick<Order, "id">, day?: Pick<OrderDailyWork, "id">) {
  return day ? `${order.id}::${day.id}` : order.id;
}

function observationsFor(order: Order): Observation[] {
  if (order.sheetDeletedAt || order.websiteDeletedAt || order.operationalStatus === "cancelled") return [];
  if (!["boosting", "gold", "item"].includes(order.orderType ?? "")) return [];
  const service = preciseService(order);
  const game = normalizeText(order.gameId || order.game || order.gameName);
  if (!service || !game || /^-+$/.test(game)) return [];

  const basis: OrderPriceAssessment["basis"] = "rate";
  let dailyScope: (string | number)[] = [];
  if (order.scheduleMode === "daily") {
    const days = order.dailyWork;
    const hours = order.dailyHours ?? days?.[0]?.hours;
    if (hours !== undefined && (!Number.isFinite(hours) || hours <= 0)) return [];
    const totalDays = order.scheduleTotalDays ?? days?.length;
    if (totalDays !== undefined && (!Number.isInteger(totalDays) || totalDays <= 0)) return [];
    dailyScope = ["daily", hours ?? "unknown-hours", totalDays ?? "unknown-days"];
  }
  const groupKey = JSON.stringify([game, order.orderType, normalizeText(order.region), normalizeText(order.server), service, basis, ...dailyScope]);
  const days = order.scheduleMode === "daily" && order.dailyWork?.length ? order.dailyWork : [undefined];
  const candidates = days.flatMap(day => {
    const priceMinor = getOrderRateMinor(order, day);
    return priceMinor === undefined ? [] : [{ day, priceMinor, exactPrice: rationalNumber(priceMinor) }];
  });
  if (!candidates.length) return [];
  // Every other KODE contributes one mean of its positive stored DAY rates.
  // Zero remains a candidate and summary value, never a peer price baseline.
  // Repeated days never increase the peer count; TOTAL/JUMLAH supply no RATE.
  const referenceSamplePrice = dividedBy(candidates.reduce((sum, item) => add(sum, item.exactPrice), ZERO_PRICE), rationalNumber(candidates.length));
  const positive = candidates.filter(item => item.exactPrice.numerator > ZERO);
  const referencePrice = positive.length
    ? dividedBy(positive.reduce((sum, item) => add(sum, item.exactPrice), ZERO_PRICE), rationalNumber(positive.length)) : ZERO_PRICE;
  const referenceLowest = candidates.reduce((lowest, item) => compare(item.exactPrice, lowest) < ZERO ? item.exactPrice : lowest, candidates[0].exactPrice);
  const referenceHighest = candidates.reduce((highest, item) => compare(item.exactPrice, highest) > ZERO ? item.exactPrice : highest, candidates[0].exactPrice);
  return candidates.map(({ day, priceMinor, exactPrice }) => ({
    orderId: getOrderPriceAssessmentKey(order, day),
    sourceOrderId: order.id,
    parentIdentity: normalizeText(order.externalReference || order.orderNumber) || order.id,
    groupKey,
    exactPrice,
    referencePrice, referenceSamplePrice, referenceLowest, referenceHighest,
    assessment: { groupKey, basis, priceMinor, peerCount: 0 },
  }));
}

function dropTier(price: Rational, peerTotal: Rational, peerCount: number): PriceTier | undefined {
  // Exact cross-products protect 10/20/30 boundaries for stored RATE values.
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
 * one RATE reference, and all of its own days are excluded from its peer average.
 * No financial data or stored import issues are changed.
 */
export function buildOrderPriceAssessments(orders: readonly Order[]): Map<string, OrderPriceAssessment> {
  const observationsById = new Map<string, Observation>();
  const conflictingIds = new Set<string>();
  const parentSignatures = new Map<string, string>();
  const conflictingOrders = new Set<string>();
  const aliases = new Map<string, string>();
  const groups = new Map<string, PriceGroup>();
  for (const order of orders) {
    const items = observationsFor(order);
    if (!items.length) continue;
    const signature = JSON.stringify(items.map(item => [item.orderId, item.parentIdentity, item.groupKey,
      item.exactPrice.numerator.toString(), item.exactPrice.denominator.toString()]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    const previousSignature = parentSignatures.get(order.id);
    if (previousSignature !== undefined && previousSignature !== signature) conflictingOrders.add(order.id);
    else parentSignatures.set(order.id, signature);
    if (order.scheduleMode === "daily" && order.dailyWork?.length === items.length
      && items.every(item => compare(item.exactPrice, items[0].exactPrice) === ZERO)) aliases.set(order.id, items[0].orderId);
    for (const item of items) {
      const existing = observationsById.get(item.orderId);
      if (!existing) observationsById.set(item.orderId, item);
      else if (existing.groupKey !== item.groupKey || existing.parentIdentity !== item.parentIdentity
        || compare(existing.exactPrice, item.exactPrice) !== ZERO) conflictingIds.add(item.orderId);
    }
  }
  const observations = [...observationsById.values()].filter(item => !conflictingIds.has(item.orderId)
    && !conflictingOrders.has(item.sourceOrderId));
  for (const item of observations) {
    let group = groups.get(item.groupKey);
    if (!group) {
      group = { parents: new Map(), total: ZERO_PRICE, count: 0, sampleCount: 0, sampleTotal: ZERO_PRICE };
      groups.set(item.groupKey, group);
    }
    const parent = group.parents.get(item.parentIdentity);
    if (!parent) group.parents.set(item.parentIdentity, { exactPrice: item.referencePrice,
      samplePrice: item.referenceSamplePrice, lowest: item.referenceLowest, highest: item.referenceHighest, conflicting: false });
    else if (compare(parent.exactPrice, item.referencePrice) !== ZERO
      || compare(parent.samplePrice, item.referenceSamplePrice) !== ZERO
      || compare(parent.lowest, item.referenceLowest) !== ZERO || compare(parent.highest, item.referenceHighest) !== ZERO) parent.conflicting = true;
  }
  for (const group of groups.values()) {
    for (const parent of group.parents.values()) {
      if (parent.conflicting) continue;
      group.sampleCount += 1;
      group.sampleTotal = add(group.sampleTotal, parent.samplePrice);
      if (!group.lowest || compare(parent.lowest, group.lowest) < ZERO) group.lowest = parent.lowest;
      if (!group.highest || compare(parent.highest, group.highest) > ZERO) group.highest = parent.highest;
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
  for (const [parentId, key] of aliases) {
    const assessment = result.get(key);
    if (assessment && !conflictingOrders.has(parentId)) result.set(parentId, assessment);
  }
  return result;
}

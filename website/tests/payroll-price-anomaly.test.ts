import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOrderPriceAssessments, getOrderRateMinor } from "../features/payroll/lib/price-anomaly";
import type { Order } from "../features/payroll/types/domain";

function order(id: string, rateMinor: number, patch: Partial<Order> = {}): Order {
  return {
    id, orderNumber: id, externalReference: id, source: "G2G", orderName: "12 Hours Package⭐ Piloting All Activities",
    orderType: "boosting", game: "AION", service: "12 Hours Package⭐ Piloting All Activities", quantity: 1, rateMinor, grossMinor: rateMinor,
    operationalStatus: "draft", financeStatus: "pending", expectedPaymentMinor: rateMinor, matchedPaymentMinor: 0,
    orderedAt: "2026-10-06T00:00:00Z", dueAt: "2026-10-07T00:00:00Z", ...patch,
  };
}
function peers(rate = 320_000, patch: Partial<Order> = {}) { return [1, 2, 3].map(index => order(`peer-${index}`, rate, patch)); }

test("stored RATE helper preserves zero and rejects missing or invalid values without a TOTAL fallback", () => {
  assert.equal(getOrderRateMinor(order("rate", 160_000, { grossMinor: 320_000, quantity: 2 })), 160_000);
  assert.equal(getOrderRateMinor({ rateMinor: 0 }), 0);
  assert.equal(getOrderRateMinor({ rateMinor: 0.3 }), 0.3);
  for (const rate of [undefined, null, "320000", Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) {
    const row = { ...order("invalid", 320_000), rateMinor: rate } as Order;
    assert.equal(getOrderRateMinor(row), undefined, String(rate));
    assert.equal(buildOrderPriceAssessments([...peers(), row]).has("invalid"), false);
  }
});

test("equal RATE values stay equal despite different TOTAL, quantity or worker splits", () => {
  const rows = [...peers(), order("shared", 320_000, { quantity: 2, grossMinor: 640_000 }),
    order("small-total", 320_000, { quantity: 10, grossMinor: 80_000 }),
    order("invalid-total", 320_000, { quantity: 0, grossMinor: Number.NaN })];
  const before = structuredClone(rows);
  const assessed = buildOrderPriceAssessments(rows);
  for (const row of rows) {
    const price = assessed.get(row.id)!;
    assert.equal(price.basis, "rate");
    assert.equal(price.priceMinor, 320_000);
    assert.equal(price.averageMinor, 320_000);
    assert.equal(price.lowestMinor, 320_000);
    assert.equal(price.highestMinor, 320_000);
    assert.equal(price.direction, undefined);
    assert.equal(price.tier, undefined);
  }
  assert.deepEqual(rows, before);
});

test("different RATE values flag both directions even when TOTAL is identical", () => {
  const low = buildOrderPriceAssessments([...peers(), order("low", 224_000, { quantity: 2, grossMinor: 320_000 })]).get("low")!;
  assert.equal(low.priceMinor, 224_000);
  assert.equal(low.direction, "down");
  assert.equal(low.tier, "30");
  assert.equal(low.dropPercent, 30);
  const high = buildOrderPriceAssessments([...peers(), order("high", 416_000, { quantity: 0.3, grossMinor: 320_000 })]).get("high")!;
  assert.equal(high.priceMinor, 416_000);
  assert.equal(high.direction, "up");
  assert.equal(high.tier, "30");
  assert.equal(high.risePercent, 30);
});

test("exact down RATE10/20/30 boundaries and one rupiah above use the unrounded peer mean", () => {
  const examples = [[288_001, undefined], [288_000, "10"], [256_001, "10"], [256_000, "20"], [224_001, "20"], [224_000, "30"], [160_000, "30"]] as const;
  for (const [rate, tier] of examples) {
    const price = buildOrderPriceAssessments([...peers(), order("candidate", rate)]).get("candidate")!;
    assert.equal(price.averageMinor, 320_000);
    assert.equal(price.peerCount, 3);
    assert.equal(price.tier, tier, String(rate));
    assert.equal(price.direction, tier ? "down" : undefined);
    assert.equal(price.risePercent, 0);
  }
});

test("exact up RATE10/20/30 boundaries and one rupiah below use the unrounded peer mean", () => {
  const examples = [[351_999, undefined], [352_000, "10"], [383_999, "10"], [384_000, "20"], [415_999, "20"], [416_000, "30"], [480_000, "30"]] as const;
  for (const [rate, tier] of examples) {
    const price = buildOrderPriceAssessments([...peers(), order("candidate", rate)]).get("candidate")!;
    assert.equal(price.averageMinor, 320_000);
    assert.equal(price.peerCount, 3);
    assert.equal(price.tier, tier, String(rate));
    assert.equal(price.direction, tier ? "up" : undefined);
    assert.equal(price.dropPercent, 0);
  }
  const equal = buildOrderPriceAssessments([...peers(), order("equal", 320_000)]).get("equal")!;
  assert.equal(equal.direction, undefined);
  assert.equal(equal.risePercent, 0);
  assert.equal(equal.dropPercent, 0);
});

test("zero RATE is a100% decrease candidate and never a baseline peer even when TOTAL is positive", () => {
  const assessed = buildOrderPriceAssessments([...peers(), order("zero", 0, { grossMinor: 320_000 }), order("normal", 320_000)]);
  assert.equal(assessed.get("zero")?.tier, "30");
  assert.equal(assessed.get("zero")?.direction, "down");
  assert.equal(assessed.get("zero")?.dropPercent, 100);
  assert.equal(assessed.get("zero")?.risePercent, 0);
  assert.equal(assessed.get("zero")?.peerCount, 4);
  assert.equal(assessed.get("normal")?.averageMinor, 320_000);
  assert.equal(assessed.get("normal")?.peerCount, 3);
});

test("stored decimal/scientific RATE thresholds are exact and ignore decimal quantities", () => {
  const examples = [
    [0.3, 0.27, "down", "10"], [0.3, 0.24, "down", "20"], [0.3, 0.21, "down", "30"],
    [0.3, 0.33, "up", "10"], [0.3, 0.36, "up", "20"], [0.3, 0.39, "up", "30"],
    [1e-7, 9e-8, "down", "10"], [1e-7, 8e-8, "down", "20"], [1e-7, 7e-8, "down", "30"],
    [1e-7, 1.1e-7, "up", "10"], [1e-7, 1.2e-7, "up", "20"], [1e-7, 1.3e-7, "up", "30"],
  ] as const;
  for (const [referenceRate, candidateRate, direction, tier] of examples) {
    const price = buildOrderPriceAssessments([...peers(referenceRate, { quantity: 3e7, grossMinor: 90_000_000 }), order("candidate", candidateRate, { quantity: 0.0000003, grossMinor: 320_000 })]).get("candidate")!;
    assert.equal(price.direction, direction);
    assert.equal(price.tier, tier, `${referenceRate}/${candidateRate}`);
  }
  assert.equal(buildOrderPriceAssessments([...peers(0.3), order("almost-down", 0.2700000000000001)]).get("almost-down")?.tier, undefined);
  assert.equal(buildOrderPriceAssessments([...peers(0.3), order("almost-up", 0.3299999999999999)]).get("almost-up")?.tier, undefined);
});

test("large stored RATE boundaries remain exact one rupiah apart in both directions", () => {
  const referenceRate = 3_000_000_000_000_000;
  const examples = [[2_700_000_000_000_000, "down", "10", undefined], [2_400_000_000_000_000, "down", "20", "10"], [2_100_000_000_000_000, "down", "30", "20"],
    [3_300_000_000_000_000, "up", "10", undefined], [3_600_000_000_000_000, "up", "20", "10"], [3_900_000_000_000_000, "up", "30", "20"]] as const;
  for (const [rate, direction, tier, adjacentTier] of examples) {
    const exact = buildOrderPriceAssessments([...peers(referenceRate), order("candidate", rate)]).get("candidate")!;
    const adjacentRate = rate + (direction === "down" ? 1 : -1);
    const adjacent = buildOrderPriceAssessments([...peers(referenceRate), order("candidate", adjacentRate)]).get("candidate")!;
    assert.equal(exact.direction, direction);
    assert.equal(exact.tier, tier);
    assert.equal(adjacent.tier, adjacentTier);
  }
});

test("finite very small RATE references still produce finite summary values", () => {
  const rate = Number.MIN_VALUE;
  const price = buildOrderPriceAssessments([...peers(rate), order("zero", 0)]).get("zero")!;
  assert.equal(price.averageMinor, rate);
  assert.ok(Number.isFinite(price.groupAverageMinor));
  assert.equal(price.lowestMinor, 0);
  assert.equal(price.highestMinor, rate);
  assert.equal(price.dropPercent, 100);
  assert.equal(price.tier, "30");
});

test("candidate RATE is excluded from its baseline and three other positive parents are required", () => {
  for (const [rate, direction] of [[224_000, "down"], [416_000, "up"]] as const) {
    const short = buildOrderPriceAssessments([...peers().slice(0, 2), order("candidate", rate)]).get("candidate")!;
    assert.equal(short.peerCount, 2);
    assert.equal(short.averageMinor, 320_000);
    assert.equal(short.direction, undefined);
    assert.equal(short.dropPercent, undefined);
    assert.equal(short.risePercent, undefined);
    const sufficient = buildOrderPriceAssessments([...peers(), order("candidate", rate)]).get("candidate")!;
    assert.equal(sufficient.averageMinor, 320_000);
    assert.equal(sufficient.direction, direction);
    assert.equal(sufficient.tier, "30");
  }
});

test("precise title variants share RATE peers but game/duration/multiplier/levels remain separate", () => {
  const assessed = buildOrderPriceAssessments([...peers(), order("variant", 256_000, { orderName: "⭐ 12Hours Package ☑ Piloting All Activities" }),
    order("duration", 100_000, { orderName: "6 Hours Package Piloting All Activities" }), order("multiplier", 100_000, { orderName: "12 Hours Package Piloting All Activities x2" }),
    order("level", 100_000, { orderName: "Leveling1-200" }), order("game", 100_000, { game: "ANII" })]);
  assert.equal(assessed.get("variant")?.tier, "20");
  assert.equal(assessed.get("variant")?.groupKey, assessed.get("peer-1")?.groupKey);
  for (const id of ["duration", "multiplier", "level", "game"]) assert.equal(assessed.get(id)?.peerCount, 0, id);
});

test("sources/buyers/workers do not split RATE peers but regions and servers do", () => {
  const assessed = buildOrderPriceAssessments([...peers(), order("other-source", 224_000, { source: "PAUC", buyerName: "Other", team: "FH3" }),
    order("region", 224_000, { region: "NA" }), order("server", 224_000, { server: "EU-2" })]);
  assert.equal(assessed.get("other-source")?.tier, "30");
  assert.equal(assessed.get("region")?.peerCount, 0);
  assert.equal(assessed.get("server")?.peerCount, 0);
});

test("gold stored RATE retains currency/location grouping independently of TOTAL and quantity correctness", () => {
  const references = [50, 100, 200].map((quantity, index) => order(`gold-${index}`, 2_200, { orderType: "gold", orderName: `${quantity}M NA`, quantity, grossMinor: quantity * 20_000 }));
  const assessed = buildOrderPriceAssessments([...references, order("cheap", 1_760, { orderType: "gold", orderName: "20M NA", quantity: 20, grossMinor: 44_000 }),
    order("K", 1_760, { orderType: "gold", orderName: "20K NA", quantity: 20 }), order("EU", 1_760, { orderType: "gold", orderName: "20M EU", quantity: 20 })]);
  assert.equal(assessed.get("cheap")?.basis, "rate");
  assert.equal(assessed.get("cheap")?.priceMinor, 1_760);
  assert.equal(assessed.get("cheap")?.averageMinor, 2_200);
  assert.equal(assessed.get("cheap")?.tier, "20");
  assert.equal(assessed.get("K")?.peerCount, 0);
  assert.equal(assessed.get("EU")?.peerCount, 0);
  const mismatch = order("X3141", 22_000, { orderType: "gold", orderName: "200M NA", quantity: 20, grossMinor: 440_000 });
  const mismatchPrice = buildOrderPriceAssessments([...references, mismatch]).get("X3141")!;
  assert.equal(mismatchPrice.priceMinor, 22_000);
  assert.equal(mismatchPrice.direction, "up");
  assert.equal(mismatchPrice.tier, "30");
});

test("item RATE never divides by quantity or substitutes identical TOTAL", () => {
  const references = peers(10_000, { orderType: "item", orderName: "Sword+20", quantity: 2, grossMinor: 20_000 });
  const candidate = order("item", 8_000, { orderType: "item", orderName: "Sword+20", quantity: 0, grossMinor: 20_000 });
  const assessed = buildOrderPriceAssessments([...references, candidate]).get("item")!;
  assert.equal(assessed.priceMinor, 8_000);
  assert.equal(assessed.averageMinor, 10_000);
  assert.equal(assessed.direction, "down");
  assert.equal(assessed.tier, "20");
});

test("explicit daily orders use parent RATE once and ignore changing financial day totals", () => {
  const daily = (id: string, rate: number, count: number, dayAmount: number) => order(id, rate, {
    orderName: "1 Month Package (12 Hours/Day)", scheduleMode: "daily", scheduleTotalDays: 30, dailyHours: 12, grossMinor: 99_000_000,
    dailyWork: Array.from({ length: count }, (_, index) => ({ id: `${id}-day-${index}`, sequence: index + 1, workDate: "2026-10-06", grossMinor: dayAmount, status: "pending", hours: 12 })),
  });
  const rows = [daily("daily-1", 320_000, 30, 1), daily("daily-2", 320_000, 1, 9_000_000), daily("daily-3", 320_000, 10, 0), daily("cheap", 224_000, 30, 320_000),
    order("raw-month", 224_000, { orderName: "1 Month Package (12 Hours/Day)" }), { ...daily("other-duration", 224_000, 30, 1), scheduleTotalDays: 60 },
    { ...daily("missing-rate", 224_000, 30, 320_000), rateMinor: undefined }];
  const assessed = buildOrderPriceAssessments(rows);
  assert.equal(assessed.get("cheap")?.basis, "rate");
  assert.equal(assessed.get("cheap")?.priceMinor, 224_000);
  assert.equal(assessed.get("cheap")?.averageMinor, 320_000);
  assert.equal(assessed.get("cheap")?.peerCount, 3);
  assert.equal(assessed.get("cheap")?.sampleCount, 4);
  assert.equal(assessed.get("cheap")?.tier, "30");
  assert.equal(assessed.get("raw-month")?.peerCount, 0);
  assert.equal(assessed.get("other-duration")?.peerCount, 0);
  assert.equal(assessed.has("missing-rate"), false);
  const modified = rows.map(row => ({ ...row, grossMinor: 0, quantity: 99, dailyWork: row.dailyWork?.map(day => ({ ...day, grossMinor: 55_555_555 })) }));
  assert.deepEqual(buildOrderPriceAssessments(modified).get("cheap"), assessed.get("cheap"));
});

test("archive, cancelled, unknown/generic scope and invalid RATE do not become references", () => {
  const invalid = [order("archive", 320_000, { sheetDeletedAt: "2026-10-06" }), order("cancel", 320_000, { operationalStatus: "cancelled" }), order("nan", Number.NaN),
    order("infinity", Number.POSITIVE_INFINITY), order("negative", -1), order("missing", 320_000, { rateMinor: undefined }), order("unknown", 320_000, { orderType: undefined }),
    order("custom", 320_000, { orderName: "Custom Order" })];
  const assessed = buildOrderPriceAssessments([...invalid, ...peers().slice(0, 2), order("candidate", 224_000)]);
  for (const row of invalid) assert.equal(assessed.has(row.id), false, row.id);
  assert.equal(assessed.get("candidate")?.peerCount, 2);
  assert.equal(assessed.get("candidate")?.tier, undefined);
});

test("same ID/KODE RATE duplicates count once despite different totals and conflicting RATE is excluded", () => {
  const first = peers()[0];
  const sameRate = { ...first, id: "same-code", grossMinor: 900_000, quantity: 3 };
  const candidate = order("candidate", 224_000);
  const short = buildOrderPriceAssessments([first, first, sameRate, peers()[1], candidate]);
  assert.equal(short.get("candidate")?.peerCount, 2);
  assert.equal(short.get("candidate")?.tier, undefined);
  const conflicting = buildOrderPriceAssessments([...peers(), { ...first, id: "different-rate", rateMinor: 640_000 }, candidate]);
  assert.equal(conflicting.get("candidate")?.peerCount, 2);
  assert.equal(conflicting.get("candidate")?.averageMinor, 320_000);
  assert.equal(conflicting.has(first.id), false);
  assert.equal(conflicting.has("different-rate"), false);
});

test("conflicting RATE duplicates cannot change summary statistics under input permutation", () => {
  const first = order("first", 100);
  const sameCode = { ...first, id: "same-code", rateMinor: 1_000 };
  const second = order("second", 200);
  for (const rows of [[first, sameCode, second], [sameCode, first, second], [first, { ...sameCode, id: first.id }, second], [{ ...sameCode, id: first.id }, first, second]]) {
    const assessed = buildOrderPriceAssessments(rows);
    assert.equal(assessed.has(first.id), false);
    assert.equal(assessed.get("second")?.sampleCount, 1);
    assert.equal(assessed.get("second")?.groupAverageMinor, 200);
    assert.equal(assessed.get("second")?.lowestMinor, 200);
    assert.equal(assessed.get("second")?.highestMinor, 200);
  }
});

test("group RATE min/max/mean include own and zero rates and stay fixed when rows are filtered", () => {
  const rows = [...peers(), order("cheap", 224_000, { source: "PAUC" }), order("high", 400_000), order("zero", 0)];
  const before = structuredClone(rows);
  const all = buildOrderPriceAssessments(rows);
  const displayed = rows.filter(row => row.source === "PAUC").map(row => all.get(row.id)!);
  assert.equal(displayed[0].lowestMinor, 0);
  assert.equal(displayed[0].highestMinor, 400_000);
  assert.equal(displayed[0].sampleCount, 6);
  assert.equal(displayed[0].groupAverageMinor, 264_000);
  assert.equal(displayed[0].averageMinor, 340_000);
  assert.equal(displayed[0].peerCount, 4);
  assert.equal(displayed[0].tier, "30");
  assert.deepEqual(rows, before);
  const single = buildOrderPriceAssessments([rows[3]]).get("cheap")!;
  assert.equal(single.lowestMinor, 224_000);
  assert.equal(single.highestMinor, 224_000);
  assert.equal(single.groupAverageMinor, 224_000);
  assert.equal(single.sampleCount, 1);
  assert.equal(single.averageMinor, undefined);
});

test("closed history remains a RATE reference and changing TOTAL alone never clears an anomaly", () => {
  const historical = peers().map(row => ({ ...row, payrollClosedAt: "2026-10-05T00:00:00Z", operationalStatus: "verified" as const }));
  const candidate = order("candidate", 224_000);
  assert.equal(buildOrderPriceAssessments([...historical, candidate]).get("candidate")?.tier, "30");
  assert.equal(buildOrderPriceAssessments([...historical, { ...candidate, grossMinor: 320_000 }]).get("candidate")?.tier, "30");
  assert.equal(buildOrderPriceAssessments([...historical, { ...candidate, rateMinor: 320_000 }]).get("candidate")?.tier, undefined);
});

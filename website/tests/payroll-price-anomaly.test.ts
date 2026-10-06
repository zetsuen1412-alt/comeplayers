import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOrderPriceAssessments } from "../features/payroll/lib/price-anomaly";
import type { Order } from "../features/payroll/types/domain";

function order(id: string, grossMinor: number, patch: Partial<Order> = {}): Order {
  return {
    id, orderNumber: id, externalReference: id, source: "G2G", orderName: "12 Hours Package⭐ Piloting All Activities",
    orderType: "boosting", game: "AION", service: "12 Hours Package⭐ Piloting All Activities", quantity: 1, grossMinor,
    operationalStatus: "draft", financeStatus: "pending", expectedPaymentMinor: grossMinor, matchedPaymentMinor: 0,
    orderedAt: "2026-10-06T00:00:00Z", dueAt: "2026-10-07T00:00:00Z", ...patch,
  };
}
function peers(price = 320_000, patch: Partial<Order> = {}) { return [1, 2, 3].map(index => order(`peer-${index}`, price, patch)); }

test("exact 10/20/30 boundaries and immediately adjacent integer prices use the unrounded peer mean", () => {
  const examples = [[288_001, undefined], [288_000, "10"], [256_001, "10"], [256_000, "20"], [224_001, "20"], [224_000, "30"], [160_000, "30"]] as const;
  for (const [price, tier] of examples) {
    const assessment = buildOrderPriceAssessments([...peers(), order("candidate", price)]).get("candidate")!;
    assert.equal(assessment.averageMinor, 320_000);
    assert.equal(assessment.peerCount, 3);
    assert.equal(assessment.tier, tier, String(price));
  }
});

test("zero candidate is brown against positive peers, but never lowers another order's average", () => {
  const assessment = buildOrderPriceAssessments([...peers(), order("zero", 0), order("normal", 320_000)]);
  assert.equal(assessment.get("zero")?.tier, "30");
  assert.equal(assessment.get("zero")?.dropPercent, 100);
  assert.equal(assessment.get("zero")?.peerCount, 4);
  assert.equal(assessment.get("normal")?.averageMinor, 320_000);
  assert.equal(assessment.get("normal")?.peerCount, 3);
});

test("fractional unit and daily prices retain exact tier boundaries without swallowing one minor unit above", () => {
  for (const denominator of [3, 7, 19, 31, 999]) {
    const scope = { orderType: "gold" as const, orderName: `${denominator}M`, quantity: denominator };
    const references = peers(1_000, scope);
    for (const [gross, tier, immediatelyAboveTier] of [[900, "10", undefined], [800, "20", "10"], [700, "30", "20"]] as const) {
      const exact = buildOrderPriceAssessments([...references, order("candidate", gross, scope)]).get("candidate")!;
      const above = buildOrderPriceAssessments([...references, order("candidate", gross + 1, scope)]).get("candidate")!;
      assert.equal(exact.tier, tier, `${gross}/${denominator}`);
      assert.equal(above.tier, immediatelyAboveTier, `${gross + 1}/${denominator}`);
    }
  }
  const daily = (id: string, gross: number) => order(id, gross, {
    orderName: "12 Hours Package x3", scheduleMode: "daily", scheduleTotalDays: 3, dailyHours: 12,
    dailyWork: [Math.floor(gross / 3), Math.floor(gross / 3), gross - 2 * Math.floor(gross / 3)].map((amount, index) => ({ id: `${id}-${index}`, sequence: index + 1, workDate: "2026-10-06", grossMinor: amount, status: "pending" })),
  });
  const references = [1, 2, 3].map(index => daily(`day-${index}`, 1_000));
  assert.equal(buildOrderPriceAssessments([...references, daily("candidate", 700)]).get("candidate")?.tier, "30");
  assert.equal(buildOrderPriceAssessments([...references, daily("candidate", 701)]).get("candidate")?.tier, "20");
});

test("decimal/scientific quantities and large totals keep exact boundaries one rupiah apart", () => {
  for (const quantity of [0.3, 0.0000003, 3e7]) {
    const scope = { orderType: "gold" as const, orderName: "Spiritvale currency", quantity };
    const references = peers(1_000_000_000_000, scope);
    for (const [gross, tier, aboveTier] of [[900_000_000_000, "10", undefined], [800_000_000_000, "20", "10"], [700_000_000_000, "30", "20"]] as const) {
      assert.equal(buildOrderPriceAssessments([...references, order("candidate", gross, scope)]).get("candidate")?.tier, tier);
      assert.equal(buildOrderPriceAssessments([...references, order("candidate", gross + 1, scope)]).get("candidate")?.tier, aboveTier);
    }
  }
});

test("mean leaves the candidate out and requires three other distinct parent orders", () => {
  const candidate = order("candidate", 224_000);
  const short = buildOrderPriceAssessments([...peers().slice(0, 2), candidate]);
  assert.equal(short.get("candidate")?.peerCount, 2);
  assert.equal(short.get("candidate")?.averageMinor, 320_000);
  assert.equal(short.get("candidate")?.tier, undefined);
  const sufficient = buildOrderPriceAssessments([...peers(), candidate]);
  assert.equal(sufficient.get("candidate")?.averageMinor, 320_000);
  assert.equal(sufficient.get("candidate")?.tier, "30");
});

test("boosting TOTAL is independent of shared-worker quantity and stale RATE", () => {
  const assessment = buildOrderPriceAssessments([...peers(), order("shared", 320_000, { quantity: 2, rateMinor: 160_000 })]).get("shared")!;
  assert.equal(assessment.basis, "order");
  assert.equal(assessment.priceMinor, 320_000);
  assert.equal(assessment.tier, undefined);
});

test("decorative title variants match while different duration, multiplier, level and game remain separate", () => {
  const common = peers();
  const rows = [order("variant", 256_000, { orderName: "⭐  12Hours Package ☑ Piloting All Activities" }),
    order("duration", 100_000, { orderName: "6 Hours Package Piloting All Activities" }),
    order("multiplier", 100_000, { orderName: "12 Hours Package Piloting All Activities x2" }),
    order("level", 100_000, { orderName: "Leveling 1 - 200" }), order("game", 100_000, { game: "ANII" })];
  const assessed = buildOrderPriceAssessments([...common, ...rows]);
  assert.equal(assessed.get("variant")?.tier, "20");
  assert.equal(assessed.get("variant")?.groupKey, assessed.get("peer-1")?.groupKey);
  assert.notEqual(assessed.get("multiplier")?.groupKey, assessed.get("peer-1")?.groupKey);
  for (const id of ["duration", "multiplier", "level", "game"]) assert.equal(assessed.get(id)?.peerCount, 0, id);
});

test("buyers, sources and workers do not split matching prices; regions and servers do", () => {
  const assessed = buildOrderPriceAssessments([...peers(), order("other-source", 224_000, { source: "PAUC", buyerName: "Other", team: "FH3" }),
    order("region", 224_000, { region: "NA" }), order("server", 224_000, { server: "EU-2" })]);
  assert.equal(assessed.get("other-source")?.tier, "30");
  assert.equal(assessed.get("region")?.peerCount, 0);
  assert.equal(assessed.get("server")?.peerCount, 0);
});

test("gold quantities use TOTAL per unit while currency units and location suffixes stay separate", () => {
  const goldPeers = [50, 100, 200].map((quantity, index) => order(`gold-${index}`, quantity * 2_200, { orderType: "gold", orderName: `${quantity}M NA`, quantity }));
  const assessed = buildOrderPriceAssessments([...goldPeers, order("gold-cheap", 20 * 1_760, { orderType: "gold", orderName: "20M NA", quantity: 20, rateMinor: 2_200 }),
    order("gold-K", 20 * 1_760, { orderType: "gold", orderName: "20K NA", quantity: 20 }),
    order("gold-EU", 20 * 1_760, { orderType: "gold", orderName: "20M EU", quantity: 20 })]);
  assert.equal(assessed.get("gold-cheap")?.basis, "unit");
  assert.equal(assessed.get("gold-cheap")?.averageMinor, 2_200);
  assert.equal(assessed.get("gold-cheap")?.priceMinor, 1_760);
  assert.equal(assessed.get("gold-cheap")?.tier, "20");
  assert.equal(assessed.get("gold-K")?.peerCount, 0);
  assert.equal(assessed.get("gold-EU")?.peerCount, 0);
});

test("quantity-inconsistent gold imports cannot inflate legitimate unit-price averages", () => {
  const normal = [50, 100, 200].map((quantity, index) => order(`gold-${index}`, quantity * 2_200, { orderType: "gold", orderName: `${quantity}M SPIRITVALE`, quantity }));
  const inconsistent = order("X3141", 440_000, { orderType: "gold", orderName: "200M SPIRITVALE", quantity: 20, rateMinor: 22_000 });
  const candidate = order("normal", 10 * 2_200, { orderType: "gold", orderName: "10M Spiritvale", quantity: 10 });
  const assessed = buildOrderPriceAssessments([...normal, inconsistent, candidate]);
  assert.equal(assessed.has("X3141"), false);
  assert.equal(assessed.get("normal")?.averageMinor, 2_200);
  assert.equal(assessed.get("normal")?.highestMinor, 2_200);
  assert.equal(assessed.get("normal")?.sampleCount, 4);
  assert.equal(assessed.get("normal")?.tier, undefined);
});

test("items use unit price without changing product names or input data", () => {
  const itemPeers = peers(20_000, { orderType: "item", orderName: "Sword +20", quantity: 2 });
  const candidate = order("item", 8_000, { orderType: "item", orderName: "Sword +20", quantity: 1 });
  const input = [...itemPeers, candidate];
  const snapshot = structuredClone(input);
  assert.equal(buildOrderPriceAssessments(input).get("item")?.tier, "20");
  assert.deepEqual(input, snapshot);
});

test("explicit daily orders contribute one parent price regardless of number of segments", () => {
  const daily = (id: string, dailyPrice: number, count: number) => order(id, dailyPrice * count, {
    orderName: "1 Month Package (12 Hours/Day)", scheduleMode: "daily", scheduleTotalDays: 30, dailyHours: 12,
    dailyWork: Array.from({ length: count }, (_, index) => ({ id: `${id}-day-${index}`, sequence: index + 1, workDate: "2026-10-06", grossMinor: dailyPrice, status: "pending", hours: 12 })),
  });
  const assessed = buildOrderPriceAssessments([daily("daily-1", 320_000, 30), daily("daily-2", 320_000, 1), daily("daily-3", 320_000, 10), daily("cheap", 224_000, 30),
    order("raw-sheet-month", 224_000, { orderName: "1 Month Package (12 Hours/Day)" }),
    { ...daily("other-duration", 224_000, 30), scheduleTotalDays: 60 }, { ...daily("other-hours", 224_000, 30), dailyHours: 6, dailyWork: [] }]);
  assert.equal(assessed.get("cheap")?.basis, "day");
  assert.equal(assessed.get("cheap")?.priceMinor, 224_000);
  assert.equal(assessed.get("cheap")?.averageMinor, 320_000);
  assert.equal(assessed.get("cheap")?.peerCount, 3);
  assert.equal(assessed.get("cheap")?.tier, "30");
  assert.equal(assessed.get("raw-sheet-month")?.basis, "order");
  assert.equal(assessed.get("raw-sheet-month")?.peerCount, 0);
  assert.equal(assessed.get("other-duration")?.peerCount, 0);
  assert.equal(assessed.has("other-hours"), false);
});

test("archive, cancelled, unknown, generic scopes and invalid amounts cannot become price references", () => {
  const invalid = [order("archive", 320_000, { sheetDeletedAt: "2026-10-06" }), order("cancel", 320_000, { operationalStatus: "cancelled" }),
    order("nan", Number.NaN), order("infinity", Number.POSITIVE_INFINITY), order("negative", -1),
    order("unknown", 320_000, { orderType: undefined }), order("custom", 320_000, { orderName: "Custom Order" }),
    order("quantity-zero", 320_000, { orderType: "gold", orderName: "100M", quantity: 0 })];
  const assessed = buildOrderPriceAssessments([...invalid, ...peers().slice(0, 2), order("candidate", 224_000)]);
  for (const row of invalid) assert.equal(assessed.has(row.id), false, row.id);
  assert.equal(assessed.get("candidate")?.peerCount, 2);
  assert.equal(assessed.get("candidate")?.tier, undefined);
});

test("duplicate IDs and KODEs do not inflate peers; conflicting duplicate prices are not references", () => {
  const first = peers()[0];
  const copy = { ...first, id: "same-code" };
  const candidate = order("candidate", 224_000);
  const short = buildOrderPriceAssessments([first, first, copy, peers()[1], candidate]);
  assert.equal(short.get("candidate")?.peerCount, 2);
  assert.equal(short.get("candidate")?.tier, undefined);
  const conflicting = buildOrderPriceAssessments([...peers(), { ...first, id: "different-price", grossMinor: 640_000 }, candidate]);
  assert.equal(conflicting.get("candidate")?.peerCount, 2);
  assert.equal(conflicting.get("candidate")?.averageMinor, 320_000);
  assert.equal(conflicting.has(first.id), false);
  assert.equal(conflicting.has("different-price"), false);
});

test("closed historical orders remain valid references and recomputation follows corrected input", () => {
  const closedPeers = peers().map(row => ({ ...row, payrollClosedAt: "2026-10-05T00:00:00Z", operationalStatus: "verified" as const }));
  const low = order("candidate", 224_000);
  assert.equal(buildOrderPriceAssessments([...closedPeers, low]).get("candidate")?.tier, "30");
  assert.equal(buildOrderPriceAssessments([...closedPeers, { ...low, grossMinor: 320_000 }]).get("candidate")?.tier, undefined);
});

test("group min/max include candidate and valid zero even before the minimum peer count is reached", () => {
  const rows = [order("zero", 0), order("cheap", 224_000), order("high", 400_000)];
  const assessed = buildOrderPriceAssessments(rows);
  for (const row of rows) {
    const price = assessed.get(row.id)!;
    assert.equal(price.lowestMinor, 0);
    assert.equal(price.highestMinor, 400_000);
    assert.equal(price.sampleCount, 3);
    assert.equal(price.groupAverageMinor, 208_000);
    assert.equal(price.tier, undefined);
  }
  const single = buildOrderPriceAssessments([rows[1]]).get("cheap")!;
  assert.equal(single.lowestMinor, 224_000);
  assert.equal(single.highestMinor, 224_000);
  assert.equal(single.sampleCount, 1);
  assert.equal(single.groupAverageMinor, 224_000);
  assert.equal(single.averageMinor, undefined);
});

test("each row retains whole-group statistics when displayed through source or candidate filters", () => {
  const rows = [...peers(), order("cheap", 224_000, { source: "PAUC" }), order("highest", 400_000), order("zero", 0)];
  const complete = buildOrderPriceAssessments(rows);
  const displayed = rows.filter(row => row.source === "PAUC").map(row => complete.get(row.id)!);
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].lowestMinor, 0);
  assert.equal(displayed[0].highestMinor, 400_000);
  assert.equal(displayed[0].sampleCount, 6);
  assert.equal(displayed[0].peerCount, 4);
  assert.equal(displayed[0].averageMinor, 340_000);
  assert.equal(displayed[0].groupAverageMinor, 264_000);
  assert.equal(displayed[0].tier, "30");
});

test("conflicting duplicate KODE/ID prices cannot change group summaries when the input order changes", () => {
  const first = order("first", 100);
  const sameCode = { ...first, id: "same-code", grossMinor: 1_000 };
  const second = order("second", 200);
  for (const rows of [[first, sameCode, second], [sameCode, first, second]]) {
    const assessed = buildOrderPriceAssessments(rows);
    assert.equal(assessed.has(first.id), false);
    assert.equal(assessed.has(sameCode.id), false);
    assert.equal(assessed.get("second")?.sampleCount, 1);
    assert.equal(assessed.get("second")?.groupAverageMinor, 200);
    assert.equal(assessed.get("second")?.lowestMinor, 200);
    assert.equal(assessed.get("second")?.highestMinor, 200);
  }
  for (const rows of [[first, { ...sameCode, id: first.id }, second], [{ ...sameCode, id: first.id }, first, second]]) {
    const assessed = buildOrderPriceAssessments(rows);
    assert.equal(assessed.has(first.id), false);
    assert.equal(assessed.get("second")?.sampleCount, 1);
    assert.equal(assessed.get("second")?.groupAverageMinor, 200);
  }
  const zeroConflict = buildOrderPriceAssessments([order("first", 0), sameCode, second]);
  assert.equal(zeroConflict.get("second")?.sampleCount, 1);
  assert.equal(zeroConflict.get("second")?.lowestMinor, 200);
});

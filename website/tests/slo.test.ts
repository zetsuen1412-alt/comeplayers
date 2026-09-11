import assert from "node:assert/strict";
import test from "node:test";
import { calculateSlo, percentile } from "@/lib/slo";

test("percentile returns the nearest-rank value", () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 95), 50);
  assert.equal(percentile([], 95), 0);
});

test("SLO calculation aggregates availability, p95, regions, and targets", () => {
  const checks = [
    { target: "a", region: "sin1", status: "up" as const, latency_ms: 100, checked_at: "2026-01-01" },
    { target: "a", region: "sfo1", status: "up" as const, latency_ms: 200, checked_at: "2026-01-01" },
    { target: "b", region: "sin1", status: "down" as const, latency_ms: 500, checked_at: "2026-01-01" },
  ];
  const result = calculateSlo(checks, {
    availabilityPercent: 60,
    p95LatencyMs: 250,
  });
  assert.equal(result.totalChecks, 3);
  assert.equal(result.failedChecks, 1);
  assert.equal(result.regionCount, 2);
  assert.equal(result.targetCount, 2);
  assert.equal(result.p95LatencyMs, 200);
  assert.equal(result.passing, true);
});

test("empty evidence never passes launch SLO", () => {
  const result = calculateSlo([]);
  assert.equal(result.passing, false);
  assert.equal(result.availabilityPassing, false);
});

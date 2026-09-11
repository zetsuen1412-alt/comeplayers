export type UptimeCheckRecord = {
  target: string;
  region: string;
  status: "up" | "down";
  latency_ms?: number | null;
  checked_at: string;
};

export type SloTarget = {
  availabilityPercent: number;
  p95LatencyMs: number;
};

export function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export function calculateSlo(
  checks: UptimeCheckRecord[],
  target: SloTarget = { availabilityPercent: 99.9, p95LatencyMs: 1500 }
) {
  const total = checks.length;
  const successful = checks.filter((check) => check.status === "up").length;
  const latencies = checks
    .filter((check) => check.status === "up")
    .map((check) => Number(check.latency_ms || 0))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const availabilityPercent = total === 0 ? 0 : (successful / total) * 100;
  const p95LatencyMs = percentile(latencies, 95);
  const regions = new Set(checks.map((check) => check.region).filter(Boolean));
  const targets = new Set(checks.map((check) => check.target).filter(Boolean));

  return {
    totalChecks: total,
    successfulChecks: successful,
    failedChecks: total - successful,
    availabilityPercent,
    p95LatencyMs,
    regionCount: regions.size,
    targetCount: targets.size,
    availabilityPassing: total > 0 && availabilityPercent >= target.availabilityPercent,
    latencyPassing: latencies.length > 0 && p95LatencyMs <= target.p95LatencyMs,
    passing:
      total > 0 &&
      availabilityPercent >= target.availabilityPercent &&
      latencies.length > 0 &&
      p95LatencyMs <= target.p95LatencyMs,
  };
}

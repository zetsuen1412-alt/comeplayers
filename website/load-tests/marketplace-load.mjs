import fs from "node:fs/promises";

const baseUrl = String(process.env.LOAD_BASE_URL || "").replace(/\/$/, "");
if (!baseUrl) throw new Error("LOAD_BASE_URL is required.");

const durationSeconds = clamp(process.env.LOAD_DURATION_SECONDS, 5, 900, 30);
const concurrency = clamp(process.env.LOAD_CONCURRENCY, 1, 200, 10);
const timeoutMs = clamp(process.env.LOAD_REQUEST_TIMEOUT_MS, 1000, 60000, 15000);
const p95ThresholdMs = clamp(process.env.LOAD_P95_THRESHOLD_MS, 50, 60000, 1500);
const maxErrorRate = clampFloat(process.env.LOAD_MAX_ERROR_RATE, 0, 1, 0.01);
const allowMutations = process.env.LOAD_ALLOW_MUTATIONS === "true";
const loadEnvironment = String(process.env.LOAD_ENVIRONMENT || "").trim().toLowerCase();
if (allowMutations && !["staging", "test"].includes(loadEnvironment)) {
  throw new Error("Mutation load tests require LOAD_ENVIRONMENT=staging or test.");
}

function clamp(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.floor(parsed)))
    : fallback;
}

function clampFloat(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

const dynamicTokens = new Set(["REQUEST_ID", "WORKER_ID", "TIMESTAMP"]);

function substitute(value) {
  if (typeof value === "string") {
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, name) =>
      dynamicTokens.has(name) ? match : process.env[name] || ""
    );
  }
  if (Array.isArray(value)) return value.map(substitute);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item)]));
  }
  return value;
}

function renderDynamic(value, context) {
  if (typeof value === "string") {
    return value
      .replaceAll("{{REQUEST_ID}}", String(context.requestId))
      .replaceAll("{{WORKER_ID}}", String(context.workerId))
      .replaceAll("{{TIMESTAMP}}", String(context.timestamp));
  }
  if (Array.isArray(value)) return value.map((item) => renderDynamic(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderDynamic(item, context)])
    );
  }
  return value;
}

async function customScenarios() {
  const inline = process.env.LOAD_SCENARIOS_JSON;
  const file = process.env.LOAD_SCENARIOS_FILE;
  if (!inline && !file) return [];
  const raw = inline || (await fs.readFile(file, "utf8"));
  const parsed = substitute(JSON.parse(raw));
  if (!Array.isArray(parsed)) throw new Error("Load scenarios must be a JSON array.");
  return parsed;
}

const defaults = [
  {
    name: "health",
    method: "GET",
    path: "/api/health",
    weight: 2,
    expectedStatuses: [200],
  },
  {
    name: "marketplace-search",
    method: "GET",
    path: "/api/marketplace/search?q=mobile&limit=12",
    weight: 8,
    expectedStatuses: [200],
  },
];

const scenarios = [...defaults, ...(await customScenarios())]
  .map((scenario) => ({
    name: String(scenario.name || "unnamed").slice(0, 100),
    method: String(scenario.method || "GET").toUpperCase(),
    path: String(scenario.path || "/"),
    weight: clamp(scenario.weight, 1, 100, 1),
    mutation: Boolean(scenario.mutation),
    headers: scenario.headers && typeof scenario.headers === "object" ? scenario.headers : {},
    body: scenario.body,
    expectedStatuses: Array.isArray(scenario.expectedStatuses)
      ? scenario.expectedStatuses.map(Number)
      : [200, 201, 202, 204],
  }))
  .filter((scenario) => allowMutations || !scenario.mutation);

if (scenarios.length === 0) throw new Error("No enabled load scenarios.");

const weighted = scenarios.flatMap((scenario) => Array(scenario.weight).fill(scenario));
const results = [];
const endAt = Date.now() + durationSeconds * 1000;
let cursor = 0;

async function worker(workerId) {
  while (Date.now() < endAt) {
    const sequence = cursor++;
    const scenario = weighted[(sequence + workerId) % weighted.length];
    const dynamicContext = {
      requestId: `${Date.now()}-${workerId}-${sequence}`,
      workerId,
      timestamp: Date.now(),
    };
    const requestPath = renderDynamic(scenario.path, dynamicContext);
    const requestHeaders = renderDynamic(scenario.headers, dynamicContext);
    const requestBody = renderDynamic(scenario.body, dynamicContext);
    const started = performance.now();
    let status = 0;
    let error = "";

    try {
      const response = await fetch(`${baseUrl}${requestPath}`, {
        method: scenario.method,
        headers: {
          Accept: "application/json",
          ...(requestBody !== undefined ? { "Content-Type": "application/json" } : {}),
          ...requestHeaders,
          "x-load-test": "comeplayers-v20",
          "x-load-environment": loadEnvironment || "unspecified",
          "x-load-request-id": dynamicContext.requestId,
        },
        body:
          requestBody === undefined
            ? undefined
            : typeof requestBody === "string"
              ? requestBody
              : JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      await response.arrayBuffer();
      if (!scenario.expectedStatuses.includes(status)) {
        error = `Unexpected HTTP ${status}`;
      }
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : "Request failed";
    }

    results.push({
      scenario: scenario.name,
      durationMs: performance.now() - started,
      status,
      error,
    });
  }
}

console.log(
  `Running ${scenarios.length} scenario(s) against ${baseUrl} for ${durationSeconds}s at concurrency ${concurrency}.`
);
await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));

const durations = results.map((row) => row.durationMs).sort((a, b) => a - b);
const failures = results.filter((row) => row.error);
const p50 = percentile(durations, 0.5);
const p95 = percentile(durations, 0.95);
const p99 = percentile(durations, 0.99);
const errorRate = results.length ? failures.length / results.length : 1;
const throughput = results.length / durationSeconds;

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)];
}

const byScenario = Object.fromEntries(
  scenarios.map((scenario) => {
    const rows = results.filter((row) => row.scenario === scenario.name);
    const scenarioDurations = rows.map((row) => row.durationMs).sort((a, b) => a - b);
    const scenarioFailures = rows.filter((row) => row.error).length;
    return [
      scenario.name,
      {
        requests: rows.length,
        failures: scenarioFailures,
        errorRate: rows.length ? scenarioFailures / rows.length : 0,
        p95Ms: Number(percentile(scenarioDurations, 0.95).toFixed(1)),
      },
    ];
  })
);

const summary = {
  baseUrl,
  loadEnvironment: loadEnvironment || "unspecified",
  mutationsEnabled: allowMutations,
  durationSeconds,
  concurrency,
  requests: results.length,
  failures: failures.length,
  errorRate: Number(errorRate.toFixed(4)),
  requestsPerSecond: Number(throughput.toFixed(2)),
  latencyMs: {
    p50: Number(p50.toFixed(1)),
    p95: Number(p95.toFixed(1)),
    p99: Number(p99.toFixed(1)),
  },
  thresholds: {
    p95ThresholdMs,
    maxErrorRate,
  },
  byScenario,
};

console.log(JSON.stringify(summary, null, 2));

const failedThreshold = p95 > p95ThresholdMs || errorRate > maxErrorRate;
if (failedThreshold) {
  console.error(
    `Load test failed thresholds: p95=${p95.toFixed(1)}ms, errorRate=${(errorRate * 100).toFixed(2)}%.`
  );
  process.exitCode = 1;
}

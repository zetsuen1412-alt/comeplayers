import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|token|secret|password|credential|ciphertext|auth_tag|account_number|delivery|pin/i;

function normalizeError(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) };

  return {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
  };
}

export function sanitizeLogData(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[MAX_DEPTH]";
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return normalizeError(value);
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeLogData(item, depth + 1));
  }
  if (typeof value !== "object") {
    return typeof value === "string" && value.length > 2000
      ? `${value.slice(0, 2000)}…`
      : value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : sanitizeLogData(item, depth + 1),
    ])
  );
}

export function requestId(request: Request) {
  const provided = String(request.headers.get("x-request-id") || "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, 120);

  return provided || randomUUID();
}

export function logEvent(
  level: LogLevel,
  event: string,
  data: Record<string, unknown> = {}
) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "comeplayers-web",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    ...(sanitizeLogData(data) as Record<string, unknown>),
  };
  const serialized = JSON.stringify(payload);

  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else if (level === "debug") console.debug(serialized);
  else console.info(serialized);
}

export async function observeOperation<T>(input: {
  event: string;
  requestId?: string;
  context?: Record<string, unknown>;
  run: () => Promise<T>;
}) {
  const startedAt = Date.now();

  try {
    const result = await input.run();
    logEvent("info", `${input.event}.completed`, {
      requestId: input.requestId,
      durationMs: Date.now() - startedAt,
      ...input.context,
    });
    return result;
  } catch (error) {
    logEvent("error", `${input.event}.failed`, {
      requestId: input.requestId,
      durationMs: Date.now() - startedAt,
      error,
      ...input.context,
    });
    throw error;
  }
}

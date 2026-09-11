export type UpstashCommand = Array<string | number>;

type UpstashResponse<T = unknown> = { result?: T; error?: string };

const KEY_PREFIX = "cp:v30";

function redisConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, "");
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  return { url, token, configured: Boolean(url && token) };
}

export function isUpstashRedisConfigured() {
  return redisConfig().configured;
}

async function requestJson<T>(path: string, body: unknown): Promise<T> {
  const { url, token, configured } = redisConfig();
  if (!configured) throw new Error("Upstash Redis is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as UpstashResponse<T>;
    if (!response.ok || payload.error) {
      throw new Error(payload.error || `Upstash request failed with ${response.status}.`);
    }
    return payload.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function redisCommand<T = unknown>(command: UpstashCommand): Promise<T> {
  return requestJson<T>("", command);
}

export async function redisPipeline(commands: UpstashCommand[]) {
  const { url, token, configured } = redisConfig();
  if (!configured) throw new Error("Upstash Redis is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => [])) as UpstashResponse[];
    if (!response.ok) throw new Error(`Upstash pipeline failed with ${response.status}.`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export function redisKey(...parts: Array<string | number | null | undefined>) {
  return [KEY_PREFIX, ...parts.map((part) => String(part || "").replace(/[^a-zA-Z0-9:_-]/g, "_"))].join(":");
}

export async function safeRedis<T>(label: string, operation: () => Promise<T>, fallback: T): Promise<T> {
  if (!isUpstashRedisConfigured()) return fallback;
  try {
    return await operation();
  } catch (error) {
    console.warn(`[upstash:${label}] falling back`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

export async function consumeRedisRateLimit(input: {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}) {
  const key = redisKey("rate", input.scope, input.identifier);
  const script = [
    "local count = redis.call('INCR', KEYS[1])",
    "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
    "local ttl = redis.call('TTL', KEYS[1])",
    "return {count, ttl}",
  ].join("\n");
  const result = await redisCommand<[number, number]>([
    "EVAL",
    script,
    1,
    key,
    input.windowSeconds,
  ]);
  const count = Number(result?.[0] || 0);
  const ttl = Math.max(0, Number(result?.[1] || input.windowSeconds));
  return {
    allowed: count <= input.limit,
    count,
    remaining: Math.max(0, input.limit - count),
    retryAfterSeconds: ttl,
  };
}

export async function invalidateUnreadCache(userIds: string[]) {
  const keys = Array.from(new Set(userIds.filter(Boolean))).map((id) => redisKey("unread", id));
  if (!keys.length) return;
  await safeRedis("unread-invalidate", () => redisCommand(["DEL", ...keys]), 0);
}

export async function getUnreadCache(userId: string) {
  return safeRedis<number | null>("unread-get", async () => {
    const value = await redisCommand<string | null>(["GET", redisKey("unread", userId)]);
    if (value === null || value === undefined) return null;
    const count = Number(value);
    return Number.isFinite(count) ? count : null;
  }, null);
}

export async function setUnreadCache(userId: string, count: number, ttlSeconds = 20) {
  await safeRedis("unread-set", () => redisCommand(["SETEX", redisKey("unread", userId), ttlSeconds, Math.max(0, Math.trunc(count))]), "");
}

export type PresenceRecord = {
  userId: string;
  roomId: string;
  channelId: string;
  name: string;
  lastSeen: number;
};

export async function writePresence(record: PresenceRecord, ttlSeconds = 70) {
  const now = Date.now();
  const userKey = redisKey("presence", "user", record.userId);
  const roomKey = redisKey("presence", "room", record.roomId);
  await redisPipeline([
    ["SETEX", userKey, ttlSeconds, JSON.stringify({ ...record, lastSeen: now })],
    ["ZADD", roomKey, now, record.userId],
    ["ZREMRANGEBYSCORE", roomKey, 0, now - ttlSeconds * 1000],
    ["EXPIRE", roomKey, 86400],
  ]);
}

export async function readPresence(roomId: string, allowedUserIds: string[]) {
  const now = Date.now();
  const roomKey = redisKey("presence", "room", roomId);
  const candidateIds = await redisCommand<string[]>([
    "ZRANGEBYSCORE",
    roomKey,
    now - 70_000,
    "+inf",
  ]);
  const allowed = new Set(allowedUserIds);
  const ids = (candidateIds || []).filter((id) => allowed.has(String(id))).slice(0, 250);
  if (!ids.length) return [] as PresenceRecord[];
  const responses = await redisPipeline(ids.map((id) => ["GET", redisKey("presence", "user", id)]));
  return responses.flatMap((response, index) => {
    if (response.error || typeof response.result !== "string") return [];
    try {
      const parsed = JSON.parse(response.result) as PresenceRecord;
      if (!parsed?.userId || Date.now() - Number(parsed.lastSeen || 0) > 70_000) return [];
      return [{ ...parsed, userId: ids[index] }];
    } catch {
      return [];
    }
  });
}

export type TypingRecord = {
  userId: string;
  roomId: string;
  channelId: string;
  name: string;
  at: number;
};

export async function writeTyping(record: TypingRecord, active: boolean) {
  const key = redisKey("typing", record.roomId, record.channelId || "default", record.userId);
  const index = redisKey("typing-index", record.roomId, record.channelId || "default");
  if (!active) {
    await redisPipeline([["DEL", key], ["ZREM", index, record.userId]]);
    return;
  }
  const now = Date.now();
  await redisPipeline([
    ["SETEX", key, 5, JSON.stringify({ ...record, at: now })],
    ["ZADD", index, now, record.userId],
    ["ZREMRANGEBYSCORE", index, 0, now - 5_000],
    ["EXPIRE", index, 30],
  ]);
}

export async function readTyping(roomId: string, channelId: string, excludeUserId: string) {
  const now = Date.now();
  const index = redisKey("typing-index", roomId, channelId || "default");
  const ids = (await redisCommand<string[]>(["ZRANGEBYSCORE", index, now - 5_000, "+inf"]))
    .filter((id) => id !== excludeUserId)
    .slice(0, 20);
  if (!ids.length) return [] as TypingRecord[];
  const responses = await redisPipeline(
    ids.map((id) => ["GET", redisKey("typing", roomId, channelId || "default", id)]),
  );
  return responses.flatMap((response) => {
    if (response.error || typeof response.result !== "string") return [];
    try {
      const parsed = JSON.parse(response.result) as TypingRecord;
      return Date.now() - Number(parsed.at || 0) <= 5_000 ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

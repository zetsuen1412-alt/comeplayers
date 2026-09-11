import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function securityHashSecret() {
  const value =
    process.env.SECURITY_HASH_SECRET ||
    process.env.WITHDRAWAL_PIN_PEPPER ||
    "";

  if (value.length < 32) {
    throw new Error(
      "SECURITY_HASH_SECRET must be configured with at least 32 characters."
    );
  }

  return value;
}

export function securityHash(value: string) {
  return createHmac("sha256", securityHashSecret())
    .update(value)
    .digest("hex");
}

export function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function requestUserAgent(request: Request) {
  return (request.headers.get("user-agent") || "Unknown browser").slice(0, 500);
}

export function normalizeDeviceKey(value: unknown) {
  const key = String(value || "").trim();
  if (!UUID_PATTERN.test(key)) {
    throw new Error("A valid device identifier is required.");
  }
  return key;
}

export async function touchSecurityDevice(input: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  request: Request;
  deviceKey: string;
  deviceName?: string;
}) {
  const deviceKey = normalizeDeviceKey(input.deviceKey);
  const deviceKeyHash = securityHash(deviceKey);
  const ipHash = securityHash(requestIp(input.request));
  const userAgent = requestUserAgent(input.request);
  const now = new Date().toISOString();

  const { data: existing, error: lookupError } = await input.supabaseAdmin
    .from("user_security_devices")
    .select("*")
    .eq("user_id", input.userId)
    .eq("device_key_hash", deviceKeyHash)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);

  if (existing) {
    const { data, error } = await input.supabaseAdmin
      .from("user_security_devices")
      .update({
        device_name:
          String(input.deviceName || "").trim().slice(0, 120) ||
          existing.device_name,
        user_agent: userAgent,
        ip_hash: ipHash,
        last_seen_at: now,
        updated_at: now,
      })
      .eq("id", existing.id)
      .eq("user_id", input.userId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Failed to update security device.");
    }

    return data as Record<string, unknown>;
  }

  const { data, error } = await input.supabaseAdmin
    .from("user_security_devices")
    .insert({
      user_id: input.userId,
      device_key_hash: deviceKeyHash,
      device_name:
        String(input.deviceName || "").trim().slice(0, 120) || "Current device",
      user_agent: userAgent,
      ip_hash: ipHash,
      first_seen_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to register security device.");
  }

  return data as Record<string, unknown>;
}

export async function recordSecurityEvent(input: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  request: Request;
  eventType: string;
  severity?: "info" | "low" | "medium" | "high" | "critical";
  source?: string;
  deviceId?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await input.supabaseAdmin.from("security_events").insert({
    user_id: input.userId,
    event_type: input.eventType,
    severity: input.severity || "info",
    status: "open",
    source: input.source || "web",
    device_id: input.deviceId || null,
    ip_hash: securityHash(requestIp(input.request)),
    details: input.details || {},
  });

  if (error) {
    console.error("Security event insert failed:", error.message);
  }
}

export function publicDevice(device: Record<string, unknown>) {
  return {
    id: String(device.id || ""),
    device_name: String(device.device_name || "Unknown device"),
    user_agent: String(device.user_agent || "Unknown browser"),
    first_seen_at: device.first_seen_at,
    last_seen_at: device.last_seen_at,
    trusted_at: device.trusted_at,
    revoked_at: device.revoked_at,
    last_used_for_payout_at: device.last_used_for_payout_at,
  };
}

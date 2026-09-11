import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  evaluateCheckoutAccess,
  type CheckoutControl,
  type CheckoutMode,
} from "@/lib/runtimeControlPolicy";

function clampPercentage(value: unknown, fallback = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.floor(parsed)));
}

function normalizeMode(value: unknown): CheckoutMode {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "disabled" || normalized === "canary"
    ? normalized
    : "enabled";
}

function environmentAllowlist() {
  return String(process.env.CHECKOUT_CANARY_ALLOWLIST || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function getCheckoutControl(
  supabaseAdmin: SupabaseClient
): Promise<CheckoutControl> {
  const emergencyDisabled = ["1", "true", "yes", "on"].includes(
    String(process.env.CHECKOUT_KILL_SWITCH || "").trim().toLowerCase()
  );

  if (emergencyDisabled) {
    return {
      key: "checkout",
      mode: "disabled",
      percentage: 0,
      message:
        String(process.env.CHECKOUT_DISABLED_MESSAGE || "").trim() ||
        "Checkout is temporarily unavailable while we perform maintenance.",
      allowlist: environmentAllowlist(),
      source: "environment",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("runtime_controls")
    .select("key,mode,percentage,message,allowlist,updated_at")
    .eq("key", "checkout")
    .maybeSingle();

  if (!error && data) {
    const databaseAllowlist = Array.isArray(data.allowlist)
      ? data.allowlist.map(String).map((value) => value.trim()).filter(Boolean)
      : [];

    return {
      key: "checkout",
      mode: normalizeMode(data.mode),
      percentage: clampPercentage(data.percentage),
      message:
        String(data.message || "").trim() ||
        "Checkout is temporarily unavailable.",
      allowlist: Array.from(
        new Set([...databaseAllowlist, ...environmentAllowlist()])
      ),
      source: "database",
      updatedAt: data.updated_at || null,
    };
  }

  return {
    key: "checkout",
    mode: normalizeMode(process.env.CHECKOUT_MODE),
    percentage: clampPercentage(process.env.CHECKOUT_CANARY_PERCENT, 100),
    message:
      String(process.env.CHECKOUT_DISABLED_MESSAGE || "").trim() ||
      "Checkout is temporarily unavailable.",
    allowlist: environmentAllowlist(),
    source: "default",
  };
}

export async function requireCheckoutAccess(input: {
  supabaseAdmin: SupabaseClient;
  userId: string;
}) {
  const control = await getCheckoutControl(input.supabaseAdmin);
  const decision = evaluateCheckoutAccess(control, input.userId);

  if (!decision.allowed) {
    const error = new Error(control.message);
    Object.assign(error, {
      status: 503,
      code: decision.reason,
      checkoutControl: {
        mode: control.mode,
        percentage: control.percentage,
        source: control.source,
        bucket: decision.bucket,
      },
    });
    throw error;
  }

  return { control, decision };
}

export function runtimeControlErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if (Number.isFinite(status) && status >= 400 && status <= 599) return status;
  }
  return null;
}

export function runtimeControlErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code || "").trim() || null;
  }
  return null;
}

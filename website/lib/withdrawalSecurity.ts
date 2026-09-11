import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyWithdrawalPin } from "@/lib/securityPin";
import { recordSecurityEvent } from "@/lib/requestSecurity";

export async function ensureSecurityControls(
  supabaseAdmin: SupabaseClient,
  userId: string
) {
  const now = new Date().toISOString();
  const { error: insertError } = await supabaseAdmin
    .from("user_security_controls")
    .upsert(
      {
        user_id: userId,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );

  if (insertError) throw new Error(insertError.message);

  const { data, error } = await supabaseAdmin
    .from("user_security_controls")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Security controls are unavailable.");
  }

  return data as Record<string, unknown>;
}

export function payoutSecurityCooldownHours() {
  const value = Number(process.env.PAYOUT_SECURITY_COOLDOWN_HOURS || 24);
  if (!Number.isFinite(value)) return 24;
  return Math.min(Math.max(Math.floor(value), 0), 168);
}

export async function applyPayoutSecurityCooldown(input: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  reason: string;
}) {
  const hours = payoutSecurityCooldownHours();
  const until = new Date(Date.now() + hours * 3_600_000).toISOString();
  const now = new Date().toISOString();

  await ensureSecurityControls(input.supabaseAdmin, input.userId);

  const { error } = await input.supabaseAdmin
    .from("user_security_controls")
    .update({
      payout_cooldown_until: until,
      cooldown_reason: input.reason.slice(0, 160),
      security_version: 2,
      updated_at: now,
    })
    .eq("user_id", input.userId);

  if (error) throw new Error(error.message);
  return { hours, until };
}

export async function verifyWithdrawalPinOrThrow(input: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  pin: string;
  request: Request;
  deviceId?: string | null;
}) {
  const controls = await ensureSecurityControls(
    input.supabaseAdmin,
    input.userId
  );
  const lockedUntil = controls.pin_locked_until
    ? new Date(String(controls.pin_locked_until))
    : null;

  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    throw new Error(
      `Withdrawal PIN is locked until ${lockedUntil.toISOString()}.`
    );
  }

  const expectedHash = String(controls.withdrawal_pin_hash || "");
  const salt = String(controls.withdrawal_pin_salt || "");

  if (!expectedHash || !salt) {
    throw new Error("Set a withdrawal PIN before requesting payout.");
  }

  const verified = verifyWithdrawalPin({
    userId: input.userId,
    pin: String(input.pin || ""),
    salt,
    expectedHash,
  });

  if (!verified) {
    const failedAttempts = Number(controls.pin_failed_attempts || 0) + 1;
    const shouldLock = failedAttempts >= 5;
    const nextLock = shouldLock
      ? new Date(Date.now() + 30 * 60_000).toISOString()
      : null;

    const { error } = await input.supabaseAdmin
      .from("user_security_controls")
      .update({
        pin_failed_attempts: shouldLock ? 0 : failedAttempts,
        pin_locked_until: nextLock,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", input.userId);

    if (error) throw new Error(error.message);

    await recordSecurityEvent({
      supabaseAdmin: input.supabaseAdmin,
      userId: input.userId,
      request: input.request,
      eventType: shouldLock ? "withdrawal_pin_locked" : "withdrawal_pin_failed",
      severity: shouldLock ? "high" : "medium",
      deviceId: input.deviceId || null,
      details: {
        failed_attempts: failedAttempts,
        locked_until: nextLock,
      },
    });

    throw new Error(
      shouldLock
        ? "Too many incorrect PIN attempts. Withdrawals are locked for 30 minutes."
        : `Incorrect withdrawal PIN. ${5 - failedAttempts} attempt(s) remaining.`
    );
  }

  const { error } = await input.supabaseAdmin
    .from("user_security_controls")
    .update({
      pin_failed_attempts: 0,
      pin_locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId);

  if (error) throw new Error(error.message);
  return controls;
}

import type { SupabaseClient } from "@supabase/supabase-js";

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function ageHours(value: unknown) {
  const timestamp = new Date(String(value || "")).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max((Date.now() - timestamp) / 3_600_000, 0);
}

export function kycDailyLimit(level: number) {
  if (level >= 3) return 500_000_000;
  if (level >= 2) return 100_000_000;
  if (level >= 1) return 5_000_000;
  return 500_000;
}

export type WithdrawalRiskResult = {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  reasons: string[];
  holdHours: number;
  kycLevel: number;
  dailyLimit: number;
  dailyUsed: number;
  reviewStatus: "automatic" | "review" | "blocked";
};

export async function evaluateWithdrawalRisk(input: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  amount: number;
  walletBalance: number;
  payoutAccountId: number;
  device: Record<string, unknown>;
  controls: Record<string, unknown>;
  baseHoldHours: number;
}) : Promise<WithdrawalRiskResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [verificationResult, accountResult, recentResult, profileResult] =
    await Promise.all([
      input.supabaseAdmin
        .from("user_verifications")
        .select("phone_verified,email_verified,identity_verified,kyc_level")
        .eq("user_id", input.userId)
        .maybeSingle(),
      input.supabaseAdmin
        .from("payout_accounts")
        .select("id,created_at,updated_at,verification_status,security_changed_at")
        .eq("id", input.payoutAccountId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      input.supabaseAdmin
        .from("withdrawal_requests")
        .select("amount,status,created_at")
        .eq("user_id", input.userId)
        .gte("created_at", since),
      input.supabaseAdmin
        .from("user_risk_profiles")
        .select("risk_score,risk_level,status,kyc_level,payout_daily_limit,reasons")
        .eq("user_id", input.userId)
        .maybeSingle(),
    ]);

  if (verificationResult.error) throw new Error(verificationResult.error.message);
  if (accountResult.error) throw new Error(accountResult.error.message);
  if (recentResult.error) throw new Error(recentResult.error.message);
  if (profileResult.error) throw new Error(profileResult.error.message);

  if (!accountResult.data) throw new Error("Payout account not found.");
  if (input.device.revoked_at) throw new Error("This device has been revoked.");

  const verification = verificationResult.data;
  const derivedKyc = verification?.identity_verified
    ? 2
    : verification?.phone_verified
      ? 1
      : 0;
  const kycLevel = Math.max(
    derivedKyc,
    Number(verification?.kyc_level || 0),
    Number(profileResult.data?.kyc_level || 0)
  );
  const dailyLimit = Math.max(
    numberValue(profileResult.data?.payout_daily_limit),
    kycDailyLimit(kycLevel)
  );
  const recent = recentResult.data || [];
  const dailyUsed = recent
    .filter((item) => !["rejected", "failed", "cancelled"].includes(String(item.status || "")))
    .reduce((sum, item) => sum + numberValue(item.amount), 0);

  if (dailyUsed + input.amount > dailyLimit) {
    throw new Error(
      `Daily withdrawal limit exceeded for KYC level ${kycLevel}.`
    );
  }

  if (String(profileResult.data?.status || "active") === "blocked") {
    throw new Error("Withdrawals are blocked pending a security review.");
  }

  let score = Math.max(0, Math.min(Number(profileResult.data?.risk_score || 0), 100));
  const reasons: string[] = [];

  if (kycLevel === 0) {
    score += 20;
    reasons.push("identity_not_verified");
  } else if (kycLevel === 1) {
    score += 8;
    reasons.push("identity_verification_incomplete");
  }

  if (ageHours(input.device.first_seen_at) < 24) {
    score += 18;
    reasons.push("new_device");
  }

  if (!input.device.trusted_at) {
    score += 8;
    reasons.push("untrusted_device");
  }

  const pinAge = ageHours(input.controls.pin_set_at);
  if (pinAge < 24) {
    score += 15;
    reasons.push("recent_pin_change");
  }

  const accountAge = Math.min(
    ageHours(accountResult.data.created_at),
    ageHours(accountResult.data.security_changed_at || accountResult.data.updated_at)
  );
  if (accountAge < 24) {
    score += 20;
    reasons.push("recent_payout_account_change");
  }

  if (String(accountResult.data.verification_status || "unverified") !== "verified") {
    score += 8;
    reasons.push("unverified_payout_account");
  }

  if (input.walletBalance > 0 && input.amount / input.walletBalance >= 0.75) {
    score += 12;
    reasons.push("large_balance_percentage");
  }

  if (input.amount >= 5_000_000) {
    score += 10;
    reasons.push("high_value_withdrawal");
  }

  if (recent.length >= 3) {
    score += 15;
    reasons.push("high_withdrawal_velocity");
  }

  score = Math.min(Math.round(score), 100);
  const level: WithdrawalRiskResult["level"] =
    score >= 80 ? "critical" : score >= 55 ? "high" : score >= 30 ? "medium" : "low";
  const extraHold = level === "critical" ? 72 : level === "high" ? 48 : level === "medium" ? 24 : 0;
  const reviewStatus = level === "critical" || level === "high" ? "review" : "automatic";

  return {
    score,
    level,
    reasons,
    holdHours: Math.min(input.baseHoldHours + extraHold, 168),
    kycLevel,
    dailyLimit,
    dailyUsed,
    reviewStatus,
  };
}

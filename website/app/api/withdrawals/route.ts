import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  requireApprovedSeller,
  sellerErrorStatus,
} from "@/lib/sellerSecurity";
import { getBearerToken } from "@/lib/serverSupabase";
import {
  publicDevice,
  recordSecurityEvent,
  touchSecurityDevice,
} from "@/lib/requestSecurity";
import {
  ensureSecurityControls,
  verifyWithdrawalPinOrThrow,
} from "@/lib/withdrawalSecurity";
import { evaluateWithdrawalRisk, kycDailyLimit } from "@/lib/riskEngine";

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function holdHours() {
  const value = Number(process.env.PAYOUT_HOLD_HOURS || 24);
  if (!Number.isFinite(value)) return 24;
  return Math.min(Math.max(Math.floor(value), 0), 168);
}

function minimumKycLevel() {
  const value = Number(process.env.WITHDRAWAL_MIN_KYC_LEVEL || 0);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.floor(value), 0), 3);
}

function tokenAal(request: Request) {
  try {
    const token = getBearerToken(request);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] || "", "base64url").toString("utf8")
    ) as { aal?: string };
    return String(payload.aal || "aal1");
  } catch {
    return "aal1";
  }
}

export async function GET(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const controls = await ensureSecurityControls(supabaseAdmin, user.id);
    const deviceKey = request.headers.get("x-device-id") || "";
    let currentDevice: Record<string, unknown> | null = null;

    if (deviceKey) {
      currentDevice = await touchSecurityDevice({
        supabaseAdmin,
        userId: user.id,
        request,
        deviceKey,
        deviceName: request.headers.get("x-device-name") || "Current device",
      });
    }

    await supabaseAdmin.from("wallets").upsert(
      {
        user_id: user.id,
        balance: 0,
        pending_balance: 0,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );

    const [walletResult, accountsResult, withdrawalsResult, verificationResult, riskResult, taxRatesResult] =
      await Promise.all([
        supabaseAdmin
          .from("wallets")
          .select("id,balance,pending_balance,total_earned,total_spent,total_withdrawn,status,updated_at")
          .eq("user_id", user.id)
          .single(),
        supabaseAdmin
          .from("payout_accounts")
          .select("id,method,label,account_name,account_last4,bank_name,country_code,currency,is_default,status,verification_status,created_at,security_changed_at")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("withdrawal_requests")
          .select("id,payout_account_id,amount,fee_amount,net_amount,currency,payout_method,payout_account_name,payout_account_number,payout_note,status,admin_note,payout_reference,payout_provider,provider_status,eligible_at,approved_at,processing_at,paid_at,failed_at,cancelled_at,processed_at,created_at,updated_at,risk_score,risk_level,risk_reasons,security_review_status,tax_country_code,tax_payout_method,tax_rate_percent,tax_fixed_amount,tax_amount,tax_rule_id,tax_source_reference,source_currency,payout_currency,source_amount,fx_rate,fx_rate_id,payout_gross_amount,payout_tax_amount,payout_provider_fee,payout_net_amount,provider_batch_id,provider_item_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabaseAdmin
          .from("user_verifications")
          .select("phone_verified,identity_verified,kyc_level")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabaseAdmin
          .from("user_risk_profiles")
          .select("risk_score,risk_level,status,kyc_level,payout_daily_limit")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabaseAdmin
          .from("withdrawal_tax_rates")
          .select("id,country_code,payout_method,rate_percent,fixed_amount,currency,status,valid_from,valid_to,source_reference")
          .eq("status", "active")
          .lte("valid_from", new Date().toISOString())
          .order("valid_from", { ascending: false })
          .limit(300),
      ]);

    if (walletResult.error) throw new Error(walletResult.error.message);
    if (accountsResult.error) throw new Error(accountsResult.error.message);
    if (withdrawalsResult.error) throw new Error(withdrawalsResult.error.message);
    if (verificationResult.error) throw new Error(verificationResult.error.message);
    if (riskResult.error) throw new Error(riskResult.error.message);
    if (taxRatesResult.error) throw new Error(taxRatesResult.error.message);

    const derivedKyc = verificationResult.data?.identity_verified
      ? 2
      : verificationResult.data?.phone_verified
        ? 1
        : 0;
    const kycLevel = Math.max(
      derivedKyc,
      Number(verificationResult.data?.kyc_level || 0),
      Number(riskResult.data?.kyc_level || 0)
    );

    return NextResponse.json({
      wallet: walletResult.data,
      accounts: (accountsResult.data || []).map((account) => ({
        ...account,
        masked_identifier: `****${String(account.account_last4 || "****")}`,
      })),
      withdrawals: withdrawalsResult.data || [],
      withdrawalTaxRates: (taxRatesResult.data || []).filter((rule) => {
        if (!rule.valid_to) return true;
        return new Date(String(rule.valid_to)).getTime() > Date.now();
      }),
      settings: {
        minimumAmount: 50000,
        maximumAmount: 100000000,
        holdHours: holdHours(),
        minimumKycLevel: minimumKycLevel(),
        kycLevel,
        dailyLimit: Number(
          riskResult.data?.payout_daily_limit || kycDailyLimit(kycLevel)
        ),
        riskLevel: String(riskResult.data?.risk_level || "low"),
        riskStatus: String(riskResult.data?.status || "active"),
        pinSet: Boolean(controls.withdrawal_pin_hash && controls.withdrawal_pin_salt),
        pinLockedUntil: controls.pin_locked_until,
        payoutCooldownUntil: controls.payout_cooldown_until,
        cooldownReason: controls.cooldown_reason,
        mfaRequiredForPayout: Boolean(controls.mfa_required_for_payout),
        currentAal: tokenAal(request),
        currentDevice: currentDevice ? publicDevice(currentDevice) : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected withdrawal error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as {
      payoutAccountId?: number | string;
      amount?: number | string;
      note?: string;
      requestKey?: string;
      withdrawalPin?: string;
      deviceKey?: string;
      deviceName?: string;
    };

    const payoutAccountId = Number(body.payoutAccountId || 0);
    const amount = numberValue(body.amount);
    const note = String(body.note || "").trim().slice(0, 500);
    const requestKey = String(body.requestKey || randomUUID()).trim();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) {
      throw new Error("Invalid withdrawal request key.");
    }

    if (!Number.isInteger(payoutAccountId) || payoutAccountId <= 0) {
      throw new Error("Select a payout account.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Withdrawal amount must be positive.");
    }

    const device = await touchSecurityDevice({
      supabaseAdmin,
      userId: user.id,
      request,
      deviceKey: String(body.deviceKey || ""),
      deviceName: String(body.deviceName || "Current device"),
    });
    const deviceId = String(device.id || "");

    const controls = await verifyWithdrawalPinOrThrow({
      supabaseAdmin,
      userId: user.id,
      pin: String(body.withdrawalPin || ""),
      request,
      deviceId,
    });

    if (Boolean(controls.mfa_required_for_payout) && tokenAal(request) !== "aal2") {
      throw new Error("Complete MFA verification before requesting withdrawal.");
    }

    const [walletResult, accountResult] = await Promise.all([
      supabaseAdmin
        .from("wallets")
        .select("id,balance,status")
        .eq("user_id", user.id)
        .single(),
      supabaseAdmin
        .from("payout_accounts")
        .select("id")
        .eq("id", payoutAccountId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
    ]);

    if (walletResult.error) throw new Error(walletResult.error.message);
    if (accountResult.error) throw new Error(accountResult.error.message);
    if (!accountResult.data) throw new Error("Active payout account not found.");

    const risk = await evaluateWithdrawalRisk({
      supabaseAdmin,
      userId: user.id,
      amount,
      walletBalance: numberValue(walletResult.data.balance),
      payoutAccountId,
      device,
      controls,
      baseHoldHours: holdHours(),
    });

    const { data, error } = await supabaseAdmin.rpc(
      "cp_create_withdrawal_request_v23",
      {
        p_user_id: user.id,
        p_payout_account_id: payoutAccountId,
        p_amount: amount,
        p_note: note || null,
        p_request_key: requestKey,
        p_hold_hours: risk.holdHours,
        p_risk_score: risk.score,
        p_risk_level: risk.level,
        p_risk_reasons: risk.reasons,
        p_device_id: deviceId,
        p_security_review_status: risk.reviewStatus,
        p_pin_verified_at: new Date().toISOString(),
        p_min_kyc_level: minimumKycLevel(),
      }
    );

    if (error) throw new Error(error.message);

    await recordSecurityEvent({
      supabaseAdmin,
      userId: user.id,
      request,
      eventType: "withdrawal_requested",
      severity:
        risk.level === "critical" || risk.level === "high"
          ? "high"
          : risk.level === "medium"
            ? "medium"
            : "low",
      deviceId,
      details: {
        amount,
        payout_account_id: payoutAccountId,
        risk_score: risk.score,
        risk_level: risk.level,
        risk_reasons: risk.reasons,
        review_status: risk.reviewStatus,
        withdrawal_tax_amount: Number((data as Record<string, unknown> | null)?.tax_amount || 0),
        withdrawal_net_amount: Number((data as Record<string, unknown> | null)?.net_amount || amount),
      },
    });

    return NextResponse.json({ ok: true, result: data, risk }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected withdrawal error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as {
      withdrawalId?: number | string;
      action?: string;
    };

    const withdrawalId = Number(body.withdrawalId || 0);
    const action = String(body.action || "cancel").trim().toLowerCase();

    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
      throw new Error("Invalid withdrawal ID.");
    }
    if (action !== "cancel") throw new Error("Unsupported withdrawal action.");

    const { data, error } = await supabaseAdmin.rpc(
      "cp_cancel_withdrawal_request_v10",
      {
        p_withdrawal_id: withdrawalId,
        p_user_id: user.id,
      }
    );

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected withdrawal error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

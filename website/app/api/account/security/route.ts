import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import {
  applyPayoutSecurityCooldown,
  ensureSecurityControls,
  verifyWithdrawalPinOrThrow,
} from "@/lib/withdrawalSecurity";
import { hashWithdrawalPin } from "@/lib/securityPin";
import { recordSecurityEvent } from "@/lib/requestSecurity";
import { kycDailyLimit } from "@/lib/riskEngine";

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/authentication|token/i.test(message)) return 401;
  if (/incorrect|locked|required|predictable|digits|cooldown|invalid/i.test(message)) return 400;
  return 500;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const controls = await ensureSecurityControls(supabaseAdmin, user.id);

    const [settingsResult, verificationResult, riskResult, eventsResult] =
      await Promise.all([
        supabaseAdmin
          .from("user_account_settings")
          .select("phone_number,mfa_enabled,show_followers,accept_profile_chat")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabaseAdmin
          .from("user_verifications")
          .select("phone_verified,email_verified,identity_verified,phone_number,kyc_level")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabaseAdmin
          .from("user_risk_profiles")
          .select("risk_score,risk_level,status,kyc_level,payout_daily_limit,reasons,last_evaluated_at")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabaseAdmin
          .from("security_events")
          .select("id,event_type,severity,status,source,details,created_at,resolved_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    if (settingsResult.error) throw new Error(settingsResult.error.message);
    if (verificationResult.error) throw new Error(verificationResult.error.message);
    if (riskResult.error) throw new Error(riskResult.error.message);
    if (eventsResult.error) throw new Error(eventsResult.error.message);

    const verification = verificationResult.data;
    const derivedKyc = verification?.identity_verified
      ? 2
      : verification?.phone_verified
        ? 1
        : 0;
    const kycLevel = Math.max(
      derivedKyc,
      Number(verification?.kyc_level || 0),
      Number(riskResult.data?.kyc_level || 0)
    );

    return NextResponse.json({
      account: {
        email: user.email || "",
        phoneNumber:
          verification?.phone_number || settingsResult.data?.phone_number || "",
      },
      privacy: {
        showFollowers: settingsResult.data?.show_followers ?? true,
        acceptProfileChat: settingsResult.data?.accept_profile_chat ?? true,
      },
      verification: {
        emailVerified: Boolean(user.email_confirmed_at || verification?.email_verified),
        phoneVerified: Boolean(verification?.phone_verified),
        identityVerified: Boolean(verification?.identity_verified),
        kycLevel,
      },
      payoutSecurity: {
        pinSet: Boolean(controls.withdrawal_pin_hash && controls.withdrawal_pin_salt),
        pinSetAt: controls.pin_set_at,
        pinLockedUntil: controls.pin_locked_until,
        payoutCooldownUntil: controls.payout_cooldown_until,
        cooldownReason: controls.cooldown_reason,
        mfaRequiredForPayout: Boolean(controls.mfa_required_for_payout),
      },
      risk: {
        score: Number(riskResult.data?.risk_score || 0),
        level: String(riskResult.data?.risk_level || "low"),
        status: String(riskResult.data?.status || "active"),
        dailyLimit: Number(
          riskResult.data?.payout_daily_limit || kycDailyLimit(kycLevel)
        ),
        reasons: Array.isArray(riskResult.data?.reasons)
          ? riskResult.data?.reasons
          : [],
        lastEvaluatedAt: riskResult.data?.last_evaluated_at || null,
      },
      events: eventsResult.data || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected security error.";
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();

    if (action === "privacy") {
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin.from("user_account_settings").upsert(
        {
          user_id: user.id,
          show_followers: booleanValue(body.showFollowers, true),
          accept_profile_chat: booleanValue(body.acceptProfileChat, true),
          updated_at: now,
          created_at: now,
        },
        { onConflict: "user_id" }
      );

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "set_withdrawal_pin") {
      const newPin = String(body.newPin || "").trim();
      const currentPin = String(body.currentPin || "").trim();
      const controls = await ensureSecurityControls(supabaseAdmin, user.id);
      const alreadySet = Boolean(
        controls.withdrawal_pin_hash && controls.withdrawal_pin_salt
      );

      if (alreadySet) {
        await verifyWithdrawalPinOrThrow({
          supabaseAdmin,
          userId: user.id,
          pin: currentPin,
          request,
        });
      }

      const hashed = hashWithdrawalPin(user.id, newPin);
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("user_security_controls")
        .update({
          withdrawal_pin_hash: hashed.hash,
          withdrawal_pin_salt: hashed.salt,
          pin_version: 1,
          pin_set_at: now,
          pin_failed_attempts: 0,
          pin_locked_until: null,
          security_version: 2,
          updated_at: now,
        })
        .eq("user_id", user.id);

      if (error) throw new Error(error.message);
      const cooldown = await applyPayoutSecurityCooldown({
        supabaseAdmin,
        userId: user.id,
        reason: alreadySet ? "withdrawal_pin_changed" : "withdrawal_pin_created",
      });

      await recordSecurityEvent({
        supabaseAdmin,
        userId: user.id,
        request,
        eventType: alreadySet ? "withdrawal_pin_changed" : "withdrawal_pin_created",
        severity: alreadySet ? "high" : "medium",
        details: { cooldown_until: cooldown.until },
      });

      return NextResponse.json({ ok: true, cooldownUntil: cooldown.until });
    }

    if (action === "set_mfa_payout_requirement") {
      const controls = await ensureSecurityControls(supabaseAdmin, user.id);
      const nextValue = Boolean(body.required);
      const { error } = await supabaseAdmin
        .from("user_security_controls")
        .update({
          mfa_required_for_payout: nextValue,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) throw new Error(error.message);
      await recordSecurityEvent({
        supabaseAdmin,
        userId: user.id,
        request,
        eventType: "payout_mfa_requirement_changed",
        severity: "medium",
        details: {
          previous: Boolean(controls.mfa_required_for_payout),
          current: nextValue,
        },
      });
      return NextResponse.json({ ok: true });
    }

    throw new Error("Unsupported security action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected security error.";
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}

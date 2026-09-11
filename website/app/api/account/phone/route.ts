import { NextResponse } from "next/server";
import { createSupabaseAdmin, createSupabaseAuthClient, getBearerToken, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { normalizePhone, phoneCountries, phoneCountry } from "@/lib/phoneNumbers";
import { confirmedPhone } from "@/lib/phoneVerification";
import { accountApiError, inputError } from "@/lib/accountApi";
import { limitPhoneOtp, phoneOtpChannels } from "@/lib/phoneOtpLimits";

export async function GET() {
  const channels = phoneOtpChannels();
  return NextResponse.json({ countries: phoneCountries(), channels, otpEnabled: channels.length > 0 });
}
export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json();
    if (body.action === "save") {
      const normalized = String(body.phone || "").trim() ? normalizePhone(body.phone, body.country) : { e164: null, country: phoneCountry(body.country) };
      const db = createSupabaseAdmin();
      // A contact field is never written to auth.users or user_verifications.
      const { error } = await db.from("user_account_settings").upsert({ user_id: user.id, phone_number: normalized.e164, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      const { error: settingsError } = await db.from("cp_messaging_settings").upsert({ user_id: user.id, phone_country: normalized.country }, { onConflict: "user_id" });
      if (settingsError) throw settingsError;
      return NextResponse.json({ ok: true, phone: normalized.e164, country: normalized.country, phoneVerified: !!normalized.e164 && confirmedPhone(user) === normalized.e164 });
    }
    if (!phoneOtpChannels().length) throw inputError("Phone verification is not available yet. Use Google or email and password to sign in.", 503);
    const { e164, country } = normalizePhone(body.phone, body.country);
    // Use the current user's JWT, not an admin updateUserById call that could bypass OTP.
    const token = getBearerToken(request);
    if (body.action === "send") {
      const channel = body.channel || phoneOtpChannels()[0];
      if (!phoneOtpChannels().includes(channel)) throw inputError("This verification channel is not available yet.");
      if (confirmedPhone(user) === e164) throw inputError("This phone number is already verified on your account.");
      await limitPhoneOtp(user.id, e164, "send");
      const result = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
        method: "PUT", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: e164, channel }), signal: AbortSignal.timeout(20000),
      });
      const data = await result.json();
      if (!result.ok) throw inputError(result.status === 429 ? "Please wait before requesting another code." : /disabled|provider|not enabled/i.test(data.msg || data.message || "") ? "Phone verification is not available yet. Please try again later." : "The verification code could not be sent. Check your number and try again.", result.status === 429 ? 429 : 400);
      return NextResponse.json({ ok: true, phone: e164, country, channel, resendAfter: 60 });
    }
    if (body.action !== "verify" || !/^\d{6,8}$/.test(String(body.code || ""))) throw inputError("Enter the verification code sent to your phone.");
    await limitPhoneOtp(user.id, e164, "verify");
    const auth = createSupabaseAuthClient();
    const { data, error } = await auth.auth.verifyOtp({ phone: e164, token: String(body.code), type: "phone_change" });
    if (error) throw inputError("The code is incorrect or expired. Request a new code and try again.");
    if (data.user?.id !== user.id || confirmedPhone(data.user) !== e164) throw inputError("The phone verification does not belong to this account.", 403);
    const { error: settingsError } = await createSupabaseAdmin().from("cp_messaging_settings").upsert({ user_id: user.id, phone_country: country }, { onConflict: "user_id" });
    if (settingsError) throw settingsError;
    const { error: contactError } = await createSupabaseAdmin().from("user_account_settings").upsert({ user_id: user.id, phone_number: e164, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (contactError) throw contactError;
    return NextResponse.json({ ok: true, phone: e164, country });
  } catch (error) { return accountApiError(error, "Phone verification could not be completed."); }
}

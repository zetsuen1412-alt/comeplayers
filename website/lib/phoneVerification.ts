import type { User } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "./serverSupabase";

// Auth owns this identity. Profile fields and user-editable JWT metadata never grant access.
export function confirmedPhone(user: Pick<User, "phone" | "phone_confirmed_at">) {
  const phone = String(user.phone || "").replace(/^\+/, "");
  return user.phone_confirmed_at && /^[1-9]\d{7,14}$/.test(phone) ? `+${phone}` : null;
}
export async function phoneRequirementEnabled() {
  const { data, error } = await createSupabaseAdmin().from("cp_platform_settings").select("phone_required").eq("id", true).single();
  if (error) throw Object.assign(new Error("Account access could not be checked. Please try again."), { status: 503 });
  return data.phone_required === true;
}
export async function requireVerifiedPhone(user: User) {
  if (!confirmedPhone(user) && await phoneRequirementEnabled()) {
    throw Object.assign(new Error("Verify your phone number in Account settings to use messages and transactions."), { status: 403, code: "PHONE_VERIFICATION_REQUIRED" });
  }
}

export function requiresPhoneAccess(path: string, method: string) {
  // Provider callbacks and public browsing must remain reachable to complete payments and verification.
  if (/\/(webhook|callback|notify|notification|return|capture-webhook)(\/|$)/.test(path)) return false;
  if (/^\/api\/messages(?:\/|$)/.test(path)) return !/^\/api\/messages\/(blocks|reports)(?:\/|$)/.test(path);
  if (/^\/api\/(checkout|orders|wallet|withdrawals|payout-accounts|disputes)(?:\/|$)/.test(path)) return true;
  if (/^\/api\/(doku|paypal)\/(create|capture|refund|cancel|confirm|verify)/.test(path)) return true;
  if (/^\/api\/(products|seller|storefront|tournaments)(?:\/|$)/.test(path)) return !["GET", "HEAD", "OPTIONS"].includes(method);
  return false;
}

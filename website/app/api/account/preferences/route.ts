import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { accountApiError, inputError } from "@/lib/accountApi";
import { confirmedPhone, phoneRequirementEnabled } from "@/lib/phoneVerification";
import { phoneCountry } from "@/lib/phoneNumbers";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const [profile, settings, required, contact] = await Promise.all([
      db.from("profiles").select("id,username,full_name,bio,avatar_url,username_changes,cp_number").eq("id", user.id).single(),
      db.from("cp_messaging_settings").select("phone_country,read_receipts,show_last_seen,allow_calls,message_notifications,call_notifications,status_audience").eq("user_id", user.id).maybeSingle(),
      phoneRequirementEnabled(),
      db.from("user_account_settings").select("phone_number").eq("user_id", user.id).maybeSingle(),
    ]);
    if (profile.error) throw profile.error;
    if (settings.error) throw settings.error;
    if (contact.error) throw contact.error;
    const verifiedPhone = confirmedPhone(user);
    const phone = contact.data?.phone_number || verifiedPhone;
    return NextResponse.json({ profile: profile.data, phone, verifiedPhone, phoneVerified: !!phone && phone === verifiedPhone, phoneRequired: required, freeUsernameChangesRemaining: Math.max(0, 1 - profile.data.username_changes), settings: settings.data || { phone_country: "ID", read_receipts: true, show_last_seen: true, allow_calls: true, message_notifications: true, call_notifications: true, status_audience: "contacts" } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const body = await request.json();
    if (body && (Object.hasOwn(body, "cp_number") || Object.hasOwn(body, "cpNumber"))) {
      throw inputError("Your CP number is permanent and cannot be changed.");
    }
    if (body.action === "username") {
      const username = String(body.username || "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(username)) throw inputError("Use 3–30 letters, numbers, dots, underscores or hyphens.");
      const result = await db.rpc("cp_change_username_once", { p_user: user.id, p_username: username });
      if (result.error) {
        if (result.error.code === "23505") throw inputError("This username is already in use.", 409);
        if (/free username change/i.test(result.error.message)) throw inputError("Your one free username change has already been used.", 409);
        throw result.error;
      }
      return NextResponse.json({ ok: true, username: result.data });
    }
    if (body.action === "profile") {
      const fullName = String(body.fullName || "").trim().slice(0, 80);
      const bio = String(body.bio || "").trim().slice(0, 160);
      const result = await db.from("profiles").update({ full_name: fullName, bio }).eq("id", user.id);
      if (result.error) throw result.error;
    } else if (body.action === "settings") {
      const next: Record<string, unknown> = { user_id: user.id };
      for (const key of ["read_receipts", "show_last_seen", "allow_calls", "message_notifications", "call_notifications"]) if (typeof body[key] === "boolean") next[key] = body[key];
      if (body.phone_country) next.phone_country = phoneCountry(body.phone_country);
      if (["contacts", "nobody"].includes(body.status_audience)) next.status_audience = body.status_audience;
      const result = await db.from("cp_messaging_settings").upsert(next, { onConflict: "user_id" });
      if (result.error) throw result.error;
    } else throw inputError("Unknown account action.");
    return NextResponse.json({ ok: true });
  } catch (error) { return accountApiError(error); }
}

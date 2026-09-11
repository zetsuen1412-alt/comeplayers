import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createLiveKitRoomServiceClient } from "./livekitServer";

async function selectOwned(
  supabaseAdmin: SupabaseClient,
  table: string,
  userColumn: string,
  userId: string,
  limit = 5000
) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq(userColumn, userId)
    .limit(limit);
  if (error) return { unavailable: error.message };
  return data || [];
}

export async function buildPrivacyExport(input: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  email?: string | null;
}) {
  const [profile, billing, ordersAsBuyer, ordersAsSeller, walletTransactions, disputesAsBuyer,
    disputesAsSeller, notifications, wishlist, securityEvents, privacyRequests, sellerTaxLedger,
    accountSettings, messagingSettings, chatPreferences, starredMessages, statuses, statusViews, outgoingCalls, incomingCalls] = await Promise.all([
    input.supabaseAdmin.from("profiles").select("*").eq("id", input.userId).maybeSingle(),
    input.supabaseAdmin.from("user_billing_profiles").select("*").eq("user_id", input.userId).maybeSingle(),
    selectOwned(input.supabaseAdmin, "orders", "buyer_id", input.userId),
    selectOwned(input.supabaseAdmin, "orders", "seller_id", input.userId),
    selectOwned(input.supabaseAdmin, "wallet_transactions", "user_id", input.userId),
    selectOwned(input.supabaseAdmin, "disputes", "buyer_id", input.userId),
    selectOwned(input.supabaseAdmin, "disputes", "seller_id", input.userId),
    selectOwned(input.supabaseAdmin, "notifications", "user_id", input.userId),
    selectOwned(input.supabaseAdmin, "wishlists", "user_id", input.userId),
    selectOwned(input.supabaseAdmin, "security_events", "user_id", input.userId),
    selectOwned(input.supabaseAdmin, "privacy_requests", "user_id", input.userId),
    selectOwned(input.supabaseAdmin, "seller_tax_ledger", "seller_id", input.userId),
    selectOwned(input.supabaseAdmin, "user_account_settings", "user_id", input.userId),
    selectOwned(input.supabaseAdmin, "cp_messaging_settings", "user_id", input.userId),
    selectOwned(input.supabaseAdmin, "cp_chat_preferences", "user_id", input.userId),
    selectOwned(input.supabaseAdmin, "cp_starred_messages", "user_id", input.userId),
    selectOwned(input.supabaseAdmin, "cp_statuses", "author_id", input.userId),
    selectOwned(input.supabaseAdmin, "cp_status_views", "viewer_id", input.userId),
    selectOwned(input.supabaseAdmin, "cp_calls", "caller_id", input.userId),
    selectOwned(input.supabaseAdmin, "cp_calls", "callee_id", input.userId),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    formatVersion: "comeplayers-privacy-export-v1",
    identity: { userId: input.userId, email: input.email || null },
    profile: profile.error ? { unavailable: profile.error.message } : profile.data,
    billing: billing.error ? { unavailable: billing.error.message } : billing.data,
    orders: { asBuyer: ordersAsBuyer, asSeller: ordersAsSeller },
    walletTransactions,
    disputes: { asBuyer: disputesAsBuyer, asSeller: disputesAsSeller },
    notifications,
    wishlist,
    securityEvents,
    privacyRequests,
    sellerTaxLedger,
    accountSettings,
    messaging: { settings: messagingSettings, chatPreferences, starredMessages, statuses, statusViews, calls: { outgoing: outgoingCalls, incoming: incomingCalls } },
    retentionNotice:
      "Financial, tax, dispute, fraud-prevention, and audit records may be retained where required for legal, security, or accounting obligations.",
  };
}

export async function processPrivacyDeletion(input: {
  supabaseAdmin: SupabaseClient;
  requestId: string;
  userId: string;
}) {
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await input.supabaseAdmin
    .from("privacy_requests")
    .update({ status: "processing", updated_at: now })
    .eq("id", input.requestId)
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) throw new Error("Deletion request is no longer pending.");

  // Hide statuses immediately and retain only the object key for the existing R2 cleanup retry.
  const statusCleanup = await input.supabaseAdmin.from("cp_statuses").update({ body: "[Deleted status]", expires_at: now }).eq("author_id", input.userId);
  if (statusCleanup.error && !/does not exist|schema cache/i.test(statusCleanup.error.message)) throw new Error(statusCleanup.error.message);
  const endedCalls = await input.supabaseAdmin.from("cp_calls").update({ status: "ended", ended_at: now }).or(`caller_id.eq.${input.userId},callee_id.eq.${input.userId}`).in("status", ["ringing", "accepted", "scheduled"]).select("id");
  if (endedCalls.error && !/does not exist|schema cache/i.test(endedCalls.error.message)) throw new Error(endedCalls.error.message);
  for (const call of endedCalls.data || []) await createLiveKitRoomServiceClient().deleteRoom(`cp-call-${call.id}`).catch(() => undefined);

  const deletions: Array<[string, string]> = [
    ["wishlists", "user_id"],
    ["recently_viewed", "user_id"],
    ["recently_viewed_games", "user_id"],
    ["notifications", "user_id"],
    ["user_billing_profiles", "user_id"],
    ["user_security_devices", "user_id"],
    ["cp_messaging_settings", "user_id"],
    ["cp_chat_preferences", "user_id"],
    ["cp_starred_messages", "user_id"],
    ["cp_status_views", "viewer_id"],
  ];
  for (const [table, column] of deletions) {
    const { error } = await input.supabaseAdmin.from(table).delete().eq(column, input.userId);
    if (error && !/does not exist|schema cache/i.test(error.message)) throw new Error(error.message);
  }

  const anonymousName = `Deleted User ${input.userId.slice(0, 8)}`;
  const { error: profileError } = await input.supabaseAdmin
    .from("profiles")
    .update({
      email: `deleted+${input.userId}@privacy.invalid`,
      username: `deleted-${input.userId.slice(0, 12)}`,
      full_name: anonymousName,
      seller_name: anonymousName,
      privacy_status: "anonymized",
      anonymized_at: now,
      updated_at: now,
    })
    .eq("id", input.userId);
  if (profileError) throw new Error(profileError.message);

  const { error: settingsError } = await input.supabaseAdmin
    .from("user_account_settings")
    .update({
      first_name: null,
      last_name: null,
      national_identity_number: null,
      date_of_birth: null,
      instant_messenger_type: null,
      instant_messenger_value: null,
      phone_number: null,
      updated_at: now,
    })
    .eq("user_id", input.userId);
  if (settingsError && !/does not exist|schema cache/i.test(settingsError.message)) {
    throw new Error(settingsError.message);
  }

  const { error: verificationError } = await input.supabaseAdmin
    .from("user_verifications")
    .update({ phone_number: null, phone_verified: false, updated_at: now })
    .eq("user_id", input.userId);
  if (verificationError && !/does not exist|schema cache/i.test(verificationError.message)) {
    throw new Error(verificationError.message);
  }

  const { error: payoutAccountError } = await input.supabaseAdmin
    .from("payout_accounts")
    .update({
      label: "Deleted payout account",
      account_name: anonymousName,
      account_last4: null,
      bank_name: null,
      ciphertext: null,
      iv: null,
      auth_tag: null,
      is_default: false,
      status: "deleted",
      verification_status: "revoked",
      metadata: { anonymized_at: now },
      updated_at: now,
    })
    .eq("user_id", input.userId);
  if (payoutAccountError && !/does not exist|schema cache/i.test(payoutAccountError.message)) {
    throw new Error(payoutAccountError.message);
  }

  const { error: withdrawalError } = await input.supabaseAdmin
    .from("withdrawal_requests")
    .update({
      payout_account_name: anonymousName,
      payout_account_number: null,
      payout_ciphertext: null,
      payout_iv: null,
      payout_auth_tag: null,
      payout_note: null,
      updated_at: now,
    })
    .eq("user_id", input.userId);
  if (withdrawalError && !/does not exist|schema cache/i.test(withdrawalError.message)) {
    throw new Error(withdrawalError.message);
  }

  const { error: chatError } = await input.supabaseAdmin
    .from("chat_messages")
    .update({
      message: "[Message removed after account deletion]",
      risk_flags: [],
      deleted_at: now,
    })
    .eq("sender_id", input.userId);
  if (chatError && !/does not exist|schema cache/i.test(chatError.message)) {
    throw new Error(chatError.message);
  }

  const { error: authDeleteError } = await input.supabaseAdmin.auth.admin.deleteUser(
    input.userId,
    true
  );
  if (authDeleteError) throw new Error(authDeleteError.message);

  const { error: eventError } = await input.supabaseAdmin.from("privacy_events").insert({
    request_id: input.requestId,
    user_id: input.userId,
    event_type: "account_anonymized",
    details: {
      retained: ["orders", "invoices", "transactions", "disputes", "audit_logs"],
      scrubbed: ["profile", "billing", "payout_accounts", "withdrawal_destination", "chat_messages"],
    },
  });
  if (eventError) throw new Error(eventError.message);

  const { error: requestError } = await input.supabaseAdmin
    .from("privacy_requests")
    .update({ status: "completed", completed_at: now, updated_at: now })
    .eq("id", input.requestId);
  if (requestError) throw new Error(requestError.message);

  return { requestId: input.requestId, userId: input.userId, completedAt: now };
}

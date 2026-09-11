import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";
import { decryptPayoutAccount } from "@/lib/payoutCrypto";
import { createPayPalPayout, getPayPalPayoutBatch } from "@/lib/paypalPayoutServer";

function clean(value: unknown, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

async function getWithdrawal(supabaseAdmin: SupabaseClient, withdrawalId: number) {
  const { data, error } = await supabaseAdmin
    .from("withdrawal_requests")
    .select("*")
    .eq("id", withdrawalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Withdrawal request not found.");
  return data as Record<string, unknown>;
}

async function revealPayoutDetails(
  supabaseAdmin: SupabaseClient,
  withdrawal: Record<string, unknown>
) {
  const payoutAccountId = Number(withdrawal.payout_account_id || 0);
  let details = {
    method: String(withdrawal.payout_method || ""),
    accountName: String(withdrawal.payout_account_name || ""),
    accountIdentifier: String(withdrawal.payout_account_number || ""),
    bankName: "",
    countryCode: String(withdrawal.tax_country_code || "ID"),
    currency: String(withdrawal.payout_currency || withdrawal.currency || "IDR"),
  };
  if (payoutAccountId <= 0) return details;

  if (withdrawal.payout_ciphertext && withdrawal.payout_iv && withdrawal.payout_auth_tag) {
    return decryptPayoutAccount(payoutAccountId, {
      ciphertext: String(withdrawal.payout_ciphertext),
      iv: String(withdrawal.payout_iv),
      auth_tag: String(withdrawal.payout_auth_tag),
      key_version: Number(withdrawal.payout_key_version || 1),
    });
  }

  const { data: account, error } = await supabaseAdmin
    .from("payout_accounts")
    .select("id,ciphertext,iv,auth_tag,key_version")
    .eq("id", payoutAccountId)
    .eq("user_id", withdrawal.user_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!account?.ciphertext || !account.iv || !account.auth_tag) {
    throw new Error("Encrypted payout account details are unavailable.");
  }
  details = decryptPayoutAccount(payoutAccountId, {
    ciphertext: String(account.ciphertext),
    iv: String(account.iv),
    auth_tag: String(account.auth_tag),
    key_version: Number(account.key_version || 1),
  });
  return details;
}

async function processWithdrawal(input: {
  supabaseAdmin: SupabaseClient;
  withdrawalId: number;
  adminId: string;
  action: string;
  note?: string | null;
  reference?: string | null;
  provider?: string | null;
  feeAmount?: number;
  overrideHold?: boolean;
}) {
  const { data, error } = await input.supabaseAdmin.rpc(
    "cp_admin_process_withdrawal_v23",
    {
      p_withdrawal_id: input.withdrawalId,
      p_admin_id: input.adminId,
      p_action: input.action,
      p_note: input.note || null,
      p_reference: input.reference || null,
      p_provider: input.provider || null,
      p_fee_amount: Math.max(0, input.feeAmount || 0),
      p_override_hold: Boolean(input.overrideHold),
    }
  );
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const url = new URL(request.url);
    const requestedStatus = clean(url.searchParams.get("status"), 30).toLowerCase();
    let query = supabaseAdmin
      .from("withdrawal_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (requestedStatus && requestedStatus !== "all") query = query.eq("status", requestedStatus);
    const { data: withdrawals, error } = await query;
    if (error) throw new Error(error.message);

    const rows = withdrawals || [];
    const userIds = [...new Set(rows.map((row) => String(row.user_id || "")).filter(Boolean))];
    const walletIds = [...new Set(rows.map((row) => Number(row.wallet_id || 0)).filter((id) => id > 0))];
    const accountIds = [...new Set(rows.map((row) => Number(row.payout_account_id || 0)).filter((id) => id > 0))];
    const [profilesResult, walletsResult, accountsResult] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id,email,username,role,avatar_url,seller_name,seller_status").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      walletIds.length
        ? supabaseAdmin.from("wallets").select("id,user_id,balance,total_withdrawn,status").in("id", walletIds)
        : Promise.resolve({ data: [], error: null }),
      accountIds.length
        ? supabaseAdmin.from("payout_accounts").select("id,user_id,method,label,account_name,account_last4,bank_name,country_code,currency,is_default,status,verification_status").in("id", accountIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (walletsResult.error) throw new Error(walletsResult.error.message);
    if (accountsResult.error) throw new Error(accountsResult.error.message);
    const profiles = new Map((profilesResult.data || []).map((item) => [String(item.id), item]));
    const wallets = new Map((walletsResult.data || []).map((item) => [Number(item.id), item]));
    const accounts = new Map((accountsResult.data || []).map((item) => [Number(item.id), item]));
    return NextResponse.json({
      withdrawals: rows.map((row) => ({
        ...row,
        profiles: profiles.get(String(row.user_id)) || null,
        wallets: wallets.get(Number(row.wallet_id)) || null,
        payout_accounts: accounts.get(Number(row.payout_account_id)) || null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected withdrawal error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const withdrawalId = Number(body.withdrawalId || 0);
    const action = clean(body.action || "reveal", 40).toLowerCase();
    const reason = clean(body.reason, 300);
    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal ID." }, { status: 400 });
    }
    if (!["reveal", "execute_provider", "sync_provider"].includes(action)) {
      return NextResponse.json({ error: "Unsupported admin action." }, { status: 400 });
    }

    const withdrawal = await getWithdrawal(supabaseAdmin, withdrawalId);
    if (action === "reveal") {
      const details = await revealPayoutDetails(supabaseAdmin, withdrawal);
      await recordAdminAudit({
        adminId: user.id,
        action: "withdrawal.payout_details_revealed",
        entityType: "withdrawal_request",
        entityId: withdrawalId,
        metadata: { reason: reason || "Manual payout processing", payout_account_id: withdrawal.payout_account_id || null },
      });
      return NextResponse.json({ details });
    }

    const payoutMethod = String(withdrawal.tax_payout_method || withdrawal.payout_method || "").toLowerCase();
    if (payoutMethod !== "paypal") throw new Error("Automated provider execution currently supports PayPal payout accounts only.");

    if (action === "execute_provider") {
      if (String(withdrawal.status || "").toLowerCase() !== "approved") {
        throw new Error("Withdrawal must be approved before provider execution.");
      }
      const { data: residency, error: residencyError } = await supabaseAdmin
        .from("seller_tax_residencies")
        .select("status")
        .eq("seller_id", withdrawal.user_id)
        .maybeSingle();
      if (residencyError) throw new Error(residencyError.message);
      if (residency?.status !== "verified") throw new Error("Verified seller tax residency is required before provider payout.");

      const details = await revealPayoutDetails(supabaseAdmin, withdrawal);
      const receiver = String(details.accountIdentifier || "").trim();
      if (!receiver.includes("@")) throw new Error("PayPal payout account must contain a valid email receiver.");
      const batchKey = `cp-wd-${withdrawalId}-${String(withdrawal.request_key || withdrawalId).replace(/[^a-z0-9]/gi, "").slice(0, 24)}`.slice(0, 50);
      const result = await createPayPalPayout({
        batchId: batchKey,
        withdrawalId,
        receiver,
        amount: numberValue(withdrawal.payout_net_amount || withdrawal.net_amount),
        currency: String(withdrawal.payout_currency || withdrawal.currency || "IDR"),
      });
      const { error: attemptError } = await supabaseAdmin.from("payout_execution_attempts").insert({
        withdrawal_id: withdrawalId,
        provider: "paypal",
        idempotency_key: batchKey,
        attempt_number: 1,
        action: "submit",
        status: result.marketplaceStatus,
        provider_batch_id: result.batchId || null,
        provider_item_id: result.itemId,
        response_payload: result.raw,
        executed_by: user.id,
      });
      if (attemptError && !attemptError.message.toLowerCase().includes("duplicate")) throw new Error(attemptError.message);
      const providerBatchId = result.batchId || batchKey;
      const { error: updateError } = await supabaseAdmin.from("withdrawal_requests").update({
        provider_batch_id: providerBatchId,
        provider_item_id: result.itemId,
        provider_payload: result.raw,
        payout_provider: "paypal",
        provider_status: result.providerStatus,
        updated_at: new Date().toISOString(),
      }).eq("id", withdrawalId);
      if (updateError) throw new Error(updateError.message);

      if (result.marketplaceStatus === "paid") {
        await processWithdrawal({ supabaseAdmin, withdrawalId, adminId: user.id, action: "paid", reference: result.itemId || providerBatchId, provider: "paypal", feeAmount: result.feeAmount, overrideHold: true });
      } else if (result.marketplaceStatus === "failed") {
        await processWithdrawal({ supabaseAdmin, withdrawalId, adminId: user.id, action: "fail", note: `PayPal payout status: ${result.providerStatus}`, provider: "paypal", overrideHold: true });
      } else {
        await processWithdrawal({ supabaseAdmin, withdrawalId, adminId: user.id, action: "processing", provider: "paypal", overrideHold: true });
      }
      await recordAdminAudit({ adminId: user.id, action: "withdrawal.provider_execute", entityType: "withdrawal_request", entityId: withdrawalId, metadata: { batch_id: providerBatchId, status: result.providerStatus } });
      return NextResponse.json({ ok: true, provider: result });
    }

    const batchId = String(withdrawal.provider_batch_id || "").trim();
    if (!batchId) throw new Error("Provider payout batch ID is missing.");
    const result = await getPayPalPayoutBatch(batchId);
    const { count: priorSyncAttempts, error: countError } = await supabaseAdmin
      .from("payout_execution_attempts")
      .select("id", { count: "exact", head: true })
      .eq("withdrawal_id", withdrawalId)
      .eq("provider", "paypal")
      .eq("action", "sync");
    if (countError) throw new Error(countError.message);
    const { error: attemptError } = await supabaseAdmin.from("payout_execution_attempts").insert({
      withdrawal_id: withdrawalId,
      provider: "paypal",
      idempotency_key: batchId,
      attempt_number: Number(priorSyncAttempts || 0) + 1,
      action: "sync",
      status: result.marketplaceStatus,
      provider_batch_id: result.batchId || batchId,
      provider_item_id: result.itemId,
      response_payload: result.raw,
      executed_by: user.id,
    });
    if (attemptError) throw new Error(attemptError.message);
    await supabaseAdmin.from("withdrawal_requests").update({
      provider_item_id: result.itemId,
      provider_payload: result.raw,
      provider_status: result.providerStatus,
      payout_provider_fee: result.feeAmount,
      updated_at: new Date().toISOString(),
    }).eq("id", withdrawalId);
    if (result.marketplaceStatus === "paid") {
      await processWithdrawal({ supabaseAdmin, withdrawalId, adminId: user.id, action: "paid", reference: result.itemId || batchId, provider: "paypal", feeAmount: result.feeAmount, overrideHold: true });
    } else if (result.marketplaceStatus === "failed") {
      await processWithdrawal({ supabaseAdmin, withdrawalId, adminId: user.id, action: "fail", note: `PayPal payout status: ${result.providerStatus}`, provider: "paypal", overrideHold: true });
    }
    await recordAdminAudit({ adminId: user.id, action: "withdrawal.provider_sync", entityType: "withdrawal_request", entityId: withdrawalId, metadata: { batch_id: batchId, status: result.providerStatus } });
    return NextResponse.json({ ok: true, provider: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payout action error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const withdrawalId = Number(body.withdrawalId || 0);
    const action = clean(body.action, 30).toLowerCase();
    const note = clean(body.note, 1000);
    const reference = clean(body.reference, 180);
    const provider = clean(body.provider, 80);
    const feeAmount = numberValue(body.feeAmount);
    const allowed = new Set(["approve", "processing", "paid", "reject", "fail"]);
    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) return NextResponse.json({ error: "Invalid withdrawal ID." }, { status: 400 });
    if (!allowed.has(action)) return NextResponse.json({ error: "Invalid withdrawal action." }, { status: 400 });
    if ((action === "reject" || action === "fail") && !note) return NextResponse.json({ error: "An admin note is required for rejected or failed payouts." }, { status: 400 });
    if (action === "paid" && !reference) return NextResponse.json({ error: "A payout reference is required before marking paid." }, { status: 400 });
    if (feeAmount < 0) return NextResponse.json({ error: "Payout fee cannot be negative." }, { status: 400 });

    const before = await getWithdrawal(supabaseAdmin, withdrawalId);
    const result = await processWithdrawal({
      supabaseAdmin,
      withdrawalId,
      adminId: user.id,
      action,
      note,
      reference,
      provider,
      feeAmount,
      overrideHold: Boolean(body.overrideHold),
    });
    const after = await getWithdrawal(supabaseAdmin, withdrawalId);
    await recordAdminAudit({
      adminId: user.id,
      action: `withdrawal.${action}`,
      entityType: "withdrawal_request",
      entityId: withdrawalId,
      beforeData: before,
      afterData: after,
      metadata: { note, reference, provider, feeAmount, overrideHold: Boolean(body.overrideHold) },
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected withdrawal error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

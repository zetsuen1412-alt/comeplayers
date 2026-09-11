import { NextResponse } from "next/server";
import {
  encryptPayoutAccount,
  maskPayoutIdentifier,
  payoutIdentifierLast4,
} from "@/lib/payoutCrypto";
import {
  requireApprovedSeller,
  sellerErrorStatus,
} from "@/lib/sellerSecurity";
import { applyPayoutSecurityCooldown } from "@/lib/withdrawalSecurity";
import { recordSecurityEvent } from "@/lib/requestSecurity";

const ALLOWED_METHODS = new Set(["bank_transfer", "paypal", "wise"]);

function clean(value: unknown, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeMethod(value: unknown) {
  return clean(value, 40).toLowerCase();
}

function publicAccount(account: Record<string, unknown>) {
  return {
    id: Number(account.id),
    method: String(account.method || ""),
    label: String(account.label || ""),
    account_name: String(account.account_name || ""),
    account_last4: String(account.account_last4 || ""),
    masked_identifier: `****${String(account.account_last4 || "****")}`,
    bank_name: String(account.bank_name || ""),
    country_code: String(account.country_code || "ID"),
    currency: String(account.currency || "IDR"),
    is_default: Boolean(account.is_default),
    status: String(account.status || "active"),
    verification_status: String(account.verification_status || "unverified"),
    created_at: account.created_at,
    updated_at: account.updated_at,
  };
}

function validateInput(body: Record<string, unknown>) {
  const method = normalizeMethod(body.method);
  const label = clean(body.label, 80);
  const accountName = clean(body.accountName, 120);
  const accountIdentifier = clean(body.accountIdentifier, 180);
  const bankName = clean(body.bankName, 120);
  const countryCode = clean(body.countryCode || "ID", 2).toUpperCase();
  const currency = clean(body.currency || "IDR", 3).toUpperCase();

  if (!ALLOWED_METHODS.has(method)) {
    throw new Error("Invalid payout method.");
  }

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error("A valid two-letter payout country code is required.");
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("A valid three-letter payout currency is required.");
  }

  if (accountName.length < 2) {
    throw new Error("Payout account name is required.");
  }

  if (accountIdentifier.length < 4) {
    throw new Error("Payout account number or email is required.");
  }

  if (method === "bank_transfer" && bankName.length < 2) {
    throw new Error("Bank name is required for bank transfer.");
  }

  if ((method === "paypal" || method === "wise") && !accountIdentifier.includes("@")) {
    throw new Error("A valid payout email is required for this method.");
  }

  return {
    method,
    label: label || (method === "bank_transfer" ? bankName : method),
    accountName,
    accountIdentifier,
    bankName,
    countryCode,
    currency,
    isDefault: Boolean(body.isDefault),
  };
}

export async function GET(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);

    const { data, error } = await supabaseAdmin
      .from("payout_accounts")
      .select(
        "id,method,label,account_name,account_last4,bank_name,country_code,currency,is_default,status,verification_status,created_at,updated_at"
      )
      .eq("user_id", user.id)
      .neq("status", "deleted")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      accounts: (data || []).map((item) =>
        publicAccount(item as Record<string, unknown>)
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payout account error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const input = validateInput(body);

    const { count, error: countError } = await supabaseAdmin
      .from("payout_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active");

    if (countError) throw new Error(countError.message);
    if ((count || 0) >= 5) {
      throw new Error("Maximum 5 active payout accounts are allowed.");
    }

    const makeDefault = input.isDefault || (count || 0) === 0;

    if (makeDefault) {
      const { error } = await supabaseAdmin
        .from("payout_accounts")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("is_default", true);
      if (error) throw new Error(error.message);
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("payout_accounts")
      .insert({
        user_id: user.id,
        method: input.method,
        label: input.label,
        account_name: input.accountName,
        account_last4: payoutIdentifierLast4(input.accountIdentifier),
        bank_name: input.bankName || null,
        country_code: input.countryCode,
        currency: input.currency,
        is_default: makeDefault,
        status: "active",
        verification_status: "unverified",
        security_changed_at: new Date().toISOString(),
        metadata: {
          masked_identifier: maskPayoutIdentifier(input.accountIdentifier),
        },
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(insertError?.message || "Failed to create payout account.");
    }

    const accountId = Number(inserted.id);
    const encrypted = encryptPayoutAccount(accountId, {
      method: input.method,
      accountName: input.accountName,
      accountIdentifier: input.accountIdentifier,
      bankName: input.bankName,
      countryCode: input.countryCode,
      currency: input.currency,
    });

    const { data: account, error: updateError } = await supabaseAdmin
      .from("payout_accounts")
      .update({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_version: encrypted.keyVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId)
      .eq("user_id", user.id)
      .select(
        "id,method,label,account_name,account_last4,bank_name,country_code,currency,is_default,status,verification_status,created_at,updated_at"
      )
      .single();

    if (updateError || !account) {
      await supabaseAdmin.from("payout_accounts").delete().eq("id", accountId);
      throw new Error(updateError?.message || "Failed to encrypt payout account.");
    }

    const cooldown = await applyPayoutSecurityCooldown({
      supabaseAdmin,
      userId: user.id,
      reason: "payout_account_added",
    });
    await recordSecurityEvent({
      supabaseAdmin,
      userId: user.id,
      request,
      eventType: "payout_account_added",
      severity: "high",
      details: {
        payout_account_id: accountId,
        method: input.method,
        cooldown_until: cooldown.until,
      },
    });

    return NextResponse.json(
      {
        account: publicAccount(account as Record<string, unknown>),
        cooldownUntil: cooldown.until,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payout account error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const accountId = Number(body.accountId || 0);
    const action = clean(body.action || "update", 30).toLowerCase();

    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error("Invalid payout account ID.");
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("payout_accounts")
      .select("*")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("Payout account not found.");

    if (action === "set_default") {
      await supabaseAdmin
        .from("payout_accounts")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("is_default", true);

      const { data, error } = await supabaseAdmin
        .from("payout_accounts")
        .update({ is_default: true, status: "active", updated_at: new Date().toISOString() })
        .eq("id", accountId)
        .eq("user_id", user.id)
        .select(
          "id,method,label,account_name,account_last4,bank_name,country_code,currency,is_default,status,verification_status,created_at,updated_at"
        )
        .single();

      if (error || !data) throw new Error(error?.message || "Failed to set default account.");
      return NextResponse.json({ account: publicAccount(data as Record<string, unknown>) });
    }

    if (action === "deactivate") {
      const { count, error: pendingError } = await supabaseAdmin
        .from("withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("payout_account_id", accountId)
        .in("status", ["pending", "approved", "processing"]);

      if (pendingError) throw new Error(pendingError.message);
      if ((count || 0) > 0) {
        throw new Error("This payout account is used by an active withdrawal.");
      }

      const { error } = await supabaseAdmin
        .from("payout_accounts")
.update({ is_default: false, status: "inactive", security_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", accountId)
        .eq("user_id", user.id);

      if (error) throw new Error(error.message);
      const cooldown = await applyPayoutSecurityCooldown({
        supabaseAdmin,
        userId: user.id,
        reason: "payout_account_deactivated",
      });
      await recordSecurityEvent({
        supabaseAdmin,
        userId: user.id,
        request,
        eventType: "payout_account_deactivated",
        severity: "high",
        details: { payout_account_id: accountId, cooldown_until: cooldown.until },
      });
      return NextResponse.json({ ok: true, cooldownUntil: cooldown.until });
    }

    const input = validateInput(body);
    const encrypted = encryptPayoutAccount(accountId, {
      method: input.method,
      accountName: input.accountName,
      accountIdentifier: input.accountIdentifier,
      bankName: input.bankName,
      countryCode: input.countryCode,
      currency: input.currency,
    });

    if (input.isDefault) {
      await supabaseAdmin
        .from("payout_accounts")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("is_default", true);
    }

    const { data, error } = await supabaseAdmin
      .from("payout_accounts")
      .update({
        method: input.method,
        label: input.label,
        account_name: input.accountName,
        account_last4: payoutIdentifierLast4(input.accountIdentifier),
        bank_name: input.bankName || null,
        country_code: input.countryCode,
        currency: input.currency,
        is_default: input.isDefault || Boolean(existing.is_default),
        status: "active",
        verification_status: "unverified",
        security_changed_at: new Date().toISOString(),
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_version: encrypted.keyVersion,
        metadata: {
          masked_identifier: maskPayoutIdentifier(input.accountIdentifier),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId)
      .eq("user_id", user.id)
      .select(
        "id,method,label,account_name,account_last4,bank_name,country_code,currency,is_default,status,verification_status,created_at,updated_at"
      )
      .single();

    if (error || !data) throw new Error(error?.message || "Failed to update payout account.");
    const cooldown = await applyPayoutSecurityCooldown({
      supabaseAdmin,
      userId: user.id,
      reason: "payout_account_updated",
    });
    await recordSecurityEvent({
      supabaseAdmin,
      userId: user.id,
      request,
      eventType: "payout_account_updated",
      severity: "high",
      details: { payout_account_id: accountId, cooldown_until: cooldown.until },
    });
    return NextResponse.json({
      account: publicAccount(data as Record<string, unknown>),
      cooldownUntil: cooldown.until,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payout account error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

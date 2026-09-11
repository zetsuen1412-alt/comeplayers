import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";
import { calculateCommerceMetrics } from "@/lib/commerceMetrics";
import { generateProviderSettlementReport } from "@/lib/providerSettlementServer";
import { normalizeRateProposal } from "@/lib/rateGovernance";
import { accountingMonthBounds } from "@/lib/accounting";

function clean(value: unknown, length = 1000) {
  return String(value ?? "").trim().slice(0, length);
}

function parseTimestamp(value: unknown, label: string, fallback?: string) {
  const raw = clean(value, 80) || fallback || "";
  const timestamp = new Date(raw).getTime();
  if (!raw || !Number.isFinite(timestamp)) throw new Error(`${label} is invalid.`);
  return new Date(timestamp).toISOString();
}

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [
      sellerTaxSettings, withdrawalTaxRates, policyReviews, privacyRequests, settlements, feedback,
      orders, withdrawals, marketplaceFees, sellerTaxRates, rateRequests, taxResidencies, fxRates,
      accountingPeriods, taxStatements,
    ] = await Promise.all([
      supabaseAdmin.from("seller_tax_settings").select("*").eq("setting_key", "global_seller_sales_tax").maybeSingle(),
      supabaseAdmin.from("withdrawal_tax_rates").select("*").order("country_code").order("payout_method").order("valid_from", { ascending: false }).limit(500),
      supabaseAdmin.from("product_policy_reviews").select("*").order("created_at", { ascending: false }).limit(200),
      supabaseAdmin.from("privacy_requests").select("*").order("requested_at", { ascending: false }).limit(200),
      supabaseAdmin.from("provider_settlement_reports").select("*").order("period_end", { ascending: false }).limit(50),
      supabaseAdmin.from("risk_feedback_events").select("*").order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("orders").select("status,payment_status,total_amount,total_price,seller_gross_amount,seller_sales_tax_amount,marketplace_fee_amount,created_at,paid_at,delivered_at,completed_at,delivery_due_at").gte("created_at", since).limit(10000),
      supabaseAdmin.from("withdrawal_requests").select("status,amount,tax_amount,fee_amount,net_amount,paid_at").gte("created_at", since).limit(10000),
      supabaseAdmin.from("marketplace_fee_settings").select("*").order("valid_from", { ascending: false }).limit(50),
      supabaseAdmin.from("seller_sales_tax_rates").select("*").order("valid_from", { ascending: false }).limit(50),
      supabaseAdmin.from("rate_change_requests").select("*").order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("seller_tax_residencies").select("seller_id,country_code,legal_name,tax_identifier_last4,residency_since,evidence_reference,status,submitted_at,verified_by,verified_at,rejected_by,rejected_at,rejection_reason,metadata,updated_at").order("submitted_at", { ascending: false }).limit(200),
      supabaseAdmin.from("fx_rates").select("*").order("valid_from", { ascending: false }).limit(200),
      supabaseAdmin.from("accounting_periods").select("*").order("period_start", { ascending: false }).limit(36),
      supabaseAdmin.from("seller_tax_statements").select("*").order("period_end", { ascending: false }).limit(200),
    ]);
    const firstError = [
      sellerTaxSettings.error, withdrawalTaxRates.error, policyReviews.error, privacyRequests.error,
      settlements.error, feedback.error, orders.error, withdrawals.error, marketplaceFees.error,
      sellerTaxRates.error, rateRequests.error, taxResidencies.error, fxRates.error,
      accountingPeriods.error, taxStatements.error,
    ].find(Boolean);
    if (firstError) throw new Error(firstError.message);

    const productIds = Array.from(new Set((policyReviews.data || []).map((row) => Number(row.product_id || 0)).filter(Boolean)));
    const sellerIds = Array.from(new Set((policyReviews.data || []).map((row) => String(row.seller_id || "")).filter(Boolean)));
    const [productsResult, profilesResult] = await Promise.all([
      productIds.length ? supabaseAdmin.from("products").select("id,title,status,policy_status,seller_id").in("id", productIds) : Promise.resolve({ data: [], error: null }),
      sellerIds.length ? supabaseAdmin.from("profiles").select("id,email,username,seller_name").in("id", sellerIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (productsResult.error) throw new Error(productsResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    const products = new Map((productsResult.data || []).map((row) => [Number(row.id), row]));
    const profiles = new Map((profilesResult.data || []).map((row) => [String(row.id), row]));

    return NextResponse.json({
      asOf: new Date().toISOString(),
      sellerTaxSettings: sellerTaxSettings.data || null,
      marketplaceFeeSettings: marketplaceFees.data || [],
      sellerTaxRates: sellerTaxRates.data || [],
      rateChangeRequests: rateRequests.data || [],
      taxResidencies: taxResidencies.data || [],
      fxRates: fxRates.data || [],
      accountingPeriods: accountingPeriods.data || [],
      taxStatements: taxStatements.data || [],
      withdrawalTaxRates: withdrawalTaxRates.data || [],
      policyReviews: (policyReviews.data || []).map((row) => ({ ...row, product: products.get(Number(row.product_id)) || null, seller: profiles.get(String(row.seller_id)) || null })),
      privacyRequests: privacyRequests.data || [],
      settlements: settlements.data || [],
      riskFeedback: feedback.data || [],
      metrics: calculateCommerceMetrics(orders.data || [], withdrawals.data || []),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load compliance dashboard.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = clean(body.action, 50).toLowerCase();

    if (action === "propose_rate_change") {
      const proposal = normalizeRateProposal({
        rateType: clean(body.rateType, 40) as "marketplace_fee" | "seller_sales_tax" | "withdrawal_tax",
        ratePercent: Number(body.ratePercent || 0),
        fixedAmount: Number(body.fixedAmount || 0),
        effectiveFrom: parseTimestamp(body.effectiveFrom, "Rate effective date", new Date().toISOString()),
        countryCode: clean(body.countryCode, 2),
        payoutMethod: clean(body.payoutMethod, 40),
        currency: clean(body.currency, 3),
        sourceReference: clean(body.sourceReference, 500),
        reason: clean(body.reason, 1000),
      });
      const targetKey = proposal.rateType === "withdrawal_tax"
        ? `${proposal.countryCode}:${proposal.payoutMethod}:${proposal.currency}`
        : proposal.rateType === "marketplace_fee" ? "global_marketplace_fee" : "global_seller_sales_tax";
      const { data, error } = await supabaseAdmin.from("rate_change_requests").insert({
        rate_type: proposal.rateType,
        target_key: targetKey,
        proposed_rate_percent: proposal.ratePercent,
        proposed_fixed_amount: proposal.fixedAmount,
        country_code: proposal.countryCode,
        payout_method: proposal.payoutMethod,
        currency: proposal.currency,
        effective_from: proposal.effectiveFrom,
        source_reference: proposal.sourceReference,
        reason: proposal.reason,
        requested_by: user.id,
        status: "pending",
        metadata: { version: "v23", dual_approval_required: true },
      }).select("*").single();
      if (error) throw new Error(error.message);
      await recordAdminAudit({ adminId: user.id, action: "rate_change.proposed", entityType: "rate_change_request", entityId: data.id, afterData: data });
      return NextResponse.json({ rateChangeRequest: data }, { status: 201 });
    }

    if (action === "review_rate_change") {
      const requestId = clean(body.requestId, 80);
      const decision = clean(body.decision || "approve", 20).toLowerCase();
      const note = clean(body.note, 1000);
      if (!requestId) throw new Error("Rate change request ID is required.");
      if (!["approve", "reject"].includes(decision)) throw new Error("Decision must be approve or reject.");
      if (decision === "reject" && !note) throw new Error("A rejection reason is required.");
      const { data: before, error: beforeError } = await supabaseAdmin.from("rate_change_requests").select("*").eq("id", requestId).maybeSingle();
      if (beforeError) throw new Error(beforeError.message);
      if (!before) throw new Error("Rate change request not found.");
      const { data, error } = await supabaseAdmin.rpc("cp_approve_rate_change_v23", { p_request_id: requestId, p_admin_id: user.id, p_decision: decision, p_note: note || null });
      if (error) throw new Error(error.message);
      const { data: after } = await supabaseAdmin.from("rate_change_requests").select("*").eq("id", requestId).maybeSingle();
      await recordAdminAudit({ adminId: user.id, action: `rate_change.${decision}`, entityType: "rate_change_request", entityId: requestId, beforeData: before, afterData: after, metadata: { note } });
      return NextResponse.json({ result: data, rateChangeRequest: after });
    }

    if (action === "save_fx_rate") {
      const baseCurrency = clean(body.baseCurrency || "IDR", 3).toUpperCase();
      const quoteCurrency = clean(body.quoteCurrency, 3).toUpperCase();
      const rate = Number(body.rate || 0);
      const provider = clean(body.provider || "manual", 80);
      const sourceReference = clean(body.sourceReference, 500);
      const validFrom = parseTimestamp(body.validFrom, "FX effective date", new Date().toISOString());
      if (!/^[A-Z]{3}$/.test(baseCurrency) || !/^[A-Z]{3}$/.test(quoteCurrency) || baseCurrency === quoteCurrency) throw new Error("FX currencies are invalid.");
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("FX rate must be positive.");
      if (!sourceReference) throw new Error("FX source reference is required.");
      const futureRate = new Date(validFrom).getTime() > Date.now();
      const { error: closeError } = await supabaseAdmin.from("fx_rates").update({
        valid_to: validFrom,
        ...(futureRate ? {} : { status: "inactive" }),
        updated_at: new Date().toISOString(),
      }).eq("base_currency", baseCurrency).eq("quote_currency", quoteCurrency).in("status", ["active", "scheduled"]).is("valid_to", null).lt("valid_from", validFrom);
      if (closeError) throw new Error(closeError.message);
      const { data, error } = await supabaseAdmin.from("fx_rates").insert({ base_currency: baseCurrency, quote_currency: quoteCurrency, rate, provider, source_reference: sourceReference, status: futureRate ? "scheduled" : "active", valid_from: validFrom, metadata: { entered_by: user.id, version: "v23" } }).select("*").single();
      if (error) throw new Error(error.message);
      await recordAdminAudit({ adminId: user.id, action: "fx_rate.create", entityType: "fx_rate", entityId: data.id, afterData: data });
      return NextResponse.json({ fxRate: data }, { status: 201 });
    }

    if (action === "create_accounting_period") {
      const bounds = accountingMonthBounds(clean(body.periodKey, 7));
      const { data, error } = await supabaseAdmin.from("accounting_periods").insert({ period_key: bounds.periodKey, period_start: bounds.start, period_end: bounds.end, status: "open", opened_by: user.id, metadata: { version: "v23" } }).select("*").single();
      if (error) throw new Error(error.message);
      await recordAdminAudit({ adminId: user.id, action: "accounting_period.create", entityType: "accounting_period", entityId: data.id, afterData: data });
      return NextResponse.json({ accountingPeriod: data }, { status: 201 });
    }

    if (action === "close_accounting_period") {
      const periodId = clean(body.periodId, 80);
      if (!periodId) throw new Error("Accounting period ID is required.");
      const { data, error } = await supabaseAdmin.rpc("cp_close_accounting_period_v23", { p_period_id: periodId, p_admin_id: user.id });
      if (error) throw new Error(error.message);
      await recordAdminAudit({ adminId: user.id, action: "accounting_period.close", entityType: "accounting_period", entityId: periodId, metadata: data as Record<string, unknown> });
      return NextResponse.json({ result: data });
    }

    if (action === "review_tax_residency") {
      const sellerId = clean(body.sellerId, 80);
      const decision = clean(body.decision, 20).toLowerCase();
      const note = clean(body.note, 1000);
      if (!sellerId || !["verified", "rejected"].includes(decision)) throw new Error("Seller and residency decision are required.");
      if (decision === "rejected" && !note) throw new Error("A rejection reason is required.");
      const now = new Date().toISOString();
      const payload = decision === "verified"
        ? { status: "verified", verified_by: user.id, verified_at: now, rejected_by: null, rejected_at: null, rejection_reason: null, updated_at: now }
        : { status: "rejected", rejected_by: user.id, rejected_at: now, rejection_reason: note, verified_by: null, verified_at: null, updated_at: now };
      const { data, error } = await supabaseAdmin.from("seller_tax_residencies").update(payload).eq("seller_id", sellerId).select("seller_id,country_code,legal_name,tax_identifier_last4,residency_since,evidence_reference,status,submitted_at,verified_by,verified_at,rejected_by,rejected_at,rejection_reason,metadata,updated_at").single();
      if (error) throw new Error(error.message);
      await recordAdminAudit({ adminId: user.id, action: `tax_residency.${decision}`, entityType: "seller_tax_residency", entityId: sellerId, afterData: data, metadata: { note } });
      return NextResponse.json({ taxResidency: data });
    }

    if (action === "save_withdrawal_tax_rate") {
      const countryCode = clean(body.countryCode, 2).toUpperCase();
      const payoutMethod = clean(body.payoutMethod, 40).toLowerCase();
      const ratePercent = Number(body.ratePercent || 0);
      const fixedAmount = Number(body.fixedAmount || 0);
      const currency = clean(body.currency || "IDR", 3).toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error("A two-letter country code is required.");
      if (!/^[a-z0-9_-]{2,40}$/.test(payoutMethod)) throw new Error("Payout method is invalid.");
      if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) throw new Error("Withdrawal tax rate must be between 0 and 100.");
      if (!Number.isFinite(fixedAmount) || fixedAmount < 0) throw new Error("Fixed withdrawal tax cannot be negative.");
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error("A three-letter currency code is required.");
      const status = clean(body.status || "draft", 20).toLowerCase();
      if (!["draft", "active", "inactive"].includes(status)) {
        throw new Error("Withdrawal tax status must be draft, active, or inactive.");
      }
      const validFrom = parseTimestamp(body.validFrom, "Withdrawal tax start date", new Date().toISOString());
      const validTo = clean(body.validTo, 80)
        ? parseTimestamp(body.validTo, "Withdrawal tax end date")
        : null;
      if (validTo && new Date(validTo).getTime() <= new Date(validFrom).getTime()) {
        throw new Error("Withdrawal tax end date must be after the start date.");
      }
      const sourceReference = clean(body.sourceReference, 500);
      if (status === "active" && !sourceReference) {
        throw new Error("An active withdrawal tax rule requires a legal/source reference.");
      }
      if (status === "active") {
        const proposal = normalizeRateProposal({
          rateType: "withdrawal_tax",
          ratePercent,
          fixedAmount,
          effectiveFrom: validFrom,
          countryCode,
          payoutMethod,
          currency,
          sourceReference,
          reason: clean(body.reason, 1000),
        });
        const { data, error } = await supabaseAdmin.from("rate_change_requests").insert({
          rate_type: proposal.rateType,
          target_key: `${proposal.countryCode}:${proposal.payoutMethod}:${proposal.currency}`,
          proposed_rate_percent: proposal.ratePercent,
          proposed_fixed_amount: proposal.fixedAmount,
          country_code: proposal.countryCode,
          payout_method: proposal.payoutMethod,
          currency: proposal.currency,
          effective_from: proposal.effectiveFrom,
          source_reference: proposal.sourceReference,
          reason: proposal.reason,
          requested_by: user.id,
          status: "pending",
          metadata: { version: "v23", dual_approval_required: true, requested_via: "withdrawal_tax_form" },
        }).select("*").single();
        if (error) throw new Error(error.message);
        await recordAdminAudit({ adminId: user.id, action: "rate_change.proposed", entityType: "rate_change_request", entityId: data.id, afterData: data });
        return NextResponse.json({ rateChangeRequest: data, requiresDualApproval: true }, { status: 202 });
      }
      const payload = {
        country_code: countryCode,
        payout_method: payoutMethod,
        rate_percent: ratePercent,
        fixed_amount: fixedAmount,
        currency,
        status,
        valid_from: validFrom,
        valid_to: validTo,
        source_reference: sourceReference || null,
        metadata: { reviewed_by: user.id, tax_bearer: "seller" },
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin
        .from("withdrawal_tax_rates")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAudit({
        adminId: user.id,
        action: "withdrawal_tax_rate.create",
        entityType: "withdrawal_tax_rate",
        entityId: data.id,
        afterData: data,
      });
      return NextResponse.json({ withdrawalTaxRate: data }, { status: 201 });
    }


    if (action === "retry_privacy_deletion") {
      const requestId = clean(body.requestId, 80);
      if (!requestId) throw new Error("Privacy request ID is required.");
      const now = new Date().toISOString();
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("privacy_requests")
        .select("*")
        .eq("id", requestId)
        .eq("request_type", "delete")
        .eq("status", "failed")
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (!existing) throw new Error("Failed privacy deletion request not found.");
      const { data, error } = await supabaseAdmin
        .from("privacy_requests")
        .update({
          status: "pending",
          scheduled_for: now,
          failure_reason: null,
          updated_at: now,
          metadata: {
            ...((existing.metadata || {}) as Record<string, unknown>),
            retried_by: user.id,
            retried_at: now,
          },
        })
        .eq("id", requestId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAudit({
        adminId: user.id,
        action: "privacy_deletion.retry",
        entityType: "privacy_request",
        entityId: requestId,
        beforeData: existing,
        afterData: data,
      });
      return NextResponse.json({ request: data });
    }

    if (action === "generate_settlement") {
      const periodEnd = parseTimestamp(body.periodEnd, "Settlement period end", new Date().toISOString());
      const defaultStart = new Date(new Date(periodEnd).getTime() - 24 * 60 * 60 * 1000).toISOString();
      const periodStart = parseTimestamp(body.periodStart, "Settlement period start", defaultStart);
      if (new Date(periodEnd).getTime() <= new Date(periodStart).getTime()) {
        throw new Error("Settlement period end must be after the start.");
      }
      if (new Date(periodEnd).getTime() - new Date(periodStart).getTime() > 366 * 86_400_000) {
        throw new Error("Settlement period cannot exceed 366 days.");
      }
      const result = await generateProviderSettlementReport({
        supabaseAdmin,
        periodStart,
        periodEnd,
        generatedBy: user.id,
        source: "admin",
      });
      await recordAdminAudit({ adminId: user.id, action: "settlement.generate", entityType: "provider_settlement_report", entityId: result.reportId, metadata: result });
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported compliance action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compliance action failed.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const reviewId = Number(body.reviewId || 0);
    const decision = clean(body.decision, 20).toLowerCase();
    const note = clean(body.note, 2000);
    if (!Number.isInteger(reviewId) || reviewId <= 0) throw new Error("Invalid policy review ID.");
    if (!["approved", "rejected"].includes(decision)) throw new Error("Decision must be approved or rejected.");
    if (!note) throw new Error("A compliance review note is required.");

    const { data: review, error } = await supabaseAdmin
      .from("product_policy_reviews")
      .select("*")
      .eq("id", reviewId)
      .eq("status", "pending")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!review) throw new Error("Pending policy review not found.");
    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("product_policy_reviews")
      .update({ status: decision, reviewed_by: user.id, review_note: note, reviewed_at: now, updated_at: now })
      .eq("id", reviewId)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);

    const { data: product, error: productReadError } = await supabaseAdmin
      .from("products")
      .select("id,stock,status")
      .eq("id", review.product_id)
      .maybeSingle();
    if (productReadError) throw new Error(productReadError.message);
    if (!product) throw new Error("Reviewed product no longer exists.");

    const productUpdate = decision === "approved"
      ? {
          policy_status: "allowed",
          policy_reasons: [],
          policy_checked_at: now,
          status: Number(product.stock || 0) > 0 ? "active" : "inactive",
          updated_at: now,
        }
      : { policy_status: "rejected", policy_checked_at: now, status: "inactive", updated_at: now };
    const { error: productError } = await supabaseAdmin.from("products").update(productUpdate).eq("id", review.product_id);
    if (productError) throw new Error(productError.message);

    if (decision === "rejected") {
      const reasons = Array.isArray(review.reasons) ? review.reasons : [];
      const { error: strikeError } = await supabaseAdmin.from("seller_policy_strikes").insert({
        seller_id: review.seller_id,
        product_id: review.product_id,
        review_id: reviewId,
        severity: review.severity,
        reason: reasons.join("; ") || note,
        created_by: user.id,
      });
      if (strikeError) throw new Error(strikeError.message);
    }

    await recordAdminAudit({
      adminId: user.id,
      action: `product_policy.${decision}`,
      entityType: "product_policy_review",
      entityId: reviewId,
      beforeData: review,
      afterData: updated,
      metadata: { note, product_id: review.product_id },
    });
    return NextResponse.json({ review: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Policy review failed.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

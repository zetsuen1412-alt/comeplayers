import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PRODUCT_POLICY_RULES,
  evaluateProductPolicy,
  type ProductPolicyRule,
} from "@/lib/prohibitedProducts";

export async function loadProductPolicyRules(supabaseAdmin: SupabaseClient) {
  const { data, error } = await supabaseAdmin
    .from("prohibited_product_rules")
    .select("rule_key,match_type,pattern,decision,severity,reason")
    .eq("enabled", true)
    .order("id", { ascending: true });

  if (error) return DEFAULT_PRODUCT_POLICY_RULES;
  const rules = (data || []).flatMap((row) => {
    const decision = String(row.decision || "");
    const severity = String(row.severity || "");
    const matchType = String(row.match_type || "regex");
    if (!["block", "review"].includes(decision)) return [];
    if (!["medium", "high", "critical"].includes(severity)) return [];
    return [{
      key: String(row.rule_key),
      pattern: String(row.pattern),
      matchType: matchType === "keyword" ? "keyword" as const : "regex" as const,
      decision: decision as ProductPolicyRule["decision"],
      severity: severity as ProductPolicyRule["severity"],
      reason: String(row.reason),
    }];
  });
  return rules.length > 0 ? rules : DEFAULT_PRODUCT_POLICY_RULES;
}

export async function evaluateProductPolicyWithDatabase(input: {
  supabaseAdmin: SupabaseClient;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  gameName?: unknown;
  tags?: unknown[] | unknown;
}) {
  const rules = await loadProductPolicyRules(input.supabaseAdmin);
  return evaluateProductPolicy({ ...input, rules });
}

export async function createProductPolicyReview(input: {
  supabaseAdmin: SupabaseClient;
  productId: number;
  sellerId: string;
  decision: "review" | "block";
  severity: "medium" | "high" | "critical";
  matchedRules: string[];
  reasons: string[];
  listingSnapshot: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await input.supabaseAdmin
    .from("product_policy_reviews")
    .select("id")
    .eq("product_id", input.productId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const payload = {
    product_id: input.productId,
    seller_id: input.sellerId,
    decision: input.decision,
    severity: input.severity,
    status: "pending",
    matched_rules: input.matchedRules,
    reasons: input.reasons,
    listing_snapshot: input.listingSnapshot,
    reviewed_by: null,
    review_note: null,
    reviewed_at: null,
    updated_at: now,
  };
  const mutation = existing
    ? input.supabaseAdmin
        .from("product_policy_reviews")
        .update(payload)
        .eq("id", existing.id)
    : input.supabaseAdmin
        .from("product_policy_reviews")
        .insert(payload);
  const { data, error } = await mutation.select("id").single();
  if (error || !data) throw new Error(error?.message || "Failed to create policy review.");

  const { error: productError } = await input.supabaseAdmin
    .from("products")
    .update({
      status: "inactive",
      policy_status: input.decision === "block" ? "blocked" : "pending_review",
      policy_reasons: input.reasons,
      policy_checked_at: now,
      policy_review_id: data.id,
      updated_at: now,
    })
    .eq("id", input.productId);
  if (productError) throw new Error(productError.message);
  return Number(data.id);
}

export async function supersedePendingProductPolicyReviews(input: {
  supabaseAdmin: SupabaseClient;
  productId: number;
  note?: string;
}) {
  const now = new Date().toISOString();
  const { error } = await input.supabaseAdmin
    .from("product_policy_reviews")
    .update({
      status: "superseded",
      review_note: input.note || "Listing changed and passed automated policy screening.",
      reviewed_at: now,
      updated_at: now,
    })
    .eq("product_id", input.productId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

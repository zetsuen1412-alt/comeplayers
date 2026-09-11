import { NextResponse } from "next/server";
import { calculateCommerceMetrics } from "@/lib/commerceMetrics";
import { requestId } from "@/lib/observability";
import { runTrackedOperation } from "@/lib/operationalRuns";
import { processPrivacyDeletion } from "@/lib/privacyServer";
import {
  createProductPolicyReview,
  evaluateProductPolicyWithDatabase,
} from "@/lib/productPolicyServer";
import { generateProviderSettlementReport } from "@/lib/providerSettlementServer";
import { createSupabaseAdmin } from "@/lib/serverSupabase";
import { cleanupExpiredStatuses } from "@/lib/statusCleanup";
import { cleanupPrivateRelay, cleanupUnattachedSecureHistory } from "@/lib/privateRelayCleanup";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(request: Request) {
  const currentRequestId = requestId(request);
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  try {
    const result = await runTrackedOperation({
      supabaseAdmin,
      jobName: "commerce_compliance_v22",
      runKey: `cron:commerce-compliance:${new Date().toISOString().slice(0, 10)}`,
      source: "cron",
      requestId: currentRequestId,
      execute: async () => {
        const now = new Date();
        await cleanupExpiredStatuses();
        await cleanupPrivateRelay();
        await cleanupUnattachedSecureHistory();
        const nowIso = now.toISOString();
        const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
        const periodStart = new Date(new Date(periodEnd).getTime() - 86_400_000).toISOString();

        const { data: deletionRequests, error: deletionError } = await supabaseAdmin
          .from("privacy_requests")
          .select("id,user_id")
          .eq("request_type", "delete")
          .eq("status", "pending")
          .lte("scheduled_for", nowIso)
          .order("scheduled_for", { ascending: true })
          .limit(20);
        if (deletionError) throw new Error(deletionError.message);

        let deletionsCompleted = 0;
        let deletionsFailed = 0;
        for (const row of deletionRequests || []) {
          try {
            await processPrivacyDeletion({
              supabaseAdmin,
              requestId: String(row.id),
              userId: String(row.user_id),
            });
            deletionsCompleted += 1;
          } catch (error) {
            deletionsFailed += 1;
            await supabaseAdmin
              .from("privacy_requests")
              .update({
                status: "failed",
                failure_reason: error instanceof Error ? error.message.slice(0, 1000) : "Deletion failed.",
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
          }
        }

        const configuredPolicyLimit = Number(process.env.PRODUCT_POLICY_SCAN_LIMIT || 250);
        const policyScanLimit = Number.isFinite(configuredPolicyLimit)
          ? Math.min(1000, Math.max(1, Math.floor(configuredPolicyLimit)))
          : 250;
        const { data: products, error: productError } = await supabaseAdmin
          .from("products")
          .select("id,seller_id,title,description,category,game_name,offer_tags,status,policy_status")
          .in("status", ["active", "inactive"])
          .order("updated_at", { ascending: false })
          .limit(policyScanLimit);
        if (productError) throw new Error(productError.message);

        let policyQueued = 0;
        for (const product of products || []) {
          const policy = await evaluateProductPolicyWithDatabase({
            supabaseAdmin,
            title: product.title,
            description: product.description,
            category: product.category,
            gameName: product.game_name,
            tags: product.offer_tags,
          });
          if (policy.decision === "allow") {
            if (String(product.policy_status || "allowed") !== "allowed") continue;
            await supabaseAdmin
              .from("products")
              .update({ policy_checked_at: nowIso })
              .eq("id", product.id);
            continue;
          }
          await createProductPolicyReview({
            supabaseAdmin,
            productId: Number(product.id),
            sellerId: String(product.seller_id),
            decision: policy.decision,
            severity: policy.severity === "info" ? "medium" : policy.severity,
            matchedRules: policy.matchedRules,
            reasons: policy.reasons,
            listingSnapshot: product,
          });
          policyQueued += 1;
        }

        let settlement: Awaited<ReturnType<typeof generateProviderSettlementReport>> | null = null;
        if (String(process.env.SETTLEMENT_AUTO_REPORT || "true").toLowerCase() !== "false") {
          const { data: existing } = await supabaseAdmin
            .from("provider_settlement_reports")
            .select("id")
            .eq("period_start", periodStart)
            .eq("period_end", periodEnd)
            .maybeSingle();
          if (!existing) {
            settlement = await generateProviderSettlementReport({
              supabaseAdmin,
              periodStart,
              periodEnd,
              source: "cron",
            });
          }
        }

        const { data: orders, error: orderError } = await supabaseAdmin
          .from("orders")
          .select("status,payment_status,total_amount,total_price,seller_gross_amount,seller_sales_tax_amount,marketplace_fee_amount,created_at,paid_at,delivered_at,completed_at,delivery_due_at")
          .gte("created_at", periodStart)
          .lt("created_at", periodEnd)
          .limit(10000);
        if (orderError) throw new Error(orderError.message);

        const { data: withdrawals, error: withdrawalError } = await supabaseAdmin
          .from("withdrawal_requests")
          .select("status,amount,tax_amount,fee_amount,net_amount,paid_at")
          .eq("status", "paid")
          .gte("paid_at", periodStart)
          .lt("paid_at", periodEnd)
          .limit(10000);
        if (withdrawalError) throw new Error(withdrawalError.message);

        const metrics = calculateCommerceMetrics(orders || [], withdrawals || []);
        const [disputes, support, policyBlocks] = await Promise.all([
          supabaseAdmin.from("disputes").select("id", { count: "exact", head: true }).gte("created_at", periodStart).lt("created_at", periodEnd),
          supabaseAdmin.from("support_tickets").select("id", { count: "exact", head: true }).gte("created_at", periodStart).lt("created_at", periodEnd),
          supabaseAdmin.from("product_policy_reviews").select("id", { count: "exact", head: true }).gte("created_at", periodStart).lt("created_at", periodEnd),
        ]);
        const { error: metricError } = await supabaseAdmin
          .from("commerce_daily_metrics")
          .upsert({
            metric_date: periodStart.slice(0, 10),
            created_orders: metrics.createdOrders,
            paid_orders: metrics.paidOrders,
            completed_orders: metrics.completedOrders,
            gross_volume: metrics.grossVolume,
            tax_collected: metrics.taxCollected,
            marketplace_fees: metrics.marketplaceFees,
            disputes_opened: Number(disputes.count || 0),
            support_tickets_opened: Number(support.count || 0),
            policy_blocks: Number(policyBlocks.count || 0),
            late_delivery_count: Math.round(metrics.createdOrders * metrics.lateDeliveryPercent / 100),
            metadata: metrics,
            calculated_at: nowIso,
            updated_at: nowIso,
          }, { onConflict: "metric_date" });
        if (metricError) throw new Error(metricError.message);

        return {
          deletionsCompleted,
          deletionsFailed,
          policyScanned: (products || []).length,
          policyQueued,
          settlement,
          metrics,
        };
      },
      summarize: (value) => ({
        deletionsCompleted: value.deletionsCompleted,
        deletionsFailed: value.deletionsFailed,
        policyScanned: value.policyScanned,
        policyQueued: value.policyQueued,
        settlementStatus: value.settlement?.status || "skipped",
        createdOrders: value.metrics.createdOrders,
      }),
    });

    return NextResponse.json(result, { headers: { "x-request-id": currentRequestId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Commerce compliance cron failed." },
      { status: 500, headers: { "x-request-id": currentRequestId } }
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}

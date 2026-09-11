import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { disputeResolutionFeedback } from "@/lib/fraudFeedback";

export async function recordDisputeRiskFeedback(input: {
  supabaseAdmin: SupabaseClient;
  disputeId: number;
  orderId: number;
  buyerId?: string | null;
  sellerId?: string | null;
  action: string;
  actorId?: string | null;
}) {
  const feedback = disputeResolutionFeedback(input);
  const recorded: Array<Record<string, unknown>> = [];

  for (const row of feedback) {
    const payload = {
      source_type: "dispute",
      source_id: String(input.disputeId),
      subject_user_id: row.subjectUserId,
      subject_role: row.role,
      outcome: row.outcome,
      score_delta: row.scoreDelta,
      reason: row.reason,
      metadata: { order_id: input.orderId, actor_id: input.actorId || null },
      processed_at: new Date().toISOString(),
    };
    const { data, error } = await input.supabaseAdmin
      .from("risk_feedback_events")
      .upsert(payload, {
        onConflict: "source_type,source_id,subject_user_id,reason",
        ignoreDuplicates: true,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) continue;

    const { data: current, error: currentError } = await input.supabaseAdmin
      .from("user_risk_profiles")
      .select("risk_score,reasons")
      .eq("user_id", row.subjectUserId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);

    const nextScore = Math.min(
      100,
      Math.max(0, Number(current?.risk_score || 0) + row.scoreDelta)
    );
    const nextLevel =
      nextScore >= 80 ? "critical" : nextScore >= 55 ? "high" : nextScore >= 30 ? "medium" : "low";
    const reasons = Array.from(
      new Set([...(Array.isArray(current?.reasons) ? current.reasons : []), row.reason])
    ).slice(-20);

    const { error: riskError } = await input.supabaseAdmin
      .from("user_risk_profiles")
      .upsert(
        {
          user_id: row.subjectUserId,
          risk_score: nextScore,
          risk_level: nextLevel,
          reasons,
          last_evaluated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    if (riskError) throw new Error(riskError.message);
    recorded.push(payload);
  }

  return recorded;
}

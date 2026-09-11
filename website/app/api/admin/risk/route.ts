import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);

    const [eventsResult, profilesResult] = await Promise.all([
      supabaseAdmin
        .from("security_events")
        .select("id,user_id,event_type,severity,status,source,device_id,details,created_at,resolved_at,resolution_note")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("user_risk_profiles")
        .select("user_id,risk_score,risk_level,status,kyc_level,payout_daily_limit,reasons,last_evaluated_at,reviewed_at,review_note")
        .order("risk_score", { ascending: false })
        .limit(200),
    ]);

    if (eventsResult.error) throw new Error(eventsResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const userIds = Array.from(
      new Set([
        ...(eventsResult.data || []).map((item) => item.user_id),
        ...(profilesResult.data || []).map((item) => item.user_id),
      ].filter(Boolean))
    );

    const profileMap = new Map<string, Record<string, unknown>>();
    if (userIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id,email,username,full_name,role,seller_status")
        .in("id", userIds);
      if (error) throw new Error(error.message);
      for (const profile of data || []) {
        profileMap.set(String(profile.id), profile as Record<string, unknown>);
      }
    }

    return NextResponse.json({
      events: (eventsResult.data || []).map((item) => ({
        ...item,
        profile: profileMap.get(String(item.user_id)) || null,
      })),
      profiles: (profilesResult.data || []).map((item) => ({
        ...item,
        profile: profileMap.get(String(item.user_id)) || null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected risk queue error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    const note = String(body.note || "").trim().slice(0, 1000);

    if (action === "resolve_event") {
      const eventId = Number(body.eventId || 0);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throw new Error("Valid event ID is required.");
      }

      const { data: before, error: beforeError } = await supabaseAdmin
        .from("security_events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();
      if (beforeError) throw new Error(beforeError.message);
      if (!before) throw new Error("Security event not found.");

      const { data: after, error } = await supabaseAdmin
        .from("security_events")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_note: note || "Reviewed by administrator",
          updated_at: new Date().toISOString(),
        })
        .eq("id", eventId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await recordAdminAudit({
        adminId: user.id,
        action: "resolve_security_event",
        entityType: "security_event",
        entityId: eventId,
        beforeData: before,
        afterData: after,
      });
      return NextResponse.json({ ok: true, event: after });
    }

    if (action === "set_risk_status") {
      const userId = String(body.userId || "").trim();
      const status = String(body.status || "").trim().toLowerCase();
      if (!userId) throw new Error("User ID is required.");
      if (!["active", "review", "blocked"].includes(status)) {
        throw new Error("Invalid risk status.");
      }

      const { data: before } = await supabaseAdmin
        .from("user_risk_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      const { data: after, error } = await supabaseAdmin
        .from("user_risk_profiles")
        .upsert(
          {
            user_id: userId,
            status,
            reviewed_at: new Date().toISOString(),
            reviewed_by: user.id,
            review_note: note || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await recordAdminAudit({
        adminId: user.id,
        action: "set_user_risk_status",
        entityType: "user_risk_profile",
        entityId: userId,
        beforeData: before,
        afterData: after,
      });
      return NextResponse.json({ ok: true, profile: after });
    }

    throw new Error("Unsupported risk action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected risk queue error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

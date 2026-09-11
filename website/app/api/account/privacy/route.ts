import { NextResponse } from "next/server";
import { buildPrivacyExport } from "@/lib/privacyServer";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

const configuredGraceDays = Number(process.env.PRIVACY_DELETE_GRACE_DAYS || 30);
const DELETE_GRACE_DAYS = Number.isFinite(configuredGraceDays)
  ? Math.min(60, Math.max(7, Math.floor(configuredGraceDays)))
  : 30;

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("privacy_requests")
      .select("id,request_type,status,requested_at,scheduled_for,completed_at,cancelled_at,failure_reason")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return NextResponse.json({ requests: data || [], deleteGraceDays: DELETE_GRACE_DAYS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load privacy requests.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(message) });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const body = (await request.json()) as { action?: string; confirmation?: string };
    const action = String(body.action || "").toLowerCase();

    if (action === "export") {
      const exportData = await buildPrivacyExport({
        supabaseAdmin,
        userId: user.id,
        email: user.email,
      });
      await supabaseAdmin.from("privacy_requests").insert({
        user_id: user.id,
        request_type: "export",
        status: "completed",
        completed_at: new Date().toISOString(),
        export_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        metadata: { delivery: "direct_download", format: "json" },
      });
      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="comeplayers-privacy-export-${new Date().toISOString().slice(0, 10)}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (action === "request_deletion") {
      if (String(body.confirmation || "") !== "DELETE") {
        return NextResponse.json(
          { error: "Type DELETE exactly to confirm the deletion request." },
          { status: 400 }
        );
      }
      const scheduledFor = new Date(Date.now() + DELETE_GRACE_DAYS * 86_400_000).toISOString();
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("privacy_requests")
        .insert({
          user_id: user.id,
          request_type: "delete",
          status: "pending",
          requested_at: now,
          scheduled_for: scheduledFor,
          metadata: { grace_days: DELETE_GRACE_DAYS },
        })
        .select("id,scheduled_for,status")
        .single();
      if (error) throw new Error(error.message);
      await supabaseAdmin
        .from("profiles")
        .update({ privacy_status: "deletion_pending", deletion_requested_at: now, updated_at: now })
        .eq("id", user.id);
      await supabaseAdmin.from("privacy_events").insert({
        request_id: data.id,
        user_id: user.id,
        actor_id: user.id,
        event_type: "deletion_requested",
        details: { scheduled_for: scheduledFor },
      });
      return NextResponse.json({ request: data }, { status: 201 });
    }

    if (action === "cancel_deletion") {
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("privacy_requests")
        .update({ status: "cancelled", cancelled_at: now, updated_at: now })
        .eq("user_id", user.id)
        .eq("request_type", "delete")
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ error: "No pending deletion request." }, { status: 404 });
      await supabaseAdmin
        .from("profiles")
        .update({ privacy_status: "active", deletion_requested_at: null, updated_at: now })
        .eq("id", user.id);
      await supabaseAdmin.from("privacy_events").insert({
        request_id: data.id,
        user_id: user.id,
        actor_id: user.id,
        event_type: "deletion_cancelled",
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported privacy action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Privacy operation failed.";
    const status = /duplicate|unique|pending/i.test(message) ? 409 : authErrorStatus(message);
    return NextResponse.json({ error: message }, { status });
  }
}

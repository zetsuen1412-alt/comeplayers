import { NextResponse } from "next/server";
import { adminErrorStatus, requireAdmin } from "@/lib/adminSecurity";

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || 100);
    const limit = Math.min(Math.max(requestedLimit, 1), 250);

    const { data, error } = await supabaseAdmin
      .from("admin_audit_logs")
      .select(
        `
        id,
        admin_id,
        action,
        entity_type,
        entity_id,
        before_data,
        after_data,
        metadata,
        created_at,
        profiles:admin_id (
          email,
          username,
          seller_name
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return NextResponse.json({ logs: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected audit log error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

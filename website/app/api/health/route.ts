import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let databaseOk = false;
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { error } = await supabaseAdmin.from("game_master").select("id").limit(1);
    databaseOk = !error;
  } catch {
    databaseOk = false;
  }

  const ok = databaseOk;
  return NextResponse.json(
    {
      ok,
      service: "comeplayers-web",
      readiness: databaseOk ? "ready" : "degraded",
      environment: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

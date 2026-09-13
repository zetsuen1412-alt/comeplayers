import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    app: "ok",
    service: "CP-OFS",
    version: "0.4.0",
    demoMode: process.env.CP_OFS_DEMO_MODE !== "false",
    database: process.env.NEXT_PUBLIC_SUPABASE_URL ? "configured" : "not_configured",
  });
}

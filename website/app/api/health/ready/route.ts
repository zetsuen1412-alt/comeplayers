import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function hasInternalAccess(request: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  const authorization = request.headers.get("authorization") || "";
  const provided = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";

  return Boolean(secret && provided && secureEqual(secret, provided));
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_SECRET",
  ].filter((name) => !String(process.env[name] || "").trim());

  let databaseOk = false;
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { error } = await supabaseAdmin.from("game_master").select("id").limit(1);
    if (error) throw new Error(error.message);
    databaseOk = true;
  } catch (error) {
    console.error(
      "Readiness database check failed:",
      error instanceof Error ? error.message : error
    );
  }

  const ok = missing.length === 0 && databaseOk;
  const internal = hasInternalAccess(request);
  const payload: Record<string, unknown> = {
    ok,
    service: "comeplayers-web",
    dependencies: {
      database: databaseOk ? "ready" : "unavailable",
    },
    responseTimeMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };

  if (internal) {
    payload.environment = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
    payload.missingConfiguration = missing;
  }

  return NextResponse.json(payload, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

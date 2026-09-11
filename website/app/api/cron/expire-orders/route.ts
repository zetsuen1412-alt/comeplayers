import { NextResponse } from "next/server";
import { requestId } from "@/lib/observability";
import { runTrackedOperation } from "@/lib/operationalRuns";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(request: Request) {
  const currentRequestId = requestId(request);
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron request." },
      { status: 401, headers: { "x-request-id": currentRequestId } }
    );
  }

  const supabaseAdmin = createSupabaseAdmin();
  try {
    const data = await runTrackedOperation({
      supabaseAdmin,
      jobName: "expire_stock_reservations",
      runKey: `cron:expire-stock:${new Date().toISOString().slice(0, 13)}`,
      source: "cron",
      requestId: currentRequestId,
      execute: async () => {
        const { data: result, error } = await supabaseAdmin.rpc(
          "cp_release_expired_stock_reservations",
          { p_limit: 500 }
        );
        if (error) throw new Error(error.message);
        return result;
      },
      summarize: (result) => ({ result }),
    });

    return NextResponse.json(
      { ok: true, result: data },
      { headers: { "x-request-id": currentRequestId } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Stock expiration cron failed.",
      },
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

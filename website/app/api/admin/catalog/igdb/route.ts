import { NextRequest, NextResponse } from "next/server";
import {
  applyApprovedIgdbCandidates,
  setIgdbCandidateStatus,
  stagePopularIgdbGames,
  syncExistingIgdbGames,
} from "@/lib/igdb/catalog";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

type ActionBody = {
  action?: "stage" | "approve" | "reject" | "apply" | "sync";
  candidateIds?: number[];
  note?: string;
  limit?: number;
  offset?: number;
  gameTypes?: number[];
};

function integer(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

function ids(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map(Number)
        .filter((candidate) => Number.isInteger(candidate) && candidate > 0)
    )
  );
}

export async function GET(request: NextRequest) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "pending";
    const page = Math.max(1, integer(url.searchParams.get("page"), 1, 10_000));
    const limit = Math.max(1, integer(url.searchParams.get("limit"), 30, 100));
    const offset = (page - 1) * limit;
    const allowedStatuses = ["all", "pending", "approved", "rejected", "imported", "error"];
    const safeStatus = allowedStatuses.includes(status) ? status : "pending";

    let candidatesQuery = supabaseAdmin
      .from("igdb_import_candidates")
      .select(
        "id,igdb_id,status,proposed_name,proposed_slug,proposed_summary,proposed_cover_url,proposed_background_url,proposed_release_date,proposed_rating,proposed_genres,proposed_platforms,match_game_id,match_score,match_reason,review_note,reviewed_at,imported_game_id,imported_at,last_error,updated_at",
        { count: "exact" }
      )
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (safeStatus !== "all") {
      candidatesQuery = candidatesQuery.eq("status", safeStatus);
    }

    const [candidatesResult, runsResult, countsResult] = await Promise.all([
      candidatesQuery,
      supabaseAdmin
        .from("igdb_sync_runs")
        .select("*")
        .order("id", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("igdb_import_candidates")
        .select("status")
        .range(0, 9999),
    ]);

    if (candidatesResult.error) throw new Error(candidatesResult.error.message);
    if (runsResult.error) throw new Error(runsResult.error.message);
    if (countsResult.error) throw new Error(countsResult.error.message);

    const counts: Record<string, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      imported: 0,
      error: 0,
    };

    for (const row of countsResult.data || []) {
      const key = String(row.status || "");
      counts[key] = (counts[key] || 0) + 1;
    }

    return NextResponse.json({
      configured: Boolean(
        process.env.TWITCH_CLIENT_ID &&
          process.env.TWITCH_CLIENT_SECRET &&
          process.env.IGDB_SYNC_ENABLED?.toLowerCase() === "true"
      ),
      candidates: candidatesResult.data || [],
      runs: runsResult.data || [],
      counts,
      pagination: {
        page,
        limit,
        count: candidatesResult.count || 0,
        totalPages: Math.max(
          1,
          Math.ceil((candidatesResult.count || 0) / limit)
        ),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "IGDB catalog request failed." },
      { status: adminErrorStatus(error) }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as ActionBody;
    const action = body.action;

    if (!action) throw new Error("Action is required.");

    let result: Record<string, unknown>;

    if (action === "stage") {
      result = await stagePopularIgdbGames({
        supabaseAdmin,
        limit: Math.max(1, integer(body.limit, 50, 100)),
        offset: integer(body.offset, 0, 100_000),
        gameTypes: ids(body.gameTypes).slice(0, 10),
      });
    } else if (action === "approve" || action === "reject") {
      result = await setIgdbCandidateStatus({
        supabaseAdmin,
        candidateIds: ids(body.candidateIds),
        status: action === "approve" ? "approved" : "rejected",
        adminId: user.id,
        note: body.note,
      });
    } else if (action === "apply") {
      result = await applyApprovedIgdbCandidates({
        supabaseAdmin,
        limit: Math.max(1, integer(body.limit, 50, 250)),
      });
    } else if (action === "sync") {
      result = await syncExistingIgdbGames({
        supabaseAdmin,
        limit: Math.max(1, integer(body.limit, 100, 500)),
      });
    } else {
      throw new Error("Unsupported action.");
    }

    await recordAdminAudit({
      adminId: user.id,
      action: `igdb_catalog_${action}`,
      entityType: "igdb_catalog",
      afterData: result,
      metadata: {
        candidateIds: ids(body.candidateIds),
        limit: body.limit || null,
        offset: body.offset || null,
      },
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "IGDB catalog action failed." },
      { status: adminErrorStatus(error) }
    );
  }
}

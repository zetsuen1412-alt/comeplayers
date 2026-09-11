import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";
import { logEvent, requestId } from "@/lib/observability";
import { runFinancialReconciliation } from "@/lib/reconciliationServer";

function integer(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function errorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return adminErrorStatus(error);
}

export async function GET(request: Request) {
  const currentRequestId = requestId(request);

  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "open").toLowerCase();
    const issueLimit = Math.min(500, Math.max(1, integer(url.searchParams.get("limit"), 200)));

    const runsPromise = supabaseAdmin
      .from("reconciliation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30);

    let issueQuery = supabaseAdmin
      .from("reconciliation_issues")
      .select("*")
      .order("last_detected_at", { ascending: false })
      .limit(issueLimit);

    if (["open", "resolved", "ignored"].includes(status)) {
      issueQuery = issueQuery.eq("status", status);
    }

    const [runsResult, issuesResult] = await Promise.all([runsPromise, issueQuery]);
    if (runsResult.error) throw new Error(runsResult.error.message);
    if (issuesResult.error) throw new Error(issuesResult.error.message);

    return NextResponse.json(
      {
        runs: runsResult.data || [],
        issues: issuesResult.data || [],
      },
      { headers: { "x-request-id": currentRequestId } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected reconciliation error.";
    logEvent("error", "admin_reconciliation.read_failed", {
      requestId: currentRequestId,
      error,
    });
    return NextResponse.json(
      { error: message, requestId: currentRequestId },
      { status: errorStatus(error), headers: { "x-request-id": currentRequestId } }
    );
  }
}

export async function POST(request: Request) {
  const currentRequestId = requestId(request);

  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { days?: number };
    const requestKey =
      String(request.headers.get("idempotency-key") || "").trim().slice(0, 160) ||
      `admin:${user.id}:${randomUUID()}`;

    const result = await runFinancialReconciliation({
      supabaseAdmin,
      days: body.days,
      initiatedBy: user.id,
      requestKey,
      source: "admin",
      requestId: currentRequestId,
    });

    await recordAdminAudit({
      adminId: user.id,
      action: "reconciliation.financial_scan",
      entityType: "reconciliation_run",
      entityId: result.run.id,
      metadata: {
        requestKey,
        idempotent: result.idempotent,
        summary: result.run.summary || {},
      },
    });

    return NextResponse.json(result, {
      headers: { "x-request-id": currentRequestId },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected reconciliation error.";
    return NextResponse.json(
      { error: message, requestId: currentRequestId },
      { status: errorStatus(error), headers: { "x-request-id": currentRequestId } }
    );
  }
}

export async function PATCH(request: Request) {
  const currentRequestId = requestId(request);

  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as {
      issueId?: number;
      action?: "resolve" | "ignore" | "reopen";
      note?: string;
    };
    const issueId = Number(body.issueId || 0);
    const action = String(body.action || "").toLowerCase();
    const note = String(body.note || "").trim().slice(0, 1000);

    if (!Number.isInteger(issueId) || issueId <= 0) {
      return NextResponse.json({ error: "Invalid issue ID." }, { status: 400 });
    }
    if (!["resolve", "ignore", "reopen"].includes(action)) {
      return NextResponse.json({ error: "Invalid reconciliation action." }, { status: 400 });
    }
    if (action !== "reopen" && !note) {
      return NextResponse.json(
        { error: "A resolution note is required." },
        { status: 400 }
      );
    }

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("reconciliation_issues")
      .select("*")
      .eq("id", issueId)
      .maybeSingle();
    if (beforeError) throw new Error(beforeError.message);
    if (!before) {
      return NextResponse.json({ error: "Reconciliation issue not found." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const status = action === "resolve" ? "resolved" : action === "ignore" ? "ignored" : "open";
    const { data: issue, error } = await supabaseAdmin
      .from("reconciliation_issues")
      .update({
        status,
        resolved_at: action === "reopen" ? null : now,
        resolved_by: action === "reopen" ? null : user.id,
        resolution_note: action === "reopen" ? null : note,
        updated_at: now,
      })
      .eq("id", issueId)
      .select("*")
      .single();

    if (error || !issue) {
      throw new Error(error?.message || "Failed to update reconciliation issue.");
    }

    await recordAdminAudit({
      adminId: user.id,
      action: `reconciliation.issue_${action}`,
      entityType: "reconciliation_issue",
      entityId: issueId,
      beforeData: before,
      afterData: issue,
      metadata: { note },
    });

    return NextResponse.json(
      { issue },
      { headers: { "x-request-id": currentRequestId } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected reconciliation error.";
    return NextResponse.json(
      { error: message, requestId: currentRequestId },
      { status: errorStatus(error), headers: { "x-request-id": currentRequestId } }
    );
  }
}

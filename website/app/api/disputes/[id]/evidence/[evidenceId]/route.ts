import { NextResponse } from "next/server";
import {
  disputeErrorStatus,
  requireDisputeAccess,
} from "@/lib/disputeServer";

type RouteContext = {
  params: Promise<{ id: string; evidenceId: string }>;
};

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id, evidenceId: evidenceIdParam } = await context.params;
    const disputeId = Number(id);
    const evidenceId = Number(evidenceIdParam);

    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      return NextResponse.json({ error: "Invalid dispute ID." }, { status: 400 });
    }

    if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
      return NextResponse.json({ error: "Invalid evidence ID." }, { status: 400 });
    }

    const access = await requireDisputeAccess(request, disputeId);
    const { data: evidence, error: evidenceError } = await access.supabaseAdmin
      .from("dispute_evidence")
      .select("id,dispute_id,file_name,storage_path,mime_type")
      .eq("id", evidenceId)
      .eq("dispute_id", disputeId)
      .maybeSingle();

    if (evidenceError) throw new Error(evidenceError.message);
    if (!evidence) {
      return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
    }

    const { data, error } = await access.supabaseAdmin.storage
      .from("dispute-evidence")
      .createSignedUrl(String(evidence.storage_path), 120, {
        download: String(evidence.file_name || "evidence"),
      });

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || "Could not create evidence access URL.");
    }

    return NextResponse.json({
      url: data.signedUrl,
      expiresIn: 120,
      fileName: evidence.file_name,
      mimeType: evidence.mime_type,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected evidence access error.";
    return NextResponse.json(
      { error: message },
      { status: disputeErrorStatus(error) }
    );
  }
}

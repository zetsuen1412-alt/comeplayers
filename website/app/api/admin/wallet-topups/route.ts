import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as {
      topupId?: number | string;
      action?: string;
      note?: string;
    };

    const topupId = Number(body.topupId || 0);
    const action = String(body.action || "").trim().toLowerCase();
    const note = String(body.note || "").trim();

    if (!Number.isInteger(topupId) || topupId <= 0) {
      return NextResponse.json({ error: "Invalid wallet top-up ID." }, { status: 400 });
    }

    if (!new Set(["approve", "reject"]).has(action)) {
      return NextResponse.json({ error: "Invalid wallet top-up action." }, { status: 400 });
    }

    if (action === "reject" && !note) {
      return NextResponse.json({ error: "An admin note is required when rejecting a top-up." }, { status: 400 });
    }

    const { data: before } = await supabaseAdmin
      .from("wallet_topups")
      .select("*")
      .eq("id", topupId)
      .maybeSingle();

    const { data, error } = await supabaseAdmin.rpc("cp_admin_process_wallet_topup", {
      p_topup_id: topupId,
      p_admin_id: user.id,
      p_action: action,
      p_note: note || null,
    });

    if (error) throw new Error(error.message);

    const { data: after } = await supabaseAdmin
      .from("wallet_topups")
      .select("*")
      .eq("id", topupId)
      .maybeSingle();

    await recordAdminAudit({
      adminId: user.id,
      action: `wallet_topup.${action}`,
      entityType: "wallet_topup",
      entityId: topupId,
      beforeData: before,
      afterData: after,
      metadata: { note },
    });

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected wallet top-up error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

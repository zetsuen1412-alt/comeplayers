import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

const allowedRoles = new Set(["user", "seller", "admin"]);
const allowedSellerStatuses = new Set([
  "not_applied",
  "pending",
  "approved",
  "rejected",
]);

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as {
      profileId?: string;
      role?: string;
      sellerStatus?: string;
    };

    const profileId = String(body.profileId || "").trim();
    const requestedRole = body.role === undefined ? undefined : String(body.role).trim().toLowerCase();
    const sellerStatus =
      body.sellerStatus === undefined
        ? undefined
        : String(body.sellerStatus).trim().toLowerCase();

    if (!profileId) {
      return NextResponse.json({ error: "Profile ID is required." }, { status: 400 });
    }

    if (requestedRole !== undefined && !allowedRoles.has(requestedRole)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    if (sellerStatus !== undefined && !allowedSellerStatuses.has(sellerStatus)) {
      return NextResponse.json({ error: "Invalid seller status." }, { status: 400 });
    }

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .maybeSingle();

    if (beforeError) throw new Error(beforeError.message);
    if (!before) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

    if (profileId === user.id && requestedRole && requestedRole !== "admin") {
      return NextResponse.json(
        { error: "You cannot remove the admin role from your own account." },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, unknown> = {};

    if (requestedRole !== undefined) {
      updatePayload.role = requestedRole;
    }

    if (sellerStatus !== undefined) {
      updatePayload.seller_status = sellerStatus;
      updatePayload.role =
        String(before.role || "").toLowerCase() === "admin"
          ? "admin"
          : sellerStatus === "approved"
            ? "seller"
            : "user";

      if (sellerStatus === "approved") {
        updatePayload.seller_name =
          before.seller_name || before.username || before.email || "ComePlayers Seller";
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No profile changes were supplied." }, { status: 400 });
    }

    const { data: after, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update(updatePayload)
      .eq("id", profileId)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);

    await recordAdminAudit({
      adminId: user.id,
      action: sellerStatus !== undefined ? "user.seller_status.update" : "user.role.update",
      entityType: "profile",
      entityId: profileId,
      beforeData: before,
      afterData: after,
    });

    return NextResponse.json({ ok: true, profile: after });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected user update error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

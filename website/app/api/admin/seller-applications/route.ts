import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

const allowedActions = new Set(["approve", "reject", "reset"]);

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as {
      applicationId?: number | string;
      action?: string;
      note?: string;
    };

    const applicationId = Number(body.applicationId || 0);
    const action = String(body.action || "").trim().toLowerCase();
    const note = String(body.note || "").trim();

    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      return NextResponse.json({ error: "Invalid seller application ID." }, { status: 400 });
    }

    if (!allowedActions.has(action)) {
      return NextResponse.json({ error: "Invalid seller application action." }, { status: 400 });
    }

    if (action === "reject" && !note) {
      return NextResponse.json({ error: "A rejection note is required." }, { status: 400 });
    }

    const { data: application, error: applicationError } = await supabaseAdmin
      .from("seller_applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();

    if (applicationError) throw new Error(applicationError.message);
    if (!application) {
      return NextResponse.json({ error: "Seller application not found." }, { status: 404 });
    }

    const { data: profileBefore, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", application.user_id)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending";
    const finalNote =
      note ||
      (action === "approve"
        ? "Seller application approved."
        : action === "reset"
          ? "Seller application reset to pending review."
          : "Seller application rejected.");

    const applicationUpdate = {
      status,
      notes: finalNote,
    };

    const profileUpdate: Record<string, unknown> = {
      seller_status: status,
      seller_name: application.seller_name,
      discord: application.discord,
    };

    if (action === "approve") {
      profileUpdate.role = String(profileBefore?.role || "").toLowerCase() === "admin" ? "admin" : "seller";
      profileUpdate.bio = "Verified ComePlayers marketplace seller.";
    } else if (action === "reject") {
      profileUpdate.role = String(profileBefore?.role || "").toLowerCase() === "admin" ? "admin" : "user";
      profileUpdate.bio = "Seller application rejected. Please contact support for more information.";
    } else {
      profileUpdate.role = String(profileBefore?.role || "").toLowerCase() === "admin" ? "admin" : "user";
      profileUpdate.bio = "Seller application submitted. Waiting for approval.";
    }

    const { data: applicationAfter, error: updateApplicationError } = await supabaseAdmin
      .from("seller_applications")
      .update(applicationUpdate)
      .eq("id", applicationId)
      .select("*")
      .single();

    if (updateApplicationError) throw new Error(updateApplicationError.message);

    const { data: profileAfter, error: updateProfileError } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", application.user_id)
      .select("*")
      .single();

    if (updateProfileError) {
      await supabaseAdmin
        .from("seller_applications")
        .update({ status: application.status, notes: application.notes })
        .eq("id", applicationId);
      throw new Error(updateProfileError.message);
    }

    const notification =
      action === "approve"
        ? {
            type: "seller_approved",
            title: "Seller Application Approved",
            message: "Your seller application has been approved. You can now access the Seller Dashboard.",
            link_url: "/seller",
          }
        : action === "reject"
          ? {
              type: "seller_rejected",
              title: "Seller Application Rejected",
              message: finalNote,
              link_url: "/seller/apply",
            }
          : {
              type: "seller_pending",
              title: "Seller Application Reset",
              message: "Your seller application has been reset to pending review.",
              link_url: "/seller/verification",
            };

    await supabaseAdmin.from("notifications").insert({
      user_id: application.user_id,
      ...notification,
      is_read: false,
    });

    await recordAdminAudit({
      adminId: user.id,
      action: `seller_application.${action}`,
      entityType: "seller_application",
      entityId: applicationId,
      beforeData: { application, profile: profileBefore },
      afterData: { application: applicationAfter, profile: profileAfter },
      metadata: { note: finalNote },
    });

    return NextResponse.json({
      ok: true,
      application: applicationAfter,
      profile: profileAfter,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected seller application error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

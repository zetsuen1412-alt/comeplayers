import type { User } from "@supabase/supabase-js";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const ACTIVE_DISPUTE_STATUSES = new Set([
  "open",
  "investigating",
  "awaiting_buyer",
  "awaiting_seller",
]);

export const FINAL_DISPUTE_STATUSES = new Set([
  "buyer_win",
  "seller_win",
  "closed",
]);

type DisputeAccess = {
  user: User;
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  profile: Record<string, unknown> | null;
  dispute: Record<string, unknown>;
  isAdmin: boolean;
  role: "admin" | "buyer" | "seller" | "participant";
};

function accessError(message: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
}

export function disputeErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if (Number.isFinite(status) && status >= 400 && status <= 599) {
      return status;
    }
  }

  const message = error instanceof Error ? error.message : "";
  if (/authentication|token|login/i.test(message)) return 401;
  if (/not allowed|forbidden|access required/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/invalid|required|must|unsupported|eligible|closed|resolved|maximum|minimum/i.test(message)) {
    return 400;
  }
  return 500;
}

export async function requireDisputeAccess(
  request: Request,
  disputeId: number
): Promise<DisputeAccess> {
  const user = await requireAuthenticatedUser(request);
  const supabaseAdmin = createSupabaseAdmin();

  const [{ data: profile, error: profileError }, { data: dispute, error: disputeError }] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id,email,username,role,seller_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("disputes")
        .select("*")
        .eq("id", disputeId)
        .maybeSingle(),
    ]);

  if (profileError) throw new Error(profileError.message);
  if (disputeError) throw new Error(disputeError.message);
  if (!dispute) throw accessError("Dispute not found.", 404);

  const isAdmin = String(profile?.role || "").trim().toLowerCase() === "admin";
  const isBuyer = String(dispute.buyer_id || "") === user.id;
  const isSeller = String(dispute.seller_id || "") === user.id;
  const isOpenedBy = String(dispute.opened_by || "") === user.id;

  if (!isAdmin && !isBuyer && !isSeller && !isOpenedBy) {
    throw accessError("You are not allowed to access this dispute.", 403);
  }

  return {
    user,
    supabaseAdmin,
    profile: (profile || null) as Record<string, unknown> | null,
    dispute: dispute as Record<string, unknown>,
    isAdmin,
    role: isAdmin
      ? "admin"
      : isBuyer
        ? "buyer"
        : isSeller
          ? "seller"
          : "participant",
  };
}

export async function notifyDisputeParty(input: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  userId?: string | null;
  title: string;
  message: string;
  disputeId: number;
}) {
  if (!input.userId) return;

  const { error } = await input.supabaseAdmin.from("notifications").insert({
    user_id: input.userId,
    type: "dispute",
    title: input.title,
    message: input.message,
    link_url: `/resolution-center/${input.disputeId}`,
    is_read: false,
  });

  if (error) {
    console.error("Dispute notification failed:", error.message);
  }
}

export function disputeRoleForUser(
  dispute: Record<string, unknown>,
  userId: string,
  isAdmin: boolean
) {
  if (isAdmin) return "admin";
  if (String(dispute.buyer_id || "") === userId) return "buyer";
  if (String(dispute.seller_id || "") === userId) return "seller";
  return "participant";
}

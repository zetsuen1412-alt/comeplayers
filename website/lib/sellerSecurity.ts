import type { User } from "@supabase/supabase-js";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export type SellerContext = {
  user: User;
  profile: Record<string, unknown>;
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
};

export function isApprovedSellerProfile(profile: Record<string, unknown> | null | undefined) {
  const role = String(profile?.role || "").trim().toLowerCase();
  const sellerStatus = String(profile?.seller_status || "")
    .trim()
    .toLowerCase();

  return role === "admin" || sellerStatus === "approved";
}

export async function requireApprovedSeller(
  request: Request
): Promise<SellerContext> {
  const user = await requireAuthenticatedUser(request);
  const supabaseAdmin = createSupabaseAdmin();

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!isApprovedSellerProfile(profile)) {
    const accessError = new Error("Approved seller access required.");
    Object.assign(accessError, { status: 403 });
    throw accessError;
  }

  return {
    user,
    profile: (profile || {}) as Record<string, unknown>,
    supabaseAdmin,
  };
}

export function sellerErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if (Number.isFinite(status) && status >= 400 && status <= 599) {
      return status;
    }
  }

  const message = error instanceof Error ? error.message : "";

  if (/authentication|token/i.test(message)) return 401;
  if (/seller access|required|forbidden/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (
    /invalid|required|minimum|maximum|insufficient|active|pending|cannot|limit|missing|incorrect|locked|cooldown|exceeded|mfa|blocked|predictable|digits/i.test(
      message
    )
  ) {
    return 400;
  }

  return 500;
}

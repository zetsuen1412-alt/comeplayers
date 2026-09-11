import type { User } from "@supabase/supabase-js";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type AdminContext = {
  user: User;
  profile: Record<string, unknown>;
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
};

export async function requireAdmin(request: Request): Promise<AdminContext> {
  const user = await requireAuthenticatedUser(request);
  const supabaseAdmin = createSupabaseAdmin();

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (String(profile?.role || "").trim().toLowerCase() !== "admin") {
    const accessError = new Error("Admin access required.");
    Object.assign(accessError, { status: 403 });
    throw accessError;
  }

  return {
    user,
    profile: (profile || {}) as Record<string, unknown>,
    supabaseAdmin,
  };
}

export function adminErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if (Number.isFinite(status) && status >= 400 && status <= 599) return status;
  }

  const message = error instanceof Error ? error.message : "";

  if (/authentication|token/i.test(message)) return 401;
  if (/admin access|required|forbidden/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/invalid|required|unsupported|only pending|must|cannot|exceed|missing|greater|lower|after|positive|reference/i.test(message)) return 400;
  return 500;
}

export async function recordAdminAudit(input: {
  adminId: string;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { error } = await supabaseAdmin.from("admin_audit_logs").insert({
      admin_id: input.adminId,
      action: input.action,
      entity_type: input.entityType,
      entity_id:
        input.entityId === null || input.entityId === undefined
          ? null
          : String(input.entityId),
      before_data: input.beforeData ?? null,
      after_data: input.afterData ?? null,
      metadata: input.metadata || {},
    });

    if (error) {
      console.error("Admin audit log insert failed:", error.message);
    }
  } catch (error) {
    console.error("Admin audit log error:", error);
  }
}

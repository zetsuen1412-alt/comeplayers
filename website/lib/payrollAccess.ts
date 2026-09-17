import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { payrollFailure } from "@/features/payroll/lib/workspace-model";

export type PayrollActor = { id: string; name: string; email: string; isAdmin: boolean };
export async function requirePayrollAccess(request: Request) {
  const user = await requireAuthenticatedUser(request);
  const supabaseAdmin = createSupabaseAdmin();
  const { data: profile, error } = await supabaseAdmin.from("profiles").select("id,role,username,full_name,email").eq("id", user.id).maybeSingle();
  if (error) throw error;
  const isAdmin = String(profile?.role || "").trim().toLowerCase() === "admin";
  if (!profile) payrollFailure("Akses payroll tidak diberikan untuk akun ini.", 403);
  if (!isAdmin) {
    const { data: access, error: accessError } = await supabaseAdmin.from("cp_payroll_access").select("active").eq("user_id", user.id).maybeSingle();
    if (accessError) throw accessError;
    if (!access?.active) payrollFailure("Akses payroll tidak diberikan atau telah dicabut. Hubungi admin.", 403);
  }
  const actor: PayrollActor = { id: user.id, name: String(profile.username || profile.full_name || profile.email || user.id), email: String(profile.email || ""), isAdmin };
  return { user, profile, actor, supabaseAdmin };
}

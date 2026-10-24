import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { workspaceKeys } from "@/features/payroll/lib/workspace-model";
import type { Employee } from "@/features/payroll/types/domain";

export async function requireMonitorAccess(request: Request) {
  const user = await requireAuthenticatedUser(request), supabaseAdmin = createSupabaseAdmin();
  const { data: profile, error } = await supabaseAdmin.from("profiles")
    .select("id,role,username,full_name,email").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!profile) throw Object.assign(new Error("Akses Monitor ditolak."), { status: 403 });
  const actor = { id: user.id, name: String(profile.username || profile.full_name || ""),
    email: String(profile.email || ""), isAdmin: String(profile.role).trim().toLowerCase() === "admin" };
  let employeeCode = "", employeeId = "";
  if (!actor.isAdmin) {
    const [binding, workspace] = await Promise.all([
      supabaseAdmin.from("cp_fh3_monitor_accounts").select("employee_id,employee_code,active").eq("user_id", user.id).maybeSingle(),
      supabaseAdmin.from("cp_payroll_workspace").select("payload").eq("id", 1).single(),
    ]);
    if (binding.error || workspace.error) throw binding.error ?? workspace.error;
    const roster = workspace.data?.payload?.[workspaceKeys.employees] as Employee[] | undefined;
    const employee = roster?.find(e => e.id === binding.data?.employee_id && e.code === binding.data?.employee_code
      && e.team === "FH3" && ["NEW", "SHIFT", "FULL"].includes(e.workforceStatus) && !e.sheetRosterMissingAt);
    const unique = employee && roster?.filter(e=>e.id===employee.id).length===1 && roster?.filter(e=>e.code===employee.code).length===1;
    if (!binding.data?.active || !employee || !unique) throw Object.assign(new Error("Akun belum dihubungkan atau telah dinonaktifkan oleh admin."), { status: 403 });
    employeeCode = employee.code; employeeId = employee.id;
  }
  return { user, profile, actor, supabaseAdmin, employeeCode, employeeId };
}

export function requireOwnEmployee(context: { actor: { isAdmin: boolean }; employeeCode: string }, code: string) {
  if (!context.actor.isAdmin && context.employeeCode !== code)
    throw Object.assign(new Error("Karyawan hanya boleh mengerjakan order miliknya."), { status: 403 });
}

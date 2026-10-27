import { createSupabaseAdmin, createSupabaseUserClient, getBearerToken, requireAccountIdentity, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { singleDeviceSessionsEnabled } from "@/lib/auth/accountSessionConfig";
import { workspaceKeys } from "@/features/payroll/lib/workspace-model";
import type { Employee } from "@/features/payroll/types/domain";
import { openMonitorContext } from './monitorOpenWorkspace';
import { loadMonitorWorkspace } from './monitorWorkspaceSnapshot';

export async function requireMonitorAccess(request: Request, options: { activateSession?: boolean; signal?: AbortSignal; allowPublic?: boolean; rosterOnly?: boolean } = {}) {
  if (options.allowPublic) {
    const open = await openMonitorContext(request, options.signal);
    if (open) return open;
  }
  // Identity/MFA is always verified. Only an explicitly bound shared Monitor
  // account may bypass the website's one-device claim, and only on Monitor APIs.
  const user = await requireAccountIdentity(request, options), supabaseAdmin = createSupabaseAdmin(options);
  const { data: profile, error } = await supabaseAdmin.from("profiles")
    .select("id,role,username,full_name,email").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!profile) throw Object.assign(new Error("Akses Monitor ditolak."), { status: 403 });
  const actor = { id: user.id, name: String(profile.username || profile.full_name || ""),
    email: String(profile.email || ""), isAdmin: String(profile.role).trim().toLowerCase() === "admin" };
  let employeeCode = "", employeeId = "";
  let accessScope: "admin" | "employee" | "shared" = actor.isAdmin ? "admin" : "employee";
  let operableEmployeeCodes: string[] = [];
  // Reuse only within this request. Authorization still reads identity, binding,
  // roster and session state afresh; nothing is shared between users/requests.
  let workspaceSnapshot: { payload: Record<string, unknown>; revision: number; updated_at: string } | undefined;
  if (!actor.isAdmin) {
    const [binding, workspace] = await Promise.all([
      supabaseAdmin.from("cp_fh3_monitor_accounts").select("employee_id,employee_code,active,access_scope").eq("user_id", user.id).maybeSingle(),
      loadMonitorWorkspace(supabaseAdmin, !options.rosterOnly),
    ]);
    if (binding.error) throw binding.error;
    workspaceSnapshot = workspace;
    const roster = workspace.payload?.[workspaceKeys.employees] as Employee[] | undefined;
    const eligible = roster?.filter(e => e.team === "FH3" && ["NEW", "SHIFT", "FULL"].includes(e.workforceStatus)
      && !e.sheetRosterMissingAt && roster.filter(x => x.id === e.id).length === 1
      && roster.filter(x => x.code === e.code).length === 1) ?? [];
    const account = binding.data;
    if (!account?.active) throw Object.assign(new Error("Akun belum dihubungkan atau telah dinonaktifkan oleh admin."), { status: 403 });
    if (account.access_scope === "shared" && account.employee_id === null && account.employee_code === null) {
      accessScope = "shared";
      operableEmployeeCodes = eligible.map(e => e.code);
    } else {
      const employee = eligible.find(e => e.id === account.employee_id && e.code === account.employee_code);
      if ((account.access_scope ?? "employee") !== "employee" || !employee)
        throw Object.assign(new Error("Akun belum dihubungkan atau telah dinonaktifkan oleh admin."), { status: 403 });
      employeeCode = employee.code; employeeId = employee.id;
      operableEmployeeCodes = [employeeCode];
    }
  }
  if (accessScope === "shared") {
    // Read session_id only after getUser has validated this same bearer token.
    let sessionId = "";
    try { sessionId = JSON.parse(Buffer.from(getBearerToken(request).split(".")[1], "base64url").toString()).session_id; } catch { /* reject below */ }
    if (typeof sessionId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(sessionId))
      throw Object.assign(new Error("Sesi Monitor tidak valid."), { status: 401 });
    const { data, error } = await supabaseAdmin.rpc("cp_monitor_shared_session_active", { p_actor: actor.id, p_session: sessionId });
    if (error) throw error;
    if (data !== true) throw Object.assign(new Error("Sesi Monitor telah berakhir."), { status: 401 });
  } else {
    if (options.activateSession && singleDeviceSessionsEnabled()) {
      const { data, error } = await createSupabaseUserClient(getBearerToken(request), options).rpc("cp_claim_account_session");
      if (error) throw Object.assign(new Error("Pemeriksaan sesi belum tersedia."), { status: 503 });
      if (!data?.active) throw Object.assign(new Error("Sesi akun belum aktif."), { status: 403 });
    }
    await requireAuthenticatedUser(request, options);
  }
  return { user, profile, actor, supabaseAdmin, employeeCode, employeeId, accessScope,
    canOperateAll: accessScope === "shared", operableEmployeeCodes, workspaceSnapshot };
}

export function requireOwnEmployee(context: { actor: { isAdmin: boolean }; employeeCode: string;
  canOperateAll?: boolean; operableEmployeeCodes?: string[] }, code: string) {
  if (!context.actor.isAdmin && (!code || (!(context.canOperateAll && context.operableEmployeeCodes?.includes(code)) && context.employeeCode !== code)))
    throw Object.assign(new Error("Karyawan hanya boleh mengerjakan order miliknya."), { status: 403 });
}

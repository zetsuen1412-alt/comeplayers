import { requireMonitorAccess } from "@/lib/monitorAccess";
import { monitorBody, monitorError, monitorReply } from "@/lib/monitorHttp";
import { workspaceKeys } from "@/features/payroll/lib/workspace-model";
import type { Employee } from "@/features/payroll/types/domain";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const {actor,supabaseAdmin}=await requireMonitorAccess(request);
    if(!actor.isAdmin) return monitorReply({error:"Khusus admin."},403);
    const {data,error}=await supabaseAdmin.from("cp_fh3_monitor_accounts")
      .select("user_id,employee_code,access_scope,active,profile:profiles!cp_fh3_monitor_accounts_user_id_fkey(username)").order("employee_code");
    if(error) throw error; return monitorReply({accounts:data});
  } catch(e) { return monitorError(e); }
}
export async function POST(request: Request) {
  try {
    const {actor,supabaseAdmin}=await requireMonitorAccess(request);
    if(!actor.isAdmin) return monitorReply({error:"Khusus admin."},403);
    const b=await monitorBody(request),username=String(b.username ?? "").trim().toLowerCase();
    const scope=b.accessScope ?? "employee";
    if(!/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(username) || typeof scope!=="string" || !["employee","shared"].includes(scope)
      || (scope==="employee" && (typeof b.employeeCode!=="string" || !/^[\w-]{1,100}$/.test(b.employeeCode)))
      || (scope==="shared" && b.employeeCode != null && b.employeeCode!=="") || typeof b.active!=="boolean")
      return monitorReply({error:"Isi username, jenis akses, karyawan bila diperlukan, dan status akun yang valid."},400);
    if(b.create===true) {
      if(typeof b.email!=="string" || b.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)
        || typeof b.password!=="string" || b.password.length<12 || b.password.length>128)
        return monitorReply({error:"Akun baru membutuhkan email dan password minimal 12 karakter."},400);
      const exists=await supabaseAdmin.from("profiles").select("id").ilike("username",username.replace(/_/g,"\\_")).maybeSingle();
      if(exists.error) throw exists.error;
      if(exists.data) return monitorReply({error:"Username sudah dipakai. Gunakan Hubungkan akun yang ada."},409);
      if(scope==="employee") {
        const workspace=await supabaseAdmin.from("cp_payroll_workspace").select("payload").eq("id",1).single();
        if(workspace.error) throw workspace.error;
        const roster=workspace.data?.payload?.[workspaceKeys.employees] as Employee[] | undefined;
        if(!roster?.some(e=>e.code===b.employeeCode && e.team==="FH3" && ["NEW","SHIFT","FULL"].includes(e.workforceStatus) && !e.sheetRosterMissingAt))
          return monitorReply({error:"Karyawan FH3 tidak aktif."},400);
        const binding=await supabaseAdmin.from("cp_fh3_monitor_accounts").select("user_id").eq("employee_code",b.employeeCode).maybeSingle();
        if(binding.error) throw binding.error;
        if(binding.data) return monitorReply({error:"Karyawan sudah memiliki akun. Hubungkan atau aktifkan akun yang sudah ada."},409);
      }
      const {data:created,error}=await supabaseAdmin.auth.admin.createUser({email:b.email.trim(),password:b.password,
        email_confirm:true,user_metadata:{username}});
      if(error) return monitorReply({error:"Akun belum dapat dibuat. Email/username mungkin sudah terdaftar."},409);
      // The production Auth trigger generates a username from email; metadata is deliberately ignored.
      // Use the platform's guarded username RPC after provisioning, never grant an admin role.
      const renamed=await supabaseAdmin.rpc("cp_change_username_once",{p_user:created.user.id,p_username:username});
      if(renamed.error) {
        const profile=await supabaseAdmin.from("profiles").select("username").eq("id",created.user.id).maybeSingle();
        return monitorReply({error:`Akun dibuat dengan username ${profile.data?.username ?? "dari email"}, tetapi belum terhubung. Gunakan Hubungkan akun yang ada.`},409);
      }
    }
    const {data:profile,error:lookup}=await supabaseAdmin.from("profiles").select("id,role")
      .ilike("username",username.replace(/_/g,"\\_")).maybeSingle();
    if(lookup) throw lookup;
    if(!profile) return monitorReply({error:"Username belum ditemukan. Buat akun ComePlayers terlebih dahulu, lalu hubungkan."},404);
    const {data,error}=await supabaseAdmin.rpc("cp_monitor_set_account_scope",{p_actor:actor.id,p_user:profile.id,
      p_scope:scope,p_code:scope==="shared"?null:b.employeeCode,p_active:b.active});
    if(error) throw error; return monitorReply(data);
  } catch(e) { return monitorError(e); }
}

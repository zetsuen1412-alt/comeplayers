import { adminErrorStatus } from "@/lib/adminSecurity";
import { requirePayrollAccess } from "@/lib/payrollAccess";
import { diffWorkspace } from "@/features/payroll/lib/audit-model";
import { payrollFailure } from "@/features/payroll/lib/workspace-model";
export const dynamic = "force-dynamic";
const response = (data:unknown,status=200) => Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request) {
  try {
    const {supabaseAdmin} = await requirePayrollAccess(request);
    const params = new URL(request.url).searchParams;
    const revision = params.get("revision"), before = params.get("before");
    for (const value of [revision,before]) if (value !== null && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) payrollFailure("Revisi tidak valid.");
    if (revision) {
      const offset = Number(params.get("offset") || 0);
      if (!Number.isSafeInteger(offset) || offset < 0) payrollFailure("Halaman tidak valid.");
      const {data,error} = await supabaseAdmin.from("cp_payroll_workspace_audit").select("before_data,after_data").eq("revision",Number(revision)).maybeSingle();
      if(error) throw error;
      if(!data) payrollFailure("History tidak ditemukan.",404);
      const changes = diffWorkspace(data.before_data,data.after_data);
      return response({changes:changes.slice(offset,offset+30),total:changes.length,nextOffset:offset+30<changes.length?offset+30:null});
    }
    let query = supabaseAdmin.from("cp_payroll_workspace_audit").select("revision,actor_id,actor_name,actor_email,action,changed_keys,created_at").order("revision",{ascending:false}).limit(26);
    if(before) query=query.lt("revision",Number(before));
    const {data,error}=await query;
    if(error) throw error;
    const rows=data || [], page=rows.slice(0,25);
    return response({entries:page,nextCursor:rows.length>25?page.at(-1)?.revision:null});
  } catch(error) {const status=adminErrorStatus(error);return response({error:status>=500?"History belum dapat dimuat.":error instanceof Error?error.message:"Permintaan tidak valid."},status);}
}

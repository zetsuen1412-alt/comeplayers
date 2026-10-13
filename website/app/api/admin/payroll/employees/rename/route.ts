import { requirePayrollAccess } from "@/lib/payrollAccess";
import { prepareEmployeeNameCorrection } from "@/features/payroll/lib/employee-name-correction";
import { payrollFailure, validateWorkspace, validateWorkspaceEdit, workspaceKeys, type WorkspaceState } from "@/features/payroll/lib/workspace-model";
import type { Employee } from "@/features/payroll/types/domain";
import { adminErrorStatus } from "@/lib/adminSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: {"Cache-Control":"no-store"} });
export async function POST(request: Request) {
  try {
    const {user, actor, supabaseAdmin} = await requirePayrollAccess(request);
    if (!actor.isAdmin) payrollFailure("Hanya administrator yang boleh memperbaiki nama karyawan.", 403);
    const text = await request.text();
    if (text.length > 4000) payrollFailure("Permintaan terlalu panjang.", 413);
    let body: {employeeId?:unknown; expectedName?:unknown; newName?:unknown};
    try {body = JSON.parse(text);} catch {payrollFailure("Permintaan tidak valid.");}
    if (!body || typeof body.employeeId !== "string" || typeof body.expectedName !== "string"
      || typeof body.newName !== "string") payrollFailure("Isi karyawan dan nama yang valid.");
    for (let attempt=0;attempt<3;attempt++) {
      const {data:current,error:readError} = await supabaseAdmin.from("cp_payroll_workspace")
        .select("payload,revision").eq("id",1).single();
      if (readError) throw readError;
      const previous = current.payload as WorkspaceState;
      if (previous[workspaceKeys.lock]) payrollFailure("Payroll sedang dikunci untuk Closing. Buka kunci sebelum mengubah nama.",423);
      const changed = prepareEmployeeNameCorrection(previous, body.employeeId, body.expectedName, body.newName,
        {id:user.id,name:actor.name},new Date().toISOString(),crypto.randomUUID());
      validateWorkspace(changed.state);
      validateWorkspaceEdit(previous, changed.state, "admin");
      const {data:saved,error} = await supabaseAdmin.rpc("cp_save_payroll_workspace",{
        p_revision:current.revision,p_payload:changed.state,p_actor:user.id,p_action:"save",
      });
      if (error?.code==="40001" && attempt<2)continue;
      if (error?.code==="40001") payrollFailure("Data karyawan berubah bersamaan. Muat ulang halaman.",409);
      if (error)throw error;
      return response({ok:true,pendingSheet:changed.pendingSheet,
        employeeId:changed.employee.id, name:changed.employee.name,
        requestedName:changed.employee.sheetNameCorrection?.newName,
        revision:saved?.revision});
    }
    payrollFailure("Perubahan belum berhasil. Silakan coba lagi.",409);
  } catch (error) {
    const status = adminErrorStatus(error);
    return response({error:status>=500?"Gagal menyimpan perubahan karyawan.":error instanceof Error?error.message:"Permintaan tidak valid."},status);
  }
}

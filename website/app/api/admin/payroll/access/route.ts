import { requireAdmin, adminErrorStatus } from "@/lib/adminSecurity";
import { payrollFailure } from "@/features/payroll/lib/workspace-model";
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
function failure(error:unknown){const status=adminErrorStatus(error);return response({error:status>=500?"Pengaturan akses belum tersedia.":error instanceof Error?error.message:"Permintaan tidak valid."},status);}
export async function GET(request:Request) {
  try {
    const {supabaseAdmin}=await requireAdmin(request);
    const params=new URL(request.url).searchParams, search=(params.get("q") || "").trim();
    if(search) {
      if(search.length<3||search.length>150)payrollFailure("Masukkan minimal 3 dan maksimal 150 karakter.");
      // Quote PostgREST literals and escape LIKE wildcards; search never changes roles.
      const pattern='"%'+search.replace(/[\\%_]/g,"\\$&").replace(/"/g,'\\"')+'%"';
      const {data,error}=await supabaseAdmin.from("profiles").select("id,username,full_name,email,role").or("username.ilike."+pattern+",email.ilike."+pattern).limit(10);
      if(error)throw error;
      return response({users:data || []});
    }
    const [{data:members,error},{data:events,error:eventError}]=await Promise.all([
      supabaseAdmin.from("cp_payroll_access").select("user_id,active,created_at,updated_at,profile:profiles!cp_payroll_access_user_id_fkey(id,username,full_name,email,role)").order("updated_at",{ascending:false}).limit(200),
      supabaseAdmin.from("cp_payroll_access_audit").select("id,actor_id,actor_name,target_id,target_name,before_active,after_active,created_at").order("id",{ascending:false}).limit(30),
    ]);
    if(error||eventError)throw error||eventError;
    return response({members:members || [],events:events || []});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try {
    const {user,supabaseAdmin}=await requireAdmin(request);
    const text=await request.text();
    if(text.length>2000)payrollFailure("Permintaan terlalu besar.",413);
    const body=JSON.parse(text);
    if(!body||typeof body.active!=="boolean"||typeof body.userId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId))payrollFailure("Akun atau izin tidak valid.");
    const {data,error}=await supabaseAdmin.rpc("cp_set_payroll_access",{p_actor:user.id,p_target:body.userId,p_active:body.active});
    if(error){if(error.code==="42501")payrollFailure("Akses admin diperlukan.",403);if(error.code==="22023")payrollFailure("Akun tidak ditemukan atau memiliki akses admin bawaan.");throw error;}
    return response({ok:true,...data});
  }catch(error){if(error instanceof SyntaxError)return response({error:"JSON tidak valid."},400);return failure(error);}
}

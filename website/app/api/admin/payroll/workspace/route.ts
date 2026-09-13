import { requireAdmin, adminErrorStatus } from '@/lib/adminSecurity';
import { closeWorkspace, payrollFailure, validateWorkspace, validateWorkspaceEdit } from '@/features/payroll/lib/workspace-model';
export const dynamic='force-dynamic';
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown) { const status=adminErrorStatus(error);return response({error:status>=500?'Layanan payroll belum tersedia. Silakan coba lagi.':error instanceof Error?error.message:'Permintaan tidak valid.'},status); }
export async function GET(request:Request) {
  try {
    const {supabaseAdmin}=await requireAdmin(request);
    const {data,error}=await supabaseAdmin.from('cp_payroll_workspace').select('payload,revision,updated_at').eq('id',1).single();
    if(error)throw error;
    return response({state:data.payload,revision:data.revision,updatedAt:data.updated_at});
  }catch(error){return failure(error);}
}
async function readBody(request:Request) {
  const reader=request.body?.getReader();if(!reader)payrollFailure('Permintaan kosong.');
  const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3_500_000){await reader.cancel();payrollFailure('Data payroll terlalu besar.',413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{payrollFailure('JSON tidak valid.');}
}
export async function POST(request:Request) {
  try {
    const {user,supabaseAdmin}=await requireAdmin(request);
    const body=await readBody(request);
    if(!body||!['save','close'].includes(body.action)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)payrollFailure('Permintaan payroll tidak valid.');
    const {data:current,error:readError}=await supabaseAdmin.from('cp_payroll_workspace').select('payload,revision').eq('id',1).single();
    if(readError)throw readError;
    if(current.revision!==body.expectedRevision)payrollFailure('Data diubah admin lain atau penyimpanan sebelumnya sudah berhasil. Muat ulang sebelum melanjutkan.',409);
    const closing=body.action==='close'?closeWorkspace(current.payload):null;
    const state=closing?.state??validateWorkspace(body.state);
    if(!closing)validateWorkspaceEdit(current.payload,state);
    const {data,error}=await supabaseAdmin.rpc('cp_save_payroll_workspace',{p_revision:body.expectedRevision,p_payload:state,p_actor:user.id,p_action:body.action});
    if(error){if(error.code==='40001')payrollFailure('Data diubah admin lain. Muat ulang sebelum melanjutkan.',409);throw error;}
    return response({...data,...(closing?{record:closing.record,payroll:closing.payroll,orders:closing.orders}:{})});
  }catch(error){return failure(error);}
}

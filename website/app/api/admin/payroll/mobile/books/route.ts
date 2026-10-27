import { requireMonitorAccess } from "@/lib/monitorAccess";
import { monitorBookData } from "@/lib/monitorManagement";
import { monitorBody, monitorError, monitorReply } from "@/lib/monitorHttp";
import { withMonitorSessionDeadline } from '@/lib/monitorSessionDeadline';
export const maxDuration = 25;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return await withMonitorSessionDeadline(async signal => {
    const {supabaseAdmin,workspaceSnapshot}=await requireMonitorAccess(request, { allowPublic: true, signal });
    // Owner-approved team visibility includes open worker mode for this ledger.
    // Existing website Payroll salaries/Closing are never included.
    const data=await monitorBookData(supabaseAdmin,"",false,workspaceSnapshot);
    return monitorReply({schema:1,scope:"FH3",visibility:"team",open:data.open,closings:data.closings,
      notice:"Upah bersih diisi admin. Data Tutup Buku adalah arsip penghasilan, bukan bukti pembayaran."});
    }, 18_000);
  } catch(e) { return monitorError(e); }
}
export async function POST(request: Request) {
  try {
    const {actor,supabaseAdmin}=await requireMonitorAccess(request);
    if(!actor.isAdmin) return monitorReply({error:"Khusus admin."},403);
    const b=await monitorBody(request);
    if(typeof b.id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id)
      || typeof b.title!=="string" || b.title.trim().length<3 || b.title.length>100
      || !Array.isArray(b.expected) || b.expected.length>500) return monitorReply({error:"Data Tutup Buku tidak valid."},400);
    const {data,error}=await supabaseAdmin.rpc("cp_monitor_close_book",{p_actor:actor.id,p_id:b.id,p_title:b.title,p_expected:b.expected});
    if(error) throw error; return monitorReply(data);
  } catch(e) { return monitorError(e); }
}

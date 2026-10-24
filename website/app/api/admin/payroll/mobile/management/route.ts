import { requireMonitorAccess } from "@/lib/monitorAccess";
import { monitorBookData } from "@/lib/monitorManagement";
import { monitorBody, monitorError, monitorReply } from "@/lib/monitorHttp";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requireMonitorAccess(request);
    if (!actor.isAdmin) return monitorReply({error:"Khusus admin."},403);
    const data = await monitorBookData(supabaseAdmin,"",true);
    const done = new Map(data.open.map(row=>[row.orderRef,row]));
    const orders = data.evidence.receipts.map(receipt=> {
      const c=data.controls.get(receipt.order_ref),job=data.jobs.get(receipt.order_ref),complete=done.get(receipt.order_ref),closed=data.closed.get(receipt.order_ref);
      return { orderRef:receipt.order_ref,game:receipt.game,discord:receipt.discord ?? "",task:receipt.task,
        employeeName:closed?.employee_name ?? complete?.employeeName ?? job?.employee_name ?? "—",
        status:closed ? "Tutup Buku" : complete ? "Selesai" : job?.status ?? (receipt.active ? "Order baru":"Sumber nonaktif"),
        adminState:c?.state ?? "normal",monitorArchived:c?.archived ?? false,version:c?.version ?? 0,
        wageRupiah:closed ? Number(closed.wage_rupiah) : c?.wage_rupiah == null ? null:Number(c.wage_rupiah),
        canPrice:!!complete && !closed,closed:!!closed,sourceActive:receipt.active,
      };
    }).sort((a,b)=>b.orderRef.localeCompare(a.orderRef,undefined,{numeric:true}));
    const eligible=data.eligible.map(i=>({orderRef:i.orderRef,version:i.version,wageRupiah:i.wageRupiah}))
      .sort((a,b)=>a.orderRef < b.orderRef ? -1 : a.orderRef > b.orderRef ? 1 : 0);
    return monitorReply({orders,eligible,
      totalRupiah:data.eligible.reduce((sum,i)=>sum+(i.wageRupiah ?? 0),0)});
  } catch(e) { return monitorError(e); }
}
export async function POST(request: Request) {
  try {
    const { actor,supabaseAdmin } = await requireMonitorAccess(request);
    if (!actor.isAdmin) return monitorReply({error:"Khusus admin."},403);
    const b=await monitorBody(request);
    if(typeof b.orderRef!=="string" || !/^X\d{2,12}$/.test(b.orderRef) || !Number.isSafeInteger(b.version)
      || typeof b.action!=="string" || !["archive","restore","status","price","transfer"].includes(b.action)
      || typeof b.reason!=="string" || b.reason.trim().length<3 || b.reason.length>500
      || (b.action==="price" && (!Number.isSafeInteger(b.wageRupiah) || Number(b.wageRupiah)<0 || Number(b.wageRupiah)>1e9))
      || (b.action==="transfer" && (typeof b.employeeCode!=="string" || !/^[\w-]{1,100}$/.test(b.employeeCode))))
      return monitorReply({error:"Periksa order, alasan, dan nilai yang diisi."},400);
    const {data,error}=await supabaseAdmin.rpc("cp_monitor_manage_order",{p_actor:actor.id,p_ref:b.orderRef,p_version:b.version,
      p_action:b.action,p_reason:b.reason,p_state:b.state ?? null,p_wage:b.wageRupiah ?? null,p_employee:b.employeeCode ?? null});
    if(error) throw error; return monitorReply(data);
  } catch(e) { return monitorError(e); }
}

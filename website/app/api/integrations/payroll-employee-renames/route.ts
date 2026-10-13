import {timingSafeEqual} from "node:crypto";
import {createSupabaseAdmin} from "@/lib/serverSupabase";
import {listPendingSheetNameCorrections} from "@/features/payroll/lib/employee-name-correction";
import type {WorkspaceState} from "@/features/payroll/lib/workspace-model";

export const runtime="nodejs";
export const dynamic="force-dynamic";
function response(data:unknown,status=200) {return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});}
export async function GET(request:Request) {
 try {
   const expected = process.env.PAYROLL_SHEETS_SYNC_SECRET || process.env.CRON_SECRET || "";
   if(expected.length<24)return response({error:"Secret sinkronisasi belum dikonfigurasi."},503);
   const auth=request.headers.get("authorization") || "";
   const supplied=auth.toLowerCase().startsWith("bearer ")?auth.slice(7).trim():"";
   const a=Buffer.from(expected),b=Buffer.from(supplied);
   if(a.length!==b.length||!timingSafeEqual(a,b))return response({error:"Autentikasi sinkronisasi tidak valid."},401);
   const {searchParams}=new URL(request.url);
   const spreadsheetId=searchParams.get("spreadsheetId")?.trim()||"";
   if(!spreadsheetId||spreadsheetId.length>200)return response({error:"ID spreadsheet tidak valid."},400);
   const admin=createSupabaseAdmin();
   const {data,error}=await admin.from("cp_payroll_workspace").select("payload").eq("id",1).single();
   if(error)throw error;
   return response({ok:true,renames:listPendingSheetNameCorrections(data.payload as WorkspaceState,spreadsheetId)});
 }catch{return response({error:"Daftar koreksi nama tidak dapat dimuat."},500);}
}

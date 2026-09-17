import { requirePayrollAccess } from '@/lib/payrollAccess';
import { adminErrorStatus } from '@/lib/adminSecurity';
export async function GET(request:Request) {
  try {await requirePayrollAccess(request);return Response.json({now:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return Response.json({error:'Akses payroll diperlukan.'},{status:adminErrorStatus(error)});}
}

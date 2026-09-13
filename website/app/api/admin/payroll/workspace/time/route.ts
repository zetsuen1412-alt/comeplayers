import { requireAdmin, adminErrorStatus } from '@/lib/adminSecurity';
export async function GET(request:Request) {
  try {await requireAdmin(request);return Response.json({now:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return Response.json({error:'Akses admin diperlukan.'},{status:adminErrorStatus(error)});}
}

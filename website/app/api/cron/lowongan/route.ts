import { createSupabaseAdmin } from '@/lib/serverSupabase';
import { drainMeta } from '@/lib/loker/server';
import { equalSecret } from '@/lib/loker/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.LOKER_CRON_SECRET || '';
  if (!secret || !equalSecret(request.headers.get('authorization') || '', `Bearer ${secret}`)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try { return Response.json(await drainMeta(createSupabaseAdmin(), 3), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Worker lowongan belum tersedia.' }, { status: 503 }); }
}

import { requireAdmin, adminErrorStatus } from '@/lib/adminSecurity';
import { LokerError, readLimited, validateImage } from '@/lib/loker/model';
import { dbError, banner } from '@/lib/loker/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function failure(e: unknown) { const status = e instanceof LokerError ? e.status : adminErrorStatus(e); return Response.json({ error: e instanceof LokerError ? e.message : 'Banner tidak dapat diakses.' }, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function POST(request: Request) {
  try {
    const { supabaseAdmin: db } = await requireAdmin(request);
    const bytes = await readLimited(request, 2 * 1024 * 1024); const mime = request.headers.get('content-type') || '';
    validateImage(bytes, mime);
    const { data, error } = await db.from('cp_loker_banners').insert({ mime, body: Buffer.from(bytes).toString('base64') }).select('id').single(); dbError(error);
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
export async function GET(request: Request) {
  try {
    const { supabaseAdmin: db } = await requireAdmin(request);
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new LokerError('Banner tidak valid.');
    const img = await banner(db, id); if (!img) throw new LokerError('Banner tidak ditemukan.', 404);
    return new Response(new Uint8Array(Buffer.from(img.body, 'base64')), { headers: { 'Content-Type': img.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="lowongan"' } });
  } catch (e) { return failure(e); }
}

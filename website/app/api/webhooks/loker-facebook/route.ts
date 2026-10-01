import { after } from 'next/server';
import { createSupabaseAdmin } from '@/lib/serverSupabase';
import { LokerError, readLimited } from '@/lib/loker/model';
import { equalSecret, validSignature } from '@/lib/loker/security';
import { ingestFacebook } from '@/lib/loker/webhook';
import { drainMeta } from '@/lib/loker/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams; const secret = process.env.LOKER_META_VERIFY_TOKEN || '';
  if (!secret || p.get('hub.mode') !== 'subscribe' || !equalSecret(p.get('hub.verify_token') || '', secret)) return new Response('Forbidden', { status: 403 });
  const challenge = p.get('hub.challenge') || '';
  if (!/^\d{1,100}$/.test(challenge)) return new Response('Bad challenge', { status: 400 });
  return new Response(challenge, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  try {
    const raw = await readLimited(request, 1_000_000);
    if (!validSignature(raw, request.headers.get('x-hub-signature-256'), process.env.LOKER_META_APP_SECRET || '')) return new Response('Forbidden', { status: 403 });
    let input: unknown; try { input = JSON.parse(new TextDecoder().decode(raw)); } catch { return new Response('Bad JSON', { status: 400 }); }
    const db = createSupabaseAdmin();
    await ingestFacebook(db, input, process.env.LOKER_META_PAGE_ID || '');
    after(async () => { await drainMeta(db).catch(() => undefined); });
    return new Response('EVENT_RECEIVED');
  } catch (e) { return new Response('Webhook unavailable', { status: e instanceof LokerError ? e.status : 503 }); }
}

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createSupabaseAdmin } from '@/lib/serverSupabase';
import { createSupabaseAuthClient } from '@/lib/serverSupabase';
import { requireMonitorAccess } from '@/lib/monitorAccess';
import { adminErrorStatus } from '@/lib/adminSecurity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const reply = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' },
});

async function limitedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('Permintaan kosong.'), { status: 400 });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 8192) throw Object.assign(new Error('Permintaan terlalu besar.'), { status: 413 });
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw Object.assign(new Error('JSON tidak valid.'), { status: 400 }); }
}

/** Mobile sign-in is scoped to existing payroll members; no service-role key is ever sent to a phone. */
export async function POST(request: Request) {
  try {
    const body = await limitedBody(request);
    if (!body || typeof body !== 'object') return reply({ error: 'Permintaan tidak valid.' }, 400);
    const action = body.action;
    if (action !== 'login' && action !== 'refresh') return reply({ error: 'Tindakan tidak valid.' }, 400);

    const client = createSupabaseAuthClient();
    let result;
    if (action === 'login') {
      const identity = typeof body.username === 'string' ? body.username.trim().toLowerCase() : typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!identity || identity.length > 254 || typeof body.password !== 'string'
        || body.password.length < 1 || body.password.length > 512) return reply({ error: 'Email atau kata sandi tidak valid.' }, 400);
      const service = createSupabaseAdmin();
      for (const bucket of [identity, request.headers.get('x-vercel-forwarded-for')?.split(',')[0] || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown']) {
        const {data,error}=await service.rpc('cp_monitor_login_limit',{p_key:createHash('sha256').update('monitor-login:'+bucket).digest('hex')});
        if(error) throw error;
        if(!data) return reply({error:'Terlalu banyak percobaan login. Tunggu 10 menit.'},429);
      }
      let email = identity.includes('@') ? identity : '';
      if (!email && /^[a-z0-9][a-z0-9_.-]{2,29}$/.test(identity)) {
        const {data,error}=await service.from('profiles').select('email').ilike('username',identity.replace(/_/g,'\\_')).maybeSingle();
        if(error) throw error;
        email=String(data?.email || '');
      }
      // Unknown users also perform password verification; never disclose account existence.
      result = await client.auth.signInWithPassword({ email: email || 'unknown@invalid.example', password: body.password });
    } else {
      if (typeof body.refreshToken !== 'string' || body.refreshToken.length > 4096 || !body.refreshToken) {
        return reply({ error: 'Sesi tidak valid. Silakan login ulang.' }, 401);
      }
      result = await client.auth.refreshSession({ refresh_token: body.refreshToken });
    }
    if (result.error || !result.data.session) return reply({ error: 'Login atau sesi ditolak. Periksa akun payroll.' }, 401);
    const session = result.data.session;
    // Shared Monitor accounts retain identity/MFA checks but use independent
    // per-device sessions. Other accounts keep the website's session policy.
    const authorized = new Request(request.url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    try {
      await requireMonitorAccess(authorized, { activateSession: action === 'login' });
    } catch (error) {
      const status = adminErrorStatus(error);
      return reply({ error: status === 403 ? 'Akun Monitor belum dihubungkan oleh admin atau membutuhkan verifikasi tambahan.'
        : 'Sesi payroll ditolak. Coba login melalui website terlebih dahulu.' }, status === 401 ? 401 : 403);
    }
    return reply({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? (Math.floor(Date.now() / 1000) + session.expires_in),
    });
  } catch (error) {
    const status = adminErrorStatus(error);
    return reply({ error: status === 413 ? 'Permintaan terlalu besar.' : status === 400 ? 'Permintaan tidak valid.'
      : 'Tidak dapat menghubungi layanan autentikasi payroll.' }, status === 400 || status === 413 ? status : 503);
  }
}

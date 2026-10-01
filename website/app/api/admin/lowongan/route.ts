import { after } from 'next/server';
import { requireAdmin, adminErrorStatus } from '@/lib/adminSecurity';
import { LokerError, readLimited, validateConfig, replyText, facebookTarget } from '@/lib/loker/model';
import { automationEnabled, metaConfig, subjectHash } from '@/lib/loker/security';
import { workspace, dbError, browserJob, browserResult, preflight, drainMeta, graph, banner, enqueue } from '@/lib/loker/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  const status = error instanceof LokerError ? error.status : adminErrorStatus(error);
  return json({ error: error instanceof LokerError || status < 500 ? (error instanceof Error ? error.message : 'Permintaan tidak valid.') : 'Layanan lowongan belum tersedia.' }, status);
}
export async function GET(request: Request) {
  try {
    const { supabaseAdmin: db } = await requireAdmin(request);
    const w = await workspace(db);
    const { data: jobs, error } = await db.from('cp_loker_jobs').select('id,kind,status,target,note,external_ref,created_at,finished_at').order('created_at', { ascending: false }).limit(60); dbError(error);
    let pageConfigured = false; try { metaConfig(); pageConfigured = true; } catch { /* Only expose readiness, never credentials. */ }
    return json({ ...w, jobs: (jobs || []).map(j => ({ ...j, target: j.kind === 'messenger' ? 'Percakapan Facebook' : j.target })), connection: { enabled: automationEnabled(), pageConfigured, webhookConfigured: !!(process.env.LOKER_META_APP_SECRET && process.env.LOKER_META_VERIFY_TOKEN && /^[a-f0-9]{64}$/i.test(process.env.LOKER_DATA_KEY || '')) } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { supabaseAdmin: db, user } = await requireAdmin(request);
    let body: Record<string, unknown>;
    try { body = JSON.parse(new TextDecoder().decode(await readLimited(request))); }
    catch (e) { if (e instanceof LokerError) throw e; throw new LokerError('JSON tidak valid.'); }
    if (!body || typeof body !== 'object') throw new LokerError('Permintaan tidak valid.');
    const action = body.action;
    if (action === 'preview') return json({ text: replyText(validateConfig(body.config, true), String(body.question || '').slice(0,4000)) });
    if (action === 'test_page') {
      const c = metaConfig(); const result = await graph(c.pageId);
      if (String(result.id) !== c.pageId) throw new LokerError('Token tidak cocok dengan Page.', 409);
      return json({ ok: true, name: String(result.name || c.pageId), notice: 'Identitas Page cocok. Izin posting/Messenger tetap bergantung konfigurasi Meta.' });
    }
    if (action === 'tick') { after(async () => { await drainMeta(db).catch(() => undefined); }); return json({ accepted: true }); }
    if (action === 'next') return json({ job: await browserJob(db) });
    if (action === 'preflight') {
      if (typeof body.id !== 'string' || typeof body.lease !== 'string' || !/^[0-9a-f-]{36}$/.test(body.id) || !/^[0-9a-f-]{36}$/.test(body.lease)) throw new LokerError('Tugas tidak valid.');
      return json({ allowed: await preflight(db, body.id, body.lease) });
    }
    if (action === 'result') { await browserResult(db, body); return json({ ok: true }); }
    if (action === 'queue_selected') {
      const current = await workspace(db);
      if (current.state !== 'running') throw new LokerError('Aktifkan kampanye sebelum mengirim komentar.', 409);
      const config = validateConfig(current.config, true);
      if (!config.manualReview || !config.commentGroups) throw new LokerError('Mode review manual belum aktif.', 409);
      if (!Array.isArray(body.posts) || body.posts.length < 1 || body.posts.length > 500) throw new LokerError('Pilih 1–500 postingan per batch.');
      const allowedGroups = new Set(config.groups);
      let accepted = 0;
      const seen = new Set<string>();
      for (const value of body.posts) {
        if (typeof value !== 'string') throw new LokerError('Daftar postingan tidak valid.');
        const post = facebookTarget(value, true);
        const groupUrl = `https://www.facebook.com/groups/${post.group}/`;
        if (!allowedGroups.has(groupUrl)) throw new LokerError('Ada postingan dari grup yang tidak ada dalam daftar kampanye.');
        if (seen.has(post.url)) continue;
        seen.add(post.url);
        await enqueue(db, current, 'group_comment', post.url, `selected_comment:${post.url}`, { adminSelected: true });
        accepted++;
      }
      return json({ accepted });
    }
    if (!['save','start','pause','stop'].includes(String(action)) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw new LokerError('Perintah atau revisi tidak valid.');
    const current = await workspace(db);
    const config = action === 'save' ? validateConfig(body.config) : current.config;
    if (action === 'start') {
      if (!automationEnabled()) throw new LokerError('Pengiriman masih dinonaktifkan di server. Selesaikan pemasangan sebelum START.', 503);
      validateConfig(config, true);
      if (config.bannerId) await banner(db, config.bannerId);
      if (config.publishPage || config.replyComments || config.replyMessenger) metaConfig();
      if (config.replyComments || config.replyMessenger) {
        subjectHash('configuration-check');
        if (!process.env.LOKER_META_APP_SECRET || !process.env.LOKER_META_VERIFY_TOKEN) throw new LokerError('Webhook Facebook belum dikonfigurasi.', 503);
      }
    }
    const { data, error } = await db.rpc('cp_loker_control', { p_revision: body.expectedRevision, p_action: action, p_config: config, p_actor: user.id }); dbError(error);
    if (action === 'start') after(async () => { await drainMeta(db).catch(() => undefined); });
    return json(data);
  } catch (error) { return failure(error); }
}

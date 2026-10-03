import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPTY_CONFIG, LokerError, validateConfig, publicationText, facebookTarget, browserResultNote, type Config, type JobKind, type Outcome, type RunState } from './model';
import { automationEnabled, metaConfig, unseal } from './security';
export type DB = SupabaseClient;
export type Workspace = { id: number; revision: number; generation: string; state: RunState; config: Config; updated_at: string };
export type Job = { id: string; lease: string; generation: string; kind: JobKind; target: string; payload: Record<string, unknown>; status: string; created_at: string };
export function dbError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === '40001') throw new LokerError('Data berubah di tab lain. Muat ulang sebelum melanjutkan.', 409);
  if (error.code === '42501') throw new LokerError('Akses administrator diperlukan.', 403);
  throw new LokerError('Penyimpanan lowongan belum tersedia. Periksa migrasi dan koneksi database.', 503);
}
export async function workspace(db: DB): Promise<Workspace> {
  const { data, error } = await db.from('cp_loker_workspace').select('*').eq('id', 1).single(); dbError(error);
  if (!data) throw new LokerError('Modul lowongan belum dipasang.', 503);
  return { ...data, config: validateConfig({ ...EMPTY_CONFIG, ...data.config }) } as Workspace;
}
export async function enqueue(db: DB, w: Workspace, kind: JobKind, target: string, key: string, payload: Record<string, unknown> = {}) {
  const { error } = await db.from('cp_loker_jobs').upsert({ dedupe_key: `${w.generation}:${key}`, generation: w.generation, kind, channel: kind.startsWith('group_') ? 'browser' : 'meta', target, payload }, { onConflict: 'dedupe_key', ignoreDuplicates: true }); dbError(error);
}
export async function enqueueDue(db: DB, w: Workspace, channel: 'browser' | 'meta') {
  if (w.state !== 'running' || !automationEnabled()) return;
  const c = validateConfig(w.config, true);
  if (channel === 'meta' && c.publishPage) await enqueue(db, w, 'page_post', metaConfig().pageId, 'page_post');
  if (channel === 'browser') for (const group of c.groups) {
    if (c.publishGroups) await enqueue(db, w, 'group_post', group, `group_post:${group}`);
    if (c.commentGroups && !c.manualReview) {
      const slot = Math.floor(Date.now() / (c.intervalMinutes * 60_000));
      await enqueue(db, w, 'group_scan', group, `group_scan:${group}:${slot}`);
    }
  }
}
export async function claim(db: DB, channel: 'browser' | 'meta'): Promise<Job | null> {
  if (!automationEnabled()) return null;
  const { data, error } = await db.rpc('cp_loker_claim', { p_channel: channel }); dbError(error); return data as Job | null;
}
export async function preflight(db: DB, id: string, lease: string): Promise<boolean> {
  if (!automationEnabled()) return false;
  const { data, error } = await db.rpc('cp_loker_preflight', { p_id: id, p_lease: lease }); dbError(error); return data === true;
}
export async function finish(db: DB, job: Pick<Job, 'id' | 'lease'>, status: Outcome, ref = '', note = '') {
  const { data, error } = await db.rpc('cp_loker_finish', { p_id: job.id, p_lease: job.lease, p_status: status, p_ref: ref, p_note: note }); dbError(error);
  if (!data) throw new LokerError('Hasil tidak cocok dengan tugas aktif. Tidak ada pengiriman ulang.', 409);
}
export async function banner(db: DB, id: string): Promise<{ mime: string; body: string } | null> {
  if (!id) return null;
  const { data, error } = await db.from('cp_loker_banners').select('mime,body').eq('id', id).single(); dbError(error); return data;
}
export async function browserJob(db: DB) {
  const w = await workspace(db); await enqueueDue(db, w, 'browser');
  const job = await claim(db, 'browser'); if (!job) return null;
  const current = await workspace(db);
  if (job.generation !== current.generation || current.state !== 'running') { await finish(db, job, 'cancelled'); return null; }
  return { ...job, text: job.kind.startsWith('group_') ? '' : publicationText(w.config, job.kind === 'group_comment'), banner: job.kind === 'group_scan' ? null : await banner(db, w.config.bannerId), expiresAt: Date.now() + 140_000 };
}
export async function browserResult(db: DB, body: Record<string, unknown>) {
  if (typeof body.id !== 'string' || typeof body.lease !== 'string') throw new LokerError('Tugas tidak valid.');
  const { data, error } = await db.from('cp_loker_jobs').select('*').eq('id', body.id).eq('lease', body.lease).eq('channel', 'browser').single(); dbError(error);
  const job = data as Job; const w = await workspace(db);
  const status = body.status as Outcome;
  if (!['sent','pending','skipped','failed','uncertain','cancelled'].includes(status)) throw new LokerError('Hasil tugas tidak valid.');
  let ref = '';
  if (typeof body.ref === 'string' && body.ref) {
    const parsed = facebookTarget(body.ref, true); const target = facebookTarget(job.target, job.kind === 'group_comment');
    if (parsed.group !== target.group || (target.post && parsed.post !== target.post)) throw new LokerError('Bukti pengiriman bukan tujuan tugas.');
    ref = parsed.url;
  }
  if (status === 'sent' && !ref) throw new LokerError('Kiriman berhasil memerlukan tautan bukti.');
  const note = browserResultNote(body.note, body.stage);
  await finish(db, job, status, ref, note);
  if (job.kind === 'group_scan' && status === 'skipped' && w.state === 'running' && w.generation === job.generation && Array.isArray(body.discovered)) {
    const group = facebookTarget(job.target).group;
    for (const u of body.discovered) {
      if (typeof u !== 'string') continue;
      const post = facebookTarget(u, true);
      if (post.group !== group || !w.config.groups.includes(facebookTarget(job.target).url)) continue;
      await enqueue(db, w, 'group_comment', post.url, `group_comment:${post.url}`);
    }
  }
}
class MetaFailure extends Error { constructor(public certain: boolean, message: string) { super(message); } }
export async function graph(path: string, body?: FormData | Record<string, unknown>): Promise<Record<string, unknown>> {
  const { version, token } = metaConfig();
  if (!/^[\d_]+(?:\/(?:feed|photos|messages|comments))?$/.test(path)) throw new LokerError('Tujuan API tidak valid.');
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error' });
  } catch { throw new MetaFailure(false, 'Koneksi Meta terputus; hasil tidak diketahui. Periksa Facebook.'); }
  let data: Record<string, unknown>;
  try { data = await response.json(); } catch { throw new MetaFailure(false, 'Respons Meta tidak dapat diverifikasi.'); }
  if (!response.ok || data.error) throw new MetaFailure(response.status >= 400 && response.status < 500, `Meta menolak atau gagal memproses permintaan (HTTP ${response.status}). Periksa izin/koneksi sebelum melanjutkan.`);
  return data;
}
export async function drainMeta(db: DB, maximum = 2) {
  // Erase expired recipient payloads even while the send switch is off.
  const { error: cleanupError } = await db.from('cp_loker_jobs').update({ status: 'skipped', payload: {}, note: 'Jendela balasan telah berakhir.', finished_at: new Date().toISOString() }).eq('kind','messenger').in('status',['queued','leased']).lt('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString()); dbError(cleanupError);
  if (!automationEnabled()) return { processed: 0 };
  const initial = await workspace(db); if (initial.state !== 'running') return { processed: 0 };
  await enqueueDue(db, initial, 'meta'); let processed = 0;
  for (let i = 0; i < maximum; i++) {
    const job = await claim(db, 'meta'); if (!job) break;
    const w = await workspace(db);
    try {
      if (w.state !== 'running' || job.generation !== w.generation) { await finish(db, job, 'cancelled'); continue; }
      if (job.kind === 'messenger') {
        const expires = Number(job.payload.expiresAt || 0);
        const { data: suppression, error } = await db.from('cp_loker_suppression').select('expires_at').eq('subject', job.target).maybeSingle(); dbError(error);
        if (Date.now() >= expires || suppression && (!suppression.expires_at || Date.parse(suppression.expires_at) > Date.now())) { await finish(db, job, 'skipped', '', 'Jendela balasan berakhir atau percakapan ditangani admin/dihentikan.'); continue; }
      }
      // Load everything that may fail before the once-only dispatch transition.
      const c = metaConfig(); let path = ''; let body: FormData | Record<string, unknown>;
      if (job.kind === 'page_post') {
        const img = await banner(db, w.config.bannerId);
        if (img) { const form = new FormData(); form.set('source', new Blob([new Uint8Array(Buffer.from(img.body, 'base64'))], { type: img.mime }), 'lowongan'); form.set('message', publicationText(w.config)); form.set('published','true'); body = form; path = `${c.pageId}/photos`; }
        else { path = `${c.pageId}/feed`; body = { message: publicationText(w.config) }; }
      } else if (job.kind === 'messenger') {
        const recipient = unseal(String(job.payload.recipient || '')); if (!/^\d+$/.test(recipient)) throw new LokerError('Penerima tidak valid.');
        path = `${c.pageId}/messages`; body = { recipient: { id: recipient }, messaging_type: 'RESPONSE', message: { text: String(job.payload.text), metadata: 'comeplayers-loker-v1' } };
      } else if (job.kind === 'page_comment') { path = `${job.target}/comments`; body = { message: String(job.payload.text) }; }
      else { await finish(db, job, 'skipped'); continue; }
      if (!await preflight(db, job.id, job.lease)) { await finish(db, job, 'cancelled'); continue; }
      let data: Record<string, unknown>;
      try { data = await graph(path, body); }
      catch (e) { await finish(db, job, e instanceof MetaFailure && e.certain ? 'failed' : 'uncertain', '', e instanceof MetaFailure ? e.message : 'Hasil Meta tidak terverifikasi.'); break; }
      const ref = String(data.post_id || data.message_id || data.id || '');
      if (!ref) { await finish(db, job, 'uncertain', '', 'Meta tidak mengembalikan ID pengiriman.'); break; }
      await finish(db, job, 'sent', ref, 'ID kiriman dikonfirmasi oleh Meta.');
      if (job.kind === 'messenger' && job.payload.handoff === true) {
        const { data: existing, error: readError } = await db.from('cp_loker_suppression').select('reason').eq('subject',job.target).maybeSingle(); dbError(readError);
        if (existing?.reason !== 'optout') { const { error } = await db.from('cp_loker_suppression').upsert({ subject: job.target, reason: 'human', expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString() }); dbError(error); }
      }
      processed++;
    } catch {
      // A DB failure after sending is intentionally not retried. Stale claims become uncertain.
      await finish(db, job, 'uncertain', '', 'Tugas terhenti; periksa koneksi dan hasil sebelum melanjutkan.').catch(() => undefined);
      break;
    }
  }
  return { processed };
}

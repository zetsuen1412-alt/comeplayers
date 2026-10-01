import { LokerError, HANDOFF_WORDS, STOP_WORDS, isJobInquiry, replyText } from './model';
import { automationEnabled, subjectHash, seal } from './security';
import { dbError, enqueue, workspace, type DB } from './server';
type Message = { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; metadata?: string } };
type Change = { field?: string; value?: { item?: string; verb?: string; comment_id?: string; post_id?: string; parent_id?: string; message?: string; from?: { id?: string } } };
type Entry = { id?: string; messaging?: Message[]; changes?: Change[] };
const numeric = (s: unknown): s is string => typeof s === 'string' && /^\d+$/.test(s);
export async function ingestFacebook(db: DB, input: unknown, pageId: string, now = Date.now()) {
  if (!input || typeof input !== 'object') return;
  const payload = input as { object?: string; entry?: Entry[] };
  if (payload.object !== 'page' || !Array.isArray(payload.entry)) return;
  if (payload.entry.length > 50 || payload.entry.some(e => (e.messaging?.length || 0) > 100 || (e.changes?.length || 0) > 100)) throw new LokerError('Webhook batch terlalu besar.', 413);
  const w = await workspace(db);
  for (const entry of payload.entry.slice(0,50)) {
    if (entry.id !== pageId) continue;
    for (const event of (Array.isArray(entry.messaging) ? entry.messaging : []).slice(0,100)) {
      const msg = event.message;
      if (!msg || typeof msg.mid !== 'string') continue;
      if (msg.is_echo) {
        if (msg.metadata !== 'comeplayers-loker-v1' && numeric(event.recipient?.id)) {
          const subject = subjectHash(`${pageId}:${event.recipient.id}`);
          const { data: existing, error: readError } = await db.from('cp_loker_suppression').select('reason').eq('subject',subject).maybeSingle(); dbError(readError);
          if (existing?.reason !== 'optout') { const { error } = await db.from('cp_loker_suppression').upsert({ subject, reason: 'human', expires_at: new Date(now + 24 * 60 * 60_000).toISOString() }); dbError(error); }
        }
        continue;
      }
      if (event.recipient?.id !== pageId || !numeric(event.sender?.id) || event.sender.id === pageId || typeof msg.text !== 'string') continue;
      const target = subjectHash(`${pageId}:${event.sender.id}`); const text = msg.text.slice(0,4000).trim();
      // Honor opt-out even while publishing is paused. Store only a one-way identifier, not a profile.
      if (STOP_WORDS.test(text)) {
        const { error } = await db.from('cp_loker_suppression').upsert({ subject: target, reason: 'optout', expires_at: null }); dbError(error); continue;
      }
      if (!automationEnabled() || !w.config.replyMessenger || w.state !== 'running') continue;
      const stamp = Number(event.timestamp || 0);
      if (!Number.isFinite(stamp) || stamp > now + 300_000 || stamp < now - 23 * 60 * 60_000) continue;
      const { data: previous, error: previousError } = await db.from('cp_loker_jobs').select('id').eq('kind','messenger').eq('target',target).eq('status','sent').gte('started_at', new Date(now - 24 * 60 * 60_000).toISOString()).limit(1); dbError(previousError);
      if (!isJobInquiry(text) && !previous?.length) continue; // Do not hijack unrelated marketplace support messages.
      const reply = replyText(w.config, text); if (!reply) continue;
      await enqueue(db, w, 'messenger', target, `message:${subjectHash(msg.mid)}`, { recipient: seal(event.sender.id), text: reply, expiresAt: stamp + 23 * 60 * 60_000, handoff: HANDOFF_WORDS.test(text) });
    }
    for (const change of (Array.isArray(entry.changes) ? entry.changes : []).slice(0,100)) {
      if (!automationEnabled() || w.state !== 'running' || !w.config.replyComments || change.field !== 'feed') continue;
      const v = change.value;
      if (!v || v.item !== 'comment' || v.verb !== 'add' || !v.comment_id || !/^[\d_]+$/.test(v.comment_id) || !v.post_id || v.parent_id !== v.post_id || v.from?.id === pageId || typeof v.message !== 'string') continue;
      // Reply only to top-level comments on vacancies this campaign actually published.
      const { data: post, error } = await db.from('cp_loker_jobs').select('id').eq('kind','page_post').eq('status','sent').eq('generation',w.generation).eq('external_ref',v.post_id).limit(1); dbError(error);
      if (!post?.length || STOP_WORDS.test(v.message) || !isJobInquiry(v.message)) continue;
      const reply = replyText(w.config, v.message.slice(0,4000));
      if (reply) await enqueue(db,w,'page_comment',v.comment_id,`comment:${v.comment_id}`,{ text: reply });
    }
  }
}

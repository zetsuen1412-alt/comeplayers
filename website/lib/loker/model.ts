/** Public campaign data only. No applicants, employee records or payroll fields. */
export type RunState = 'draft' | 'running' | 'paused' | 'stopped';
export type JobKind = 'page_post' | 'group_post' | 'group_scan' | 'group_comment' | 'page_comment' | 'messenger';
export type Outcome = 'sent' | 'pending' | 'skipped' | 'failed' | 'uncertain' | 'cancelled';
export type FAQ = { keywords: string[]; answer: string };
export type Config = {
  title: string; text: string; comment: string; whatsapp: string; bannerId: string;
  groups: string[]; publishPage: boolean; publishGroups: boolean; commentGroups: boolean; manualReview: boolean;
  replyComments: boolean; replyMessenger: boolean; groupsAuthorized: boolean;
  intervalMinutes: number; dailyLimit: number; fallback: string; faqs: FAQ[];
};
export const EMPTY_CONFIG: Config = {
  title: '', text: '', comment: '', whatsapp: '', bannerId: '', groups: [],
  publishPage: false, publishGroups: false, commentGroups: false, manualReview: false,
  replyComments: false, replyMessenger: false, groupsAuthorized: false,
  intervalMinutes: 60, dailyLimit: 10, fallback: '', faqs: [],
};
export class LokerError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'LokerError'; }
}
const BROWSER_STAGES = new Set([
  'navigated', 'composer_selected:post_root', 'photo_control_found', 'attachment_preview_found',
  'send_control_found', 'preflight_allowed', 'send_clicked', 'verified_new_comment',
  'context_unavailable', 'composer_missing', 'composer_nested_reply', 'composer_ambiguous',
  'composer_draft_present', 'attachment_cleanup_blocked',
  'photo_control_unavailable', 'attachment_preview_missing', 'send_control_unavailable',
  'preflight_denied', 'cancelled', 'verification_inconclusive', 'security_restriction',
  'navigation_unavailable', 'browser_interrupted',
  'banner_invalid', 'target_changed', 'approval_required',
]);
export function browserStage(value: unknown): string {
  return typeof value === 'string' && (BROWSER_STAGES.has(value) || /^(?:post_context_found:(?:modal|feed)|composer_candidates:\d{1,3})$/.test(value)) ? value : '';
}
/** Keep the final diagnostic first: the database caps notes at 250 characters. */
export function browserResultNote(note: unknown, stage: unknown): string {
  const finalStage = browserStage(stage);
  const message = typeof note === 'string' ? note.replace(/^\[stage:[^\]]+\]\s*/, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  return `${finalStage ? `[stage:${finalStage}] ` : ''}${message}`.slice(0, 250);
}
export function browserNoteStage(note: string): string {
  return browserStage(note.match(/^\[stage:([^\]]+)\]/)?.[1]);
}
function text(value: unknown, max: number, name: string): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new LokerError(`${name} tidak valid (maksimal ${max} karakter).`);
  return value.trim();
}
export function normalizePhone(value: string): string {
  if (!/^\+?[\d\s().-]+$/.test(value)) throw new LokerError('Nomor WhatsApp tidak valid.');
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new LokerError('Isi nomor WhatsApp lengkap, misalnya 08… atau +62… .');
  return digits;
}
export function whatsappLink(c: Pick<Config, 'whatsapp' | 'title'>): string {
  return `https://wa.me/${normalizePhone(c.whatsapp)}?text=${encodeURIComponent(`Halo Admin, saya tertarik dengan lowongan ${c.title}.`)}`;
}
export function facebookTarget(input: string, post = false): { url: string; group: string; post: string } {
  let u: URL; try { u = new URL(input); } catch { throw new LokerError('Tautan grup Facebook tidak valid.'); }
  if (u.protocol !== 'https:' || !['facebook.com', 'www.facebook.com', 'web.facebook.com', 'm.facebook.com'].includes(u.hostname) || u.username || u.password || u.port) throw new LokerError('Gunakan tautan HTTPS grup Facebook, bukan situs lain.');
  const m = u.pathname.match(/^\/groups\/([a-zA-Z0-9._-]+)(?:\/(?:posts|permalink)\/(\d+))?\/?$/);
  if (!m || (post && !m[2]) || (!post && m[2])) throw new LokerError('Gunakan tautan grup atau postingan grup lengkap.');
  return { url: `https://www.facebook.com/groups/${m[1]}${m[2] ? `/posts/${m[2]}` : ''}/`, group: m[1], post: m[2] || '' };
}
export function validateConfig(input: unknown, active = false): Config {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new LokerError('Pengaturan tidak valid.');
  const v = input as Record<string, unknown>;
  const c: Config = { ...EMPTY_CONFIG, groups: [], faqs: [] };
  for (const key of ['title', 'text', 'comment', 'whatsapp', 'bannerId', 'fallback'] as const) {
    c[key] = text(v[key], key === 'text' ? 4000 : key === 'comment' || key === 'fallback' ? 800 : 160, key);
  }
  if (c.whatsapp) c.whatsapp = normalizePhone(c.whatsapp);
  if (c.bannerId && !/^[0-9a-f-]{36}$/.test(c.bannerId)) throw new LokerError('Banner tidak valid.');
  for (const key of ['publishPage', 'publishGroups', 'commentGroups', 'manualReview', 'replyComments', 'replyMessenger', 'groupsAuthorized'] as const) {
    if (typeof v[key] !== 'boolean') throw new LokerError(`Pengaturan ${key} tidak valid.`);
    c[key] = v[key];
  }
  if (!Array.isArray(v.groups) || v.groups.length > 30) throw new LokerError('Maksimal 30 grup per kampanye.');
  c.groups = [...new Set(v.groups.map(g => facebookTarget(text(g, 500, 'Grup')).url))];
  for (const key of ['intervalMinutes', 'dailyLimit'] as const) {
    const n = v[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > (key === 'intervalMinutes' ? 1440 : 50)) throw new LokerError('Jeda 1–1440 menit dan batas harian posting 1–50. Komentar relevan tidak memakai batas jumlah tetap.');
    c[key] = n;
  }
  if (!Array.isArray(v.faqs) || v.faqs.length > 20) throw new LokerError('Maksimal 20 jawaban FAQ.');
  c.faqs = v.faqs.map((f: unknown) => {
    if (!f || typeof f !== 'object') throw new LokerError('FAQ tidak valid.');
    const row = f as Record<string, unknown>;
    if (!Array.isArray(row.keywords) || !row.keywords.length || row.keywords.length > 12) throw new LokerError('FAQ memerlukan 1–12 kata kunci.');
    const keywords = row.keywords.map(k => text(k, 60, 'Kata kunci').toLowerCase()).filter(Boolean);
    const answer = text(row.answer, 600, 'Jawaban FAQ');
    if (!keywords.length || !answer) throw new LokerError('Lengkapi kata kunci dan jawaban FAQ.');
    return { keywords, answer };
  });
  if (active) {
    if (![c.publishPage, c.publishGroups, c.commentGroups, c.replyComments, c.replyMessenger].some(Boolean)) throw new LokerError('Pilih sedikitnya satu aktivitas.');
    if (c.publishGroups || c.commentGroups) {
      if (!c.bannerId) throw new LokerError('Pilih foto lowongan sebelum START.');
      if (!c.groups.length || !c.groupsAuthorized) throw new LokerError('Isi daftar grup dan konfirmasi bahwa grup mengizinkan lowongan.');
    }
    if (c.publishPage || c.replyComments || c.replyMessenger) {
      if (!c.title || !c.text || !c.whatsapp) throw new LokerError('Facebook Page memerlukan judul, teks lowongan, dan nomor WhatsApp.');
    }
  }
  return c;
}
export function publicationText(c: Config, comment = false): string {
  return `${comment ? c.comment : c.text}\n\nWhatsApp Admin: +${normalizePhone(c.whatsapp)}\n${whatsappLink(c)}`;
}
export const STOP_WORDS = /^(stop|berhenti|jangan (?:balas|hubungi)|unsubscribe)\b/i;
export const HANDOFF_WORDS = /\b(?:bicara|ngobrol|hubungi|minta)\s+(?:dengan\s+)?(?:admin|manusia)|\bkomplain\b/i;
export function isJobInquiry(input: string): boolean { return /\b(loker|lowongan|rekrutmen|recruitment|kerja|gaji|mess|syarat|fasilitas|melamar|lamar|minat|daftar)\b/i.test(input); }
export function replyText(c: Config, input: string): string | null {
  if (STOP_WORDS.test(input.trim())) return null;
  const q = input.toLowerCase();
  const answer = HANDOFF_WORDS.test(input) ? 'Silakan lanjutkan langsung dengan admin melalui WhatsApp.' :
    c.faqs.find(f => f.keywords.some(k => new RegExp(`(?:^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}\\p{N}])`, 'u').test(q)))?.answer || c.fallback || 'Terima kasih atas ketertarikannya. Informasi dan pendaftaran lowongan dilanjutkan langsung melalui WhatsApp admin.';
  return `Asisten otomatis lowongan ${c.title}.\n${answer}\n\nWhatsApp Admin: +${normalizePhone(c.whatsapp)}\n${whatsappLink(c)}`;
}
export function isJobSeekerPost(input: string): boolean {
  return /\b(cari kerja|mencari (?:kerja|pekerjaan)|butuh (?:kerja|pekerjaan)|info loker|loker dong|ada loker)\b/i.test(input)
    && !/\b(kami membuka|dibutuhkan|open recruitment|lowongan tersedia|sedang membuka|membuka lowongan)\b/i.test(input);
}
export function validateImage(bytes: Uint8Array, mime: string): void {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new LokerError('Foto maksimal 5 MB.', 413);
  const isPng = bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  const isJpeg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a,b));
  const isWebp = bytes.length > 12 && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP';
  if (!((mime === 'image/png' && isPng) || (mime === 'image/jpeg' && isJpeg) || (mime === 'image/webp' && isWebp))) throw new LokerError('Pilih file PNG, JPG, atau WebP asli. SVG tidak diterima.');
}
export async function readLimited(request: Request, max = 100_000): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length') || 0) > max) throw new LokerError('Permintaan terlalu besar.', 413);
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > max) { await reader.cancel(); throw new LokerError('Permintaan terlalu besar.', 413); } chunks.push(r.value); } }
  finally { reader.releaseLock(); }
  const out = new Uint8Array(size); let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; } return out;
}

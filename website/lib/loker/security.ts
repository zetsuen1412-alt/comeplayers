import { createHmac, timingSafeEqual, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { LokerError } from './model';
export function equalSecret(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
export function validSignature(raw: Uint8Array, header: string | null, secret: string): boolean {
  return !!secret && !!header && /^sha256=[a-f0-9]{64}$/.test(header) && equalSecret(header, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
}
function key(): Buffer {
  const value = process.env.LOKER_DATA_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new LokerError('Kunci privasi modul lowongan belum dikonfigurasi.', 503);
  return Buffer.from(value, 'hex');
}
export function subjectHash(value: string): string { return createHmac('sha256', key()).update(value).digest('hex'); }
export function seal(value: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
export function unseal(value: string): string {
  const raw = Buffer.from(value, 'base64url'); if (raw.length < 29) throw new LokerError('Data kiriman tidak valid.', 500);
  const cipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0,12)); cipher.setAuthTag(raw.subarray(12,28));
  return Buffer.concat([cipher.update(raw.subarray(28)), cipher.final()]).toString('utf8');
}
export function metaConfig() {
  const pageId = process.env.LOKER_META_PAGE_ID || '';
  const token = process.env.LOKER_META_PAGE_TOKEN || '';
  const version = process.env.LOKER_META_GRAPH_VERSION || '';
  if (!/^\d+$/.test(pageId) || !token || !/^v\d+\.\d+$/.test(version)) throw new LokerError('Koneksi Facebook Page belum dikonfigurasi.', 503);
  return { pageId, token, version };
}
export function automationEnabled(): boolean { return process.env.LOKER_AUTOMATION_ENABLED === 'true' || (process.env.VERCEL_ENV === 'production' && process.env.LOKER_AUTOMATION_ENABLED !== 'false'); }

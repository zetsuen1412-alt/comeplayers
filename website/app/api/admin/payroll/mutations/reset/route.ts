import { gzipSync } from 'node:zlib';
import { requirePayrollAccess } from '@/lib/payrollAccess';
import { adminErrorStatus } from '@/lib/adminSecurity';
import { payrollFailure, validateWorkspace } from '@/features/payroll/lib/workspace-model';
import { isResetId, mutationResetPreview, validateMutationResetRequest } from '@/features/payroll/lib/mutation-reset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  const db = error as { code?: string; message?: string };
  const status = db.code === '42501' ? 403 : ['40001', '55000', '23505'].includes(db.code ?? '') ? 409 : db.code === '22023' ? 400 : adminErrorStatus(error);
  return response({ error: status >= 500 ? 'Penghapusan belum terkonfirmasi. Periksa ulang jumlah mutasi sebelum mencoba lagi.' : db.message || 'Permintaan tidak valid.' }, status);
}
async function admin(request: Request) {
  const access = await requirePayrollAccess(request);
  if (!access.actor.isAdmin) payrollFailure('Hanya admin yang dapat menghapus semua mutasi atau mengunduh cadangannya.', 403);
  return access;
}
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) payrollFailure('Konfirmasi penghapusan kosong.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); payrollFailure('Permintaan terlalu besar.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { payrollFailure('JSON tidak valid.'); }
}
export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await admin(request);
    const backup = new URL(request.url).searchParams.get('backup');
    if (backup !== null) {
      if (!isResetId(backup)) payrollFailure('Identitas cadangan tidak valid.');
      const { data, error } = await supabaseAdmin.from('cp_payroll_mutation_resets').select('*').eq('id', backup).maybeSingle();
      if (error) throw error;
      if (!data) payrollFailure('Cadangan tidak ditemukan.', 404);
      const bytes = gzipSync(JSON.stringify({ format: 'comeplayers-payroll-reset-backup-v1', ...data }));
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="ComePlayers-cadangan-mutasi-${backup}.json.gz"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const { data: current, error } = await supabaseAdmin.from('cp_payroll_workspace').select('payload,revision').eq('id', 1).single();
    if (error) throw error;
    const { data: receipts, error: receiptError } = await supabaseAdmin.from('cp_payroll_mutation_resets').select('id,removed_count,total_minor,revision_after,created_at').order('created_at', { ascending: false }).limit(5);
    if (receiptError) throw receiptError;
    return response({ ...mutationResetPreview(validateWorkspace(current.payload), current.revision), receipts: receipts ?? [] });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await admin(request);
    const body = validateMutationResetRequest(await readBody(request));
    // PostgreSQL repeats the admin, confirmation, revision, lock and dependency
    // checks under a row lock, then commits the backup + deletion + audit together.
    // Retrying the SAME request ID never deletes newer orders.
    const { data, error } = await supabaseAdmin.rpc('cp_reset_payroll_mutations', {
      p_revision: body.expectedRevision, p_expected_count: body.expectedCount,
      p_request_id: body.requestId, p_actor: user.id, p_confirmation: body.confirmation,
    });
    if (error) throw error;
    return response(data);
  } catch (error) { return failure(error); }
}

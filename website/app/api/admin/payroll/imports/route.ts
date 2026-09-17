import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { requirePayrollAccess } from '@/lib/payrollAccess';
import { adminErrorStatus } from '@/lib/adminSecurity';
import { payrollFailure, validateWorkspaceEdit, workspaceKeys, type WorkspaceState } from '@/features/payroll/lib/workspace-model';
import { mutasiFhManifest as manifest, validateMutasiFhTitles, type MutasiFhSourceRow } from '@/features/payroll/lib/mutasi-fh-import';
import type { Employee, Order, ProductGame } from '@/features/payroll/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type ImportOrder = Order & { sourceRow: number };
type ImportPackage = { batchId: string; orders: ImportOrder[]; games: ProductGame[]; expectedEmployees: Pick<Employee, 'code' | 'name' | 'team'>[]; summary: Record<string, unknown>; sourceRows: MutasiFhSourceRow[] };
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  const db = error as { code?: string; message?: string };
  const status = db.code === '42501' ? 403 : ['40001', '23505', '55000'].includes(db.code ?? '') ? 409 : db.code === '22023' ? 400 : adminErrorStatus(error);
  return response({ error: status >= 500 ? 'Impor belum dapat diproses. Periksa status impor sebelum mencoba lagi.' : db.message || 'Permintaan impor tidak valid.' }, status);
}
async function readPackage(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) payrollFailure('Pilih berkas paket impor terlebih dahulu.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > manifest.maxPacketBytes) { await reader.cancel(); payrollFailure('Gunakan paket .cpimport V2, bukan XLSX asli.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const packet = Buffer.concat(chunks);
  if (createHash('sha256').update(packet).digest('hex') !== manifest.packetSha256) payrollFailure(`Paket tidak cocok. Pilih ${manifest.fileName}. Versi lama belum memakai pemetaan STATUS yang dikoreksi.`);
  const text = gunzipSync(packet, { maxOutputLength: manifest.maxPayloadBytes }).toString('utf8');
  if (createHash('sha256').update(text).digest('hex') !== manifest.payloadSha256) payrollFailure('Pemeriksaan integritas paket gagal.');
  const data = JSON.parse(text) as ImportPackage;
  if (data.batchId !== manifest.batchId || data.summary.mappingVersion !== manifest.mappingVersion || data.orders.length !== manifest.orderCount || data.sourceRows.length !== manifest.sourceRowCount || data.orders.reduce((sum, order) => sum + order.grossMinor, 0) !== manifest.grossMinor) payrollFailure('Manifest paket tidak sesuai.');
  try { validateMutasiFhTitles(data.orders, data.sourceRows); }
  catch (error) { payrollFailure(error instanceof Error ? error.message : 'Pemetaan Nama order tidak sesuai.'); }
  return { text, data };
}
function prepare(current: WorkspaceState, data: ImportPackage) {
  const employees = (current[workspaceKeys.employees] ?? []) as Employee[];
  const employeeMap = new Map(employees.map(row => [row.code, row]));
  for (const expected of data.expectedEmployees) {
    const employee = employeeMap.get(expected.code);
    if (!employee || employee.name !== expected.name || employee.team !== expected.team) payrollFailure(`Pemetaan ${expected.code} berubah. Periksa karyawan sebelum impor.`, 409);
  }
  const games = [...(current[workspaceKeys.products] ?? []) as ProductGame[]];
  for (const game of data.games) if (!games.some(row => row.code.trim().toUpperCase() === game.code.toUpperCase())) games.push(game);
  const gameMap = new Map(games.map(game => [game.code.trim().toUpperCase(), game]));
  const orders = data.orders.map(order => {
    const game = gameMap.get(order.game.toUpperCase());
    if (!game) payrollFailure(`Game ${order.game} belum tersedia.`);
    if (order.operationalStatus === 'verified' || order.payrollClosedAt || order.inventoryAllocations) payrollFailure('Paket historis tidak boleh menjalankan gaji, Closing, atau stok.');
    return { ...order, gameId: game.id };
  });
  const next = { ...current, [workspaceKeys.products]: games, [workspaceKeys.orders]: [...(current[workspaceKeys.orders] ?? []) as Order[], ...orders] };
  validateWorkspaceEdit(current, next);
  if (Buffer.byteLength(JSON.stringify(next)) > 3400000) payrollFailure('Ukuran gabungan payroll terlalu besar. Tidak ada data yang diubah.', 413);
}
export async function GET(request: Request) {
  try {
    const { user, actor, supabaseAdmin } = await requirePayrollAccess(request);
    const url = new URL(request.url), page = Number(url.searchParams.get('page') ?? 0);
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000) payrollFailure('Halaman tidak valid.');
    const { data, error } = await supabaseAdmin.rpc('cp_read_mutasi_fh_archive', { p_actor: user.id, p_offset: page * 30, p_limit: 30, p_review: url.searchParams.get('review') !== 'false' });
    if (error) throw error;
    return response({ ...data, isAdmin: actor.isAdmin });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { user, actor, supabaseAdmin } = await requirePayrollAccess(request);
    if (!actor.isAdmin) payrollFailure('Hanya admin yang dapat mengimpor data payroll.', 403);
    const url = new URL(request.url), mode = url.searchParams.get('mode');
    if (mode !== 'preview' && mode !== 'apply') payrollFailure('Tindakan impor tidak valid.');
    const { text, data } = await readPackage(request);
    const { data: existing, error: existingError } = await supabaseAdmin.from('cp_payroll_import_batches').select('status,summary,revision_after').eq('id', data.batchId).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === 'applied') return response({ status: 'already_applied', revision: existing.revision_after, summary: existing.summary });
    const { data: current, error: currentError } = await supabaseAdmin.from('cp_payroll_workspace').select('payload,revision').eq('id', 1).single();
    if (currentError) throw currentError;
    prepare(current.payload, data);
    if (mode === 'preview') {
      const review = data.sourceRows.filter(row => row.issues?.length || ['review', 'tip', 'incomplete'].includes(row.kind));
      return response({ status: 'preview', revision: current.revision, summary: data.summary, rows: review.slice(0, 30), total: review.length });
    }
    const revision = Number(url.searchParams.get('revision'));
    if (!url.searchParams.has('revision') || !Number.isSafeInteger(revision) || revision !== current.revision) payrollFailure('Data berubah. Jalankan Periksa Paket sekali lagi sebelum impor.', 409);
    const { data: receipt, error } = await supabaseAdmin.rpc('cp_apply_mutasi_fh_import', { p_text: text, p_revision: revision, p_actor: user.id });
    if (error) throw error;
    return response(receipt);
  } catch (error) { return failure(error); }
}

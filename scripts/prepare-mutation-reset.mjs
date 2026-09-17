import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
function checked(path, sha) {
  const bytes = readFileSync(path);
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (actual !== sha) throw new Error(`Concurrent source change: ${path}`);
  return bytes.toString('utf8');
}
const storePath = 'website/features/payroll/lib/workspace-store.ts';
let store = checked(storePath, '222b442f51e8d9b933b15f4626862fa4736ac19b');
store += `
// Exclusive server reset: newer local edits and stale tabs cannot overwrite the result.
export async function resetPayrollMutations(request: import('./mutation-reset').MutationResetRequest) {
  if (exclusive) throw new Error('Payroll sedang diproses.');
  exclusive = true; notify(); const generation = epoch;
  try {
    await flushPayroll();
    if (!ready || error || !actor?.isAdmin) throw new Error(error || 'Akses admin diperlukan.');
    if (revision !== request.expectedRevision) throw new Error('Data berubah. Periksa ulang ringkasan penghapusan.');
    const result = await authenticatedFetchJson<Snapshot & { status: 'cleared' | 'already_cleared'; receiptId: string; removedCount: number }>(
      '/api/admin/payroll/mutations/reset', { method: 'POST', body: JSON.stringify(request) },
    );
    if (generation !== epoch) throw new Error('Sesi berubah. Muat ulang untuk memeriksa hasil.');
    state = result.state; revision = result.revision; error = ''; sync();
    return result;
  } catch (e) {
    if (generation === epoch && [401, 403].includes((e as { status?: number })?.status ?? 0)) recordFailure(e, 'Akses admin diperlukan.');
    throw e;
  } finally { if (generation === epoch) { exclusive = false; notify(); } }
}
`;
writeFileSync(storePath, store);
const routePath = 'website/app/api/admin/payroll/workspace/route.ts';
let route = checked(routePath, '5e4c5fb83dfcf98c2f67850a20544ee415b17b16');
route = "import { rejectUnauditedOrderRemoval } from '@/features/payroll/lib/mutation-reset';\n" + route;
const marker = 'if(!closing)validateWorkspaceEdit(current.payload,state);';
if (!route.includes(marker)) throw new Error('Missing save validation anchor');
route = route.replace(marker, 'if(!closing){rejectUnauditedOrderRemoval(current.payload,state);validateWorkspaceEdit(current.payload,state);}');
writeFileSync(routePath, route);
console.log('Prepared reset persistence and normal-save deletion guard only. No production data access.');

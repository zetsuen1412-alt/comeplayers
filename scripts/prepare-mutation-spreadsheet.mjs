import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const path = 'website/app/admin/payroll/mutations/page.tsx';
const original = readFileSync(path);
const blob = createHash('sha1').update(`blob ${original.length}\0`).update(original).digest('hex');
if (blob !== 'e2bb50c469e9dda29da8aa3d2bf51fd9f56b5280') throw new Error('The mutation page changed. Review the current file before applying this patch.');
let source = original.toString();
function replaceOnce(before, after) {
  if (source.split(before).length !== 2) throw new Error(`Expected a unique match: ${before.slice(0, 90)}`);
  source = source.replace(before, after);
}
replaceOnce('import { MutationEditModal }', 'import { MutationSpreadsheet } from "@/features/payroll/components/mutation-spreadsheet";\nimport { useDemoPeriodLock } from "@/features/payroll/lib/demo-period-lock-store";\nimport { MutationEditModal }');
replaceOnce('  const { allOrders, updateOrder } = useDemoOrders();', '  const { allOrders, updateOrder } = useDemoOrders();\n  const { isLocked } = useDemoPeriodLock();');
const overlay = '{editingOrder ? <MutationEditModal order={editingOrder} onClose={() => setEditingOrder(null)} onSave={(patch, changes, reason) => saveMutationEdit(editingOrder, patch, changes, reason)} /> : null}';
replaceOnce(`      <div className="cp-card mt-5 overflow-x-auto">\n        <table className="cp-table">\n          <thead><tr><th>Hari & tanggal</th><th>Kode</th><th>Sumber</th><th>Jenis</th><th>Pembeli</th><th>Nama pesanan</th><th>Karyawan</th><th>Gim</th><th>Wilayah</th><th>Server</th><th>Jumlah</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead>`,
`      <MutationSpreadsheet rowCount={rows.length} filterLabel={periodLabel} readOnly={isLocked}\n        overlay=${overlay} onOverlayClose={() => setEditingOrder(null)}>`);
replaceOnce(`        </table>\n        {!rows.length ? <div className="p-6 text-sm text-zinc-500">Tidak ada Mutasi sesuai filter.</div> : null}\n      </div>\n\n      ${overlay}`, '      </MutationSpreadsheet>');
replaceOnce('className="min-w-[210px] text-sm"', 'className="text-sm"');
replaceOnce('<td className="min-w-[230px]">', '<td>');
replaceOnce('<td className="min-w-[360px]">', '<td>');
// Tooltip retains a readable full reference when an exceptionally long code is narrowed.
replaceOnce('<td><Link href={`/admin/payroll/orders/${order.externalReference}`}', '<td title={order.externalReference}><Link href={`/admin/payroll/orders/${order.externalReference}`}');
writeFileSync(path, source);
console.log('Changed only presentation on the Mutasi page; callbacks, filters, totals and export are retained.');

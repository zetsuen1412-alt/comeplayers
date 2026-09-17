import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMutasiFhTitles, validateMutasiFhTitles, mutasiFhManifest, type MutasiFhSourceRow } from '../features/payroll/lib/mutasi-fh-import';
const row = (values: Record<string, unknown>, boosterBlack = false): MutasiFhSourceRow => ({ row: 4190, kind: 'imported', values, boosterBlack });
test('STATUS becomes the order name, retaining the original E title', () => {
  assert.deepEqual(getMutasiFhTitles(row({ E: '3.000 STEEL INGOT ', F: 'BAYU', H: 'NA Manibus-X0298 (Medium PvE)' })), { orderName: 'NA Manibus-X0298 (Medium PvE)', originalName: '3.000 STEEL INGOT', usesStatus: true, usesWorkerList: false });
});
test('black BOOSTER preserves the title and treats STATUS as worker information', () => {
  const mapped = getMutasiFhTitles(row({ E: '16M Skadi (EU)', H: 'PERMANA 2m\nFARDAN 5m\nFERDI 4m\nDIO 3m\nDANDA 2m' }, true));
  assert.equal(mapped.orderName, '16M Skadi (EU)'); assert.equal(mapped.usesWorkerList, true); assert.equal(mapped.usesStatus, false);
});
test('black fill wins even when BOOSTER contains text', () => {
  assert.equal(getMutasiFhTitles(row({ E: '16M', F: 'FH2', H: 'PERMANA 16m' }, true)).orderName, '16M');
});
test('literal HITAM is never an employee', () => {
  assert.equal(getMutasiFhTitles(row({ E: '16M', F: 'hitam', H: 'PERMANA 16m' })).usesWorkerList, true);
});
test('blank STATUS falls back to the original order title', () => {
  assert.equal(getMutasiFhTitles(row({ E: 'Gold order', F: 'PERMANA', H: ' ' })).orderName, 'Gold order');
});
test('empty BOOSTER alone does not invent an employee or remap the title', () => {
  assert.equal(getMutasiFhTitles(row({ E: 'Original', H: 'Unknown text' })).orderName, 'Original');
});
test('numeric STATUS content is preserved as text, not discarded', () => {
  assert.equal(getMutasiFhTitles(row({ E: 'Original', F: 'Worker', H: 0 })).orderName, '0');
});
test('V2 validation rejects the old STATUS-only-in-service mapping', () => {
  assert.throws(() => validateMutasiFhTitles([{ sourceRow: 4190, orderName: 'Original', service: 'New order name' }], [row({ E: 'Original', F: 'Worker', H: 'New order name' })]), /versi 2/);
});
test('V2 validation preserves both names', () => {
  assert.doesNotThrow(() => validateMutasiFhTitles([{ sourceRow: 4190, orderName: 'New order name', service: 'Original' }], [row({ E: 'Original', F: 'Worker', H: 'New order name' })]));
});
test('a worker list cannot become the order title', () => {
  assert.throws(() => validateMutasiFhTitles([{ sourceRow: 4190, orderName: 'PERMANA 2m', service: '16M' }], [row({ E: '16M', H: 'PERMANA 2m' }, true)]), /Daftar karyawan/);
});
test('duplicate and missing source rows are rejected', () => {
  assert.throws(() => validateMutasiFhTitles([], [row({}), row({})]), /duplikat/);
  assert.throws(() => validateMutasiFhTitles([{ sourceRow: 123, service: '' }], [row({})]), /tidak ditemukan/);
});
test('manifest is pinned to the reviewed source and the corrected packet', () => {
  assert.equal(mutasiFhManifest.mappingVersion, 2); assert.equal(mutasiFhManifest.orderCount, 4404);
  assert.equal(mutasiFhManifest.sourceRowCount, 4854); assert.equal(mutasiFhManifest.grossMinor, 1575401476);
  assert.match(mutasiFhManifest.packetSha256, /^[a-f0-9]{64}$/);
});

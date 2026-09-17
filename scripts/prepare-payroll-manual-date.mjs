import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const path = 'website/features/payroll/components/order-entry-form.tsx';
const source = readFileSync(path, 'utf8');
const sha = createHash('sha1').update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest('hex');
if (sha !== 'd289c3f3c0c7b6b8ba73acd9362234a7d86d5185') throw new Error('Entry form changed; review current source before applying.');
let output = source;
function once(before, after) {
  if (output.split(before).length !== 2) throw new Error(`Expected one exact source block: ${before.slice(0, 90)}`);
  output = output.replace(before, after);
}
once('import { authenticatedFetch } from "@/lib/authenticatedFetch";\n', '');
once('import { formatDateTimeID } from "@/features/payroll/lib/date";', 'import { jakartaDateTimeLocalNow } from "@/features/payroll/lib/date";\nimport { parseManualOrderTime } from "@/features/payroll/lib/manual-order-time";\nimport { ManualOrderDateField } from "@/features/payroll/components/manual-order-date-field";');
const start = output.indexOf('async function getServerTime() {');
const end = output.indexOf('export function OrderEntryForm()', start);
if (start < 0 || end < 0) throw new Error('Missing server-clock helper');
output = output.slice(0, start) + output.slice(end);
once('  const [serverTime, setServerTime] = useState<string | null>(null);', '  const [orderDateTime, setOrderDateTime] = useState("");');
const effectStart = output.indexOf('  useEffect(() => {');
const effectEnd = output.indexOf('\n\n  const orderCode', effectStart);
if (effectStart < 0 || effectEnd < 0 || !output.slice(effectStart, effectEnd).includes('setInterval')) throw new Error('Unexpected server-clock effect');
output = output.slice(0, effectStart) + `  useEffect(() => {
    // Initialize once after hydration. Manual edits are never refreshed by a timer.
    setOrderDateTime(current => current || jakartaDateTimeLocalNow());
  }, []);

  const orderTimeResult = useMemo(() => parseManualOrderTime(orderDateTime), [orderDateTime]);` + output.slice(effectEnd);
once('  const canSave = Boolean(serverTime)', '  const canSave = orderTimeResult.ok');
once('    event.preventDefault();\n    setMessage(null);', `    event.preventDefault();
    if (saving) return;
    setMessage(null);
    const submittedTime = parseManualOrderTime(orderDateTime);
    if (!submittedTime.ok) return setMessage({ type: "error", text: submittedTime.error });`);
once('      const orderTime = await getServerTime();\n      setServerTime(orderTime);\n      const due = new Date(new Date(orderTime).getTime() + 24 * 60 * 60 * 1000).toISOString();', '      const { orderedAt: orderTime, dueAt: due } = submittedTime;');
once('<strong>Isi kode pesanan secara manual. Tanggal diambil dari server.</strong>', '<strong>Isi kode, tanggal, dan jam pesanan secara manual (WIB).</strong> Tanggal lama dapat dipilih sesuai data spreadsheet.');
once(`          <div className="text-sm">Hari &amp; tanggal pesanan
            <div className="mt-2 min-h-[50px] rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-medium">{serverTime ? formatDateTimeID(serverTime) : "Mengambil waktu server..."}</div>
          </div>`, `          <ManualOrderDateField value={orderDateTime} onChange={setOrderDateTime} disabled={saving} inputClass={inputClass} />`);
once('canSave ? "Simpan Pesanan & Buat Mutasi" : needsStock', 'canSave ? "Simpan Pesanan & Buat Mutasi" : !orderTimeResult.ok ? "Periksa Tanggal & Jam Sebelum Simpan" : needsStock');
if (/getServerTime|serverTime|setInterval|authenticatedFetch/.test(output)) throw new Error('Server-clock dependency remains');
writeFileSync(path, output);
for (const path of ['website/app/admin/payroll/orders/page.tsx', 'website/app/admin/payroll/orders/new/page.tsx']) {
  const text = readFileSync(path, 'utf8');
  const before = 'Kode pesanan diisi manual; tanggal mengikuti server.';
  if (text.split(before).length !== 2) throw new Error(`Unexpected page description: ${path}`);
  writeFileSync(path, text.replace(before, 'Kode, tanggal dan jam pesanan dipilih manual dalam WIB. Tanggal lama dapat digunakan sesuai data spreadsheet.'));
}
console.log('Prepared only the entry form and its two route descriptions. No import, database, stock, or payroll rules changed.');

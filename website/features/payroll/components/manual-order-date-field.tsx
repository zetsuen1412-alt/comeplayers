'use client';

import { formatDateTimeID, jakartaDateTimeLocalNow } from '@/features/payroll/lib/date';
import { parseManualOrderTime } from '@/features/payroll/lib/manual-order-time';

type Props = { value: string; onChange: (value: string) => void; disabled?: boolean; inputClass: string };

export function ManualOrderDateField({ value, onChange, disabled = false, inputClass }: Props) {
  const result = parseManualOrderTime(value);
  return <div className="min-w-0 text-sm">
    <label htmlFor="payroll-order-datetime">Hari, tanggal &amp; jam pesanan (WIB)</label>
    <input
      id="payroll-order-datetime"
      name="orderedAtLocal"
      type="datetime-local"
      step={60}
      required
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled}
      aria-invalid={!result.ok}
      aria-describedby="payroll-order-datetime-preview payroll-order-datetime-help"
      className={`${inputClass} min-w-0 [color-scheme:dark]`}
    />
    <div id="payroll-order-datetime-preview" aria-live="polite" className={`mt-2 text-xs ${result.ok ? 'text-yellow-200' : 'text-red-300'}`}>
      {result.ok ? formatDateTimeID(result.orderedAt) : result.error}
    </div>
    <p id="payroll-order-datetime-help" className="mt-1 text-xs leading-5 text-zinc-400">Pilih tanggal dan jam sesuai pesanan, termasuk tanggal lama. Nama hari mengikuti tanggal yang dipilih. Waktu tidak berubah otomatis.</p>
    <button type="button" onClick={() => onChange(jakartaDateTimeLocalNow())} disabled={disabled} className="mt-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-400 disabled:opacity-40">Gunakan waktu sekarang</button>
  </div>;
}

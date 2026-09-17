/** A datetime-local value is a WIB wall-clock time, never the device timezone. */
export type ManualOrderTime =
  | { ok: true; orderedAt: string; dueAt: string }
  | { ok: false; error: string };

export function parseManualOrderTime(value: string): ManualOrderTime {
  if (!value) return { ok: false, error: 'Tanggal dan jam pesanan wajib diisi.' };
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { ok: false, error: 'Masukkan tanggal dan jam pesanan yang lengkap dalam WIB.' };
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const fail: ManualOrderTime = { ok: false, error: 'Tanggal atau jam pesanan tidak valid. Periksa kembali kalender dan jamnya.' };
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return fail;
  const milliseconds = Date.parse(`${value}:00+07:00`);
  if (!Number.isFinite(milliseconds)) return fail;
  // Reject dates such as 30 February instead of letting Date normalize them.
  const local = new Date(milliseconds + 7 * 60 * 60 * 1000);
  if (local.getUTCFullYear() !== year || local.getUTCMonth() + 1 !== month || local.getUTCDate() !== day || local.getUTCHours() !== hour || local.getUTCMinutes() !== minute) return fail;
  return {
    ok: true,
    orderedAt: new Date(milliseconds).toISOString(),
    // Preserve the existing 24-hour due-date rule, relative to the chosen date.
    dueAt: new Date(milliseconds + 24 * 60 * 60 * 1000).toISOString(),
  };
}

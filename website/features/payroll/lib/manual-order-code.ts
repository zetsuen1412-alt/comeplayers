/** New payroll references are supplied by the operator, never generated. */
export function manualOrderCode(value: string, existing: string[] = []): string {
  const code = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(code))
    throw new Error("Isi kode order 1–64 karakter menggunakan huruf, angka, titik, tanda hubung atau garis bawah.");
  if (existing.some(reference => reference.trim().toLowerCase() === code.toLowerCase()))
    throw new Error("Kode order sudah digunakan. Masukkan kode lain.");
  return code;
}

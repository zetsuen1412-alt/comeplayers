"use client";

import { FormEvent, useMemo, useState } from "react";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoAdvances } from "@/features/payroll/lib/demo-advance-store";
import { formatDateTimeID } from "@/features/payroll/lib/date";
import { formatMoney } from "@/features/payroll/lib/money";

export function KasbonManager() {
  const { employees } = useDemoEmployees();
  const { records, outstandingByEmployee, addKasbon, markPaid, resetKasbon } = useDemoAdvances();
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const selected = employees.find((row) => row.id === employeeId) ?? null;
  const totalOutstanding = useMemo(() => Object.values(outstandingByEmployee).reduce<number>((sum, value) => sum + Number(value), 0), [outstandingByEmployee]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!selected) return setMessage("⚠ Pilih karyawan terlebih dahulu.");
    const result = addKasbon(selected, amount, note);
    if (!result.ok) return setMessage(`⚠ ${result.message}`);
    setMessage(`✓ Kasbon ${selected.name} sebesar ${formatMoney(result.row.amountMinor)} berhasil dicatat.`);
    setAmount(0);
    setNote("");
  }

  const inputClass = "mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 outline-none focus:border-yellow-400";

  return (
    <div className="space-y-5">
      <section className="cp-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-zinc-500">Total kasbon belum lunas</div>
            <div className="mt-1 text-3xl font-semibold text-amber-300">{formatMoney(totalOutstanding)}</div>
          </div>
          <button type="button" onClick={() => confirm("Kosongkan semua data kasbon?") && resetKasbon()} className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold">Kosongkan Kasbon</button>
        </div>
      </section>

      <form onSubmit={submit} className="cp-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Tambah Kasbon</h2>
        <p className="mt-1 text-sm text-zinc-500">Kasbon aktif otomatis muncul sebagai potongan di menu Gaji.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm">Karyawan
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass} required>
              <option value="">Pilih karyawan</option>
              {employees.filter((row) => row.workforceStatus !== "RESIGN").map((row) => <option key={row.id} value={row.id}>{row.name} — {row.team} — {row.workforceStatus}</option>)}
            </select>
          </label>
          <label className="text-sm">Jumlah kasbon
            <input type="number" min="0" step="1000" value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} className={inputClass} required />
          </label>
          <label className="text-sm">Catatan
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: Kasbon 10 September" className={inputClass} />
          </label>
        </div>
        {selected ? <div className="mt-4 rounded-xl bg-zinc-950/70 p-3 text-sm">Saldo kasbon {selected.name} saat ini: <strong className="text-amber-300">{formatMoney(outstandingByEmployee[selected.code] ?? 0)}</strong></div> : null}
        {message ? <div className="mt-4 rounded-xl bg-zinc-900 p-3 text-sm">{message}</div> : null}
        <button type="submit" className="mt-4 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-bold text-black">Simpan Kasbon</button>
      </form>

      <div className="cp-card overflow-x-auto">
        <table className="cp-table">
          <thead><tr><th>Tanggal</th><th>Karyawan</th><th>FH</th><th>Kasbon awal</th><th>Sisa</th><th>Catatan</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.id}>
                <td className="min-w-[210px]">{formatDateTimeID(row.createdAt)}</td>
                <td className="font-semibold">{row.employeeName}<div className="text-xs font-normal text-zinc-500">{row.employeeCode}</div></td>
                <td>{row.team}</td>
                <td>{formatMoney(row.amountMinor)}</td>
                <td className={row.remainingMinor > 0 ? "font-semibold text-amber-300" : "text-emerald-300"}>{formatMoney(row.remainingMinor)}</td>
                <td className="min-w-[220px]">{row.note || "—"}</td>
                <td>{row.status === "active" ? "Belum lunas" : "Lunas"}</td>
                <td>{row.status === "active" ? <button onClick={() => confirm(`Tandai kasbon ${row.employeeName} ini lunas?`) && markPaid(row.id)} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black">Tandai Lunas</button> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length ? <div className="p-6 text-center text-sm text-zinc-500">Belum ada kasbon.</div> : null}
      </div>
    </div>
  );
}

"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
import { FormEvent, useMemo, useState } from "react";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoAdvances } from "@/features/payroll/lib/demo-advance-store";
import { useDemoInventory } from "@/features/payroll/lib/demo-inventory-store";
import { getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { useDemoPayrollSettings } from "@/features/payroll/lib/demo-payroll-settings-store";
import { exportEmployeesSpreadsheet } from "@/features/payroll/lib/spreadsheet-export";
import type { Employee, EmployeeWorkStatus } from "@/features/payroll/types/domain";

const statuses: EmployeeWorkStatus[] = ["NEW", "SHIFT", "FULL", "SAKIT", "IJIN", "RESIGN"];

function statusClass(status: EmployeeWorkStatus) {
  if (status === "SAKIT" || status === "IJIN") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (status === "RESIGN") return "border-red-500/30 bg-red-500/10 text-red-200";
  if (status === "FULL") return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  if (status === "NEW") return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

export function EmployeeManager() {
  const { employees, addEmployee, updateEmployeeStatus, removeEmployee, resetEmployees } = useDemoEmployees();
  const { allOrders } = useDemoOrders();
  const { records: kasbonRecords } = useDemoAdvances();
  const { inventory, movements } = useDemoInventory();
  const { settings, clearEmployeePayrollSettings } = useDemoPayrollSettings();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [team, setTeam] = useState<Employee["team"]>("FH1");
  const [status, setStatus] = useState<EmployeeWorkStatus>("NEW");
  const [message, setMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<"SEMUA" | Employee["team"]>("SEMUA");
  const [statusFilter, setStatusFilter] = useState<"SEMUA" | EmployeeWorkStatus>("SEMUA");
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => employees.filter((employee) => {
    if (teamFilter !== "SEMUA" && employee.team !== teamFilter) return false;
    if (statusFilter !== "SEMUA" && employee.workforceStatus !== statusFilter) return false;
    return true;
  }), [employees, statusFilter, teamFilter]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const result = addEmployee({ name, team, status });
    if (!result.ok) return setMessage(`⚠ ${result.message}`);
    setMessage(`✓ ${result.row.name} berhasil ditambahkan sebagai ${result.row.code} di ${result.row.team}.`);
    setName("");
    setStatus("NEW");
  }

  function employeeUsage(employeeCode: string) {
    const orderCount = allOrders.filter((order) => {
      if (getOrderAssignments(order).some((assignment) => assignment.employeeCode === employeeCode)) return true;
      return (order.dailyWork ?? []).some((day) =>
        (day.workerAssignments ?? []).some((assignment) => assignment.employeeCode === employeeCode),
      );
    }).length;
    const kasbonCount = kasbonRecords.filter((row) => row.employeeCode === employeeCode).length;
    const stockCount = inventory.filter((row) => row.employeeCode === employeeCode).length;
    const movementCount = movements.filter((row) => row.employeeCode === employeeCode).length;
    return { orderCount, kasbonCount, stockCount, movementCount };
  }

  function deleteEmployee(employee: Employee) {
    setActionMessage(null);
    const usage = employeeUsage(employee.code);
    const parts = [
      usage.orderCount ? `${usage.orderCount} pesanan/mutasi` : "",
      usage.kasbonCount ? `${usage.kasbonCount} data kasbon` : "",
      usage.stockCount ? `${usage.stockCount} stok gudang` : "",
      usage.movementCount ? `${usage.movementCount} riwayat stok` : "",
    ].filter(Boolean);

    if (parts.length) {
      setActionMessage(`⚠ ${employee.name} belum dapat dihapus karena masih dipakai pada ${parts.join(", ")}. Pindahkan/hapus referensinya terlebih dahulu, atau gunakan status RESIGN untuk mempertahankan riwayat.`);
      return;
    }

    if (!confirm(`Hapus karyawan ${employee.name} (${employee.code}) secara permanen? Pengaturan persentase/potongan miliknya juga akan dibersihkan.`)) return;
    const result = removeEmployee(employee.id);
    if (!result.ok) {
      setActionMessage(`⚠ ${result.message}`);
      return;
    }
    clearEmployeePayrollSettings(employee.code);
    setActionMessage(`✓ ${employee.name} (${employee.code}) berhasil dihapus dari daftar Karyawan.`);
  }

  const inputClass = "mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 outline-none focus:border-yellow-400";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-500">Total karyawan: <strong className="text-white">{employees.length}</strong> · ditampilkan <strong className="text-white">{rows.length}</strong></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowForm((value) => !value)} className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-bold text-black">{showForm ? "Tutup Form" : "+ Tambah Karyawan"}</button>
          <button type="button" onClick={() => confirm("Kosongkan semua data karyawan? Data yang dihapus tidak dapat dikembalikan melalui tombol ini.") && resetEmployees()} className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold">Kosongkan Karyawan</button>
        </div>
      </div>

      <section className="cp-card mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm">Bagian / FH<select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value as "SEMUA" | Employee["team"])} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua</option><option value={"FH1"}>FH1</option><option value={"FH2"}>FH2</option><option value={"FH3"}>FH3</option><option value={"ADMIN"}>ADMIN</option><option value={"BANDAR"}>BANDAR</option></select></label>
          <label className="text-sm">Status<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "SEMUA" | EmployeeWorkStatus)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3"><option value="SEMUA">Semua</option>{statuses.map((value) => <option key={value} value={value}>{adminLabel(value)}</option>)}</select></label>
          <div className="flex items-end"><button type="button" onClick={async () => { setExporting(true); try { await exportEmployeesSpreadsheet(rows, settings.defaultSharePercent, settings.employeeSharePercent, `${teamFilter}_${statusFilter}`); } finally { setExporting(false); } }} disabled={exporting} className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">{exporting ? "Membuat Excel..." : `⬇ Ekspor Karyawan (${rows.length})`}</button></div>
        </div>
        <div className="mt-2 text-xs text-zinc-500">Excel hanya berisi karyawan sesuai FH dan status yang sedang dipilih.</div>
      </section>

      {actionMessage ? <div className="mb-5 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm">{adminText(actionMessage)}</div> : null}

      {showForm ? (
        <form onSubmit={submit} className="cp-card mb-5 p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Tambah Karyawan</h2>
          <p className="mt-1 text-sm text-zinc-500">Isi nama, bagian (FH1/FH2/FH3/ADMIN/BANDAR), dan status awal. Kode karyawan dibuat otomatis.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="text-sm">Nama karyawan
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Rahmat" className={inputClass} required />
            </label>
            <label className="text-sm">Bagian / FH
              <select value={team} onChange={(event) => setTeam(event.target.value as Employee["team"])} className={inputClass}>
                <option value="FH1">FH1</option><option value="FH2">FH2</option><option value="FH3">FH3</option><option value="ADMIN">ADMIN</option><option value="BANDAR">BANDAR</option>
              </select>
            </label>
            <label className="text-sm">Status awal
              <select value={status} onChange={(event) => setStatus(event.target.value as EmployeeWorkStatus)} className={inputClass}>
                {statuses.map((value) => <option key={value} value={value}>{adminLabel(value)}</option>)}
              </select>
            </label>
          </div>
          {message ? <div className="mt-4 rounded-xl bg-zinc-900 p-3 text-sm">{adminText(message)}</div> : null}
          <button type="submit" className="mt-4 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black">Simpan Karyawan</button>
        </form>
      ) : null}

      {!rows.length ? (
        <div className="cp-card p-8 text-center">
          <div className="text-2xl font-semibold">Belum ada karyawan</div>
          <p className="mt-2 text-sm text-zinc-500">Mulai dari nol. Klik <strong className="text-white">+ Tambah Karyawan</strong>, isi nama dan bagian/FH, lalu karyawan akan tersedia di Pesanan, Gudang, Kasbon, dan Gaji.</p>
        </div>
      ) : (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((employee) => (
          <section key={employee.id} className="cp-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{employee.name}</h2>
                <div className="mt-1 text-sm text-zinc-500">{employee.team} · {employee.code}</div>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(employee.workforceStatus)}`}>{adminLabel(employee.workforceStatus)}</span>
            </div>

            <label className="mt-5 block text-sm text-zinc-400">Ubah status kapan saja
              <select value={employee.workforceStatus} onChange={(event) => updateEmployeeStatus(employee.id, event.target.value as EmployeeWorkStatus)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 font-semibold text-white">
                {statuses.map((value) => <option key={value} value={value}>{adminLabel(value)}</option>)}
              </select>
            </label>

            <div className="mt-4 rounded-xl bg-zinc-950/60 p-4">
              <div className="text-sm text-zinc-500">Status saat ini</div>
              <div className="mt-1 text-lg font-semibold">{adminLabel(employee.workforceStatus)}</div>
              <div className="mt-1 text-xs text-zinc-500">Status ini otomatis ikut tampil di menu Gaji.</div>
            </div>
            <div className="mt-4 text-sm text-zinc-400">Beban kerja saat ini: <strong className="text-white">{employee.utilization}%</strong></div>
            <button type="button" onClick={() => deleteEmployee(employee)} className="mt-4 w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-200 hover:bg-red-500/20">Hapus Karyawan</button>
          </section>
        ))}
      </div>
      )}
    </>
  );
}

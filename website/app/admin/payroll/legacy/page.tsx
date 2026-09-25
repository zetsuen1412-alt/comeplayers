"use client";
import { useLiveQuery } from '@/lib/live/use-live-query';

import { adminText } from "@/lib/adminLocale";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FaArrowLeft,
  FaCalculator,
  FaCheckCircle,
  FaEdit,
  FaLock,
  FaMoneyCheckAlt,
  FaPlus,
  FaSave,
  FaTrash,
  FaUserPlus,
  FaUsers,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { calculatePayrollEntry } from "@/lib/payroll";

type Employee = {
  id: number;
  employee_code: string;
  full_name: string;
  team: string | null;
  employment_status: "active" | "inactive";
  default_share_basis_points: number;
};

type PayrollPeriod = {
  id: number;
  period_code: string;
  start_date: string;
  end_date: string;
  currency_code: string;
  status: "draft" | "calculated" | "finalized" | "paid";
  total_work_value_minor: number | string;
  gross_compensation_minor: number | string;
  deductions_minor: number | string;
  net_pay_minor: number | string;
  calculation_hash: string | null;
};

type PayrollEntry = {
  id: number;
  payroll_period_id: number;
  employee_id: number;
  work_value_minor: number | string;
  share_basis_points: number;
  bonus_tips_minor: number | string;
  operational_deduction_minor: number | string;
  penalty_minor: number | string;
  advance_repayment_minor: number | string;
  base_earnings_minor: number | string;
  gross_compensation_minor: number | string;
  deductions_minor: number | string;
  net_pay_minor: number | string;
  note: string | null;
};

type PayrollResponse = {
  profile: { username: string | null; email: string | null; role: string | null };
  employees: Employee[];
  periods: PayrollPeriod[];
  selectedPeriodId: number | null;
  entries: PayrollEntry[];
  previewTotals: {
    employeeCount: number;
    workValue: number;
    grossCompensation: number;
    deductions: number;
    netPay: number;
  };
};

type EntryDraft = {
  workValue: string;
  sharePercent: string;
  bonusTips: string;
  operationalDeduction: string;
  penalty: string;
  advanceRepayment: string;
  note: string;
};

const emptyEntry = (shareBasisPoints = 5000): EntryDraft => ({
  workValue: "0",
  sharePercent: String(shareBasisPoints / 100),
  bonusTips: "0",
  operationalDeduction: "0",
  penalty: "0",
  advanceRepayment: "0",
  note: "",
});

function numberValue(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function today(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function statusLabel(status: PayrollPeriod["status"]) {
  return {
    draft: "Draf",
    calculated: "Sudah dihitung",
    finalized: "Final",
    paid: "Dibayar",
  }[status];
}

function statusClass(status: PayrollPeriod["status"]) {
  if (status === "paid") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "finalized") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  if (status === "calculated") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200";
  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}

export default function AdminPayrollPage() {
  const [data, setData] = useState<PayrollResponse | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, EntryDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeTeam, setEmployeeTeam] = useState("");
  const [employeeShare, setEmployeeShare] = useState("50");
  const [employeeStatus, setEmployeeStatus] = useState<"active" | "inactive">("active");

  const [periodCode, setPeriodCode] = useState(`GAJI-${today().slice(0, 7)}`);
  const [periodStart, setPeriodStart] = useState(today(-13));
  const [periodEnd, setPeriodEnd] = useState(today());
  const [currencyCode, setCurrencyCode] = useState("IDR");

  async function loadPayroll(periodId?: number | null, background = false, canApply: () => boolean = () => true) {
    if (!background) setLoading(true);
    setError("");
    try {
      const query = periodId ? `?periodId=${periodId}` : "";
      const next = await authenticatedFetchJson<PayrollResponse>(`/api/admin/payroll${query}`);
      if (!canApply()) return;
      setData(next);
      setSelectedPeriodId(next.selectedPeriodId);
      const entryMap = new Map(next.entries.map((entry) => [Number(entry.employee_id), entry]));
      const nextDrafts: Record<number, EntryDraft> = {};
      for (const employee of next.employees) {
        const entry = entryMap.get(Number(employee.id));
        nextDrafts[Number(employee.id)] = entry
          ? {
              workValue: String(entry.work_value_minor),
              sharePercent: String(Number(entry.share_basis_points) / 100),
              bonusTips: String(entry.bonus_tips_minor),
              operationalDeduction: String(entry.operational_deduction_minor),
              penalty: String(entry.penalty_minor),
              advanceRepayment: String(entry.advance_repayment_minor),
              note: entry.note || "",
            }
          : emptyEntry(Number(employee.default_share_basis_points));
      }
      setDrafts(nextDrafts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat penggajian.");
    } finally {
      setLoading(false);
    }
  }

  useLiveQuery((background, canApply) => {
    return loadPayroll(background ? selectedPeriodId : undefined, background, canApply);
  }, [], { topics: 'payroll', protectDrafts: true });

  const selectedPeriod = useMemo(
    () => data?.periods.find((period) => Number(period.id) === selectedPeriodId) || null,
    [data?.periods, selectedPeriodId],
  );
  const entryMap = useMemo(
    () => new Map((data?.entries || []).map((entry) => [Number(entry.employee_id), entry])),
    [data?.entries],
  );
  const visibleEmployees = useMemo(
    () =>
      (data?.employees || []).filter(
        (employee) => employee.employment_status === "active" || entryMap.has(Number(employee.id)),
      ),
    [data?.employees, entryMap],
  );

  function money(value: number | string, code = selectedPeriod?.currency_code || "IDR") {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: code,
      maximumFractionDigits: code === "IDR" ? 0 : 2,
    }).format(numberValue(value));
  }

  function updateDraft(employeeIdValue: number, key: keyof EntryDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [employeeIdValue]: { ...(current[employeeIdValue] || emptyEntry()), [key]: value },
    }));
  }

  function preview(draft: EntryDraft | undefined) {
    try {
      const current = draft || emptyEntry();
      return calculatePayrollEntry({
        workValue: Number(current.workValue || 0),
        shareBasisPoints: Math.round(Number(current.sharePercent || 0) * 100),
        bonusTips: Number(current.bonusTips || 0),
        operationalDeduction: Number(current.operationalDeduction || 0),
        penalty: Number(current.penalty || 0),
        advanceRepayment: Number(current.advanceRepayment || 0),
      });
    } catch {
      return null;
    }
  }

  async function mutate(body: Record<string, unknown>, successMessage: string) {
    setBusy(String(body.action || "saving"));
    setNotice("");
    setError("");
    try {
      await authenticatedFetchJson("/api/admin/payroll", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNotice(successMessage);
      await loadPayroll(selectedPeriodId);
      return true;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Perubahan gagal disimpan.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function saveEmployee(event: React.FormEvent) {
    event.preventDefault();
    const saved = await mutate(
      {
        action: "save_employee",
        employeeId,
        employeeCode,
        fullName: employeeName,
        team: employeeTeam,
        employmentStatus: employeeStatus,
        defaultShareBasisPoints: Math.round(Number(employeeShare || 0) * 100),
      },
      employeeId ? "Data karyawan diperbarui." : "Karyawan ditambahkan.",
    );
    if (saved) resetEmployeeForm();
  }

  function editEmployee(employee: Employee) {
    setEmployeeId(Number(employee.id));
    setEmployeeCode(employee.employee_code);
    setEmployeeName(employee.full_name);
    setEmployeeTeam(employee.team || "");
    setEmployeeShare(String(Number(employee.default_share_basis_points) / 100));
    setEmployeeStatus(employee.employment_status);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetEmployeeForm() {
    setEmployeeId(null);
    setEmployeeCode("");
    setEmployeeName("");
    setEmployeeTeam("");
    setEmployeeShare("50");
    setEmployeeStatus("active");
  }

  async function createPeriod(event: React.FormEvent) {
    event.preventDefault();
    const saved = await mutate(
      {
        action: "create_period",
        periodCode,
        startDate: periodStart,
        endDate: periodEnd,
        currencyCode,
      },
      "Periode gaji dibuat.",
    );
    if (saved) {
      setPeriodCode(`GAJI-${today().slice(0, 7)}-${Date.now().toString().slice(-4)}`);
      await loadPayroll(null);
    }
  }

  async function saveEntry(employee: Employee) {
    if (!selectedPeriodId) return;
    const draft = drafts[Number(employee.id)] || emptyEntry(employee.default_share_basis_points);
    await mutate(
      {
        action: "save_entry",
        periodId: selectedPeriodId,
        employeeId: employee.id,
        workValue: Number(draft.workValue || 0),
        shareBasisPoints: Math.round(Number(draft.sharePercent || 0) * 100),
        bonusTips: Number(draft.bonusTips || 0),
        operationalDeduction: Number(draft.operationalDeduction || 0),
        penalty: Number(draft.penalty || 0),
        advanceRepayment: Number(draft.advanceRepayment || 0),
        note: draft.note,
      },
      `Gaji ${employee.full_name} disimpan.`,
    );
  }

  async function removeEntry(entry: PayrollEntry, employee: Employee) {
    if (!confirm(`Hapus perhitungan gaji ${employee.full_name} dari periode ini?`)) return;
    await mutate(
      { action: "delete_entry", entryId: entry.id },
      `Baris gaji ${employee.full_name} dihapus.`,
    );
  }

  async function transition(target: PayrollPeriod["status"]) {
    if (!selectedPeriodId) return;
    const prompts: Partial<Record<PayrollPeriod["status"], string>> = {
      calculated: "Hitung dan simpan snapshot periode ini? Setelah itu data harus dibuka kembali ke Draf untuk diedit.",
      finalized: "Finalisasi periode ini? Data gaji tidak dapat diubah lagi setelah final.",
      paid: "Tandai seluruh periode ini sudah dibayar? Status ini permanen.",
      draft: "Buka kembali hasil perhitungan agar dapat diedit?",
    };
    if (!confirm(prompts[target] || "Lanjutkan?")) return;
    await mutate(
      { action: "transition_period", periodId: selectedPeriodId, target },
      `Status periode diubah menjadi ${statusLabel(target)}.`,
    );
  }

  if (loading && !data) {
    return <div className="min-h-screen bg-[#050812] p-8 text-slate-300">Memuat penggajian...</div>;
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#050812] p-6 text-white">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-400/20 bg-red-400/10 p-6">
          <FaLock className="text-3xl text-red-300" />
          <h1 className="mt-4 text-2xl font-black">Akses penggajian dibatasi</h1>
          <p className="mt-2 text-sm text-red-100">{adminText(error || "Hanya administrator ComePlayers yang dapat membuka halaman ini.")}</p>
          <Link href="/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-bold text-black">
            <FaArrowLeft /> Kembali
          </Link>
        </div>
      </main>
    );
  }

  const editable = selectedPeriod?.status === "draft";

  return (
    <main className="min-h-screen bg-[#050812] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-cyan-300 hover:text-cyan-200">
              <FaArrowLeft /> Pusat Admin
            </Link>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-yellow-300 text-xl text-black"><FaCalculator /></span>
              <div>
                <h1 className="text-2xl font-black sm:text-3xl">Perhitungan Gaji</h1>
                <p className="mt-1 text-sm text-slate-400">Data produksi tersimpan di Supabase dan seluruh perubahan tercatat di audit admin.</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            <strong>Admin:</strong> {data.profile.username || data.profile.email || "ComePlayers"}
          </div>
        </header>

        {notice ? <div className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{adminText(notice)}</div> : null}
        {error ? <div className="mb-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{adminText(error)}</div> : null}

        <section className="mb-6 grid gap-4 xl:grid-cols-2">
          <form onSubmit={saveEmployee} className="rounded-2xl border border-white/10 bg-[#0b1120] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-black"><FaUserPlus className="text-cyan-300" /> {employeeId ? "Edit Karyawan" : "Tambah Karyawan"}</h2>
              {employeeId ? <button type="button" onClick={resetEmployeeForm} className="text-sm text-slate-400">Batal edit</button> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kode karyawan"><input required value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} placeholder="EMP-001" className="cp-payroll-input" /></Field>
              <Field label="Nama lengkap"><input required value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder="Nama karyawan" className="cp-payroll-input" /></Field>
              <Field label="Tim"><input value={employeeTeam} onChange={(event) => setEmployeeTeam(event.target.value)} placeholder="Contoh: FH1" className="cp-payroll-input" /></Field>
              <Field label="Persentase bawaan"><div className="flex items-center gap-2"><input type="number" min="0" max="100" step="0.01" required value={employeeShare} onChange={(event) => setEmployeeShare(event.target.value)} className="cp-payroll-input" /><span>%</span></div></Field>
              <Field label="Status"><select value={employeeStatus} onChange={(event) => setEmployeeStatus(event.target.value as "active" | "inactive")} className="cp-payroll-input"><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></Field>
            </div>
            <button disabled={Boolean(busy)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 font-black text-slate-950 disabled:opacity-50"><FaSave /> Simpan karyawan</button>
          </form>

          <form onSubmit={createPeriod} className="rounded-2xl border border-white/10 bg-[#0b1120] p-5 shadow-xl">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><FaPlus className="text-yellow-300" /> Buat Periode Gaji</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kode periode"><input required value={periodCode} onChange={(event) => setPeriodCode(event.target.value)} className="cp-payroll-input" /></Field>
              <Field label="Mata uang"><select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} className="cp-payroll-input"><option value="IDR">IDR — Rupiah</option><option value="USD">USD — Dollar</option></select></Field>
              <Field label="Tanggal mulai"><input type="date" required value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="cp-payroll-input" /></Field>
              <Field label="Tanggal selesai"><input type="date" required value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="cp-payroll-input" /></Field>
            </div>
            <button disabled={Boolean(busy)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-yellow-300 px-4 py-2.5 font-black text-black disabled:opacity-50"><FaPlus /> Buat periode</button>
          </form>
        </section>

        <section className="mb-6 rounded-2xl border border-white/10 bg-[#0b1120] p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Field label="Periode aktif">
              <select
                value={selectedPeriodId || ""}
                onChange={(event) => void loadPayroll(event.target.value ? Number(event.target.value) : null)}
                className="cp-payroll-input min-w-72"
              >
                <option value="">Pilih periode</option>
                {data.periods.map((period) => <option key={period.id} value={period.id}>{period.period_code} · {statusLabel(period.status)}</option>)}
              </select>
            </Field>
            {selectedPeriod ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-2 text-xs font-black ${statusClass(selectedPeriod.status)}`}>{statusLabel(selectedPeriod.status)}</span>
                {selectedPeriod.status === "draft" ? <button onClick={() => void transition("calculated")} disabled={Boolean(busy)} className="cp-payroll-action bg-yellow-300 text-black"><FaCalculator /> Hitung periode</button> : null}
                {selectedPeriod.status === "calculated" ? <><button onClick={() => void transition("draft")} disabled={Boolean(busy)} className="cp-payroll-action bg-slate-700"><FaEdit /> Buka Draf</button><button onClick={() => void transition("finalized")} disabled={Boolean(busy)} className="cp-payroll-action bg-cyan-300 text-black"><FaLock /> Finalisasi</button></> : null}
                {selectedPeriod.status === "finalized" ? <button onClick={() => void transition("paid")} disabled={Boolean(busy)} className="cp-payroll-action bg-emerald-400 text-black"><FaMoneyCheckAlt /> Tandai dibayar</button> : null}
              </div>
            ) : null}
          </div>
        </section>

        {selectedPeriod ? (
          <>
            <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Nilai pekerjaan" value={money(data.previewTotals.workValue)} icon={<FaCalculator />} />
              <Metric label="Gaji kotor" value={money(data.previewTotals.grossCompensation)} icon={<FaUsers />} />
              <Metric label="Total potongan" value={money(data.previewTotals.deductions)} icon={<FaMoneyCheckAlt />} />
              <Metric label="Gaji bersih" value={money(data.previewTotals.netPay)} icon={<FaCheckCircle />} highlight />
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1120] shadow-2xl">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="font-black">{selectedPeriod.period_code}</h2>
                <p className="mt-1 text-xs text-slate-400">{selectedPeriod.start_date} sampai {selectedPeriod.end_date} · Rumus: pekerjaan × persentase + bonus − operasional − denda − kasbon.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1500px] w-full text-left text-sm">
                  <thead className="bg-black/25 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-3">Karyawan</th><th className="p-3">Nilai pekerjaan</th><th className="p-3">Persentase</th><th className="p-3">Gaji awal</th><th className="p-3">Bonus/uang tip</th><th className="p-3">Operasional</th><th className="p-3">Denda</th><th className="p-3">Kasbon</th><th className="p-3">Gaji bersih</th><th className="p-3">Catatan</th><th className="p-3">Aksi</th></tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {visibleEmployees.map((employee) => {
                      const draft = drafts[Number(employee.id)] || emptyEntry(employee.default_share_basis_points);
                      const result = preview(draft);
                      const savedEntry = entryMap.get(Number(employee.id));
                      return (
                        <tr key={employee.id} className="align-top hover:bg-white/[0.025]">
                          <td className="p-3"><strong>{employee.full_name}</strong><div className="mt-1 text-xs text-slate-500">{employee.employee_code}{employee.team ? ` · ${employee.team}` : ""}</div><button onClick={() => editEmployee(employee)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-cyan-300"><FaEdit /> Ubah</button></td>
                          <PayrollInput value={draft.workValue} onChange={(value) => updateDraft(employee.id, "workValue", value)} disabled={!editable} />
                          <td className="p-3"><div className="flex items-center gap-1"><input type="number" min="0" max="100" step="0.01" value={draft.sharePercent} onChange={(event) => updateDraft(employee.id, "sharePercent", event.target.value)} disabled={!editable} className="cp-payroll-table-input w-24" /><span>%</span></div></td>
                          <td className="p-3 font-bold text-yellow-200">{result ? money(result.baseEarnings) : "Periksa input"}</td>
                          <PayrollInput value={draft.bonusTips} onChange={(value) => updateDraft(employee.id, "bonusTips", value)} disabled={!editable} />
                          <PayrollInput value={draft.operationalDeduction} onChange={(value) => updateDraft(employee.id, "operationalDeduction", value)} disabled={!editable} />
                          <PayrollInput value={draft.penalty} onChange={(value) => updateDraft(employee.id, "penalty", value)} disabled={!editable} />
                          <PayrollInput value={draft.advanceRepayment} onChange={(value) => updateDraft(employee.id, "advanceRepayment", value)} disabled={!editable} />
                          <td className={`p-3 font-black ${result ? "text-emerald-300" : "text-red-300"}`}>{result ? money(result.netPay) : "Potongan terlalu besar"}</td>
                          <td className="p-3"><input value={draft.note} onChange={(event) => updateDraft(employee.id, "note", event.target.value)} disabled={!editable} maxLength={1000} className="cp-payroll-table-input w-56" placeholder="Opsional" /></td>
                          <td className="p-3"><div className="flex gap-2">{editable ? <button onClick={() => void saveEntry(employee)} disabled={Boolean(busy) || !result} className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-300 text-black disabled:opacity-40" title="Simpan"><FaSave /></button> : <FaLock className="mt-3 text-slate-600" />}{editable && savedEntry ? <button onClick={() => void removeEntry(savedEntry, employee)} disabled={Boolean(busy)} className="grid h-10 w-10 place-items-center rounded-lg bg-red-400/15 text-red-300" title="Hapus"><FaTrash /></button> : null}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!visibleEmployees.length ? <div className="p-10 text-center text-sm text-slate-400">Tambahkan karyawan terlebih dahulu. Sistem ini tidak memakai data demo.</div> : null}
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-slate-400">Buat periode gaji untuk mulai menghitung.</div>
        )}
      </div>

      <style jsx global>{`
        .cp-payroll-input { width: 100%; border: 1px solid rgba(148,163,184,.22); border-radius: .75rem; background: #050812; padding: .7rem .8rem; color: white; outline: none; }
        .cp-payroll-input:focus, .cp-payroll-table-input:focus { border-color: rgba(103,232,249,.75); box-shadow: 0 0 0 3px rgba(103,232,249,.1); }
        .cp-payroll-table-input { border: 1px solid rgba(148,163,184,.18); border-radius: .6rem; background: #050812; padding: .55rem .65rem; color: white; outline: none; }
        .cp-payroll-table-input:disabled { opacity: .72; cursor: not-allowed; }
        .cp-payroll-action { display: inline-flex; align-items: center; gap: .45rem; border-radius: .7rem; padding: .65rem .85rem; font-size: .8rem; font-weight: 900; }
        .cp-payroll-action:disabled { opacity: .5; }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>{children}</label>;
}

function PayrollInput({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <td className="p-3"><input type="number" min="0" step="1" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="cp-payroll-table-input w-36" /></td>;
}

function Metric({ label, value, icon, highlight = false }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${highlight ? "border-emerald-400/25 bg-emerald-400/10" : "border-white/10 bg-[#0b1120]"}`}><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">{icon}{label}</div><div className={`mt-2 text-xl font-black ${highlight ? "text-emerald-300" : "text-white"}`}>{value}</div></div>;
}

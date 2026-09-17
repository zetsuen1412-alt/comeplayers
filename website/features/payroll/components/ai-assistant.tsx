"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { financeIssues } from "@/features/payroll/lib/demo-data";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoPayrollSettings } from "@/features/payroll/lib/demo-payroll-settings-store";
import { useDemoAdvances } from "@/features/payroll/lib/demo-advance-store";
import {
  AiFinding,
  answerLocalBusinessQuestion,
  auditClosing,
  auditMutations,
  auditPayroll,
  auditSummary,
} from "@/features/payroll/lib/ai-auditor";
import { formatMoney } from "@/features/payroll/lib/money";

type Tab = "ringkasan" | "mutasi" | "gaji" | "tutup_buku" | "tanya";

const tabLabels: Record<Tab, string> = {
  ringkasan: "Ringkasan",
  mutasi: "Cek Mutasi",
  gaji: "Cek Gaji",
  tutup_buku: "Cek Tutup Buku",
  tanya: "Tanya AI",
};

function severityLabel(value: AiFinding["severity"]) {
  if (value === "critical") return { label: "Penting", cls: "border-red-500/30 bg-red-500/10 text-red-200" };
  if (value === "high") return { label: "Perlu segera dicek", cls: "border-orange-500/30 bg-orange-500/10 text-orange-200" };
  if (value === "warning") return { label: "Perlu dicek", cls: "border-yellow-500/30 bg-yellow-500/10 text-yellow-100" };
  return { label: "Info", cls: "border-blue-500/30 bg-blue-500/10 text-blue-100" };
}

function FindingList({ rows }: { rows: AiFinding[] }) {
  if (!rows.length) {
    return <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">✓ Tidak ditemukan masalah pada pemeriksaan ini.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const severity = severityLabel(row.severity);
        return (
          <article key={row.id} className="cp-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${severity.cls}`}>{severity.label}</span>
                  <span className="text-sm font-semibold text-zinc-400">{row.entity}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold">{row.title}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{row.explanation}</p>
                <div className="mt-3 rounded-xl bg-zinc-950/70 p-3 text-sm leading-6 text-zinc-300"><strong>Saran:</strong> {row.suggestion}</div>
              </div>
              {typeof row.exposureMinor === "number" && row.exposureMinor > 0 ? <div className="text-sm font-semibold text-yellow-200">Nilai terkait: {formatMoney(row.exposureMinor)}</div> : null}
            </div>
            {row.orderRef ? <Link href={`/admin/payroll/orders/${row.orderRef}`} className="mt-4 inline-flex rounded-xl bg-yellow-400 px-3 py-2 text-xs font-bold text-black">Buka {row.orderRef} →</Link> : null}
          </article>
        );
      })}
    </div>
  );
}

export function AiAssistant() {
  const { allOrders } = useDemoOrders();
  const { employees } = useDemoEmployees();
  const { settings } = useDemoPayrollSettings();
  const { outstandingByEmployee } = useDemoAdvances();
  const payrollOptions = useMemo(() => ({ defaultSharePercent: settings.defaultSharePercent, employeeSharePercent: settings.employeeSharePercent, employees, adjustments: settings.adjustments, kasbonByEmployee: outstandingByEmployee }), [employees, outstandingByEmployee, settings]);
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("Pilih pertanyaan cepat atau ketik pertanyaan Anda sendiri.");

  const mutationFindings = useMemo(() => auditMutations(allOrders, financeIssues), [allOrders]);
  const payrollFindings = useMemo(() => auditPayroll(allOrders, payrollOptions), [allOrders, payrollOptions]);
  const closingFindings = useMemo(() => auditClosing(allOrders, financeIssues), [allOrders]);
  const mutationSummary = auditSummary(mutationFindings);
  const payrollSummary = auditSummary(payrollFindings);
  const closingSummary = auditSummary(closingFindings);

  function ask(text: string) {
    setQuestion(text);
    setAnswer(answerLocalBusinessQuestion(text, allOrders, financeIssues, payrollOptions));
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-violet-200">🤖 Asisten Pemeriksa</div>
            <h2 className="mt-2 text-2xl font-semibold">Bantu menemukan data yang perlu Anda cek</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">Versi ini bekerja lokal dari data CP-OFS. Tidak mengubah nominal, gaji, atau tutup buku secara otomatis.</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">✓ Aman: hanya membaca & memberi saran</div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(tabLabels) as Tab[]).map((key) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === key ? "bg-yellow-400 text-black" : "bg-zinc-800 text-zinc-200"}`}>
            {tabLabels[key]}
          </button>
        ))}
      </div>

      {tab === "ringkasan" ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <button onClick={() => setTab("mutasi")} className="cp-card p-5 text-left transition hover:border-yellow-500/40">
              <div className="text-sm text-zinc-500">Cek Mutasi</div>
              <div className="mt-2 text-3xl font-semibold">{mutationSummary.total}</div>
              <div className="mt-2 text-sm text-zinc-400">{mutationSummary.critical} penting · {mutationSummary.high + mutationSummary.warning} perlu dicek</div>
            </button>
            <button onClick={() => setTab("gaji")} className="cp-card p-5 text-left transition hover:border-yellow-500/40">
              <div className="text-sm text-zinc-500">Cek Gaji</div>
              <div className="mt-2 text-3xl font-semibold">{payrollSummary.total}</div>
              <div className="mt-2 text-sm text-zinc-400">Pesanan selesai yang belum masuk gaji dan masalah penggajian.</div>
            </button>
            <button onClick={() => setTab("tutup_buku")} className={`rounded-2xl border p-5 text-left ${closingSummary.safe ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
              <div className="text-sm text-zinc-400">Kesiapan Tutup Buku</div>
              <div className="mt-2 text-2xl font-semibold">{closingSummary.safe ? "Siap diperiksa" : "Belum siap"}</div>
              <div className="mt-2 text-sm text-zinc-400">{closingSummary.total} hal perlu perhatian.</div>
            </button>
          </div>

          <section className="cp-card p-5 sm:p-6">
            <h3 className="text-xl font-semibold">Cara pakai paling mudah</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {["1. Cek Mutasi", "2. Cek Gaji", "3. Cek Tutup Buku", "4. Perbaiki yang ditandai"].map((text) => <div key={text} className="rounded-xl bg-zinc-950/70 p-4 text-sm font-semibold">{text}</div>)}
            </div>
          </section>
        </>
      ) : null}

      {tab === "mutasi" ? <FindingList rows={mutationFindings} /> : null}
      {tab === "gaji" ? <FindingList rows={payrollFindings} /> : null}
      {tab === "tutup_buku" ? (
        <div className="space-y-4">
          <div className={`rounded-2xl border p-5 ${closingSummary.safe ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
            <div className="text-sm text-zinc-400">Hasil pemeriksaan</div>
            <div className="mt-1 text-2xl font-semibold">{closingSummary.safe ? "Data utama siap diperiksa untuk tutup buku" : "Jangan tutup buku dulu"}</div>
            <div className="mt-2 text-sm text-zinc-300">Penting: {closingSummary.critical} · Tinggi: {closingSummary.high} · Peringatan: {closingSummary.warning}</div>
            <Link href="/admin/payroll/finance/closing" className="mt-4 inline-flex rounded-xl bg-yellow-400 px-4 py-2 text-sm font-bold text-black">Buka Tutup Buku →</Link>
          </div>
          <FindingList rows={closingFindings} />
        </div>
      ) : null}

      {tab === "tanya" ? (
        <section className="cp-card p-5 sm:p-6">
          <h3 className="text-xl font-semibold">Tanya dengan bahasa biasa</h3>
          <p className="mt-2 text-sm text-zinc-500">Asisten berbasis aturan memeriksa data bisnis Anda tanpa layanan AI berbayar.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Ada masalah apa?", "Berapa omzet?", "Berapa uang masuk?", "Pesanan mana yang belum selesai?", "Berapa total gaji?", "Siapa pendapatan terbesar?", "Apakah siap tutup buku?"].map((text) => (
              <button key={text} onClick={() => ask(text)} className="rounded-xl bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700">{text}</button>
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(question); }} placeholder="Contoh: Ada masalah apa hari ini?" className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3" />
            <button onClick={() => ask(question)} className="rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black">Tanya</button>
          </div>
          <div className="mt-5 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-5">
            <div className="text-sm font-semibold text-violet-200">Jawaban Asisten</div>
            <p className="mt-2 leading-7 text-zinc-200">{answer}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

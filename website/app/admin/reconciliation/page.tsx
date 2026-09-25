"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import { adminLabel, adminScanScope, adminText } from "@/lib/adminLocale";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaHistory,
  FaSearchDollar,
  FaSyncAlt,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type RunSummary = {
  scannedOrders?: number;
  scannedPayPalTransactions?: number;
  scannedWalletTransactions?: number;
  scannedWithdrawals?: number;
  issueCount?: number;
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
};

type ReconciliationRun = {
  id: string;
  scope_key: string;
  source: string;
  status: string;
  scanned_count: number;
  issue_count: number;
  critical_count: number;
  summary: RunSummary | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type ReconciliationIssue = {
  id: number;
  issue_key: string;
  issue_type: string;
  severity: "low" | "medium" | "high" | "critical";
  entity_type: string;
  entity_id: string;
  title: string;
  description: string;
  expected: Record<string, unknown> | null;
  actual: Record<string, unknown> | null;
  status: "open" | "resolved" | "ignored";
  occurrence_count: number;
  first_detected_at: string;
  last_detected_at: string;
  resolution_note: string | null;
};

type ReconciliationPayload = {
  runs: ReconciliationRun[];
  issues: ReconciliationIssue[];
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function pretty(value: string) {
  return adminLabel(value);
}

function severityClasses(severity: ReconciliationIssue["severity"]) {
  if (severity === "critical") return "border-red-400/40 bg-red-400/10 text-red-200";
  if (severity === "high") return "border-orange-400/40 bg-orange-400/10 text-orange-200";
  if (severity === "medium") return "border-yellow-400/40 bg-yellow-400/10 text-yellow-100";
  return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
}

export default function AdminReconciliationPage() {
  const [payload, setPayload] = useState<ReconciliationPayload>({ runs: [], issues: [] });
  const [status, setStatus] = useState("open");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async (background: boolean = false) => {
    if (!background) setLoading(true);
    setError("");
    try {
      const data = await authenticatedFetchJson<ReconciliationPayload>(
        `/api/admin/reconciliation?status=${encodeURIComponent(status)}&limit=300`
      );
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat data rekonsiliasi.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadData]);
  useLiveRefresh(async () => { await loadData(true); }, { topics: 'admin' });

  const latestRun = payload.runs[0] || null;
  const openSeverity = useMemo(() => {
    return payload.issues.reduce(
      (result, issue) => {
        result[issue.severity] += 1;
        return result;
      },
      { critical: 0, high: 0, medium: 0, low: 0 }
    );
  }, [payload.issues]);

  async function runScan() {
    setScanning(true);
    setError("");
    setMessage("");

    try {
      const result = await authenticatedFetchJson<{
        run: ReconciliationRun;
        automaticallyResolved?: number;
        idempotent?: boolean;
      }>("/api/admin/reconciliation", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ days }),
      });

      setMessage(
        `Pemeriksaan selesai: ${result.run.issue_count || 0} temuan, ${result.run.critical_count || 0} kritis, ${result.automaticallyResolved || 0} diselesaikan otomatis.`
      );
      await loadData();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Pemeriksaan rekonsiliasi gagal.");
    } finally {
      setScanning(false);
    }
  }

  async function updateIssue(issue: ReconciliationIssue, action: "resolve" | "ignore" | "reopen") {
    let note = "";
    if (action !== "reopen") {
      note = window.prompt(
        action === "resolve"
          ? "Jelaskan bagaimana ketidaksesuaian ini diselesaikan:"
          : "Jelaskan mengapa temuan ini dapat diabaikan:"
      )?.trim() || "";
      if (!note) return;
    }

    setActingId(issue.id);
    setError("");
    try {
      await authenticatedFetchJson("/api/admin/reconciliation", {
        method: "PATCH",
        body: JSON.stringify({ issueId: issue.id, action, note }),
      });
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Gagal memperbarui temuan.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-violet-400/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.2),transparent_40%)]">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <p className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-black text-violet-200">
            <FaSearchDollar /> Operasional Produksi V18
          </p>
          <h1 className="mt-5 text-5xl font-black md:text-7xl">Rekonsiliasi Keuangan</h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Cocokkan pesanan, penerimaan PayPal, catatan mutasi dompet, pelepasan dana yang ditahan, dan penarikan penjual sebelum ketidaksesuaian berdampak pada pelanggan.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/admin" className="rounded-xl border border-white/15 px-5 py-3 font-black hover:border-white/40">
              Dasbor Admin
            </Link>
            <Link href="/admin/finance" className="rounded-xl border border-cyan-400/40 px-5 py-3 font-black text-cyan-200">
              Dasbor Keuangan
            </Link>
            <Link href="/admin/audit-logs" className="rounded-xl border border-violet-400/40 px-5 py-3 font-black text-violet-200">
              Riwayat Audit
            </Link>
            <Link href="/admin/operations" className="rounded-xl border border-emerald-400/40 px-5 py-3 font-black text-emerald-200">
              Kesiapan Peluncuran
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label={"Temuan ditampilkan"} value={payload.issues.length} />
          <Metric label={"Kritis"} value={openSeverity.critical} tone="red" />
          <Metric label={"Tinggi"} value={openSeverity.high} tone="orange" />
          <Metric label={"Catatan diperiksa terakhir"} value={latestRun?.scanned_count || 0} />
          <Metric label={"Pemeriksaan terakhir"} value={latestRun ? pretty(latestRun.status) : "Belum pernah"} />
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h2 className="text-2xl font-black">Jalankan pemeriksaan rekonsiliasi</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Pemeriksaan dengan kunci permintaan yang sama tidak dijalankan dua kali. Hasil dicatat di riwayat audit admin, dan temuan terbuka yang tidak muncul lagi pada cakupan yang sama akan ditutup otomatis.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Rentang pemeriksaan
                <select
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                  disabled={scanning}
                  className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white"
                >
                  <option value={7}>7 hari terakhir</option>
                  <option value={30}>30 hari terakhir</option>
                  <option value={90}>90 hari terakhir</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void runScan()}
                disabled={scanning}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-5 py-3 font-black text-black disabled:opacity-50"
              >
                <FaSyncAlt className={scanning ? "animate-spin" : ""} />
                {scanning ? "Memeriksa..." : "Jalankan Pemeriksaan"}
              </button>
            </div>
          </div>
        </div>

        {error ? <p className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-5 font-bold text-red-200">{adminText(error)}</p> : null}
        {message ? <p className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 font-bold text-emerald-200">{adminText(message)}</p> : null}

        <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_360px]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-2xl font-black">Temuan rekonsiliasi</h2>
                <p className="mt-1 text-sm text-slate-400">Tandai selesai setelah masalah ditangani, abaikan temuan keliru dengan alasan, atau buka kembali temuan.</p>
              </div>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white"
              >
                <option value="open">Terbuka</option>
                <option value="resolved">Diselesaikan</option>
                <option value="ignored">Diabaikan</option>
                <option value="all">Semua status</option>
              </select>
            </div>

            <div className="mt-6 space-y-4">
              {loading ? (
                <p className="rounded-2xl border border-white/10 bg-black/30 p-6 text-slate-400">Memuat temuan rekonsiliasi...</p>
              ) : payload.issues.length === 0 ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-8 text-center">
                  <FaCheckCircle className="mx-auto text-4xl text-emerald-300" />
                  <p className="mt-4 text-xl font-black text-emerald-200">Tidak ada temuan{status === "all" ? "" : ` berstatus ${adminLabel(status).toLowerCase()}`}</p>
                  <p className="mt-2 text-sm text-emerald-100/70">Jalankan pemeriksaan baru untuk memverifikasi kondisi keuangan saat ini.</p>
                </div>
              ) : (
                payload.issues.map((issue) => (
                  <article key={issue.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${severityClasses(issue.severity)}`}>
                            {adminLabel(issue.severity)}
                          </span>
                          <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-slate-300">
                            {adminLabel(issue.entity_type)} #{issue.entity_id}
                          </span>
                          <span className="text-xs text-slate-500">Terdeteksi {issue.occurrence_count}×</span>
                        </div>
                        <h3 className="mt-3 text-xl font-black">{adminText(issue.title)}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{adminText(issue.description)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {issue.status === "open" ? (
                          <>
                            <button
                              type="button"
                              disabled={actingId === issue.id}
                              onClick={() => void updateIssue(issue, "resolve")}
                              className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-black text-emerald-200 disabled:opacity-50"
                            >
                              Tandai Selesai
                            </button>
                            <button
                              type="button"
                              disabled={actingId === issue.id}
                              onClick={() => void updateIssue(issue, "ignore")}
                              className="rounded-lg border border-slate-400/30 px-3 py-2 text-xs font-black text-slate-300 disabled:opacity-50"
                            >
                              Abaikan
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={actingId === issue.id}
                            onClick={() => void updateIssue(issue, "reopen")}
                            className="rounded-lg border border-yellow-400/40 px-3 py-2 text-xs font-black text-yellow-200 disabled:opacity-50"
                          >
                            Buka Kembali
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <JsonBlock label={"Diharapkan"} value={issue.expected} />
                      <JsonBlock label={"Tercatat"} value={issue.actual} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                      <span>Pertama terdeteksi: {formatDate(issue.first_detected_at)}</span>
                      <span>Terakhir terdeteksi: {formatDate(issue.last_detected_at)}</span>
                      {issue.resolution_note ? <span>Catatan: {adminText(issue.resolution_note)}</span> : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="flex items-center gap-2 text-2xl font-black"><FaHistory className="text-violet-300" /> Proses terbaru</h2>
              <div className="mt-5 space-y-3">
                {payload.runs.length === 0 ? (
                  <p className="text-sm text-slate-400">Belum ada pemeriksaan rekonsiliasi.</p>
                ) : (
                  payload.runs.slice(0, 10).map((run) => (
                    <div key={run.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-violet-200">{adminScanScope(run.scope_key)}</p>
                        <span className="text-xs font-black uppercase text-slate-400">{adminLabel(run.status)}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{run.scanned_count || 0} catatan · {run.issue_count || 0} temuan</p>
                      <p className="mt-2 text-xs text-slate-500">{formatDate(run.started_at)} · {adminLabel(run.source)}</p>
                      {run.error_message ? <p className="mt-2 text-xs text-red-300">{adminText(run.error_message)}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-6">
              <h2 className="flex items-center gap-2 text-xl font-black text-yellow-200"><FaExclamationTriangle /> Aturan operasional</h2>
              <p className="mt-3 text-sm leading-6 text-yellow-100/80">
                Rekonsiliasi mendeteksi ketidaksesuaian, tetapi tidak memindahkan uang otomatis. Selidiki temuan kritis melalui pesanan, transaksi dompet, catatan penyedia, dan riwayat audit sebelum melakukan koreksi manual.
              </p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, tone = "cyan" }: { label: string; value: string | number; tone?: "cyan" | "red" | "orange" }) {
  const toneClass = tone === "red" ? "text-red-300" : tone === "orange" ? "text-orange-300" : "text-cyan-300";
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#070a14] p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">
        {JSON.stringify(value || {}, null, 2)}
      </pre>
    </div>
  );
}

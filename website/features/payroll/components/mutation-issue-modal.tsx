"use client";

import type { Order, OrderDailyWork, OrderIssue } from "@/features/payroll/types/domain";

type Props = {
  order: Order;
  day?: OrderDailyWork;
  issues: OrderIssue[];
  onClose: () => void;
};

function severityLabel(severity: OrderIssue["severity"]) {
  if (severity === "critical") return "Kritis";
  if (severity === "high") return "Perlu diperbaiki";
  if (severity === "warning") return "Peringatan";
  return "Info";
}

function severityClass(severity: OrderIssue["severity"]) {
  if (severity === "critical" || severity === "high") return "border-red-500/30 bg-red-500/10 text-red-100";
  if (severity === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  return "border-sky-500/30 bg-sky-500/10 text-sky-100";
}

export function MutationIssueModal({ order, day, issues, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 sm:p-8" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 p-5 sm:p-6">
          <div>
            <div className="text-sm font-semibold text-red-300">Detail Masalah Mutasi</div>
            <h2 className="mt-1 text-2xl font-semibold">{order.externalReference}{day ? ` · Hari ${day.sequence}` : ""}</h2>
            <p className="mt-1 text-sm text-zinc-500">{order.orderName ?? order.service}</p>
          </div>
          <button onClick={onClose} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold">Tutup</button>
        </div>

        <div className="p-5 sm:p-6">
          {issues.length ? <div className="space-y-3">
            {issues.map((item, index) => (
              <div key={`${item.code}-${index}`} className={`rounded-xl border p-4 ${severityClass(item.severity)}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{item.title}</strong>
                  <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-semibold">{severityLabel(item.severity)}</span>
                </div>
                <p className="mt-2 text-sm leading-6">{item.description}</p>
                <div className="mt-2 text-xs opacity-70">Kode pemeriksaan: {item.code}{item.source ? ` · sumber: ${item.source}` : ""}</div>
              </div>
            ))}
          </div> : <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">Tidak ada masalah yang terdeteksi pada Mutasi ini.</div>}

          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm leading-6 text-zinc-300">
            Setelah diperbaiki melalui <strong>Edit Mutasi</strong> atau master <strong>Karyawan</strong>, pemeriksaan akan dihitung ulang otomatis. Untuk masalah dari spreadsheet, data asli tetap dapat dilihat di arsip impor.
          </div>
        </div>
      </div>
    </div>
  );
}

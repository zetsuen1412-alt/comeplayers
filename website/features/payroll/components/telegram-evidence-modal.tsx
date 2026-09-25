"use client";

import { useEffect, useMemo, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type EvidenceRow = {
  id: string;
  evidenceType: "start" | "done" | "gold";
  mediaType: "photo" | "video";
  createdAt: string;
  link?: string | null;
  assignmentId?: string | null;
  contributionId?: string | null;
};

type EvidencePayload = {
  order?: { order_ref?: string; state?: string; target_quantity?: number; delivered_quantity?: number } | null;
  assignments: Array<{ id: string; employee_code: string; division: string; status: string; started_at?: string | null; done_at?: string | null }>;
  contributions: Array<{ id: string; employee_code: string; division: string; requested_quantity: number; accepted_quantity: number; created_at: string }>;
  evidence: EvidenceRow[];
};

const label: Record<EvidenceRow["evidenceType"], string> = {
  start: "START",
  done: "DONE",
  gold: "GOLD",
};

export function TelegramEvidenceModal({ orderRef, onClose }: { orderRef: string; onClose: () => void }) {
  const [data, setData] = useState<EvidencePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void authenticatedFetchJson<EvidencePayload>(`/api/admin/payroll/telegram/evidence?ref=${encodeURIComponent(orderRef)}`)
      .then(result => { if (active) setData(result); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Bukti tidak dapat dimuat."); });
    return () => { active = false; };
  }, [orderRef]);

  const grouped = useMemo(() => {
    const map = new Map<string, EvidenceRow[]>();
    for (const row of data?.evidence || []) {
      const key = row.evidenceType;
      map.set(key, [...(map.get(key) || []), row]);
    }
    return map;
  }, [data]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={`Bukti Telegram ${orderRef}`} onMouseDown={onClose}>
      <section className="w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div>
            <div className="text-sm font-semibold text-sky-300">Bukti Telegram</div>
            <h2 className="mt-1 text-2xl font-semibold">{orderRef}</h2>
            <p className="mt-1 text-sm text-zinc-500">Foto/video tetap disimpan di Telegram. Tombol di bawah membuka pesan asli untuk dilihat atau diunduh admin.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-semibold">Tutup</button>
        </header>

        <div className="space-y-5 p-5">
          {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
          {!data && !error ? <div className="text-sm text-zinc-400">Memuat bukti Telegram…</div> : null}

          {data?.order ? <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-black/30 p-4"><div className="text-xs text-zinc-500">Status Telegram</div><div className="mt-2 font-semibold">{data.order.state || "—"}</div></div>
            <div className="rounded-xl bg-black/30 p-4"><div className="text-xs text-zinc-500">Progress Gold</div><div className="mt-2 font-semibold">{Number(data.order.delivered_quantity || 0).toLocaleString("id-ID")} / {Number(data.order.target_quantity || 0).toLocaleString("id-ID")}</div></div>
            <div className="rounded-xl bg-black/30 p-4"><div className="text-xs text-zinc-500">Jumlah bukti</div><div className="mt-2 font-semibold">{data.evidence.length} file</div></div>
          </div> : null}

          {(["start", "done", "gold"] as const).map(kind => {
            const rows = grouped.get(kind) || [];
            if (!rows.length) return null;
            return <section key={kind} className="rounded-xl border border-zinc-800 p-4">
              <h3 className="font-semibold">{kind === "start" ? "▶ Bukti START" : kind === "done" ? "✅ Bukti DONE" : "🪙 Bukti Setoran Gold"}</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {rows.map((row, index) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg bg-black/35 p-3 text-sm">
                  <div>
                    <div className="font-semibold">{row.mediaType === "video" ? "🎥 Video" : "📷 Foto / Screenshot"} {index + 1}</div>
                    <div className="mt-1 text-xs text-zinc-500">{new Date(row.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</div>
                  </div>
                  {row.link ? <a href={row.link} target="_blank" rel="noreferrer" className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold text-black">Buka Telegram</a> : <span className="text-xs text-zinc-600">Link tidak tersedia</span>}
                </div>)}
              </div>
            </section>;
          })}

          {data && !data.evidence.length ? <div className="rounded-xl border border-dashed border-zinc-700 p-5 text-sm text-zinc-500">Belum ada bukti Telegram untuk order ini.</div> : null}

          {data?.assignments?.length ? <section className="rounded-xl border border-zinc-800 p-4">
            <h3 className="font-semibold">Riwayat karyawan</h3>
            <div className="mt-3 space-y-2 text-sm">
              {data.assignments.map(row => <div key={row.id} className="rounded-lg bg-black/30 p-3">{row.employee_code} · {row.division} · <strong>{row.status}</strong></div>)}
            </div>
          </section> : null}

          {data?.contributions?.length ? <section className="rounded-xl border border-zinc-800 p-4">
            <h3 className="font-semibold">Setoran Gold</h3>
            <div className="mt-3 space-y-2 text-sm">
              {data.contributions.map(row => <div key={row.id} className="rounded-lg bg-black/30 p-3">{row.employee_code} · {row.division} — diterima <strong>{Number(row.accepted_quantity).toLocaleString("id-ID")}</strong> dari {Number(row.requested_quantity).toLocaleString("id-ID")}</div>)}
            </div>
          </section> : null}
        </div>
      </section>
    </div>
  );
}

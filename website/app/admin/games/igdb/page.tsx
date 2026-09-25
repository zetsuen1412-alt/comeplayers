"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import { adminLabel, adminText } from "@/lib/adminLocale";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCheck,
  FaCloudDownloadAlt,
  FaDatabase,
  FaRedo,
  FaTimes,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Candidate = {
  id: number;
  igdb_id: number;
  status: string;
  proposed_name: string;
  proposed_slug: string;
  proposed_summary?: string | null;
  proposed_cover_url?: string | null;
  proposed_release_date?: string | null;
  proposed_rating?: number | string | null;
  proposed_genres?: Array<{ name?: string }> | null;
  proposed_platforms?: Array<{ name?: string; abbreviation?: string }> | null;
  match_game_id?: number | null;
  match_score?: number | string | null;
  match_reason?: string | null;
  review_note?: string | null;
  imported_game_id?: number | null;
  last_error?: string | null;
  updated_at: string;
};

type Run = {
  id: number;
  action: string;
  status: string;
  fetched_count: number;
  staged_count: number;
  matched_count: number;
  imported_count: number;
  failed_count: number;
  error_message?: string | null;
  started_at: string;
  finished_at?: string | null;
};

type Payload = {
  configured: boolean;
  candidates: Candidate[];
  runs: Run[];
  counts: Record<string, number>;
  pagination: {
    page: number;
    limit: number;
    count: number;
    totalPages: number;
  };
};

const statuses = ["pending", "approved", "imported", "rejected", "error", "all"];

function statusClass(status: string) {
  if (status === "imported") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (status === "approved") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
  if (status === "rejected" || status === "error") return "border-red-400/30 bg-red-400/10 text-red-200";
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function names(value?: Array<{ name?: string; abbreviation?: string }> | null) {
  return (value || [])
    .map((item) => item.abbreviation || item.name || "")
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");
}

export default function IgdbCatalogAdminPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [stageLimit, setStageLimit] = useState(50);
  const [stageOffset, setStageOffset] = useState(0);

  const loadData = useCallback(async (background = false) => {
    setError("");
    try {
      const data = await authenticatedFetchJson<Payload>(
        `/api/admin/catalog/igdb?status=${encodeURIComponent(status)}&page=${page}&limit=30`
      );
      setPayload(data);
      if (!background) setSelected([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat antrean IGDB.");
    }
  }, [page, status]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  useLiveRefresh(async () => { await loadData(true); }, {topics:'admin'});

  const allVisibleSelected = useMemo(
    () => Boolean(
      payload?.candidates.length &&
        payload.candidates.every((item) => selected.includes(item.id))
    ),
    [payload, selected]
  );

  async function runAction(
    action: "stage" | "approve" | "reject" | "apply" | "sync",
    extra: Record<string, unknown> = {}
  ) {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const response = await authenticatedFetchJson<{ result?: Record<string, unknown> }>(
        "/api/admin/catalog/igdb",
        {
          method: "POST",
          body: JSON.stringify({
            action,
            candidateIds: selected,
            ...extra,
          }),
        }
      );
      setMessage(`${action.toUpperCase()} selesai: ${JSON.stringify(response.result || {})}`);
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `${action} gagal.`);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_38%)] px-4 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
                Migrasi Katalog IGDB
              </p>
              <h1 className="mt-5 text-4xl font-black md:text-6xl">Penampungan &amp; peninjauan data penyedia</h1>
              <p className="mt-4 max-w-3xl text-slate-300">
                Data IGDB ditampung terlebih dahulu. Tidak ada data yang aktif di publik sebelum admin meninjau kandidat dan mengaktifkan gim di Katalog Gim.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/games" className="rounded-xl border border-white/10 px-5 py-3 font-black hover:border-cyan-400">
                Katalog Gim
              </Link>
              <Link href="/admin" className="rounded-xl bg-cyan-400 px-5 py-3 font-black text-black hover:bg-cyan-300">
                Beranda Admin
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-8 px-4 py-10">
        {!payload?.configured && (
          <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-5 text-yellow-100">
            IGDB belum dikonfigurasi. Tambahkan TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, dan IGDB_SYNC_ENABLED=true hanya di server.
          </div>
        )}
        {error && <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">{adminText(error)}</div>}
        {message && <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-emerald-200">{adminText(message)}</div>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Object.entries(payload?.counts || {}).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setStatus(key);
                setPage(1);
              }}
              className={`rounded-2xl border p-5 text-left transition hover:border-cyan-400 ${statusClass(key)}`}
            >
              <p className="text-xs font-black uppercase tracking-widest">{key}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
            </button>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-2xl font-black">Pengaturan impor</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Ukuran kelompok (maksimal 100 di admin)
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={stageLimit}
                  onChange={(event) => setStageLimit(Number(event.target.value))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Posisi awal IGDB
                <input
                  type="number"
                  min={0}
                  value={stageOffset}
                  onChange={(event) => setStageOffset(Number(event.target.value))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white"
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={Boolean(busy) || !payload?.configured}
                onClick={() => void runAction("stage", { limit: stageLimit, offset: stageOffset, gameTypes: [0] })}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-black text-black disabled:opacity-50"
              >
                <FaCloudDownloadAlt /> {busy === "stage" ? "Menampung data..." : "Tampung gim populer"}
              </button>
              <button
                type="button"
                disabled={Boolean(busy) || !payload?.configured}
                onClick={() => void runAction("sync", { limit: 100 })}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-5 py-3 font-black text-cyan-200 disabled:opacity-50"
              >
                <FaRedo /> {busy === "sync" ? "Menyinkronkan..." : "Sinkronkan gim tertaut"}
              </button>
              <button
                type="button"
                disabled={Boolean(busy) || (payload?.counts.approved || 0) === 0}
                onClick={() => void runAction("apply", { limit: 100 })}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 px-5 py-3 font-black text-emerald-200 disabled:opacity-50"
              >
                <FaDatabase /> {busy === "apply" ? "Menerapkan..." : "Terapkan yang disetujui"}
              </button>
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-black">Model keamanan</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li>• Data penyedia disimpan terpisah untuk audit.</li>
              <li>• Kolom admin yang sudah ada hanya diisi jika kosong.</li>
              <li>• Penyesuaian lokal tidak pernah ditimpa.</li>
              <li>• Gim baru masuk dalam keadaan nonaktif dan perlu diaktifkan.</li>
              <li>• ID RAWG dan Steam dipertahankan sebagai referensi lama.</li>
            </ul>
          </aside>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black">Antrean peninjauan</h2>
              <p className="mt-1 text-sm text-slate-400">{payload?.pagination.count || 0} kandidat pada filter ini.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {statuses.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => {
                    setStatus(item);
                    setPage(1);
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-black uppercase ${status === item ? "border-cyan-400 bg-cyan-400 text-black" : "border-white/10 text-slate-300"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-y border-white/10 py-4">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => setSelected(event.target.checked ? (payload?.candidates || []).map((item) => item.id) : [])}
              />
              Pilih yang terlihat
            </label>
            <span className="text-sm text-slate-500">{selected.length} dipilih</span>
            <button
              type="button"
              disabled={Boolean(busy) || selected.length === 0}
              onClick={() => void runAction("approve")}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 px-4 py-2 text-sm font-black text-emerald-200 disabled:opacity-50"
            >
              <FaCheck /> Setujui
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || selected.length === 0}
              onClick={() => void runAction("reject")}
              className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 px-4 py-2 text-sm font-black text-red-200 disabled:opacity-50"
            >
              <FaTimes /> Tolak
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {(payload?.candidates || []).map((candidate) => (
              <article key={candidate.id} className="grid gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 md:grid-cols-[28px_88px_1fr_auto]">
                <input
                  type="checkbox"
                  checked={selected.includes(candidate.id)}
                  onChange={(event) => setSelected((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))}
                  className="mt-2"
                />
                <div
                  className="h-28 w-20 rounded-xl bg-slate-800 bg-cover bg-center"
                  style={candidate.proposed_cover_url ? { backgroundImage: `url(${candidate.proposed_cover_url})` } : undefined}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black">{candidate.proposed_name}</h3>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(candidate.status)}`}>{adminLabel(candidate.status)}</span>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-slate-400">IGDB #{candidate.igdb_id}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-400">{candidate.proposed_summary || "Tidak ada ringkasan IGDB."}</p>
                  <div className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                    <p>Rilis: {candidate.proposed_release_date || "-"}</p>
                    <p>Penilaian: {Number(candidate.proposed_rating || 0).toFixed(1)}</p>
                    <p>Platform: {names(candidate.proposed_platforms) || "-"}</p>
                    <p>Genre: {names(candidate.proposed_genres) || "-"}</p>
                  </div>
                  {candidate.last_error && <p className="mt-3 text-xs text-red-300">{adminText(candidate.last_error)}</p>}
                </div>
                <div className="text-right text-xs text-slate-400">
                  <p className="font-black text-cyan-300">Kecocokan {Number(candidate.match_score || 0).toFixed(0)}%</p>
                  <p className="mt-1">{candidate.match_reason || "tidak ada kecocokan"}</p>
                  <p className="mt-1">Gim #{candidate.match_game_id || candidate.imported_game_id || "new"}</p>
                  <p className="mt-4">{formatDate(candidate.updated_at)}</p>
                </div>
              </article>
            ))}
            {payload?.candidates.length === 0 && <p className="rounded-2xl border border-white/10 p-8 text-center text-slate-400">Tidak ada kandidat pada filter ini.</p>}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              disabled={(payload?.pagination.page || 1) <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-xl border border-white/10 px-4 py-2 font-black disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <span className="text-sm text-slate-400">Halaman {payload?.pagination.page || 1} / {payload?.pagination.totalPages || 1}</span>
            <button
              type="button"
              disabled={(payload?.pagination.page || 1) >= (payload?.pagination.totalPages || 1)}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-xl border border-white/10 px-4 py-2 font-black disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-2xl font-black">Proses terbaru</h2>
          <div className="mt-5 space-y-3">
            {(payload?.runs || []).map((run) => (
              <div key={run.id} className="grid gap-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm md:grid-cols-[100px_100px_1fr_auto]">
                <span className="font-black text-cyan-300">{adminLabel(run.action)}</span>
                <span>{adminLabel(run.status)}</span>
                <span className="text-slate-400">Diambil {run.fetched_count} · ditampung {run.staged_count} · dicocokkan {run.matched_count} · diimpor {run.imported_count} · gagal {run.failed_count}</span>
                <span className="text-slate-500">{formatDate(run.finished_at || run.started_at)}</span>
                {run.error_message && <p className="text-red-300 md:col-span-4">{adminText(run.error_message)}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { PageHeader } from "@/features/payroll/components/page-header";

type SetupState = {
  configured: boolean;
  checklist?: Record<string, boolean>;
  notices?: { pending: number; needsReview: number };
  bot?: { id: number; first_name: string; username?: string } | null;
  webhook?: { url?: string; pending_update_count?: number; last_error_message?: string } | null;
  botError?: string;
  divisions: Array<{ division: string; chat_id: number; leader_telegram_user_id?: number | null; chat_title?: string | null; chat_username?: string | null; active: boolean }>;
  employees: Array<{ employee_code: string; telegram_user_id: number | null; telegram_username?: string | null; telegram_name?: string | null; division: string; role: string; active: boolean }>;
};

export default function TelegramPayrollPage() {
  const [state, setState] = useState<SetupState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaderId, setLeaderId] = useState("");
  const [leaderDivisions, setLeaderDivisions] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const result = await authenticatedFetchJson<SetupState>("/api/admin/payroll/telegram/setup");
    setState(result);
  }, []);

  useEffect(() => {
    let active = true;
    void authenticatedFetchJson<SetupState>("/api/admin/payroll/telegram/setup")
      .then(result => { if (active) setState(result); })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Gagal memuat Telegram."); });
    return () => { active = false; };
  }, []);

  async function setupWebhook() {
    setBusy(true); setMessage("");
    try {
      const result = await authenticatedFetchJson<{ ok: boolean; url: string }>("/api/admin/payroll/telegram/setup", { method: "POST", body: "{}" });
      setMessage(`✓ Webhook Telegram aktif: ${result.url}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Webhook belum dapat dipasang.");
    } finally { setBusy(false); }
  }

  async function saveLeader() {
    setBusy(true); setMessage("");
    try {
      const result = await authenticatedFetchJson<{ name: string }>("/api/admin/payroll/telegram/leader", {
        method: "POST", body: JSON.stringify({ userId: leaderId, divisions: leaderDivisions }),
      });
      setMessage(`✓ ${result.name} menjadi leader ${leaderDivisions.join(", ")}. Order baru akan dikirim ke chat pribadinya. Karyawan tidak perlu /link.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Leader belum tersimpan."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Telegram Booster" description="Admin mengirim order ke leader. Satu akun leader memilih karyawan dan mengirim status serta bukti untuk seluruh divisinya." />

      {message ? <div className="mb-5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">{message}</div> : null}

      <section className="cp-card mb-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Hubungkan akun leader</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">Leader membuka bot, mengirim <code>/start</code> lalu <code>/myid</code>. Masukkan ID angka tersebut dan pilih divisi yang ditangani. Satu akun boleh menangani beberapa divisi. Semua karyawan aktif di divisi itu langsung tersedia untuk dipilih.</p>
        <label className="mt-4 block text-sm">ID Telegram leader
          <input inputMode="numeric" value={leaderId} onChange={e => setLeaderId(e.target.value)} placeholder="ID dari /myid" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 sm:max-w-sm" />
        </label>
        <fieldset className="mt-4"><legend className="text-sm">Divisi yang ditangani</legend>
          <div className="mt-2 flex flex-wrap gap-4">{["FH1", "FH2", "FH3", "ADMIN", "BANDAR"].map(d => <label key={d} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={leaderDivisions.includes(d)} onChange={e => setLeaderDivisions(current => e.target.checked ? [...current, d] : current.filter(value => value !== d))} />{d}
          </label>)}</div>
        </fieldset>
        <p className="mt-3 text-xs text-zinc-400">Menyimpan akan mengganti penerima untuk divisi yang dicentang. Order lama tidak dikirim ulang otomatis.</p>
        <button type="button" disabled={busy || !leaderId.trim() || !leaderDivisions.length} onClick={saveLeader} className="mt-4 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-40">{busy ? "Menyimpan…" : "Simpan leader"}</button>
      </section>

      <section className="cp-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Status bot</h2>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          {Object.entries({ token: "Bot token", secret: "Webhook secret", reachable: "Bot terhubung", webhook: "Webhook aktif", admin: "Admin terdaftar", FH1: "Penerima FH1", FH2: "Penerima FH2", FH3: "Penerima FH3", employees: "Daftar karyawan" }).map(([key, label]) =>
            <li key={key}>{state?.checklist?.[key] ? "✅" : "⬜"} {label}</li>)}
        </ul>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-zinc-950/60 p-4"><div className="text-xs text-zinc-500">Konfigurasi Vercel</div><div className={`mt-2 font-semibold ${state?.configured ? "text-emerald-300" : "text-amber-300"}`}>{state?.configured ? "Siap" : "Belum lengkap"}</div></div>
          <div className="rounded-xl bg-zinc-950/60 p-4"><div className="text-xs text-zinc-500">Bot</div><div className="mt-2 font-semibold">{state?.bot ? `@${state.bot.username || state.bot.first_name}` : "—"}</div></div>
          <div className="rounded-xl bg-zinc-950/60 p-4"><div className="text-xs text-zinc-500">Webhook</div><div className="mt-2 break-all text-sm">{state?.webhook?.url || "Belum aktif"}</div></div>
        </div>
        {state?.webhook?.last_error_message ? <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{state.webhook.last_error_message}</div> : null}
        {state?.notices ? <p className="mt-3 text-sm text-zinc-400">Pesan menunggu: {state.notices.pending} · Perlu diperiksa: {state.notices.needsReview}</p> : null}
        {state?.notices?.needsReview ? <p className="mt-2 text-sm text-amber-300">Ada hasil pengiriman yang belum pasti. Admin perlu mencocokkan antrean dengan pesan asli Telegram sebelum mengirim ulang agar tidak ganda.</p> : null}
        <button type="button" disabled={busy || !state?.configured} onClick={setupWebhook} className="mt-4 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-40">{busy ? "Memasang…" : "Pasang / Perbarui Webhook"}</button>
      </section>

      <section className="cp-card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Penerima order per divisi</h2>
        <p className="mt-2 text-sm text-zinc-400">Order masuk ke akun leader sesuai pilihan divisi admin. Pengaturan grup lama tetap tersedia bila diperlukan.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {["FH1", "FH2", "FH3", "ADMIN", "BANDAR"].map(division => {
            const row = state?.divisions.find(item => item.division === division);
            return <div key={division} className="rounded-xl border border-zinc-800 p-4">
              <div className="font-bold">{division}</div>
              <div className="mt-2 text-sm text-zinc-400">{row ? row.chat_title || row.chat_username || String(row.chat_id) : "Belum dihubungkan"}</div>
              {row?.leader_telegram_user_id && <div className="mt-1 text-xs text-zinc-400">ID leader: {row.leader_telegram_user_id}</div>}
              <div className={`mt-2 text-xs ${row?.active ? "text-emerald-300" : "text-zinc-600"}`}>{row?.active ? "● Aktif" : "○ Belum aktif"}</div>
            </div>;
          })}
        </div>
      </section>

      <section className="cp-card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Daftar karyawan untuk leader</h2>
        <p className="mt-2 text-sm text-zinc-400">Daftar mengikuti karyawan di Payroll. Leader dapat memilih karyawan aktif tanpa akun Telegram masing-masing.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="cp-table min-w-[760px]">
            <thead><tr><th>Kode</th><th>Nama</th><th>Username opsional</th><th>Divisi</th><th>Peran</th><th>Status</th></tr></thead>
            <tbody>
              {(state?.employees || []).map(row => <tr key={row.employee_code}>
                <td className="font-semibold">{row.employee_code}</td>
                <td>{row.telegram_name || "—"}</td>
                <td>{row.telegram_username ? `@${row.telegram_username}` : "—"}</td>
                <td>{row.division}</td>
                <td>{row.role === "leader" ? "Leader" : "Karyawan"}</td>
                <td>{row.active ? <span className="text-emerald-300">Aktif</span> : "Nonaktif"}</td>
              </tr>)}
              {!state?.employees?.length ? <tr><td colSpan={6} className="text-zinc-500">Daftar akan dimuat saat leader disimpan atau order diproses.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cp-card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Perintah operasional</h2>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-zinc-950/60 p-4"><code>/assign X3101 EMP001</code><p className="mt-2 text-zinc-400">Pilih atau ganti karyawan Boosting/Item. Hanya admin/leader.</p></div>
          <div className="rounded-xl bg-zinc-950/60 p-4"><code>/dispatch X3101</code><p className="mt-2 text-zinc-400">Kirim order lama ke penerima divisi yang sesuai.</p></div>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-400">START wajib minimal satu bukti foto/screenshot/video. DONE dapat menerima banyak foto/video dan baru berubah kuning setelah tombol <strong>SELESAI UPLOAD</strong>. PAUSE berwarna oranye, RESUME kembali hijau. Order Gold memakai kuota global lintas FH1/FH2/FH3 dan pengiriman tambahan ditolak otomatis saat target penuh.</p>
      </section>

      <section className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm leading-6 text-amber-100">
        <strong>Environment Variable yang diperlukan:</strong>
        <div className="mt-2 font-mono text-xs">TELEGRAM_BOT_TOKEN</div>
        <div className="font-mono text-xs">TELEGRAM_WEBHOOK_SECRET</div>
        <div className="font-mono text-xs">TELEGRAM_ADMIN_USER_IDS</div>
        <p className="mt-2">Foto dan video tidak disalin ke Vercel/Drive. File tetap berada di Telegram; ComePlayers hanya menyimpan ID pesan/file agar admin dapat membuka dan mengunduh bukti dari Telegram.</p>
      </section>
    </>
  );
}

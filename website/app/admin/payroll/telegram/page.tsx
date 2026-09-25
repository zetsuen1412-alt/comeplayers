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
  divisions: Array<{ division: string; chat_id: number; chat_title?: string | null; chat_username?: string | null; active: boolean }>;
  employees: Array<{ employee_code: string; telegram_user_id: number; telegram_username?: string | null; telegram_name?: string | null; division: string; role: string; active: boolean }>;
};

export default function TelegramPayrollPage() {
  const [state, setState] = useState<SetupState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <>
      <PageHeader title="Telegram Booster" description="Hubungkan grup per divisi, karyawan, bukti START/DONE, PAUSE, dan setoran Gold global ke Mutasi ComePlayers." />

      {message ? <div className="mb-5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">{message}</div> : null}

      <section className="cp-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Status bot</h2>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          {Object.entries({ token: "Bot token", secret: "Webhook secret", reachable: "Bot terhubung", webhook: "Webhook aktif", admin: "Admin terdaftar", FH1: "Grup FH1", FH2: "Grup FH2", FH3: "Grup FH3", employees: "Tautan karyawan" }).map(([key, label]) =>
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
        <h2 className="text-lg font-semibold">Panduan pemasangan</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-zinc-300">
          <li>Buka <a className="text-emerald-300 underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, kirim <code>/newbot</code>, lalu tentukan nama dan username bot.</li>
          <li>Simpan token dari BotFather sebagai <code>TELEGRAM_BOT_TOKEN</code> di Vercel Environment Variables. Jangan tempelkan token ke chat/grup atau kode.</li>
          <li>Di BotFather, kirim <code>/setprivacy</code>, pilih bot, lalu pilih <strong>Disable</strong>. Tambahkan ulang bot ke grup jika pengaturan belum berlaku, agar foto/video dan teks bukti diterima.</li>
          <li>Isi <code>TELEGRAM_WEBHOOK_SECRET</code> dengan nilai acak aman minimal 16 karakter dari server atau pengelola kata sandi. Gunakan karakter huruf, angka, garis bawah, atau tanda minus. Deploy perubahan konfigurasi.</li>
          <li>Buka halaman ini di website produksi, lalu klik <strong>Pasang / Perbarui Webhook</strong>.</li>
          <li>Chat bot dengan <code>/myid</code>. Isi <code>TELEGRAM_ADMIN_USER_IDS</code> dengan ID angka admin; pisahkan beberapa ID dengan koma. Deploy ulang.</li>
          <li>Tambahkan bot ke grup EVO GAMING — FH1, FH2, FH3. Admin menjalankan <code>/bind FH1</code>, <code>/bind FH2</code>, atau <code>/bind FH3</code> di grup yang sesuai.</li>
          <li>Karyawan aktif menjalankan <code>/link KODE_KARYAWAN</code> di grup divisinya. Admin dapat menentukan leader dengan <code>/leader KODE_KARYAWAN</code>.</li>
          <li>Order baru otomatis dikirim. Jenis order atau divisi yang belum jelas harus diperbaiki dahulu. Gunakan <code>/dispatch KODE_ORDER</code> untuk order lama.</li>
        </ol>
      </section>

      <section className="cp-card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">1 grup Telegram per divisi</h2>
        <p className="mt-2 text-sm text-zinc-400">Tambahkan bot ke grup FH1/FH2/FH3. Admin Telegram kemudian jalankan perintah <code>/bind FH1</code> di grup FH1, dan seterusnya.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {["FH1", "FH2", "FH3", "ADMIN", "BANDAR"].map(division => {
            const row = state?.divisions.find(item => item.division === division);
            return <div key={division} className="rounded-xl border border-zinc-800 p-4">
              <div className="font-bold">{division}</div>
              <div className="mt-2 text-sm text-zinc-400">{row ? row.chat_title || row.chat_username || String(row.chat_id) : "Belum dihubungkan"}</div>
              <div className={`mt-2 text-xs ${row?.active ? "text-emerald-300" : "text-zinc-600"}`}>{row?.active ? "● Aktif" : "○ Belum aktif"}</div>
            </div>;
          })}
        </div>
      </section>

      <section className="cp-card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Karyawan Telegram</h2>
        <p className="mt-2 text-sm text-zinc-400">Karyawan menghubungkan akun sendiri dengan <code>/link KODE_KARYAWAN</code>. Admin dapat menjadikan karyawan leader dengan <code>/leader KODE_KARYAWAN</code>.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="cp-table min-w-[760px]">
            <thead><tr><th>Kode</th><th>Nama Telegram</th><th>Username</th><th>Divisi</th><th>Peran</th><th>Status</th></tr></thead>
            <tbody>
              {(state?.employees || []).map(row => <tr key={row.employee_code}>
                <td className="font-semibold">{row.employee_code}</td>
                <td>{row.telegram_name || "—"}</td>
                <td>{row.telegram_username ? `@${row.telegram_username}` : "—"}</td>
                <td>{row.division}</td>
                <td>{row.role === "leader" ? "Leader" : "Karyawan"}</td>
                <td>{row.active ? <span className="text-emerald-300">Aktif</span> : "Nonaktif"}</td>
              </tr>)}
              {!state?.employees?.length ? <tr><td colSpan={6} className="text-zinc-500">Belum ada karyawan yang menjalankan /link.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cp-card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Perintah operasional</h2>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-zinc-950/60 p-4"><code>/assign X3101 EMP001</code><p className="mt-2 text-zinc-400">Pilih atau ganti karyawan Boosting. Hanya admin/leader.</p></div>
          <div className="rounded-xl bg-zinc-950/60 p-4"><code>/dispatch X3101</code><p className="mt-2 text-zinc-400">Kirim order lama ke grup Telegram yang sesuai.</p></div>
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

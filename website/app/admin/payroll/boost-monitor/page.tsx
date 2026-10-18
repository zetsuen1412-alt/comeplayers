"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/features/payroll/components/page-header";
import { usePayrollActor } from "@/features/payroll/lib/workspace-store";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

const APK_URL = "/downloads/cp-boost-monitor.apk";
const ZIP_URL = "/downloads/cp-boost-monitor.zip";
const APK_SHA_URL = "/downloads/cp-boost-monitor.apk.sha256";
type RosterRow = { id: string; code: string; name: string; team: string; active: boolean };
type Roster = { schema: number; scope: "FH3"; revision: number; updatedAt: string; employees: RosterRow[] };

export default function BoostMonitorDownloadPage() {
  const actor = usePayrollActor();
  const [available, setAvailable] = useState(false);
  const [zipAvailable, setZipAvailable] = useState(false);
  const [checking, setChecking] = useState(true);
  const [fileError, setFileError] = useState("");
  const [digest, setDigest] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  const checkFile = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(APK_URL, { method: "HEAD", cache: "no-store" });
      const size = Number(res.headers.get("content-length") || 0);
      if (!res.ok || size < 10000) throw new Error("APK belum tersedia di server website. Pastikan build APK GitHub berhasil dan website sudah dideploy.");
      setAvailable(true);
      setFileError("");
      try {
        const zip = await fetch(ZIP_URL, { method: "HEAD", cache: "no-store" });
        setZipAvailable(zip.ok && Number(zip.headers.get("content-length") || 0) > 10000);
      } catch { setZipAvailable(false); }
      const hashRes = await fetch(APK_SHA_URL, { cache: "no-store" });
      if (hashRes.ok) {
        const hash = (await hashRes.text()).trim().split(/\s+/)[0];
        if (/^[a-f0-9]{64}$/i.test(hash)) setDigest(hash.toLowerCase());
      }
    } catch (error) {
      setAvailable(false);
      setZipAvailable(false);
      setFileError(error instanceof Error ? error.message : "Tidak dapat memeriksa APK.");
    } finally { setChecking(false); }
  }, []);

  const checkRoster = useCallback(async () => {
    setSyncBusy(true);
    setRosterError("");
    try {
      const data = await authenticatedFetchJson<Roster>("/api/admin/payroll/mobile/roster");
      if (data.schema !== 1 || data.scope !== "FH3" || !Array.isArray(data.employees)
        || data.employees.some(employee => employee.team !== "FH3") || !Number.isSafeInteger(data.revision)) {
        throw new Error("Roster dari website bukan khusus FH3.");
      }
      setRoster(data);
    } catch (error) {
      setRoster(null);
      setRosterError(error instanceof Error ? error.message : "Gagal memeriksa data payroll.");
    } finally { setSyncBusy(false); }
  }, []);

  useEffect(() => {
    if (!actor?.isAdmin) return;
    void checkFile();
    void checkRoster();
  }, [actor?.isAdmin, checkFile, checkRoster]);

  if (!actor?.isAdmin) return <p role="alert">Halaman download APK hanya dapat dibuka admin.</p>;

  const active = roster?.employees.filter(e => e.active).length ?? 0;
  return <div className="space-y-5">
    <PageHeader title="APK Karyawan — CP Boost Monitor" description="Unduh APK dari website ComePlayers, lalu cek sumber data karyawan yang akan tersinkron dengan aplikasi." />
    <section className="cp-card p-5 sm:p-6">
      <div className="text-sm font-semibold text-emerald-300">Android · v1.3 · Khusus FH3 · Build internal (debug)</div>
      <h2 className="mt-2 text-xl font-semibold">CP Boost Monitor</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">Aplikasi memantau Ready Boosting, Farming, Tidur, Tidur Terlalu Lama, dan Sedang Bekerja. Order aktif dari Telegram menampilkan Order, Game, dan Buyer pada karyawan yang ditugaskan. Hanya nama dan kode karyawan FH3 diambil dari Payroll → Karyawan. FH1, FH2, ADMIN, dan BANDAR tidak ikut tersinkron ke APK.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {available ? <a href={APK_URL} download="CP-Boost-Monitor-v1.3-FH3.apk" className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-zinc-950 hover:bg-emerald-300">⬇ Download APK Android</a>
          : <span className="rounded-xl border border-zinc-700 px-5 py-3 text-sm text-zinc-400">{checking ? "Memeriksa file APK…" : "Download belum tersedia"}</span>}
        {zipAvailable && <a href={ZIP_URL} download="CP-Boost-Monitor-Android.zip" className="rounded-xl border border-emerald-500/70 px-5 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-950">⬇ Download ZIP (Alternatif)</a>}
        <button type="button" disabled={checking} onClick={() => void checkFile()} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm disabled:opacity-50">Cek file APK</button>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-400">Jika download APK berhenti di 100% dalam browser bawaan WhatsApp/Telegram, buka halaman ini di <strong>Chrome</strong> melalui menu ⋮ → Buka di browser. Alternatif: pilih <strong>Download ZIP</strong>, lalu buka File Manager → Download, ekstrak ZIP dan instal file APK di dalamnya.</p>
      {fileError && <p role="alert" className="mt-3 text-sm text-amber-300">{fileError}</p>}
      {digest && <p className="mt-3 break-all text-xs text-zinc-500">SHA-256 APK: <code>{digest}</code></p>}
      <p className="mt-4 text-xs leading-5 text-zinc-500">APK ini build debug untuk pengujian internal. Instal di HP Android yang diizinkan. Jika APK debug lama gagal diperbarui karena tanda tangan berbeda, backup data sebelum uninstall. Untuk distribusi produksi diperlukan APK release dengan tanda tangan stabil.</p>
    </section>
    <section className="cp-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Verifikasi sumber Payroll Website</h2><p className="mt-1 text-sm text-zinc-400">Pemeriksaan data dilakukan melalui API resmi dengan izin akun payroll admin Anda.</p></div>
        <button type="button" disabled={syncBusy} onClick={() => void checkRoster()} className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">{syncBusy ? "Memeriksa…" : "↻ Verifikasi data payroll"}</button>
      </div>
      {roster && <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 p-4 text-sm">
        <strong className="text-emerald-300">✓ API payroll berhasil dibaca oleh akun admin</strong>
        <div className="mt-2">Karyawan FH3 aktif: <strong>{active}</strong> dari total <strong>{roster.employees.length}</strong> · Revisi website: <strong>{roster.revision}</strong></div>
        <div className="mt-1 text-zinc-400">Pembaruan website: {roster.updatedAt ? new Date(roster.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "tidak tersedia"}</div>
      </div>}
      {rosterError && <p role="alert" className="mt-4 text-sm text-amber-300">Belum terverifikasi: {rosterError}</p>}
      <p className="mt-3 text-xs leading-5 text-zinc-500">Pemeriksaan ini memverifikasi akses API website, bukan membuktikan sinkronisasi pada HP tertentu. Setelah login di APK, tekan “Perbarui dari Payroll” dan cocokkan nama serta waktu sinkron. Data gaji dan kasbon tidak dikirim ke APK.</p>
    </section>
    <section className="cp-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Cara admin memasang APK</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-300">
        <li>Klik <strong>Download APK Android</strong> dari halaman ini dan instal pada Android admin.</li>
        <li>Buka APK dan tekan <strong>Login &amp; Ambil Karyawan dari Website</strong>.</li>
        <li>Masuk dengan email/password akun ComePlayers yang memiliki akses payroll.</li>
        <li>Saat login berhasil, APK langsung mengambil daftar dari website. Tekan <strong>Ambil Nama Terbaru</strong> jika ingin refresh segera; otomatis diperbarui kira-kira tiap 2 menit selama aktif.</li>
        <li>Cocokkan roster di APK dengan menu <strong>Karyawan</strong> → filter <strong>FH3</strong> pada website. Status boosting tetap lokal di HP, belum real-time lintas perangkat.</li>
      </ol>
    </section>
  </div>;
}

"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/features/payroll/components/page-header";
import { usePayrollActor } from "@/features/payroll/lib/workspace-store";

const APK_URL = "/downloads/cp-boost-monitor.apk";
const WINDOWS_EXE_URL = "/downloads/evogaming-monitor-windows.exe";
const WINDOWS_ZIP_URL = "/downloads/evogaming-monitor-windows.zip";

export default function BoostMonitorDownloadPage() {
  const actor = usePayrollActor();
  const [apkState, setApkState] = useState<"checking" | "ready" | "unavailable">("checking");
  const [parallelInstall, setParallelInstall] = useState(false);
  const [windowsReady, setWindowsReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!actor?.isAdmin) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const file = await fetch(APK_URL, { method: "HEAD", cache: "no-store", signal: controller.signal });
        if (!controller.signal.aborted) setApkState(file.ok && Number(file.headers.get("content-length")) > 10000 ? "ready" : "unavailable");
        const metadata = await fetch("/downloads/cp-boost-monitor.json", { cache: "no-store", signal: controller.signal });
        if (metadata.ok) {
          const release = await metadata.json();
          if (!controller.signal.aborted) setParallelInstall(release.parallelInstall === true);
        }
      } catch {
        if (!controller.signal.aborted) setApkState(current => current === "checking" ? "unavailable" : current);
      }
    })();
    void (async () => {
      try {
        const files = await Promise.all([WINDOWS_EXE_URL, WINDOWS_ZIP_URL].map(url =>
          fetch(url, { method: "HEAD", cache: "no-store", signal: controller.signal })));
        if (!controller.signal.aborted) setWindowsReady(files.every(file => file.ok && Number(file.headers.get("content-length")) > 3000000));
      } catch { if (!controller.signal.aborted) setWindowsReady(false); }
    })();
    return () => controller.abort();
  }, [actor?.isAdmin]);

  if (!actor?.isAdmin) return <p role="alert">Halaman unduhan hanya dapat dibuka admin.</p>;

  const downloadClass = "mt-auto inline-flex min-h-12 items-center justify-center rounded-xl bg-[#1678b8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#11659c] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1678b8]";
  return <div className="space-y-6">
    <PageHeader title="EVOGAMING Monitor" description="Order FH3 dari Telegram, langsung ke ruang kerja Anda." />
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 p-6 text-zinc-950 sm:p-8">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">Android &amp; Windows</div>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Satu tempat untuk setiap order.</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">Terima order dan TASK yang dikirim Adm EVO Gaming di grup FH3. Pilih karyawan, ambil order dengan TAKE, lalu kirim laporan START dan DONE beserta screenshot.</p>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        <article className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Android</span>
          <h3 className="mt-2 text-lg font-semibold">Monitor di ponsel</h3>
          <p className="mb-6 mt-2 text-sm leading-6 text-zinc-600">File APK untuk dipasang di perangkat Android.</p>
          {apkState === "ready" ? <a href={APK_URL} download="EVOGAMING-Monitor-Android.apk" className={downloadClass}>↓ Download Android</a>
            : <span role="status" className="mt-auto rounded-xl border border-zinc-300 p-3 text-center text-sm text-zinc-600">{apkState === "checking" ? "Memeriksa file…" : "APK belum tersedia. Muat ulang untuk mencoba lagi."}</span>}
        </article>
        <article className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Windows · EXE</span>
          <h3 className="mt-2 text-lg font-semibold">Langsung jalankan</h3>
          <p className="mb-6 mt-2 text-sm leading-6 text-zinc-600">Aplikasi untuk Windows 10/11 64-bit.</p>
          {windowsReady ? <a href={WINDOWS_EXE_URL} download="EVOGAMINGMonitor.exe" className={downloadClass}>↓ Download EXE</a>
            : <span role="status" className="mt-auto rounded-xl border border-zinc-300 p-3 text-center text-sm text-zinc-600">{windowsReady === null ? "Memeriksa file…" : "Menyiapkan file Windows. Muat ulang sebentar lagi."}</span>}
        </article>
        <article className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Windows · ZIP</span>
          <h3 className="mt-2 text-lg font-semibold">Simpan sebagai paket</h3>
          <p className="mb-6 mt-2 text-sm leading-6 text-zinc-600">Ekstrak ZIP, lalu buka EVOGAMINGMonitor.exe. Aplikasinya sama dengan unduhan EXE.</p>
          {windowsReady ? <a href={WINDOWS_ZIP_URL} download="EVOGAMINGMonitor-Windows.zip" className={downloadClass}>↓ Download ZIP</a>
            : <span role="status" className="mt-auto rounded-xl border border-zinc-300 p-3 text-center text-sm text-zinc-600">{windowsReady === null ? "Memeriksa file…" : "Menyiapkan file Windows. Muat ulang sebentar lagi."}</span>}
        </article>
      </div>
      <p className="mt-5 text-sm leading-6 text-zinc-600">Tutup Monitor Windows sebelum membuka file yang baru. Sesi login dan riwayat status lokal tetap tersimpan.</p>
    </section>
    <section className="cp-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Mulai bekerja</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-400">
        <li>Unduh aplikasi untuk perangkat Anda, lalu masuk dengan akun ComePlayers yang memiliki akses FH3.</li>
        <li>Pilih nama karyawan dan order, kemudian tekan <strong>TAKE ORDER</strong>.</li>
        <li>Unggah screenshot saat <strong>START</strong> dan <strong>DONE</strong>. Monitor Windows menampilkan jumlah dan daftar pekerjaan di <strong>Order Selesai</strong>.</li>
      </ol>
      <p className="mt-4 text-sm leading-6 text-zinc-500">Jika unduhan Android berhenti di browser Telegram atau WhatsApp, buka halaman ini melalui Chrome.</p>
      {parallelInstall && <p className="mt-3 text-sm leading-6 text-zinc-500">Android FH3 dipasang berdampingan dengan CP Boost Monitor lama. Pertahankan aplikasi lama untuk membuka atau mengekspor riwayat status lokalnya.</p>}
    </section>
  </div>;
}

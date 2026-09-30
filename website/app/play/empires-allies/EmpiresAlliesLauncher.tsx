"use client";

import Link from "next/link";
import { useState } from "react";
import { FaArrowLeft, FaGamepad, FaShieldAlt } from "react-icons/fa";
import AuthModal from "@/components/auth/AuthModal";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type LaunchResponse = {
  launchUrl: string;
  expiresAt: string;
  playerName: string;
};

export default function EmpiresAlliesLauncher() {
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);

  async function launchGame() {
    if (launching) return;
    setLaunching(true);
    setError("");

    try {
      const result = await authenticatedFetchJson<LaunchResponse>(
        "/api/games/empires-allies/ticket",
        {
          method: "POST",
          body: JSON.stringify({ source: "standalone-game-page" }),
        },
      );
      window.location.assign(result.launchUrl);
    } catch (launchError) {
      const status =
        typeof launchError === "object" && launchError !== null && "status" in launchError
          ? Number(launchError.status)
          : 0;
      const message =
        launchError instanceof Error
          ? launchError.message
          : "Empires & Allies tidak dapat dibuka. Silakan coba lagi.";

      if (status === 401 || /login|masuk|authentication/i.test(message)) {
        setAuthOpen(true);
        setError("Masuk ke akun ComePlayers untuk membuat kerajaan Anda.");
      } else {
        setError(message);
      }
      setLaunching(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#02070d] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <Link
          href="/cpcommunity"
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:border-cyan-300/30 hover:text-white"
        >
          <FaArrowLeft aria-hidden /> Kembali ke komunitas
        </Link>

        <section className="my-auto grid overflow-hidden rounded-[32px] border border-cyan-300/20 bg-[#071522] shadow-[0_32px_100px_rgba(0,0,0,0.55)] lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative overflow-hidden p-8 sm:p-12 lg:p-16">
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 right-0 h-72 w-72 rounded-full bg-yellow-300/10 blur-3xl" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-yellow-300/30 bg-yellow-300/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-yellow-200">
                <FaGamepad aria-hidden /> Game terpisah
              </span>
              <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-6xl">
                Empires <span className="text-yellow-300">&amp; Allies</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                Bangun kerajaan, kunjungi sekutu, dan lanjutkan progres Anda dengan akun ComePlayers.
                Game hanya dimuat setelah tombol dimainkan, sehingga komunitas dan chat tetap ringan.
              </p>

              {error ? (
                <p role="alert" className="mt-6 rounded-2xl border border-red-300/20 bg-red-400/10 p-4 text-sm leading-6 text-red-100">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void launchGame()}
                disabled={launching}
                className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-yellow-300 px-7 text-base font-black text-[#07111b] transition hover:bg-yellow-200 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
              >
                <FaGamepad aria-hidden />
                {launching ? "Menyiapkan kerajaan…" : "Main sekarang"}
              </button>
            </div>
          </div>

          <aside className="flex flex-col justify-center border-t border-white/10 bg-black/20 p-8 sm:p-12 lg:border-l lg:border-t-0">
            <FaShieldAlt className="text-4xl text-cyan-300" aria-hidden />
            <h2 className="mt-5 text-2xl font-black">Sesi aman ComePlayers</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Tidak perlu membuat akun game baru. Nama pemain dan teman ComePlayers disambungkan
              melalui tiket singkat yang hanya berlaku untuk satu kali masuk.
            </p>
            <div className="mt-7 space-y-3 text-sm text-slate-300">
              <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">Progres tersimpan di server online</p>
              <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">Tidak menambah beban halaman chat</p>
              <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">Bisa dimainkan dari browser desktop</p>
            </div>
          </aside>
        </section>
      </div>

      <AuthModal
        open={authOpen}
        initialMode="login"
        redirectPath="/play/empires-allies"
        contextMessage="Masuk untuk bermain Empires & Allies."
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => {
          setAuthOpen(false);
          void launchGame();
        }}
      />
    </main>
  );
}

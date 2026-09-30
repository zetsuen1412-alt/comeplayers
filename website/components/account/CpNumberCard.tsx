"use client";

import { useId, useRef, useState } from "react";
import { FaCopy, FaIdBadge, FaShareAlt } from "react-icons/fa";

type Props = { cpNumber: string | null };

export default function CpNumberCard({ cpNumber }: Props) {
  const inputId = useId();
  const numberInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function copyNumber() {
    if (!cpNumber) return;
    try {
      await navigator.clipboard.writeText(cpNumber);
      setNotice("Nomor CP disalin. Bagikan ke teman untuk mulai chat.");
    } catch {
      numberInput.current?.focus();
      numberInput.current?.select();
      setNotice("Nomor CP sudah dipilih. Tekan lama atau gunakan Salin di perangkat Anda.");
    }
  }

  async function shareNumber() {
    if (!cpNumber || busy) return;
    setBusy(true);
    setNotice("");
    try {
      if (!navigator.share) {
        await copyNumber();
        return;
      }
      await navigator.share({
        title: "Nomor CP ComePlayers",
        text: `Temukan saya di ComePlayers dengan nomor CP ${cpNumber}.`,
      });
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError") {
        setNotice("Belum bisa membagikan nomor. Gunakan Salin nomor CP.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-b border-amber-400/20 bg-amber-400/[0.06] px-6 py-7 md:px-8" aria-labelledby={`${inputId}-title`}>
      <div className="flex items-center gap-3 text-amber-300">
        <FaIdBadge aria-hidden="true" className="text-xl" />
        <h2 id={`${inputId}-title`} className="text-xl font-bold">Nomor CP saya</h2>
        <span className="rounded-full border border-amber-300/25 px-2.5 py-1 text-xs font-semibold">Permanen</span>
      </div>
      <p id={`${inputId}-description`} className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
        Identitas Anda di ComePlayers. Bagikan nomor ini agar teman bisa menemukan Anda tanpa nomor HP. Dibuat otomatis dan tidak dapat diganti.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor={inputId} className="sr-only">Nomor CP saya</label>
        <input
          id={inputId}
          ref={numberInput}
          type="text"
          readOnly
          value={cpNumber || ""}
          placeholder="Nomor CP belum tersedia"
          aria-describedby={`${inputId}-description`}
          onFocus={event => event.currentTarget.select()}
          className="min-h-12 w-full max-w-[21rem] rounded-xl border border-amber-300/25 bg-black/30 px-4 py-3 font-mono text-xl font-bold tracking-wider text-white outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25 sm:text-2xl"
        />
        <button
          type="button"
          disabled={!cpNumber}
          onClick={() => void copyNumber()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-black hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-40"
        >
          <FaCopy aria-hidden="true" /> Salin nomor CP
        </button>
        <button
          type="button"
          disabled={!cpNumber || busy}
          onClick={() => void shareNumber()}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-40"
        >
          <FaShareAlt aria-hidden="true" /> Bagikan
        </button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-amber-200">{notice}</p>
    </section>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import { enableBrowserPasswordBackup } from "@/lib/e2ee/browserPasswordBackup";

export default function BrowserPasswordBackupSettings({ userId, enabled, onEnabled }: { userId: string; enabled: boolean; onEnabled: () => void }) {
  const id = useId(), alive = useRef(true), saving = useRef(false);
  const [open, setOpen] = useState(false), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function save() {
    if (saving.current) return;
    setError("");
    if (password !== confirmation) { setError("Kedua sandi belum sama. Periksa sekali lagi."); return; }
    saving.current = true; setBusy(true);
    try {
      await enableBrowserPasswordBackup(userId, password, authenticatedFetchJson, async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const { data } = await Promise.race([supabase.auth.getSession(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Pemeriksaan akun terlalu lama. Coba lagi.")), 8000); })]).finally(() => clearTimeout(timer));
        if (data.session?.user.id !== userId) throw new Error("Akun yang sedang login berubah. Buka kembali chat.");
      });
      if (alive.current) { setPassword(""); setConfirmation(""); onEnabled(); }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Cadangan belum tersimpan. Coba lagi dengan sandi yang sama."); }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  }
  return <div className="mt-3 rounded-xl border border-white/10 p-3">
    <button type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(value => !value)} className="min-h-11 text-left text-base font-bold text-yellow-200">Cadangan chat (opsional)</button>
    {open ? <div id={`${id}-panel`} className="mt-2 space-y-3">
      <p>Siapkan cara membuka chat yang sama saat berganti perangkat. Anda tetap bisa mengobrol tanpa mengatur ini.</p>
      {enabled ? <p role="status" className="text-emerald-200">Sandi cadangan sudah aktif. Di perangkat baru, login lalu masukkan sandi cadangan ini untuk membuka chat Anda.</p> : <form onSubmit={event => { event.preventDefault(); void save(); }} className="grid gap-3">
        <p>Sandi ini berbeda dari sandi login. Gunakan minimal 12 karakter dan simpan baik-baik. ComePlayers tidak dapat meresetnya untuk membuka chat lama.</p>
        <label htmlFor={`${id}-password`} className="font-semibold">Buat sandi cadangan</label>
        <input id={`${id}-password`} type="password" autoComplete="new-password" minLength={12} maxLength={1024} required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className="min-h-12 rounded-xl border border-white/20 bg-black/25 px-4 text-base text-white" />
        <label htmlFor={`${id}-confirmation`} className="font-semibold">Ulangi sandi cadangan</label>
        <input id={`${id}-confirmation`} type="password" autoComplete="new-password" minLength={12} maxLength={1024} required disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="min-h-12 rounded-xl border border-white/20 bg-black/25 px-4 text-base text-white" />
        <button type="submit" disabled={busy || password.length < 12 || !confirmation} className="min-h-12 rounded-xl bg-yellow-400 px-4 py-3 text-base font-bold text-black disabled:opacity-40">{busy ? "Menyimpan…" : "Simpan sandi cadangan"}</button>
      </form>}
      <p className="text-sm text-slate-400">Pengaturan ini menyimpan cara membuka akun chat, bukan salinan lengkap semua pesan dan lampiran. Riwayat yang hanya ada di perangkat lama tetap memerlukan cadangan riwayat.</p>
      {error ? <div role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200"><p>{/^(Kedua sandi|Sandi cadangan|Gunakan sandi)/.test(error) ? error : "Cadangan belum tersimpan. Coba lagi dengan sandi yang sama. Chat Anda tetap bisa digunakan."}</p>{!/^(Kedua sandi|Sandi cadangan|Gunakan sandi)/.test(error) ? <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3">Detail untuk bantuan</summary>{error}</details> : null}</div> : null}
    </div> : null}
  </div>;
}

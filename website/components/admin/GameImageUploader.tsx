"use client";

import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { supabase } from "@/lib/supabase";
import {
  GAME_IMAGE_BUCKET, GAME_IMAGE_MIME_TYPES, isPlaceholderGameImage,
  normalizeGameImageUrl, type GameCatalogImageSource,
} from "@/lib/gameCatalogImages";
import { prepareGameCatalogImage } from "@/lib/prepareGameCatalogImage";
import GameCoverImage from "@/components/games/GameCoverImage";

type Props = {
  game: GameCatalogImageSource & { id: number; name: string };
  value: string;
  onChange: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  disabled?: boolean;
};

function verifyImageUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      image.src = "";
      if (error) reject(error); else resolve();
    };
    const timer = window.setTimeout(() => finish(new Error("Gambar tidak merespons. Unduh gambarnya lalu gunakan Unggah gambar.")), 15000);
    image.referrerPolicy = "no-referrer";
    image.onload = () => finish(image.naturalWidth > 0 ? undefined : new Error("Tautan tidak berisi gambar yang valid."));
    image.onerror = () => finish(new Error("Gambar tidak dapat dibuka. Gunakan tautan langsung ke gambar atau unggah file dari perangkat."));
    image.src = url;
  });
}

export default function GameImageUploader({ game, value, onChange, onBusyChange, onPendingChange, disabled = false }: Props) {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draftUrl, setDraftUrl] = useState(value);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locked = disabled || busy;
  const imageChanged = value.trim() !== (game.image_url || "").trim();
  const previewGame = {
    ...game, image_url: value, catalog_image_url: undefined,
    cover_image_url: imageChanged ? value || null : game.cover_image_url,
  };

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; onBusyChange(false); onPendingChange(false); };
  }, [onBusyChange, onPendingChange]);

  async function runTask(task: () => Promise<void>) {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "Gambar gagal diproses. Silakan coba lagi.");
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  function selectImage(url: string, notice: string) {
    if (!alive.current) return;
    setDraftUrl(url);
    onChange(url);
    onPendingChange(false);
    setMessage(notice);
  }

  async function storeFile(file: File) {
    if (!Number.isSafeInteger(game.id) || game.id <= 0) throw new Error("Simpan data game terlebih dahulu sebelum mengunggah gambar.");
    const blob = await prepareGameCatalogImage(file);
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error("Sesi berakhir. Masuk kembali menggunakan akun admin.");
    const extension = blob.type === "image/png" ? "png" : "webp";
    const path = `${auth.user.id}/${game.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(GAME_IMAGE_BUCKET).upload(path, blob, {
      contentType: blob.type, cacheControl: "31536000", upsert: false,
    });
    if (uploadError) {
      console.error("Game image upload failed:", uploadError.message);
      throw new Error("Unggah gagal. Pastikan koneksi internet aktif dan akun Anda memiliki akses admin.");
    }
    if (!alive.current) {
      // Only remove this newly created, unpublished file; never delete an existing catalog image.
      await supabase.storage.from(GAME_IMAGE_BUCKET).remove([path]);
      return;
    }
    const { data } = supabase.storage.from(GAME_IMAGE_BUCKET).getPublicUrl(path);
    selectImage(data.publicUrl, "Gambar berhasil diunggah dan dioptimalkan. Klik Simpan perubahan untuk menerapkannya ke katalog.");
  }

  function uploadFile(file: File) {
    void runTask(() => storeFile(file));
  }

  async function applyUrl() {
    await runTask(async () => {
      const url = normalizeGameImageUrl(draftUrl);
      if (!url || isPlaceholderGameImage(url)) throw new Error("Masukkan URL HTTPS gambar asli, bukan tautan halaman web atau placeholder.");
      await verifyImageUrl(url);
      selectImage(url, "URL gambar siap digunakan. Klik Simpan perubahan untuk menerapkannya ke katalog.");
    });
  }

  function paste(event: ClipboardEvent<HTMLElement>) {
    const item = Array.from(event.clipboardData.items).find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
    if (!item) return; // Leave normal text pasting in the URL field untouched.
    event.preventDefault();
    const file = item.getAsFile();
    if (file) uploadFile(file);
  }

  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (locked) return;
    if (event.dataTransfer.files.length !== 1) {
      setError("Seret satu file gambar untuk game ini. Untuk gambar dari browser, gunakan Salin gambar lalu Ctrl+V.");
      return;
    }
    uploadFile(event.dataTransfer.files[0]);
  }

  async function readClipboard() {
    await runTask(async () => {
      if (!navigator.clipboard?.read) throw new Error("Klik area gambar di bawah, lalu tekan Ctrl+V untuk menempel gambar.");
      let items: ClipboardItems;
      try { items = await navigator.clipboard.read(); }
      catch { throw new Error("Akses clipboard tidak diizinkan. Klik area gambar lalu tekan Ctrl+V, atau gunakan Unggah gambar."); }
      for (const item of items) {
        const type = GAME_IMAGE_MIME_TYPES.find((mime) => item.types.includes(mime));
        if (type) {
          const blob = await item.getType(type);
          await storeFile(new File([blob], "clipboard-image", { type }));
          return;
        }
      }
      throw new Error("Clipboard belum berisi gambar JPG, PNG, atau WebP. Pilih Salin gambar, bukan Salin alamat tautan.");
    });
  }

  return (
    <section onPaste={paste} className="mt-6 rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-4 sm:p-5" aria-busy={busy}>
      <div className="mb-4"><h3 className="text-lg font-black">Gambar katalog game</h3><p className="mt-1 text-sm text-gray-400">Satu gambar utama digunakan di seluruh kategori game ini. Unggah file, seret gambar, atau salin gambar lalu tempel dengan Ctrl+V.</p></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(220px,340px)_1fr]">
        <div>
          <GameCoverImage game={previewGame} className="aspect-video w-full rounded-xl border border-white/10" fallbackLabel="Gambar belum tersedia" />
          <p className="mt-2 truncate text-sm font-bold">{game.name}</p>
          <p className="mt-1 text-xs text-gray-400">Pratinjau kartu katalog · gambar mendatar 16:9 disarankan.</p>
        </div>
        <div className="min-w-0 space-y-4">
          <div tabIndex={locked ? -1 : 0} role="group" aria-label="Area unggah dan tempel gambar game"
            onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }}
            onDragLeave={() => setDragging(false)} onDrop={drop}
            className={`rounded-xl border-2 border-dashed p-4 outline-none focus:ring-2 focus:ring-cyan-400 ${dragging ? "border-cyan-300 bg-cyan-300/10" : "border-white/20 bg-black/20"}`}>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} className="sr-only" aria-label="Pilih file gambar game"
              onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) uploadFile(file); }} />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={locked} onClick={() => fileInput.current?.click()} className="rounded-lg bg-cyan-400 px-4 py-2 font-bold text-black disabled:opacity-50">Unggah gambar</button>
              <button type="button" disabled={locked} onClick={() => void readClipboard()} className="rounded-lg border border-white/20 px-4 py-2 font-bold disabled:opacity-50">Tempel gambar</button>
              <button type="button" disabled={locked || !value} onClick={() => { setError(""); selectImage("", "Pilihan gambar utama dikosongkan. Gambar bawaan lain tetap digunakan bila tersedia. Klik Simpan perubahan."); }} className="rounded-lg px-3 py-2 text-sm text-gray-300 underline disabled:opacity-40">Kosongkan gambar utama</button>
            </div>
            <p className="mt-3 text-xs leading-5 text-gray-400">JPG, PNG, atau WebP, maksimal 10 MB. Gambar otomatis dioptimalkan sebelum diunggah. Klik area ini lalu tekan Ctrl+V untuk menempel gambar.</p>
          </div>
          <div>
            <label htmlFor={inputId} className="text-sm font-bold">Atau gunakan URL gambar</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input id={inputId} type="text" inputMode="url" value={draftUrl} disabled={locked} maxLength={4096} placeholder="https://contoh.com/gambar-game.jpg" autoComplete="off"
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void applyUrl(); } }}
                onChange={(event) => { const next = event.target.value; setDraftUrl(next); onPendingChange(next.trim() !== value.trim()); setError(""); setMessage(""); }}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-cyan-400" />
              <button type="button" disabled={locked || !draftUrl.trim()} onClick={() => void applyUrl()} className="shrink-0 rounded-xl border border-cyan-400/40 px-4 py-2 text-sm font-bold text-cyan-300 disabled:opacity-50">Gunakan URL</button>
            </div>
            <p className="mt-2 text-xs text-gray-400">Gunakan tautan langsung ke file gambar. Unggah atau tempel gambar lebih awet karena salinannya disimpan di ComePlayers.</p>
            {draftUrl.trim() !== value.trim() && <p className="mt-2 text-xs text-yellow-300">URL belum diterapkan. Klik Gunakan URL sebelum menyimpan game.</p>}
          </div>
        </div>
      </div>
      {busy && <p role="status" className="mt-4 text-sm text-cyan-200">Sedang memproses gambar… Tunggu hingga selesai sebelum menyimpan.</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-300">{message}</p>}
    </section>
  );
}

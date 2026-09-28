"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import type { CommunityBundle, CommunityChannel } from "./CommunityChannelSidebar";

export type ChannelEditorTarget = { kind: "channel"; channel?: CommunityChannel; categoryId?: string } | { kind: "category" };

export default function CommunityChannelEditor({ bundle, target, onClose, onSaved }: {
  bundle: CommunityBundle;
  target: ChannelEditorTarget;
  onClose: () => void;
  onSaved: (channel?: CommunityChannel) => void;
}) {
  const channel = target.kind === "channel" ? target.channel : undefined;
  const category = target.kind === "category";
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(channel?.name || "");
  const [topic, setTopic] = useState(channel?.topic || "");
  const [type, setType] = useState<CommunityChannel["channel_type"]>(channel?.channel_type || "text");
  const [categoryId, setCategoryId] = useState(channel?.category_id || (target.kind === "channel" ? target.categoryId : "") || "");
  const [isPrivate, setPrivate] = useState(Boolean(channel?.is_private));
  const [isReadOnly, setReadOnly] = useState(Boolean(channel?.is_read_only));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const title = category ? "Tambah kategori" : channel ? "Pengaturan ruang" : "Tambah ruang obrolan";

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const base = `/api/messages/communities/${bundle.community.id}`;
      const result = await authenticatedFetchJson<{ channel?: CommunityChannel }>(
        category ? `${base}/categories` : `${base}/channels${channel ? `/${channel.id}` : ""}`,
        {
          method: channel ? "PATCH" : "POST",
          body: JSON.stringify(category ? { name: name.trim() } : {
            name: name.trim(), topic: topic.trim(), type, categoryId: categoryId || null,
            isPrivate, isReadOnly: type === "announcement" || isReadOnly,
          }),
        },
      );
      onSaved(result.channel);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save. Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const inputClass = "mt-1 min-h-12 w-full rounded-xl border border-white/15 bg-[#101c2c] px-3 py-2.5 text-base text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20";
  return (
    <dialog ref={dialog} aria-labelledby="channel-editor-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0b1422] p-6 text-gray-200 shadow-2xl backdrop:bg-black/75">
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">{bundle.community.name}</p><h2 id="channel-editor-title" className="mt-2 text-xl font-bold text-white">{title}</h2></div>
        <label className="block text-base">{category ? "Nama kategori" : "Nama ruang"}
          <input autoFocus required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder={category ? "Contoh: Tempat berkumpul" : "Contoh: Obrolan santai"} />
        </label>
        {!category ? <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-base">Jenis ruang<select disabled={Boolean(channel)} value={type} onChange={(event) => setType(event.target.value as CommunityChannel["channel_type"])} className={inputClass}>
              <option value="text">Obrolan teks</option><option value="voice">Ruang suara</option><option value="announcement">Pengumuman</option>
            </select></label>
            <label className="text-base">Kategori<select aria-label="Kategori" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputClass}>
              <option value="">Tanpa kategori</option>{bundle.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
          </div>
          <label className="block text-base">Deskripsi <span className="text-slate-400">(opsional)</span>
            <textarea maxLength={500} rows={3} value={topic} onChange={(event) => setTopic(event.target.value)} className={inputClass} placeholder="Apa yang ingin dibahas di ruang ini?" />
            <span className="mt-1 block text-right text-xs text-gray-400">{topic.length}/500</span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3 text-sm">
            <input type="checkbox" checked={isPrivate} onChange={(event) => setPrivate(event.target.checked)} className="mt-1 accent-cyan-400" />
            <span>Batasi anggota yang bisa masuk<span className="mt-1 block text-sm leading-6 text-slate-400">Hanya pemilik, admin, dan anggota yang diberi akses yang dapat melihat ruang ini.</span></span>
          </label>
          {type !== "voice" ? <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3 text-sm">
            <input type="checkbox" checked={type === "announcement" || isReadOnly} disabled={type === "announcement"} onChange={(event) => setReadOnly(event.target.checked)} className="mt-1 accent-cyan-400" />
            <span>Hanya pengelola yang dapat mengirim pesan<span className="mt-1 block text-sm leading-6 text-slate-400">Anggota lain tetap bisa membaca. Cocok untuk pengumuman.</span></span>
          </label> : null}
        </> : null}
        {error ? <div role="alert" className="rounded-xl bg-red-400/10 p-3 text-base text-red-100"><p>Perubahan belum tersimpan. Coba lagi.</p><details className="mt-1 text-sm"><summary className="min-h-11 cursor-pointer py-3">Rincian masalah</summary><p className="break-words">{error}</p></details></div> : null}
        <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-12 rounded-xl px-4 text-base hover:bg-white/10 disabled:opacity-50">Batal</button>
          <button disabled={busy || !name.trim()} className="min-h-12 rounded-xl bg-cyan-300 px-5 text-base font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">{busy ? "Menyimpan…" : channel ? "Simpan" : "Tambahkan"}</button>
        </div>
      </form>
    </dialog>
  );
}

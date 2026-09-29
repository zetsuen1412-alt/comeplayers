"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaCheck, FaCheckDouble, FaDownload, FaEdit, FaComments, FaEllipsisH, FaPaperPlane, FaPaperclip, FaReply, FaShieldAlt, FaStar, FaTrash } from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import type { AccountSnapshot } from "@/lib/e2ee/account";
import type { WebMessenger, SecurePrivateMessage, SecureRoom } from "@/lib/e2ee/webMessenger";
import AccountDirectCall from "./AccountDirectCall";
import BrowserPasswordBackupSettings from "./BrowserPasswordBackupSettings";

type Preview = { url: string; name: string; mime: string };
export default function SecureConversationView({ userId, room, messenger }: { userId: string; room: SecureRoom; messenger: WebMessenger }) {
  const [messages, setMessages] = useState<SecurePrivateMessage[]>([]), [draft, setDraft] = useState("");
  const [reply, setReply] = useState<SecurePrivateMessage | null>(null), [editing, setEditing] = useState<SecurePrivateMessage | null>(null);
  const [file, setFile] = useState<File | null>(null), [media, setMedia] = useState<Record<string, Preview>>({});
  const [securityCode, setSecurityCode] = useState(""), [showSecurityCode, setShowSecurityCode] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false), [backupMethod, setBackupMethod] = useState<"passkey" | "password" | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false), [securityError, setSecurityError] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [callErrorMessage, setCallErrorMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null), bottom = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null);
  const backupConfirmed = useRef(false);
  const alive = useRef(true), writing = useRef(false), previews = useRef<Record<string, Preview>>({});
  const mediaInFlight = useRef(new Set<string>());
  const mediaFailed = useRef(new Set<string>());
  const messageChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const roomRef = useRef(room);
  const messageVersion = useRef("");
  const roomId = room.id;
  const peer = room.other?.full_name || room.other?.username || "Pengguna ComePlayers";
  const refresh = useCallback(async () => {
    const next = await messenger.messages(roomId);
    if (!alive.current) return;
    const version = JSON.stringify(next.map((message) => [
      message.id, message.message, message.delivery, message.edited_at,
      message.deleted_at, message.starred, message.secureAttachment?.id,
    ]));
    if (version === messageVersion.current) return;
    const viewport = scroller.current;
    const nearBottom = !viewport || viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 160;
    messageVersion.current = version;
    setMessages(next);
    if (nearBottom) requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
  }, [messenger, roomId]);
  const callError = useCallback((message: string) => { if (alive.current) setCallErrorMessage(message); }, []);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => {
    alive.current = true;
    let active = true, syncing = false, pendingSync = false;
    let invalidationTimer: ReturnType<typeof setTimeout> | undefined;
    const synchronize = async (first = false) => {
      if (!active || (!first && document.visibilityState !== "visible")) return;
      if (syncing) { pendingSync = true; return; }
      syncing = true;
      try {
        if (first) await messenger.saveRoom(roomRef.current);
        await messenger.sync(roomId);
        if (!active) return;
        await refresh();
        if (first) { await messenger.markRead(roomId, true); await refresh(); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Pesan belum bisa diperbarui."); }
      finally {
        syncing = false;
        if (active && first) setBusy(false);
        if (active && pendingSync) { pendingSync = false; void synchronize(); }
      }
    };
    void synchronize(true);
    const channel = supabase
      .channel(`chat-room:${roomId}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "secure-message" }, ({ payload }) => {
        if (String(payload?.roomId || "") !== roomId) return;
        clearTimeout(invalidationTimer);
        invalidationTimer = setTimeout(() => { void synchronize(); }, 100);
      })
      .subscribe((status) => { if (status === "SUBSCRIBED") void synchronize(); });
    messageChannel.current = channel;
    const timer = window.setInterval(() => { void synchronize(); }, 7000);
    const visible = () => { void synchronize(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; alive.current = false; window.clearInterval(timer); clearTimeout(invalidationTimer); document.removeEventListener("visibilitychange", visible); if (messageChannel.current === channel) messageChannel.current = null; void supabase.removeChannel(channel); Object.values(previews.current).forEach(value => URL.revokeObjectURL(value.url)); previews.current = {}; };
  }, [messenger, roomId, refresh]);
  async function mutate(action: () => Promise<unknown>) {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError("");
    try { await action(); await refresh(); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Belum berhasil. Silakan coba lagi."); }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  }
  async function send() {
    if (busy || writing.current || (!draft.trim() && !file)) return;
    await mutate(async () => {
      if (editing) await messenger.edit(editing, draft);
      else await messenger.send(room, draft, file || undefined, reply || undefined);
      // The broadcast contains an invalidation only. Message text and media
      // remain in the end-to-end encrypted transport.
      const channel = messageChannel.current;
      if (channel) void channel.send({ type: "broadcast", event: "secure-message", payload: { roomId: room.id } }).catch(() => undefined);
      if (!alive.current) return;
      setDraft(""); setReply(null); setEditing(null); setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    });
  }
  const openMedia = useCallback(async (message: SecurePrivateMessage, manual = false) => {
    if (manual) mediaFailed.current.delete(message.id);
    if (previews.current[message.id] || mediaInFlight.current.has(message.id) || mediaFailed.current.has(message.id)) return;
    mediaInFlight.current.add(message.id);
    try {
      const preview = await messenger.downloadMedia(message);
      if (!alive.current) { URL.revokeObjectURL(preview.url); return; }
      if (previews.current[message.id]) { URL.revokeObjectURL(preview.url); return; }
      previews.current = { ...previews.current, [message.id]: preview }; setMedia(previews.current);
    } catch (reason) { mediaFailed.current.add(message.id); if (alive.current) setError(reason instanceof Error ? reason.message : "Lampiran belum bisa dibuka."); }
    finally { mediaInFlight.current.delete(message.id); }
  }, [messenger]);
  useEffect(() => {
    // Images appear in the conversation without asking the recipient to
    // download them. Videos stay on demand to avoid fetching large files.
    for (const message of messages) {
      if (message.secureAttachment?.mime.startsWith("image/") && !message.deleted_at) {
        void openMedia(message);
      }
    }
  }, [messages, openMedia]);
  useEffect(() => {
    if (!detailsOpen) return;
    let current = true;
    void authenticatedFetchJson<{ account: AccountSnapshot | null }>("/api/messages/secure/account")
      .then(({ account }) => { if (current) setBackupMethod(backupConfirmed.current || account?.encrypted_backup.password ? "password" : account?.encrypted_backup.passkey ? "passkey" : null); })
      .catch(() => { if (current && !backupConfirmed.current) setBackupMethod(null); });
    return () => { current = false; };
  }, [detailsOpen, userId]);
  async function openVerification() {
    if (showSecurityCode) { setShowSecurityCode(false); return; }
    setShowSecurityCode(true);
    if (securityCode || securityBusy) return;
    setSecurityBusy(true); setSecurityError("");
    try { const code = await messenger.securityCode(room.id); if (alive.current) setSecurityCode(code); }
    catch (reason) { if (alive.current) setSecurityError(reason instanceof Error ? reason.message : "Pemeriksaan belum tersedia."); }
    finally { if (alive.current) setSecurityBusy(false); }
  }
  async function downloadBackup() {
    try {
      const { account } = await authenticatedFetchJson<{ account: AccountSnapshot | null }>("/api/messages/secure/account");
      if (!account?.encrypted_backup.passkey && !account?.encrypted_backup.password) throw new Error("Cadangan belum tersedia untuk akun ini. Anda tetap bisa menggunakan chat.");
      const content = { product: "ComePlayers", version: 2, userId, rootFingerprint: account.encrypted_backup.rootFingerprint, encryptedBackup: account.encrypted_backup, note: account.encrypted_backup.password ? "Encrypted account identity only, not a complete message archive. Recovery requires the backup password." : "Encrypted account identity only, not a complete message archive. Recovery requires the same synced account passkey." };
      const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `comeplayers-encrypted-account-${userId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Cadangan belum bisa diunduh."); }
  }
  const time = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
  return <div data-active-chat-room={room.id} className="flex min-h-0 flex-1 flex-col bg-[#07131f]">
    <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#091b2a] px-4 py-3">
      <div aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cyan-400/15 font-black text-cyan-200">{room.other?.avatar_url ? <img src={room.other.avatar_url} alt="" className="h-full w-full object-cover" /> : peer.slice(0, 1).toUpperCase()}</div>
      <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-bold">{peer}</h2><p className="text-sm text-slate-300">Chat pribadi</p></div>
      <AccountDirectCall roomId={room.id} userId={userId} peerName={peer} onError={callError} />
      <button type="button" onClick={() => setDetailsOpen(value => !value)} aria-expanded={detailsOpen} aria-controls="chat-details" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl p-3 text-slate-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-yellow-300" aria-label="Info percakapan"><FaEllipsisH /></button>
    </header>
    {callErrorMessage ? <div role="alert" className="flex items-start justify-between gap-3 border-b border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100"><p>Panggilan belum tersambung: {callErrorMessage}</p><button type="button" onClick={() => setCallErrorMessage("")} aria-label="Tutup pesan panggilan" className="min-h-8 min-w-8 font-bold">×</button></div> : null}
    {detailsOpen ? <section id="chat-details" aria-label="Info percakapan" className="max-h-[55dvh] shrink-0 overflow-y-auto border-b border-white/10 bg-[#091b2a] px-4 py-4 text-sm leading-6 text-slate-300">
      <h3 className="text-base font-bold text-white">Privasi percakapan</h3>
      <p>Pesan baru hanya dapat dibaca oleh Anda dan penerima. Anda bisa terus mengobrol tanpa membuka menu ini.</p>
      <p className="mt-2">Pesan bertanda “Riwayat lama” berasal dari layanan chat sebelumnya dan belum memakai perlindungan yang sama saat dikirim.</p>
      <button type="button" onClick={() => void openVerification()} aria-expanded={showSecurityCode} className="mt-2 flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-cyan-200 hover:bg-white/10"><FaShieldAlt aria-hidden="true" />Periksa identitas kontak (opsional)</button>
      {showSecurityCode ? <div className="mt-2 rounded-xl bg-white/5 p-3"><p>Jika ingin memeriksa identitas kontak, cocokkan angka ini secara langsung dengannya.</p><p className="mt-2 break-all font-mono text-base text-white">{securityBusy ? "Memuat pemeriksaan…" : securityCode || "Pemeriksaan belum tersedia. Anda bisa mencoba lagi nanti."}</p>{securityError ? <details className="mt-2"><summary className="flex min-h-11 cursor-pointer items-center">Lihat rincian</summary><p className="break-words">{securityError}</p></details> : null}</div> : null}
      <BrowserPasswordBackupSettings key={userId} userId={userId} enabled={backupMethod === "password"} onEnabled={() => { backupConfirmed.current = true; setBackupMethod("password"); }} />
      {backupMethod ? <><button type="button" onClick={() => void downloadBackup()} className="mt-2 flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-cyan-200 hover:bg-white/10"><FaDownload aria-hidden="true" />Unduh cadangan akun</button><p className="text-sm text-slate-400">File ini berisi identitas akun, bukan seluruh pesan. {backupMethod === "password" ? "Pemulihan memakai sandi cadangan Anda." : "Pemulihan memakai kunci akses yang pernah Anda simpan."}</p></> : null}
    </section> : null}
    {error || messenger.error ? <div className="border-b border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100"><p role="alert">Chat belum bisa diperbarui. Pesan yang belum terkirim tetap ada di kolom pesan.</p><button type="button" disabled={busy} onClick={() => void mutate(() => messenger.sync(room.id))} className="mt-2 min-h-11 rounded-xl bg-white/10 px-4 font-semibold disabled:opacity-50">Coba lagi</button><details className="mt-2"><summary className="flex min-h-11 cursor-pointer items-center">Lihat rincian</summary><p className="break-words">{error || messenger.error}</p></details></div> : null}
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">{messages.map(message => {
        const mine = message.sender_id === userId, preview = media[message.id];
        return <article key={message.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] rounded-2xl px-4 py-3 shadow ${mine ? "rounded-br-sm bg-emerald-900/80" : "rounded-bl-sm bg-[#122536]"}`}>
          {message.reply_to ? <div className="mb-2 rounded-lg border-l-2 border-cyan-300 bg-black/20 px-3 py-2 text-sm text-slate-300">{message.reply_to.message || "Lampiran"}</div> : null}
          {message.deleted_at ? <p className="italic text-slate-400">Pesan dihapus</p> : <p className="whitespace-pre-wrap break-words text-base leading-7">{message.message}</p>}
          {message.secureAttachment && !message.deleted_at ? <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2">
            {preview?.mime.startsWith("image/") ? <img src={preview.url} alt={preview.name} className="max-h-72 rounded-lg object-contain" /> : null}
            {preview?.mime.startsWith("video/") ? <video controls playsInline preload="metadata" src={preview.url} className="max-h-72 rounded-lg" /> : null}
            {preview?.mime.startsWith("audio/") ? <audio controls src={preview.url} className="max-w-full" /> : null}
            <button type="button" onClick={() => void openMedia(message, true)} className="mt-1 flex min-h-11 items-center gap-2 break-all text-left text-sm font-bold text-cyan-200">{preview ? <FaCheck aria-hidden="true" /> : <FaDownload aria-hidden="true" />}{preview ? message.secureAttachment.name : message.secureAttachment.mime.startsWith("video/") ? `Putar ${message.secureAttachment.name}` : message.secureAttachment.name} · {Math.ceil(message.secureAttachment.size / 1024)} KB</button>
          </div> : null}
          {message.attachment && !message.deleted_at ? <div className="mt-2 rounded-lg bg-black/20 p-2 text-sm text-slate-300"><FaPaperclip className="mr-1 inline" aria-hidden="true" />{message.attachment.file_name} · lampiran dari riwayat lama</div> : null}
          <footer className="mt-1 flex flex-wrap items-center justify-end gap-2 text-xs text-slate-300">{message.legacy ? <span className="rounded bg-amber-300/10 px-2 py-1 text-amber-200">Riwayat lama</span> : null}{message.edited_at ? <span>diubah</span> : null}<span>{time(message.created_at)}</span>{mine && !message.legacy ? message.delivery === "read" ? <FaCheckDouble aria-label="Sudah dibaca" className="text-cyan-300" /> : message.delivery === "queued" ? <span>Menunggu dikirim</span> : <FaCheck aria-label="Terkirim" /> : null}{!message.deleted_at ? <button type="button" aria-label="Pilihan pesan" aria-expanded={selectedMessageId === message.id} onClick={() => setSelectedMessageId(current => current === message.id ? null : message.id)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/10"><FaEllipsisH /></button> : null}</footer>
          {!message.deleted_at && selectedMessageId === message.id ? <div className="mt-1 flex flex-wrap items-center justify-end gap-1 border-t border-white/10 pt-2 text-sm text-slate-200">
            <button type="button" className="flex min-h-11 items-center gap-2 rounded-lg px-3 hover:bg-white/10" onClick={() => { setReply(message); setEditing(null); setSelectedMessageId(null); }}><FaReply aria-hidden="true" />Balas</button>
            <button type="button" className="flex min-h-11 items-center gap-2 rounded-lg px-3 hover:bg-white/10" disabled={busy} onClick={() => { setSelectedMessageId(null); void mutate(() => messenger.star(message)); }}><FaStar aria-hidden="true" className={message.starred ? "text-yellow-300" : ""} />{message.starred ? "Hapus bintang" : "Beri bintang"}</button>
            {mine && !message.legacy ? <><button type="button" className="flex min-h-11 items-center gap-2 rounded-lg px-3 hover:bg-white/10" onClick={() => { setEditing(message); setReply(null); setFile(null); setDraft(message.message || ""); setSelectedMessageId(null); }}><FaEdit aria-hidden="true" />Ubah</button><button type="button" className="flex min-h-11 items-center gap-2 rounded-lg px-3 hover:bg-white/10" disabled={busy} onClick={() => { setSelectedMessageId(null); void mutate(() => messenger.edit(message)); }}><FaTrash aria-hidden="true" />Hapus</button></> : null}
          </div> : null}
        </div></article>;
      })}{!messages.length ? <div role={busy ? "status" : undefined} className="py-16 text-center text-base leading-7 text-slate-300"><FaComments className="mx-auto mb-3 text-3xl text-emerald-300" aria-hidden="true" />{busy ? "Memuat pesan…" : <><p className="font-bold text-white">Mulai percakapan</p><p>Ketik pesan di bawah untuk menyapa.</p></>}</div> : null}<div ref={bottom} /></div>
    </div>
    <div className="border-t border-white/10 bg-[#091b2a] p-3 sm:p-4">
      {reply || editing || file ? <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between gap-2 rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-slate-300"><span className="min-w-0 truncate">{editing ? "Mengubah pesan" : reply ? `Membalas: ${reply.message || "Lampiran"}` : file?.name}</span><button type="button" aria-label="Batalkan balasan, perubahan, atau lampiran" className="min-h-11 min-w-11 text-xl" onClick={() => { setReply(null); setEditing(null); setFile(null); setDraft(""); }}>×</button></div> : null}
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
        <input ref={fileInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,video/mp4,audio/mp4,audio/m4a,audio/mpeg,application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} />
        <button type="button" disabled={busy || !!editing} onClick={() => fileInput.current?.click()} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-slate-300 disabled:opacity-40" aria-label="Tambah lampiran"><FaPaperclip /></button>
        <textarea rows={1} value={draft} maxLength={6000} disabled={busy} aria-label="Ketik pesan" onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ketik pesan" className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-7 outline-none placeholder:text-slate-400" />
        <button type="button" disabled={busy || (!draft.trim() && !file)} onClick={() => void send()} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-black disabled:opacity-40" aria-label="Kirim pesan"><FaPaperPlane /></button>
      </div>
    </div>
  </div>;
}

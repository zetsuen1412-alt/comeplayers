"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaCheck, FaCheckDouble, FaDownload, FaEdit, FaLock, FaPaperPlane, FaPaperclip, FaReply, FaShieldAlt, FaStar, FaTrash } from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import type { AccountSnapshot } from "@/lib/e2ee/account";
import type { WebMessenger, SecurePrivateMessage, SecureRoom } from "@/lib/e2ee/webMessenger";
import SecureDirectCall from "./SecureDirectCall";

type Preview = { url: string; name: string; mime: string };
export default function SecureConversationView({ userId, room, messenger }: { userId: string; room: SecureRoom; messenger: WebMessenger }) {
  const [messages, setMessages] = useState<SecurePrivateMessage[]>([]), [draft, setDraft] = useState("");
  const [reply, setReply] = useState<SecurePrivateMessage | null>(null), [editing, setEditing] = useState<SecurePrivateMessage | null>(null);
  const [file, setFile] = useState<File | null>(null), [media, setMedia] = useState<Record<string, Preview>>({});
  const [securityCode, setSecurityCode] = useState(""), [showSecurityCode, setShowSecurityCode] = useState(false);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null), bottom = useRef<HTMLDivElement>(null);
  const alive = useRef(true), writing = useRef(false), previews = useRef<Record<string, Preview>>({});
  const peer = room.other?.full_name || room.other?.username || "ComePlayers user";
  const refresh = useCallback(async () => {
    const next = await messenger.messages(room.id);
    if (!alive.current) return;
    setMessages(next);
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
  }, [messenger, room.id]);
  const callError = useCallback((message: string) => { if (alive.current) setError(message); }, []);
  useEffect(() => {
    alive.current = true;
    let active = true, syncing = false;
    const synchronize = async (first = false) => {
      if (!active || syncing || (!first && document.visibilityState !== "visible")) return;
      syncing = true;
      try {
        if (first) await messenger.saveRoom(room);
        await messenger.sync(room.id);
        if (!active) return;
        await refresh();
        if (first) { setSecurityCode(await messenger.securityCode(room.id)); await messenger.markRead(room.id, true); await refresh(); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Encrypted history could not synchronize."); }
      finally { syncing = false; if (active && first) setBusy(false); }
    };
    void synchronize(true);
    const timer = window.setInterval(() => { void synchronize(); }, 7000);
    const visible = () => { void synchronize(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; alive.current = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); Object.values(previews.current).forEach(value => URL.revokeObjectURL(value.url)); previews.current = {}; };
  }, [messenger, room, refresh]);
  async function mutate(action: () => Promise<unknown>) {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError("");
    try { await action(); await refresh(); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Encrypted message operation failed."); }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  }
  async function send() {
    if (busy || writing.current || (!draft.trim() && !file)) return;
    await mutate(async () => {
      if (editing) await messenger.edit(editing, draft);
      else await messenger.send(room, draft, file || undefined, reply || undefined);
      if (!alive.current) return;
      setDraft(""); setReply(null); setEditing(null); setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    });
  }
  async function openMedia(message: SecurePrivateMessage) {
    if (previews.current[message.id]) return;
    try {
      const preview = await messenger.downloadMedia(message);
      if (!alive.current) { URL.revokeObjectURL(preview.url); return; }
      if (previews.current[message.id]) { URL.revokeObjectURL(preview.url); return; }
      previews.current = { ...previews.current, [message.id]: preview }; setMedia(previews.current);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "The encrypted attachment could not be opened."); }
  }
  async function downloadBackup() {
    try {
      const { account } = await authenticatedFetchJson<{ account: AccountSnapshot | null }>("/api/messages/secure/account");
      if (!account?.encrypted_backup.passkey) throw new Error("Protect this account with a passkey before exporting its encrypted identity backup.");
      const content = { product: "ComePlayers", version: 2, userId, rootFingerprint: account.encrypted_backup.rootFingerprint, encryptedBackup: account.encrypted_backup, note: "Encrypted account identity only, not a complete message archive. Recovery requires the same synced account passkey." };
      const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `comeplayers-encrypted-account-${userId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Encrypted backup could not be downloaded."); }
  }
  const time = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
  return <div className="flex min-h-0 flex-1 flex-col bg-[#07131f]">
    <header className="flex items-center gap-3 border-b border-white/10 bg-[#091b2a] px-4 py-3">
      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-cyan-400/15 font-black text-cyan-200">{room.other?.avatar_url ? <img src={room.other.avatar_url} alt="" className="h-full w-full object-cover" /> : peer.slice(0, 1).toUpperCase()}</div>
      <div className="min-w-0 flex-1"><h2 className="truncate font-black">{peer}</h2><p className="flex items-center gap-1 text-xs text-emerald-300"><FaLock />End-to-end encrypted</p></div>
      <SecureDirectCall messenger={messenger} roomId={room.id} userId={userId} peerName={peer} onError={callError} />
      <button type="button" onClick={() => void downloadBackup()} className="rounded-xl p-3 text-slate-300 hover:bg-white/10" title="Download encrypted account backup"><FaDownload /></button>
      <button type="button" onClick={() => setShowSecurityCode(value => !value)} className="rounded-xl p-3 text-slate-300 hover:bg-white/10" title="Security code"><FaShieldAlt /></button>
    </header>
    {showSecurityCode && securityCode ? <div className="border-b border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100"><strong>Security code:</strong> <span className="font-mono">{securityCode}</span></div> : null}
    {error || messenger.error ? <div role="alert" className="border-b border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error || messenger.error}</div> : null}
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
      <div className="mx-auto mb-5 max-w-md rounded-xl bg-amber-300/10 px-4 py-3 text-center text-xs leading-5 text-amber-100"><FaLock className="mr-1 inline" /> Pesan dan panggilan baru terenkripsi. Riwayat bertanda “sebelum E2EE” berasal dari sistem lama.</div>
      <div className="mx-auto flex max-w-3xl flex-col gap-2">{messages.map(message => {
        const mine = message.sender_id === userId, preview = media[message.id];
        return <article key={message.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[86%] rounded-2xl px-3 py-2 shadow ${mine ? "rounded-br-sm bg-emerald-900/80" : "rounded-bl-sm bg-[#122536]"}`}>
          {message.reply_to ? <div className="mb-2 rounded-lg border-l-2 border-cyan-300 bg-black/20 px-2 py-1 text-xs text-slate-300">{message.reply_to.message || "Attachment"}</div> : null}
          {message.deleted_at ? <p className="italic text-slate-400">Message deleted</p> : <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.message}</p>}
          {message.secureAttachment && !message.deleted_at ? <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2">
            {preview?.mime.startsWith("image/") ? <img src={preview.url} alt={preview.name} className="max-h-72 rounded-lg object-contain" /> : null}
            {preview?.mime.startsWith("video/") ? <video controls src={preview.url} className="max-h-72 rounded-lg" /> : null}
            {preview?.mime.startsWith("audio/") ? <audio controls src={preview.url} className="max-w-full" /> : null}
            <button type="button" onClick={() => void openMedia(message)} className="mt-1 flex items-center gap-2 text-xs font-bold text-cyan-200">{preview ? <FaCheck /> : <FaDownload />}{message.secureAttachment.name} · {Math.ceil(message.secureAttachment.size / 1024)} KB</button>
          </div> : null}
          {message.attachment && !message.deleted_at ? <div className="mt-2 rounded-lg bg-black/20 p-2 text-xs text-slate-300"><FaPaperclip className="mr-1 inline" />{message.attachment.file_name} · attachment sebelum E2EE</div> : null}
          <footer className="mt-1 flex items-center justify-end gap-2 text-[10px] text-slate-400">{message.legacy ? <span className="rounded bg-amber-300/10 px-1 text-amber-200">sebelum E2EE</span> : null}{message.edited_at ? <span>edited</span> : null}<span>{time(message.created_at)}</span>{mine && !message.legacy ? message.delivery === "read" ? <FaCheckDouble className="text-cyan-300" /> : message.delivery === "queued" ? <span>queued</span> : <FaCheck /> : null}</footer>
          {!message.deleted_at ? <div className="mt-1 flex items-center justify-end gap-3 text-[10px] text-slate-400">
            <button type="button" title="Reply" onClick={() => { setReply(message); setEditing(null); }}><FaReply /></button>
            <button type="button" title="Star" disabled={busy} onClick={() => void mutate(() => messenger.star(message))}><FaStar className={message.starred ? "text-yellow-300" : ""} /></button>
            {mine && !message.legacy ? <><button type="button" title="Edit" onClick={() => { setEditing(message); setReply(null); setFile(null); setDraft(message.message || ""); }}><FaEdit /></button><button type="button" title="Delete" disabled={busy} onClick={() => void mutate(() => messenger.edit(message))}><FaTrash /></button></> : null}
          </div> : null}
        </div></article>;
      })}{!messages.length ? <div className="py-16 text-center text-sm text-slate-400"><FaLock className="mx-auto mb-3 text-3xl text-emerald-300" />{busy ? "Membuka riwayat terenkripsi…" : "Mulai percakapan terenkripsi."}</div> : null}<div ref={bottom} /></div>
    </div>
    <div className="border-t border-white/10 bg-[#091b2a] p-3 sm:p-4">
      {reply || editing || file ? <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between rounded-xl bg-white/[0.06] px-3 py-2 text-xs text-slate-300"><span className="truncate">{editing ? "Editing message" : reply ? `Reply: ${reply.message || "Attachment"}` : file?.name}</span><button type="button" onClick={() => { setReply(null); setEditing(null); setFile(null); setDraft(""); }}>×</button></div> : null}
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
        <input ref={fileInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,video/mp4,audio/mp4,audio/m4a,audio/mpeg,application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} />
        <button type="button" disabled={busy || !!editing} onClick={() => fileInput.current?.click()} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-300 disabled:opacity-40" title="Encrypted attachment"><FaPaperclip /></button>
        <textarea rows={1} value={draft} maxLength={6000} disabled={busy} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Encrypted message" className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-600" />
        <button type="button" disabled={busy || (!draft.trim() && !file)} onClick={() => void send()} className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400 text-black disabled:opacity-40" title="Send encrypted message"><FaPaperPlane /></button>
      </div><p className="mt-2 text-center text-[10px] text-slate-500">Encrypted on this device before upload · attachments up to 4 MB</p>
    </div>
  </div>;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaCheck,
  FaCheckDouble,
  FaCopy,
  FaDownload,
  FaEdit,
  FaFile,
  FaLock,
  FaPaperPlane,
  FaPaperclip,
  FaReply,
  FaShieldAlt,
  FaStar,
  FaTrash,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import SecureDirectCall from "@/components/messages/SecureDirectCall";
import {
  activateVerifiedDevice,
  prepareFirstDevice,
  prepareRecoveredDevice,
  type AccountSnapshot,
  type EnrollmentPlan,
} from "@/lib/e2ee/account";
import {
  closeBrowserVault,
  openBrowserVault,
  persistVerifiedBrowserSession,
  type BrowserVault,
} from "@/lib/e2ee/browserVault";
import { SecureHistorySync, type SecureTransport } from "@/lib/e2ee/historySync";
import { supabase } from "@/lib/supabase";
import {
  WebMessenger,
  type SecurePrivateMessage,
  type SecureProfile,
  type SecureRoom,
} from "@/lib/e2ee/webMessenger";

type Props = {
  userId: string;
  room: SecureRoom;
};

type Enrollment =
  | { kind: "first"; plan: EnrollmentPlan; recoveryKey: string }
  | { kind: "recover"; snapshot: AccountSnapshot };

type MediaPreview = { url: string; name: string; mime: string };

const transport: SecureTransport = (path, init) =>
  authenticatedFetchJson(path, {
    method: init?.method || "GET",
    body: init?.body,
    headers: init?.headers,
  });

async function binaryTransport(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: Uint8Array },
) {
  let body: Blob | undefined;
  if (init?.body) {
    const copied = new Uint8Array(init.body.byteLength);
    copied.set(init.body);
    body = new Blob([copied], { type: "application/octet-stream" });
  }
  return fetch(url, {
    method: init?.method || "GET",
    headers: init?.headers,
    body,
    cache: "no-store",
  });
}

function accountLabel(profile?: SecureProfile | null) {
  return profile?.full_name || profile?.username || "ComePlayers user";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)
    : "";
}

function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SecureDirectConversation({ userId, room }: Props) {
  const [secureRoom] = useState(room);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [removeDeviceIds, setRemoveDeviceIds] = useState<string[]>([]);
  const [messenger, setMessenger] = useState<WebMessenger | null>(null);
  const [messages, setMessages] = useState<SecurePrivateMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<SecurePrivateMessage | null>(null);
  const [editing, setEditing] = useState<SecurePrivateMessage | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [media, setMedia] = useState<Record<string, MediaPreview>>({});
  const [securityCode, setSecurityCode] = useState("");
  const [showSecurityCode, setShowSecurityCode] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<Record<string, MediaPreview>>({});

  const refreshMessages = useCallback(async (client: WebMessenger) => {
    const next = await client.messages(room.id);
    setMessages(next);
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
  }, [room.id]);
  const handleCallError = useCallback((message: string) => setError(message), []);

  const startRuntime = useCallback(async (vault: BrowserVault) => {
    const history = new SecureHistorySync(vault, transport, binaryTransport);
    const client = new WebMessenger(vault, history);
    await client.saveRoom(secureRoom);
    setMessenger(client);
    await client.sync(secureRoom.id);
    await refreshMessages(client);
    setSecurityCode(await client.securityCode(secureRoom.id));
    await client.markRead(secureRoom.id, true);
    await refreshMessages(client);
  }, [refreshMessages, secureRoom]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [{ account }, vault] = await Promise.all([
          authenticatedFetchJson<{ account: AccountSnapshot | null }>("/api/messages/secure/account"),
          openBrowserVault(userId),
        ]);
        if (cancelled) return;
        if (vault) {
          await startRuntime(vault);
        } else if (!account) {
          setEnrollment({ kind: "first", ...prepareFirstDevice(userId) });
        } else {
          setEnrollment({ kind: "recover", snapshot: account });
          if (account.roster.devices.length >= 8) {
            setRemoveDeviceIds([account.roster.devices[0]!.id]);
          }
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Encrypted Messages could not start.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room.id, startRuntime, userId]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== userId) void closeBrowserVault(userId);
    });
    return () => data.subscription.unsubscribe();
  }, [userId]);

  useEffect(() => {
    if (!messenger) return;
    let active = true;
    const synchronize = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const changed = await messenger.sync(room.id);
        if (active && changed) await refreshMessages(messenger);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Encrypted history could not synchronize.");
      }
    };
    const timer = window.setInterval(() => void synchronize(), 7000);
    const visible = () => void synchronize();
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [messenger, refreshMessages, room.id]);

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  useEffect(() => () => {
    Object.values(mediaRef.current).forEach((item) => URL.revokeObjectURL(item.url));
  }, []);

  async function activate(plan: EnrollmentPlan) {
    setBusy(true);
    setError("");
    try {
      await activateVerifiedDevice(plan, transport, persistVerifiedBrowserSession);
      const vault = await openBrowserVault(userId);
      if (!vault) throw new Error("The encrypted browser vault was not saved.");
      setEnrollment(null);
      await startRuntime(vault);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This browser could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  async function recover() {
    if (enrollment?.kind !== "recover") return;
    try {
      const plan = prepareRecoveredDevice(userId, enrollment.snapshot, recoveryKey, {
        pinnedRoot: enrollment.snapshot.roster.identity,
        removeDeviceIds,
      });
      await activate(plan);
      setRecoveryKey("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The recovery key is invalid.");
    }
  }

  async function importRecoveryFile(selected: File) {
    try {
      const value = JSON.parse(await selected.text()) as { recoveryKey?: unknown };
      if (typeof value.recoveryKey !== "string") throw new Error("This is not a ComePlayers recovery file.");
      setRecoveryKey(value.recoveryKey);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The recovery file could not be read.");
    }
  }

  async function send() {
    if (!messenger || busy) return;
    setBusy(true);
    setError("");
    try {
      if (editing) await messenger.edit(editing, draft);
      else await messenger.send(room, draft, file || undefined, reply || undefined);
      setDraft("");
      setFile(null);
      setReply(null);
      setEditing(null);
      if (fileInput.current) fileInput.current.value = "";
      await refreshMessages(messenger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The encrypted message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function changeMessage(message: SecurePrivateMessage, text?: string) {
    if (!messenger || busy) return;
    setBusy(true);
    setError("");
    try {
      await messenger.edit(message, text);
      await refreshMessages(messenger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The encrypted message could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function openMedia(message: SecurePrivateMessage) {
    if (!messenger || media[message.id]) return;
    setError("");
    try {
      const preview = await messenger.downloadMedia(message);
      setMedia((current) => ({ ...current, [message.id]: preview }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The encrypted attachment could not be opened.");
    }
  }

  async function downloadEncryptedBackup() {
    try {
      const { account } = await authenticatedFetchJson<{ account: AccountSnapshot | null }>("/api/messages/secure/account");
      if (!account) throw new Error("Encrypted account backup is unavailable.");
      downloadJson(`comeplayers-encrypted-backup-${userId}.json`, {
        product: "ComePlayers",
        version: 2,
        userId,
        rootFingerprint: account.encrypted_backup.rootFingerprint,
        encryptedBackup: account.encrypted_backup,
        note: "Keep this file with your separate 64-character recovery key.",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The encrypted backup could not be downloaded.");
    }
  }

  if (busy && !messenger && !enrollment) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-slate-300">
        <div><FaLock className="mx-auto mb-4 animate-pulse text-4xl text-emerald-300" />Opening encrypted Messages…</div>
      </div>
    );
  }

  if (enrollment?.kind === "first") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-5">
        <section className="w-full max-w-xl rounded-3xl border border-emerald-400/30 bg-[#071722] p-6 shadow-2xl">
          <FaShieldAlt className="text-4xl text-emerald-300" />
          <h2 className="mt-4 text-2xl font-black">Aktifkan Messages terenkripsi</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            ComePlayers membuat identitas enkripsi untuk akun ini. Simpan recovery key agar chat lama dapat dipulihkan saat berganti perangkat.
          </p>
          <div className="mt-5 break-all rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-sm text-emerald-200">
            {enrollment.recoveryKey}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(enrollment.recoveryKey)}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10"
            ><FaCopy className="mr-2 inline" />Salin</button>
            <button
              type="button"
              onClick={() => downloadJson(`comeplayers-recovery-${userId}.json`, {
                product: "ComePlayers",
                version: 2,
                userId,
                recoveryKey: enrollment.recoveryKey,
                encryptedBackup: enrollment.plan.backup,
              })}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10"
            ><FaDownload className="mr-2 inline" />Unduh recovery file</button>
          </div>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-white/[0.04] p-3 text-sm text-slate-200">
            <input type="checkbox" checked={recoverySaved} onChange={(event) => setRecoverySaved(event.target.checked)} className="mt-1" />
            Saya sudah menyimpan recovery key di tempat aman.
          </label>
          {error ? <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
          <button
            type="button"
            disabled={!recoverySaved || busy}
            onClick={() => void activate(enrollment.plan)}
            className="mt-5 w-full rounded-xl bg-emerald-400 px-4 py-3 font-black text-black disabled:opacity-40"
          >{busy ? "Memverifikasi…" : "Aktifkan perangkat ini"}</button>
        </section>
      </div>
    );
  }

  if (enrollment?.kind === "recover") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-5">
        <section className="w-full max-w-xl rounded-3xl border border-cyan-400/30 bg-[#071722] p-6 shadow-2xl">
          <FaLock className="text-4xl text-cyan-300" />
          <h2 className="mt-4 text-2xl font-black">Verifikasi perangkat baru</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Masukkan recovery key untuk membuka identity backup dan menyinkronkan chat lama ke vault terenkripsi perangkat ini.
          </p>
          <textarea
            value={recoveryKey}
            onChange={(event) => setRecoveryKey(event.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="64-character recovery key"
            className="mt-5 w-full resize-none rounded-xl border border-white/15 bg-black/30 p-3 font-mono text-sm outline-none focus:border-cyan-300"
          />
          <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10">
            <FaFile className="mr-2" />Baca recovery file
            <input type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void importRecoveryFile(selected);
            }} />
          </label>
          {enrollment.snapshot.roster.devices.length >= 8 ? (
            <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm">
              <p className="font-bold text-amber-200">Batas 8 perangkat tercapai. Pilih perangkat lama yang akan diganti:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {enrollment.snapshot.roster.devices.map((device, index) => (
                  <label key={device.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={removeDeviceIds.includes(device.id)}
                      onChange={(event) => setRemoveDeviceIds((current) => event.target.checked
                        ? [...current, device.id]
                        : current.filter((id) => id !== device.id))}
                    />Perangkat {index + 1} · {new Date(device.createdAt).toLocaleDateString()}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {error ? <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
          <button
            type="button"
            disabled={busy || recoveryKey.replace(/\s/g, "").length !== 64 || (enrollment.snapshot.roster.devices.length >= 8 && !removeDeviceIds.length)}
            onClick={() => void recover()}
            className="mt-5 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-black disabled:opacity-40"
          >{busy ? "Memverifikasi…" : "Verifikasi dan pulihkan chat"}</button>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#07131f]">
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#091b2a] px-4 py-3">
        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-cyan-400/15 font-black text-cyan-200">
          {room.other?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={room.other.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : accountLabel(room.other).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-black">{accountLabel(room.other)}</h2>
          <p className="flex items-center gap-1 text-xs text-emerald-300"><FaLock />End-to-end encrypted</p>
        </div>
        {messenger ? (
          <SecureDirectCall
            messenger={messenger}
            roomId={room.id}
            userId={userId}
            peerName={accountLabel(room.other)}
            onError={handleCallError}
          />
        ) : null}
        <button type="button" onClick={() => void downloadEncryptedBackup()} className="rounded-xl p-3 text-slate-300 hover:bg-white/10" title="Download encrypted account backup"><FaDownload /></button>
        <button type="button" onClick={() => setShowSecurityCode((current) => !current)} className="rounded-xl p-3 text-slate-300 hover:bg-white/10" title="Security code"><FaShieldAlt /></button>
      </header>

      {showSecurityCode && securityCode ? (
        <div className="border-b border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100">
          <strong>Security code:</strong> <span className="font-mono">{securityCode}</span>
        </div>
      ) : null}
      {error || messenger?.error ? (
        <div className="border-b border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error || messenger?.error}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
        <div className="mx-auto mb-5 max-w-md rounded-xl bg-amber-300/10 px-4 py-3 text-center text-xs leading-5 text-amber-100">
          <FaLock className="mr-1 inline" /> Pesan dan panggilan baru hanya dapat dibaca oleh perangkat yang Anda verifikasi. Pesan bertanda “sebelum E2EE” berasal dari riwayat lama.
        </div>
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {messages.map((message) => {
            const mine = message.sender_id === userId;
            const preview = media[message.id];
            return (
              <article key={message.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[86%] rounded-2xl px-3 py-2 shadow ${mine ? "rounded-br-sm bg-emerald-900/80" : "rounded-bl-sm bg-[#122536]"}`}>
                  {message.reply_to ? <div className="mb-2 rounded-lg border-l-2 border-cyan-300 bg-black/20 px-2 py-1 text-xs text-slate-300">{message.reply_to.message || "Attachment"}</div> : null}
                  {message.deleted_at ? <p className="italic text-slate-400">Message deleted</p> : <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.message}</p>}
                  {message.secureAttachment && !message.deleted_at ? (
                    <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2">
                      {preview?.mime.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview.url} alt={preview.name} className="max-h-72 rounded-lg object-contain" />
                      ) : null}
                      {preview?.mime.startsWith("video/") ? <video controls src={preview.url} className="max-h-72 rounded-lg" /> : null}
                      {preview?.mime.startsWith("audio/") ? <audio controls src={preview.url} className="max-w-full" /> : null}
                      <button type="button" onClick={() => void openMedia(message)} className="mt-1 flex items-center gap-2 text-xs font-bold text-cyan-200">
                        {preview ? <FaCheck /> : <FaDownload />}{message.secureAttachment.name} · {Math.ceil(message.secureAttachment.size / 1024)} KB
                      </button>
                    </div>
                  ) : null}
                  {message.attachment && !message.deleted_at ? <div className="mt-2 rounded-lg bg-black/20 p-2 text-xs text-slate-300"><FaPaperclip className="mr-1 inline" />{message.attachment.file_name} · attachment sebelum E2EE</div> : null}
                  <footer className="mt-1 flex items-center justify-end gap-2 text-[10px] text-slate-400">
                    {message.legacy ? <span className="rounded bg-amber-300/10 px-1 text-amber-200">sebelum E2EE</span> : null}
                    {message.edited_at ? <span>edited</span> : null}
                    <span>{formatTime(message.created_at)}</span>
                    {mine && !message.legacy ? message.delivery === "read" ? <FaCheckDouble className="text-cyan-300" /> : message.delivery === "queued" ? <span>queued</span> : <FaCheck /> : null}
                  </footer>
                  {!message.deleted_at ? (
                    <div className="mt-1 hidden items-center justify-end gap-3 text-[10px] text-slate-400 group-hover:flex">
                      <button type="button" onClick={() => { setReply(message); setEditing(null); }}><FaReply /></button>
                      <button type="button" onClick={() => void messenger?.star(message)}><FaStar className={message.starred ? "text-yellow-300" : ""} /></button>
                      {mine && !message.legacy ? <button type="button" onClick={() => { setEditing(message); setReply(null); setFile(null); setDraft(message.message || ""); }}><FaEdit /></button> : null}
                      {mine && !message.legacy ? <button type="button" onClick={() => void changeMessage(message)}><FaTrash /></button> : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!messages.length ? <div className="py-16 text-center text-sm text-slate-400"><FaLock className="mx-auto mb-3 text-3xl text-emerald-300" />Mulai percakapan terenkripsi.</div> : null}
          <div ref={bottom} />
        </div>
      </div>

      <div className="border-t border-white/10 bg-[#091b2a] p-3 sm:p-4">
        {reply || editing || file ? (
          <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between rounded-xl bg-white/[0.06] px-3 py-2 text-xs text-slate-300">
            <span className="truncate">{editing ? "Editing message" : reply ? `Reply: ${reply.message || "Attachment"}` : file?.name}</span>
            <button type="button" onClick={() => { setReply(null); setEditing(null); setFile(null); setDraft(""); }}>×</button>
          </div>
        ) : null}
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
          <input ref={fileInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,video/mp4,audio/mp4,audio/m4a,audio/mpeg,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <button type="button" disabled={busy || !!editing} onClick={() => fileInput.current?.click()} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 disabled:opacity-40" title="Encrypted attachment"><FaPaperclip /></button>
          <textarea
            rows={1}
            value={draft}
            maxLength={6000}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Encrypted message"
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-600"
          />
          <button type="button" disabled={busy || (!draft.trim() && !file)} onClick={() => void send()} className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400 text-black disabled:opacity-40" title="Send encrypted message"><FaPaperPlane /></button>
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-500">Encrypted on this device before upload · attachments up to 4 MB</p>
      </div>
    </div>
  );
}

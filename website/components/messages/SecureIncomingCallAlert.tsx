"use client";

import { useEffect, useRef, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { selectIncomingCall, type IncomingCall } from "@/lib/incomingCalls";

export default function SecureIncomingCallAlert({ userId, onOpenRoom }: {
  userId: string; onOpenRoom: (roomId: string) => Promise<void>;
}) {
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState("");
  const notified = useRef("");
  const openRef = useRef(onOpenRoom);
  useEffect(() => { openRef.current = onOpenRoom; }, [onOpenRoom]);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let notification: Notification | undefined;
    const controller = new AbortController();
    async function poll() {
      try {
        const result = await authenticatedFetchJson<{ calls: IncomingCall[] }>("/api/messages/calls?active=1", { signal: controller.signal });
        if (!alive) return;
        const incoming = selectIncomingCall(result.calls, userId);
        setCall(incoming);
        if (!incoming) notification?.close();
        if (incoming && notified.current !== incoming.id) {
          notified.current = incoming.id;
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            notification?.close();
            notification = new Notification("ComePlayers incoming call", { body: "Open Messages to view and answer the call.", tag: "comeplayers-call" });
            notification.onclick = () => {
              window.focus();
              void openRef.current(incoming.room_id).catch(() => setError("The conversation could not open. Please retry."));
              notification?.close();
            };
          }
        }
      } catch { /* Keep the last result only until its ringing deadline. */ }
      finally { if (alive) timer = setTimeout(() => void poll(), 2000); }
    }
    void poll();
    return () => { alive = false; controller.abort(); clearTimeout(timer); notification?.close(); };
  }, [userId]);
  useEffect(() => {
    if (!call) return;
    const timer = setTimeout(() => setCall(null), Math.max(0, Date.parse(call.created_at) + 60_000 - Date.now()));
    return () => clearTimeout(timer);
  }, [call]);
  if (!call || dismissed === call.id) return null;
  async function open() {
    if (!call || opening) return;
    setOpening(true); setError("");
    try { await onOpenRoom(call.room_id); setDismissed(call.id); }
    catch { setError("The conversation could not open. Please retry."); }
    finally { setOpening(false); }
  }
  return <aside role="status" aria-live="polite" className="fixed inset-x-4 top-4 z-[120] mx-auto max-w-md rounded-2xl border border-yellow-400/40 bg-[#101923] p-5 text-white shadow-2xl">
    <p className="text-xs font-bold uppercase tracking-wide text-yellow-300">Incoming {call.media} call</p>
    <p className="mt-2 truncate text-lg font-bold">{call.other?.full_name || call.other?.username || "ComePlayers user"}</p>
    <p className="mt-1 text-sm text-slate-300">Open the conversation to answer.</p>
    {error ? <p role="alert" className="mt-2 text-sm text-red-300">{error}</p> : null}
    <div className="mt-4 flex gap-3">
      <button type="button" disabled={opening} onClick={() => void open()} className="rounded-xl bg-yellow-400 px-4 py-2 font-bold text-black disabled:opacity-50">{opening ? "Opening…" : "Open conversation"}</button>
      <button type="button" onClick={() => setDismissed(call.id)} className="rounded-xl border border-white/20 px-4 py-2">Dismiss alert</button>
    </div>
  </aside>;
}

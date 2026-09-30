"use client";

import { useEffect, useRef, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { selectIncomingCall, type IncomingCall } from "@/lib/incomingCalls";
import { subscribeAccountCalls, refreshAccountCalls } from "@/lib/accountCalls";
import { ALERT_PREFERENCES_CHANGED, CALL_ALERT_HANDLED, claimAlert, showSystemAlert, silenceCallAlert, startCallRingtone, unlockAlertAudio } from "@/lib/clientAlerts";

export default function SecureIncomingCallAlert({ userId, enabled = true, onOpenRoom }: {
  userId: string; enabled?: boolean; onOpenRoom: (roomId: string) => Promise<void>;
}) {
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState("");
  const openRef = useRef(onOpenRoom);
  const stopPresentationRef = useRef(() => {});
  useEffect(() => { openRef.current = onOpenRoom; }, [onOpenRoom]);
  useEffect(() => {
    if (!userId || !enabled) return;
    return subscribeAccountCalls(userId, calls => {
      setCall(selectIncomingCall(calls, userId));
    });
  }, [userId, enabled]);
  useEffect(() => {
    if (!call) return;
    const timer = setTimeout(() => setCall(null), Math.max(0, Date.parse(call.created_at) + 60_000 - Date.now()));
    return () => clearTimeout(timer);
  }, [call]);
  const incomingId = enabled && call && dismissed !== call.id ? call.id : "";
  useEffect(() => {
    if (!incomingId || !call) return;
    let active = true;
    let ownsSound = false;
    let presentationStopped = false;
    let stopSound = () => {};
    let closeNotification = () => {};
    stopPresentationRef.current = () => { presentationStopped = true; stopSound(); closeNotification(); };
    const handled = (event: Event) => {
      if ((event as CustomEvent<{ callId?: string }>).detail?.callId !== incomingId) return;
      setDismissed(incomingId); stopPresentationRef.current();
    };
    const preferencesChanged = () => { if (ownsSound && !presentationStopped) { stopSound(); stopSound = startCallRingtone(); } };
    void claimAlert(userId, `call:${incomingId}`).then(async claimed => {
      if (!claimed || !active || presentationStopped) return;
      ownsSound = true;
      stopSound = startCallRingtone();
      if (document.hidden) {
        const close = await showSystemAlert({ title: "ComePlayers", body: call.media === "video" ? "Panggilan video masuk" : "Panggilan suara masuk", tag: `cp-call-${incomingId}`, href: `/cpcommunity?room=${encodeURIComponent(call.room_id)}`, onClick: () => { stopPresentationRef.current(); void openRef.current(call.room_id).catch(() => setError("Percakapan belum bisa dibuka. Coba lagi.")); } });
        if (active && !presentationStopped) closeNotification = close; else close();
      }
    });
    window.addEventListener(CALL_ALERT_HANDLED, handled);
    window.addEventListener(ALERT_PREFERENCES_CHANGED, preferencesChanged);
    return () => { active = false; stopSound(); closeNotification(); stopPresentationRef.current = () => {}; window.removeEventListener(CALL_ALERT_HANDLED, handled); window.removeEventListener(ALERT_PREFERENCES_CHANGED, preferencesChanged); };
    // Only the identity controls the lifetime; polling replaces the same record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingId, userId]);
  if (!call || !enabled || dismissed === call.id) return null;
  async function open(answer = false) {
    if (!call || opening) return;
    setOpening(true); setError(""); unlockAlertAudio();
    try {
      if (answer) {
        await authenticatedFetchJson("/api/messages/calls", { method: "PATCH", body: JSON.stringify({ id: call.id, action: "accept" }) });
        // An accepted call must stop ringing immediately, even if opening the
        // conversation waits for a slow request.
        stopPresentationRef.current();
      }
      await onOpenRoom(call.room_id);
      silenceCallAlert(call.id);
      setDismissed(call.id);
    }
    catch { setError("Panggilan belum bisa dibuka. Coba lagi."); }
    finally { refreshAccountCalls(userId); setOpening(false); }
  }
  async function decline() {
    if (!call || opening) return;
    setOpening(true); setError("");
    try { await authenticatedFetchJson("/api/messages/calls", { method: "PATCH", body: JSON.stringify({ id: call.id, action: "decline" }) }); silenceCallAlert(call.id); setDismissed(call.id); }
    catch { setError("Panggilan belum bisa ditolak. Coba lagi."); }
    finally { refreshAccountCalls(userId); setOpening(false); }
  }
  return <aside role="status" aria-live="polite" className="fixed inset-x-4 top-4 z-[120] mx-auto max-w-md rounded-2xl border border-yellow-400/40 bg-[#101923] p-5 text-white shadow-2xl">
    <p className="text-xs font-bold uppercase tracking-wide text-yellow-300">Panggilan {call.media === "video" ? "video" : "suara"} masuk</p>
    <p className="mt-2 truncate text-lg font-bold">{call.other?.full_name || call.other?.username || "Pengguna ComePlayers"}</p>
    <p className="mt-1 text-sm text-slate-300">{call.media === "video" ? "Jawab dengan kamera dan mikrofon." : "Jawab untuk mulai berbicara."}</p>
    {error ? <p role="alert" className="mt-2 text-sm text-red-300">{error}</p> : null}
    <div className="mt-4 flex gap-3">
      <button type="button" disabled={opening} onClick={() => void open(true)} className="min-h-12 rounded-xl bg-yellow-400 px-4 py-2 font-bold text-black disabled:opacity-50">{opening ? "Menghubungkan…" : "Jawab"}</button>
      <button type="button" disabled={opening} onClick={() => void decline()} className="min-h-12 rounded-xl border border-red-300/40 px-4 py-2 text-red-200">Tolak</button>
      <button type="button" onClick={() => { silenceCallAlert(call.id); setDismissed(call.id); }} className="min-h-12 rounded-xl border border-white/20 px-4 py-2">Senyapkan</button>
    </div>
  </aside>;
}

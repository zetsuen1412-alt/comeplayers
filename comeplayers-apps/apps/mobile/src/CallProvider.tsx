import { lazy, Suspense, createContext, useCallback, useContext, useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { AppState, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Avatar, PrimaryButton } from "./components";
import { loadCalls, createCall, changeCall, type AccountPreferences, type CallRecord } from "./messagingApi";
const DirectCallScreen = lazy(() => import("./screens/DirectCallScreen").then(module => ({ default: module.DirectCallScreen })));
import { request } from "./api";
import { colors } from "./theme";
import type { VoiceToken } from "./types";
import { useIncomingRingtone } from "./notificationSounds";
import { useNotifications } from "./NotificationProvider";
import { supabase } from "./runtime";
import { createMobileCallMonitor } from "./mobileCallMonitor";

const Context = createContext<{ startCall: (roomId: string, media: "audio" | "video") => Promise<void>; callActive: boolean }>({ startCall: async () => undefined, callActive: false });
export const useCalls = () => useContext(Context);
export function CallProvider({ session, account, children }: { session: Session | null; account: AccountPreferences | null; children: ReactNode }) {
  const [active, setActive] = useState<CallRecord | null>(null);
  const [connection, setConnection] = useState<VoiceToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const activeRef = useRef(active); activeRef.current = active;
  const refreshCalls = useRef<() => void>(() => undefined);
  const { incomingCallSignal, setCallActive: reportCallActive } = useNotifications();
  const incoming = active?.callee_id === session?.user.id;
  useIncomingRingtone(!!active && incoming && active.status === "ringing" && !busy && account?.settings.call_notifications !== false);
  const startCall = useCallback(async (roomId: string, media: "audio" | "video") => {
    if (activeRef.current && ["ringing", "accepted"].includes(activeRef.current.status)) throw new Error("Selesaikan panggilan yang sedang berlangsung terlebih dahulu.");
    const result = await createCall(roomId, media);
    setError(""); setConnection(null); setActive(result.call);
  }, []);
  useEffect(() => {
    if (!session || (account?.phoneRequired && !account.phoneVerified)) { setActive(null); setConnection(null); return; }
    const monitor = createMobileCallMonitor<{ calls: CallRecord[]; callEventsReady?: boolean }>({
      read: (signal) => loadCalls(true, activeRef.current?.id, signal),
      isForeground: () => AppState.currentState === "active",
      hasActiveCall: () => !!activeRef.current,
      onValue: ({ calls, callEventsReady }) => {
        monitor.setEventCapability(callEventsReady === true);
        const current = activeRef.current;
        if (current) {
          const updated = calls.find(c => c.id === current.id);
          if (!updated || updated.secure_event_id || updated.encryption_envelope || !["ringing", "accepted"].includes(updated.status)) {
            setActive(null); setConnection(null);
          } else {
            setActive(previous => JSON.stringify(previous) === JSON.stringify(updated) ? previous : updated);
            if (updated.status !== "accepted") setConnection(null);
          }
        } else if (account?.settings.call_notifications !== false) {
          const incoming = calls.find(c => c.callee_id === session.user.id && c.status === "ringing");
          if (incoming) setActive(incoming);
        }
      },
      onError: e => { if (activeRef.current) setError(e instanceof Error ? e.message : "Sambungan panggilan terputus."); },
    });
    refreshCalls.current = monitor.refresh;
    // Atomic participant revisions contain no call contents. The API still
    // authorizes the call; old servers keep the two-second fallback.
    const channel = supabase.channel("mobile-call-activity:" + session.user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "cp_live_revisions", filter: "scope=eq.calls:" + session.user.id }, () => monitor.refresh())
      .subscribe(status => monitor.setRealtimeConnected(status === "SUBSCRIBED"));
    monitor.refresh();
    const listener = AppState.addEventListener("change", () => monitor.foregroundChanged());
    return () => { refreshCalls.current = () => undefined; monitor.dispose(); listener.remove(); void supabase.removeChannel(channel); };
  }, [session?.user.id, account?.phoneRequired, account?.phoneVerified, account?.settings.call_notifications]);
  // Push and local transitions bypass the idle fallback. An older in-flight
  // read cannot undo a just-accepted call.
  useEffect(() => { refreshCalls.current(); }, [incomingCallSignal, active?.id, active?.status]);
  useEffect(() => {
    if (!active || active.status !== "accepted" || connection || busy) return;
    let alive = true;
    void (async () => {
      if (active.secure_event_id || active.encryption_envelope) throw new Error("This older encrypted call cannot resume. Start a new call.");
      const token = await request<VoiceToken>("/api/messages/calls", { method: "PATCH", body: JSON.stringify({ id: active.id, action: "token" }) }, true);
      if (alive) setConnection(token);
    })().catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [active?.id, active?.status, active?.secure_event_id, connection, retry, busy]);
  const finish = async () => {
    if (busy) return;
    const call = activeRef.current; setConnection(null); setBusy(true); setError("");
    try { if (call && ["ringing", "accepted", "scheduled"].includes(call.status)) await changeCall(call.id, call.status === "ringing" && call.callee_id === session?.user.id ? "decline" : "end"); setActive(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Panggilan belum dapat diakhiri. Coba lagi."); }
    finally { setBusy(false); }
  };
  const accept = async () => {
    if (!active || busy) return; setBusy(true); setError("");
    try { if (active.secure_event_id || active.encryption_envelope) throw new Error("Ask your contact to start a new call."); await changeCall(active.id, "accept"); setActive({ ...active, status: "accepted", answered_at: new Date().toISOString() }); }
    catch (e) { setError(e instanceof Error ? e.message : "Panggilan belum dapat dijawab. Coba lagi."); }
    finally { setBusy(false); }
  };
  const callActive = !!active;
  useEffect(() => { reportCallActive(callActive); return () => reportCallActive(false); }, [callActive, reportCallActive]);
  const context = useMemo(() => ({ startCall, callActive }), [startCall, callActive]);
  return <Context.Provider value={context}>{children}
    {active && connection ? <Suspense fallback={<Modal visible><View style={s.page}><Text style={s.subtitle}>Menyambungkan panggilan…</Text></View></Modal>}><DirectCallScreen connection={connection} call={active} peerId={active.caller_id === session?.user.id ? active.callee_id : active.caller_id} onLeave={() => void finish()} onRetry={() => { setError(""); setConnection(null); setRetry(value => value + 1); }} /></Suspense> : <Modal visible={!!active} animationType="slide" onRequestClose={() => void finish()}><View style={s.page}><Text style={s.eyebrow}>COMEPLAYERS · {active?.media === "video" ? "PANGGILAN VIDEO" : "PANGGILAN SUARA"}</Text><Avatar name={active?.other?.username || "Kontak"} uri={active?.other?.avatar_url} size={100} /><Text style={s.title}>{active?.other?.username || active?.other?.full_name || "Kontak ComePlayers"}</Text><Text style={s.subtitle}>{active?.status === "ringing" ? incoming ? "Panggilan masuk" : "Memanggil…" : active?.status === "accepted" ? "Menyambungkan…" : active?.status === "missed" ? "Tidak dijawab" : active?.status === "declined" ? "Panggilan ditolak" : "Panggilan selesai"}</Text>{error ? <Text style={s.error}>{error}</Text> : null}<View style={s.actions}>{error && active?.status === "accepted" ? <PrimaryButton label="Coba sambungkan lagi" onPress={() => { setError(""); setRetry(v => v + 1); }} /> : null}{incoming && active?.status === "ringing" ? <PrimaryButton label={active.media === "video" ? "Jawab dengan video" : "Jawab"} onPress={() => void accept()} loading={busy} /> : null}<Pressable style={s.end} onPress={() => void finish()}><Text style={s.endText}>{active?.status === "ringing" ? incoming ? "Tolak" : "Batalkan" : active?.status === "accepted" ? "Akhiri panggilan" : "Tutup"}</Text></Pressable></View><Text style={s.note}>Panggilan pribadi melalui ComePlayers.</Text></View></Modal>}
  </Context.Provider>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 28, gap: 24 }, eyebrow: { color: colors.yellow, fontSize: 12, letterSpacing: 2 }, title: { color: colors.text, fontSize: 27, fontWeight: "700" }, subtitle: { color: colors.textMuted, fontSize: 18 }, error: { color: colors.red, textAlign: "center" }, actions: { width: "100%", gap: 18, marginTop: 32 }, end: { padding: 17, borderRadius: 24, backgroundColor: "#9f243b", alignItems: "center" }, endText: { color: "#fff", fontSize: 17, fontWeight: "700" }, note: { color: colors.textDim, textAlign: "center", fontSize: 12, lineHeight: 18 } });

import { lazy, Suspense, createContext, useCallback, useContext, useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { AppState, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Avatar, PrimaryButton } from "./components";
import { loadCalls, createCall, changeCall, type AccountPreferences, type CallRecord } from "./messagingApi";
const DirectCallScreen = lazy(() => import("./screens/DirectCallScreen").then(module => ({ default: module.DirectCallScreen })));
import { request } from "./api";
import { colors } from "./theme";
import type { VoiceToken } from "./types";

const Context = createContext<{ startCall: (roomId: string, media: "audio" | "video") => Promise<void> }>({ startCall: async () => undefined });
export const useCalls = () => useContext(Context);
export function CallProvider({ session, account, children }: { session: Session | null; account: AccountPreferences | null; children: ReactNode }) {
  const [active, setActive] = useState<CallRecord | null>(null);
  const [connection, setConnection] = useState<VoiceToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const activeRef = useRef(active); activeRef.current = active;
  const startCall = useCallback(async (roomId: string, media: "audio" | "video") => {
    if (activeRef.current && ["ringing", "accepted"].includes(activeRef.current.status)) throw new Error("Finish your current call first.");
    const result = await createCall(roomId, media);
    setError(""); setConnection(null); setActive(result.call);
  }, []);
  useEffect(() => {
    if (!session || (account?.phoneRequired && !account.phoneVerified)) { setActive(null); setConnection(null); return; }
    let alive = true; let loading = false;
    const poll = async () => {
      if (loading || AppState.currentState !== "active") return;
      loading = true;
      try {
        const { calls } = await loadCalls(true, activeRef.current?.id);
        if (!alive) return;
        const current = activeRef.current;
        if (current) {
          const updated = calls.find(c => c.id === current.id);
          if (updated) { setActive(previous => JSON.stringify(previous) === JSON.stringify(updated) ? previous : updated); if (updated.status !== "accepted") setConnection(null); }
        } else if (account?.settings.call_notifications !== false) {
          const incoming = calls.find(c => c.callee_id === session.user.id && c.status === "ringing");
          if (incoming) setActive(incoming);
        }
      } catch (e) { if (alive && activeRef.current) setError(e instanceof Error ? e.message : "Call connection lost."); }
      finally { loading = false; }
    };
    void poll(); const timer = setInterval(() => void poll(), 5000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") void poll(); });
    return () => { alive = false; clearInterval(timer); listener.remove(); };
  }, [session?.user.id, account?.phoneRequired, account?.phoneVerified, account?.settings.call_notifications]);
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
    try { if (call && ["ringing", "accepted", "scheduled"].includes(call.status)) await changeCall(call.id, "end"); setActive(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not end the call. Try again."); }
    finally { setBusy(false); }
  };
  const accept = async () => {
    if (!active || busy) return; setBusy(true); setError("");
    try { if (active.secure_event_id || active.encryption_envelope) throw new Error("Ask your contact to start a new call."); await changeCall(active.id, "accept"); setActive({ ...active, status: "accepted", answered_at: new Date().toISOString() }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not answer call."); }
    finally { setBusy(false); }
  };
  const incoming = active?.callee_id === session?.user.id;
  const context = useMemo(() => ({ startCall }), [startCall]);
  return <Context.Provider value={context}>{children}
    {active && connection ? <Suspense fallback={<Modal visible><View style={s.page}><Text style={s.subtitle}>Connecting call…</Text></View></Modal>}><DirectCallScreen connection={connection} call={active} peerId={active.caller_id === session?.user.id ? active.callee_id : active.caller_id} onLeave={() => void finish()} /></Suspense> : <Modal visible={!!active} animationType="slide" onRequestClose={() => void finish()}><View style={s.page}><Text style={s.eyebrow}>COMEPLAYERS · {active?.media === "video" ? "VIDEO CALL" : "VOICE CALL"}</Text><Avatar name={active?.other?.username || "Contact"} uri={active?.other?.avatar_url} size={100} /><Text style={s.title}>{active?.other?.username || active?.other?.full_name || "ComePlayers contact"}</Text><Text style={s.subtitle}>{active?.status === "ringing" ? incoming ? "Incoming call" : "Calling…" : active?.status === "accepted" ? "Connecting…" : active?.status === "missed" ? "No answer" : active?.status === "declined" ? "Call declined" : "Call ended"}</Text>{error ? <Text style={s.error}>{error}</Text> : null}<View style={s.actions}>{error && active?.status === "accepted" ? <PrimaryButton label="Retry connection" onPress={() => { setError(""); setRetry(v => v + 1); }} /> : null}{incoming && active?.status === "ringing" ? <PrimaryButton label={active.media === "video" ? "Answer with video" : "Answer"} onPress={() => void accept()} loading={busy} /> : null}<Pressable style={s.end} onPress={() => void finish()}><Text style={s.endText}>{active?.status === "ringing" ? incoming ? "Decline" : "Cancel call" : active?.status === "accepted" ? "End call" : "Close"}</Text></Pressable></View><Text style={s.note}>Calls connect through ComePlayers. Incoming alerts are available while the app is open.</Text></View></Modal>}
  </Context.Provider>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 28, gap: 24 }, eyebrow: { color: colors.yellow, fontSize: 12, letterSpacing: 2 }, title: { color: colors.text, fontSize: 27, fontWeight: "700" }, subtitle: { color: colors.textMuted, fontSize: 18 }, error: { color: colors.red, textAlign: "center" }, actions: { width: "100%", gap: 18, marginTop: 32 }, end: { padding: 17, borderRadius: 24, backgroundColor: "#9f243b", alignItems: "center" }, endText: { color: "#fff", fontSize: 17, fontWeight: "700" }, note: { color: colors.textDim, textAlign: "center", fontSize: 12, lineHeight: 18 } });

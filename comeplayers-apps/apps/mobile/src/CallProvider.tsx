import { createContext, useCallback, useContext, useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { AppState, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Avatar, PrimaryButton } from "./components";
import { loadCalls, type AccountPreferences, type CallRecord } from "./messagingApi";
import { DirectCallScreen } from "./screens/DirectCallScreen";
import { usePrivateMessenger } from "./secure/PrivateProvider";
import { colors } from "./theme";
import type { VoiceToken } from "./types";

const Context = createContext<{ startCall: (roomId: string, media: "audio" | "video") => Promise<void> }>({ startCall: async () => undefined });
export const useCalls = () => useContext(Context);
export function CallProvider({ session, account, children }: { session: Session | null; account: AccountPreferences | null; children: ReactNode }) {
  const { messenger } = usePrivateMessenger();
  const [sharedKey, setSharedKey] = useState("");
  const [active, setActive] = useState<CallRecord | null>(null);
  const [connection, setConnection] = useState<VoiceToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const activeRef = useRef(active); activeRef.current = active;
  const startCall = useCallback(async (roomId: string, media: "audio" | "video") => {
    if (activeRef.current && ["ringing", "accepted"].includes(activeRef.current.status)) throw new Error("Finish your current call first.");
    if (!messenger) throw new Error("Private messaging is loading.");
    const offer = await messenger.prepareCall(roomId, media);
    const result = await messenger.api<{ call: CallRecord }>("/api/messages/calls", "POST", { roomId, media, secureEventId: offer.eventId }); setError(""); setConnection(null); setSharedKey(offer.key); setActive(result.call);
  }, [messenger]);
  useEffect(() => {
    if (!session || (account?.phoneRequired && !account.phoneVerified)) { setActive(null); setConnection(null); return; }
    let alive = true; let loading = false;
    const poll = async () => {
      if (loading || AppState.currentState !== "active") return;
      loading = true;
      try {
        const { calls } = await loadCalls(true, activeRef.current?.id);
        if (!alive) return;
        if (messenger) for (const call of calls) await messenger.vault.put("call-history", call.id, { ...call, encryption_envelope: undefined }, call.room_id, call.created_at);
        const current = activeRef.current;
        if (current) {
          const updated = calls.find(c => c.id === current.id);
          if (updated) { setActive(updated); if (updated.status !== "accepted") setConnection(null); }
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
  }, [session?.user.id, account?.phoneRequired, account?.phoneVerified, account?.settings.call_notifications, messenger]);
  useEffect(() => {
    if (!active || active.status !== "accepted" || connection || busy) return;
    let alive = true;
    void (async () => {
      if (!messenger || !active.secure_event_id) throw new Error("This call requires verified end-to-end encrypted Messages on both devices.");
      const key = sharedKey || await messenger.callKey(active.secure_event_id, active.room_id, active.media);
      const token = await messenger.api<VoiceToken>("/api/messages/calls", "PATCH", { id: active.id, action: "token" });
      if (alive) { setSharedKey(key); setConnection(token); }
    })().catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [active?.id, active?.status, active?.secure_event_id, connection, retry, busy, messenger, sharedKey]);
  const finish = async () => {
    if (busy) return;
    const call = activeRef.current; setConnection(null); setBusy(true); setError("");
    try { if (call && ["ringing", "accepted", "scheduled"].includes(call.status)) await messenger?.api("/api/messages/calls", "PATCH", { id: call.id, action: "end" }); setActive(null); setSharedKey(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not end the call. Try again."); }
    finally { setBusy(false); }
  };
  const accept = async () => {
    if (!active || busy) return; setBusy(true); setError("");
    try { if (!messenger || !active.secure_event_id) throw new Error("Both devices must verify encrypted Messages before calling."); await messenger.callKey(active.secure_event_id, active.room_id, active.media); await messenger.api("/api/messages/calls", "PATCH", { id: active.id, action: "accept" }); setActive({ ...active, status: "accepted", answered_at: new Date().toISOString() }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not answer call."); }
    finally { setBusy(false); }
  };
  const incoming = active?.callee_id === session?.user.id;
  const context = useMemo(() => ({ startCall }), [startCall]);
  return <Context.Provider value={context}>{children}
    {active && connection && sharedKey ? <DirectCallScreen connection={connection} call={active} peerId={active.caller_id === session?.user.id ? active.callee_id : active.caller_id} sharedKey={sharedKey} onLeave={() => void finish()} /> : <Modal visible={!!active} animationType="slide" onRequestClose={() => void finish()}><View style={s.page}><Text style={s.eyebrow}>COMEPLAYERS · {active?.media === "video" ? "VIDEO CALL" : "VOICE CALL"}</Text><Avatar name={active?.other?.username || "Contact"} uri={active?.other?.avatar_url} size={100} /><Text style={s.title}>{active?.other?.username || active?.other?.full_name || "ComePlayers contact"}</Text><Text style={s.subtitle}>{active?.status === "ringing" ? incoming ? "Incoming call" : "Calling…" : active?.status === "accepted" ? "Connecting…" : active?.status === "missed" ? "No answer" : active?.status === "declined" ? "Call declined" : "Call ended"}</Text>{error ? <Text style={s.error}>{error}</Text> : null}<View style={s.actions}>{error && active?.status === "accepted" ? <PrimaryButton label="Retry connection" onPress={() => { setError(""); setRetry(v => v + 1); }} /> : null}{incoming && active?.status === "ringing" ? <PrimaryButton label={active.media === "video" ? "Answer with video" : "Answer"} onPress={() => void accept()} loading={busy} /> : null}<Pressable style={s.end} onPress={() => void finish()}><Text style={s.endText}>{active?.status === "ringing" ? incoming ? "Decline" : "Cancel call" : active?.status === "accepted" ? "End call" : "Close"}</Text></Pressable></View><Text style={s.note}>Calls connect through ComePlayers. Incoming alerts are available while the app is open.</Text></View></Modal>}
  </Context.Provider>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 28, gap: 24 }, eyebrow: { color: colors.yellow, fontSize: 12, letterSpacing: 2 }, title: { color: colors.text, fontSize: 27, fontWeight: "700" }, subtitle: { color: colors.textMuted, fontSize: 18 }, error: { color: colors.red, textAlign: "center" }, actions: { width: "100%", gap: 18, marginTop: 32 }, end: { padding: 17, borderRadius: 24, backgroundColor: "#9f243b", alignItems: "center" }, endText: { color: "#fff", fontSize: 17, fontWeight: "700" }, note: { color: colors.textDim, textAlign: "center", fontSize: 12, lineHeight: 18 } });

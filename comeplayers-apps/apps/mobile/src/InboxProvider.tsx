import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { ChatRoom } from "@comeplayers/chat-core";
import { chatClient, supabase } from "./runtime";
import { loadChatPreferences, type ChatPreference } from "./messagingApi";
import { compareRoomActivity } from "./inboxOrdering";
import { usePrivateMessenger } from "./secure/PrivateProvider";

type Inbox = { rooms: ChatRoom[]; preferences: ChatPreference[]; loading: boolean; error: string; reload: (quiet?: boolean) => Promise<void> };
const Context = createContext<Inbox>({ rooms: [], preferences: [], loading: true, error: "", reload: async () => undefined });
export const useInbox = () => useContext(Context);

// One owner for the chat list: navigation and notifications share the same request and snapshot.
export function InboxProvider({ userId, enabled, children }: { userId: string; enabled: boolean; children: ReactNode }) {
  const { messenger } = usePrivateMessenger();
  const [state, setState] = useState<Omit<Inbox, "reload">>({ rooms: [], preferences: [], loading: true, error: "" });
  const preferenceCache = useRef<{ rows: ChatPreference[]; at: number } | null>(null);
  const scope = useRef("");
  const generation = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const serverRevision = useRef(0);
  const localRevision = useRef(0);
  const refreshLocal = useCallback(async () => {
    if (!enabled || !messenger || AppState.currentState !== "active") return;
    const version = generation.current, serverVersion = serverRevision.current, localVersion = ++localRevision.current;
    const saved = new Map((await messenger.rooms()).map(room => [room.id, room]));
    if (version !== generation.current || serverVersion !== serverRevision.current || localVersion !== localRevision.current) return;
    setState(previous => {
      // Never expose a stale/removed membership from the vault. The last
      // authenticated server snapshot remains the allow-list for inbox rows.
      const rooms = previous.rooms.map(room => saved.get(room.id) || room).sort(compareRoomActivity);
      return JSON.stringify(previous.rooms) === JSON.stringify(rooms) ? previous : { ...previous, rooms };
    });
  }, [enabled, messenger]);
  const reload = useCallback((quiet = false): Promise<void> => {
    if (!enabled || AppState.currentState !== "active") return Promise.resolve();
    if (pending.current) return pending.current;
    const version = generation.current;
    if (!quiet) setState(s => ({ ...s, loading: true }));
    const operation = Promise.all([chatClient.listDirectRooms(100), quiet && preferenceCache.current && Date.now() - preferenceCache.current.at < 60000 ? Promise.resolve({ preferences: preferenceCache.current.rows }) : loadChatPreferences()])
      .then(async ([serverRooms, prefs]) => {
        const rooms = messenger ? await messenger.saveRooms(serverRooms) : serverRooms.sort(compareRoomActivity);
        if (generation.current === version) {
          serverRevision.current++;
          if (preferenceCache.current?.rows !== prefs.preferences) preferenceCache.current = { rows: prefs.preferences, at: Date.now() };
          setState(previous => JSON.stringify(previous.rooms) === JSON.stringify(rooms) && JSON.stringify(previous.preferences) === JSON.stringify(prefs.preferences) && !previous.loading && !previous.error ? previous : { rooms, preferences: prefs.preferences, loading: false, error: "" });
        }
      })
      .catch(error => { if (generation.current === version) setState(s => ({ ...s, loading: false, error: error instanceof Error ? error.message : "Could not load chats." })); })
      .finally(() => { if (pending.current === operation) pending.current = null; });
    pending.current = operation;
    return operation;
  }, [userId, enabled, messenger]);

  useEffect(() => {
    generation.current++; pending.current = null;
    const currentScope = `${userId}:${enabled}`;
    if (scope.current !== currentScope) {
      scope.current = currentScope;
      preferenceCache.current = null;
      setState({ rooms: [], preferences: [], loading: enabled, error: "" });
    }
    void reload();
    let disposed = false, realtimeConnected = false, fallbackTicks = 0;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const changed = () => { if (!disposed && !scheduled && enabled && AppState.currentState === "active") scheduled = setTimeout(() => { scheduled = undefined; void reload(true); }, 400); };
    const channel = enabled ? supabase.channel(`inbox:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_rooms", filter: `buyer_id=eq.${userId}` }, changed)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_rooms", filter: "seller_id=eq." + userId }, changed)
      .subscribe(status => {
        if (disposed) return;
        const connected = status === "SUBSCRIBED";
        if (realtimeConnected === connected) return;
        realtimeConnected = connected; fallbackTicks = 0;
        void reload(true);
      }) : null;
    let localScheduled: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = messenger?.subscribe(() => {
      // A decrypted message/read receipt/media preview is already persisted.
      // Refresh that local snapshot without refetching all 100 rooms remotely.
      if (!localScheduled && enabled && AppState.currentState === "active") localScheduled = setTimeout(() => {
        localScheduled = undefined;
        void refreshLocal().catch(() => undefined);
      }, 50);
    });
    // Keep a one-minute safety refresh while room events are healthy.
    const timer = setInterval(() => { if (!realtimeConnected || ++fallbackTicks >= 3) { fallbackTicks = 0; void reload(true); } }, 20000);
    const subscription = AppState.addEventListener("change", next => { if (next === "active") { fallbackTicks = 0; void reload(true); } });
    return () => { disposed = true; generation.current++; clearInterval(timer); clearTimeout(scheduled); clearTimeout(localScheduled); subscription.remove(); unsubscribe?.(); if (channel) void supabase.removeChannel(channel); };
  }, [reload, refreshLocal, enabled, messenger, userId]);
  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

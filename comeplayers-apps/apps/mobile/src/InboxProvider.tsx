import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { ChatRoom } from "@comeplayers/chat-core";
import { chatClient, supabase } from "./runtime";
import { loadChatPreferences, type ChatPreference } from "./messagingApi";

type Inbox = { rooms: ChatRoom[]; preferences: ChatPreference[]; loading: boolean; error: string; reload: (quiet?: boolean) => Promise<void> };
const Context = createContext<Inbox>({ rooms: [], preferences: [], loading: true, error: "", reload: async () => undefined });
export const useInbox = () => useContext(Context);

// One owner for the chat list: navigation and notifications share the same request and snapshot.
export function InboxProvider({ userId, enabled, children }: { userId: string; enabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<Omit<Inbox, "reload">>({ rooms: [], preferences: [], loading: true, error: "" });
  const preferenceCache = useRef<{ rows: ChatPreference[]; at: number } | null>(null);
  const generation = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const reload = useCallback((quiet = false): Promise<void> => {
    if (!enabled || AppState.currentState !== "active") return Promise.resolve();
    if (pending.current) return pending.current;
    const version = generation.current;
    if (!quiet) setState(s => ({ ...s, loading: true }));
    const operation = Promise.all([chatClient.listDirectRooms(100), quiet && preferenceCache.current && Date.now() - preferenceCache.current.at < 60000 ? Promise.resolve({ preferences: preferenceCache.current.rows }) : loadChatPreferences()])
      .then(async ([rooms, prefs]) => {
        if (generation.current === version) {
          if (preferenceCache.current?.rows !== prefs.preferences) preferenceCache.current = { rows: prefs.preferences, at: Date.now() };
          setState(previous => JSON.stringify(previous.rooms) === JSON.stringify(rooms) && JSON.stringify(previous.preferences) === JSON.stringify(prefs.preferences) && !previous.loading && !previous.error ? previous : { rooms, preferences: prefs.preferences, loading: false, error: "" });
        }
      })
      .catch(error => { if (generation.current === version) setState(s => ({ ...s, loading: false, error: error instanceof Error ? error.message : "Could not load chats." })); })
      .finally(() => { if (pending.current === operation) pending.current = null; });
    pending.current = operation;
    return operation;
  }, [userId, enabled]);

  useEffect(() => {
    generation.current++; pending.current = null;
    setState({ rooms: [], preferences: [], loading: enabled, error: "" });
    void reload();
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const changed = () => { if (!scheduled && enabled && AppState.currentState === "active") scheduled = setTimeout(() => { scheduled = undefined; void reload(true); }, 400); };
    const channel = enabled ? supabase.channel(`inbox:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_rooms", filter: `buyer_id=eq.${userId}` }, changed)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_rooms", filter: `seller_id=eq.${userId}` }, changed).subscribe() : null;
    const timer = setInterval(() => void reload(true), 20000);
    const subscription = AppState.addEventListener("change", next => { if (next === "active") void reload(true); });
    return () => { generation.current++; clearInterval(timer); clearTimeout(scheduled); subscription.remove(); if (channel) void supabase.removeChannel(channel); };
  }, [reload, enabled]);
  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

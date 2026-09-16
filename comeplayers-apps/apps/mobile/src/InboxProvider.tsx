import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { ChatRoom } from "@comeplayers/chat-core";
import { chatClient } from "./runtime";
import { loadChatPreferences, type ChatPreference } from "./messagingApi";

type Inbox = { rooms: ChatRoom[]; preferences: ChatPreference[]; loading: boolean; error: string; reload: (quiet?: boolean) => Promise<void> };
const Context = createContext<Inbox>({ rooms: [], preferences: [], loading: true, error: "", reload: async () => undefined });
export const useInbox = () => useContext(Context);

// One owner for the chat list: navigation and notifications share the same request and snapshot.
export function InboxProvider({ userId, enabled, children }: { userId: string; enabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<Omit<Inbox, "reload">>({ rooms: [], preferences: [], loading: true, error: "" });
  const generation = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const reload = useCallback((quiet = false): Promise<void> => {
    if (!enabled || AppState.currentState !== "active") return Promise.resolve();
    if (pending.current) return pending.current;
    const version = generation.current;
    if (!quiet) setState(s => ({ ...s, loading: true }));
    const operation = Promise.all([chatClient.listDirectRooms(100), loadChatPreferences()])
      .then(async ([rooms, prefs]) => {
        if (generation.current === version) setState({ rooms, preferences: prefs.preferences, loading: false, error: "" });
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
    const timer = setInterval(() => void reload(true), 20000);
    const subscription = AppState.addEventListener("change", next => { if (next === "active") void reload(true); });
    return () => { generation.current++; clearInterval(timer); subscription.remove(); };
  }, [reload, enabled]);
  return <Context.Provider value={{ ...state, reload }}>{children}</Context.Provider>;
}

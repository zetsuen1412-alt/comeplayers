import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { ChatRoom } from "@comeplayers/chat-core";
import { chatClient } from "./runtime";
import { loadChatPreferences, type ChatPreference } from "./messagingApi";
import { usePrivateMessenger } from "./secure/PrivateProvider";

type Inbox = { rooms: ChatRoom[]; preferences: ChatPreference[]; loading: boolean; error: string; reload: (quiet?: boolean) => Promise<void> };
const Context = createContext<Inbox>({ rooms: [], preferences: [], loading: true, error: "", reload: async () => undefined });
export const useInbox = () => useContext(Context);

// One owner for the chat list: navigation and notifications share the same request and snapshot.
export function InboxProvider({ userId, enabled, children }: { userId: string; enabled: boolean; children: ReactNode }) {
  const { messenger } = usePrivateMessenger();
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
        const merged = messenger ? await messenger.saveRooms(rooms) : rooms;
        if (messenger) await messenger.vault.put("meta", "chat-preferences", prefs.preferences);
        if (generation.current === version) setState({ rooms: merged, preferences: prefs.preferences, loading: false, error: "" });
      })
      .catch(error => { if (generation.current === version) setState(s => ({ ...s, loading: false, error: error instanceof Error ? error.message : "Could not load chats." })); })
      .finally(() => { if (pending.current === operation) pending.current = null; });
    pending.current = operation;
    return operation;
  }, [userId, enabled, messenger]);
  useEffect(() => {
    if (!messenger) return;
    let alive = true;
    const local = async () => {
      const [rooms, preferences] = await Promise.all([messenger.rooms(), messenger.vault.get<ChatPreference[]>("meta", "chat-preferences")]);
      if (alive && rooms.length) setState(s => ({ ...s, rooms, preferences: preferences || s.preferences, loading: false }));
    };
    void local().catch(() => undefined);
    const unsubscribe = messenger.subscribe(() => void local().catch(() => undefined));
    return () => { alive = false; unsubscribe(); };
  }, [messenger]);
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

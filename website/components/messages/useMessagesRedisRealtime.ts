"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { sameTypingEntries, sameUserIds } from "@/lib/chatClientPerformance";

type TypingEntry = { name: string; at: number };
type PresenceResponse = { enabled: boolean; users: Array<{ userId: string; name: string; lastSeen: number }> };
type TypingResponse = { enabled: boolean; users: Array<{ userId: string; name: string; at: number }> };
const emptyOnline = new Set<string>();
const emptyTyping: Record<string, TypingEntry> = {};

export function useMessagesRedisRealtime({ userId, roomId, channelId }: {
  userId: string; roomId: string; channelId: string;
}) {
  const scope = `${userId}:${roomId}:${channelId}`;
  const [state, setState] = useState({ scope: "", onlineUserIds: emptyOnline, typingUsers: emptyTyping, redisEnabled: false });
  const lastTypingWriteRef = useRef({ scope: "", at: 0 });
  const availabilityRef = useRef<{ scope: string; enabled?: boolean }>({ scope: "" });

  const signalTyping = useCallback(async (active: boolean) => {
    if (!userId || !roomId || !navigator.onLine || (active && document.visibilityState !== "visible")) return;
    if (availabilityRef.current.scope === scope && availabilityRef.current.enabled === false) return;
    const now = Date.now();
    if (active && lastTypingWriteRef.current.scope === scope && now - lastTypingWriteRef.current.at < 900) return;
    lastTypingWriteRef.current = { scope, at: now };
    try {
      await authenticatedFetchJson("/api/messages/typing", {
        method: "POST", body: JSON.stringify({ roomId, channelId: channelId || undefined, active }),
      });
    } catch { /* Typing is best effort; never retry a stale typing write. */ }
  }, [channelId, roomId, scope, userId]);

  useEffect(() => {
    if (!userId || !roomId) return;
    const controller = new AbortController();
    const request = { signal: controller.signal };
    let active = true;
    const commit = (update: Partial<typeof state>) => {
      if (!active) return;
      if (update.redisEnabled !== undefined) availabilityRef.current = { scope, enabled: update.redisEnabled };
      setState(previous => {
        const next = { ...(previous.scope === scope ? previous : { scope, onlineUserIds: emptyOnline, typingUsers: emptyTyping, redisEnabled: false }), ...update };
        if (previous.scope === scope && sameUserIds(previous.onlineUserIds, next.onlineUserIds)) next.onlineUserIds = previous.onlineUserIds;
        if (previous.scope === scope && sameTypingEntries(previous.typingUsers, next.typingUsers)) next.typingUsers = previous.typingUsers;
        return previous.scope === scope && previous.onlineUserIds === next.onlineUserIds && previous.typingUsers === next.typingUsers && previous.redisEnabled === next.redisEnabled ? previous : next;
      });
    };
    const visible = () => document.visibilityState === "visible" && navigator.onLine;
    // Each task has at most one request in flight, even on a slow connection.
    const poll = (read: () => Promise<void>, interval: number) => {
      let timer: ReturnType<typeof setTimeout>;
      let running = false;
      const run = async () => {
        if (!active || running) return;
        clearTimeout(timer);
        running = true;
        try { if (visible()) await read(); }
        catch { /* Existing realtime transport remains available. */ }
        finally {
          running = false;
          // An optional Redis service can be disabled. Do not send 24 failed/empty
          // typing reads per minute until the user leaves the conversation.
          const disabled = availabilityRef.current.scope === scope && availabilityRef.current.enabled === false;
          if (active) timer = setTimeout(() => void run(), disabled ? 60_000 : interval);
        }
      };
      void run();
      return { run, stop: () => clearTimeout(timer) };
    };
    const tasks = [
      poll(async () => {
        const result = await authenticatedFetchJson<{ enabled: boolean }>("/api/messages/presence", {
          ...request, method: "POST", body: JSON.stringify({ roomId, channelId: channelId || undefined }),
        });
        commit({ redisEnabled: Boolean(result.enabled) });
      }, 25_000),
      poll(async () => {
        try {
          const result = await authenticatedFetchJson<PresenceResponse>(`/api/messages/presence?roomId=${encodeURIComponent(roomId)}`, request);
          commit({ onlineUserIds: new Set(result.users.map(entry => entry.userId)), redisEnabled: Boolean(result.enabled) });
        } catch { commit({ onlineUserIds: emptyOnline }); }
      }, 15_000),
      poll(async () => {
        const query = new URLSearchParams({ roomId });
        if (channelId) query.set("channelId", channelId);
        try {
          const result = await authenticatedFetchJson<TypingResponse>(`/api/messages/typing?${query}`, request);
          commit({ typingUsers: Object.fromEntries(result.users.filter(entry => Date.now() - entry.at < 5000).map(entry => [entry.userId, { name: entry.name, at: entry.at }])), redisEnabled: Boolean(result.enabled) });
        } catch { commit({ typingUsers: emptyTyping }); }
      }, 2_500),
    ];
    const wake = () => { if (visible()) tasks.forEach(task => void task.run()); };
    const offline = () => commit({ onlineUserIds: emptyOnline, typingUsers: emptyTyping });
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", wake);
    return () => {
      active = false;
      controller.abort();
      tasks.forEach(task => task.stop());
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", wake);
      void signalTyping(false);
    };
  }, [userId, roomId, channelId, scope, signalTyping]);

  return {
    onlineUserIds: state.scope === scope ? state.onlineUserIds : emptyOnline,
    typingUsers: state.scope === scope ? state.typingUsers : emptyTyping,
    redisEnabled: state.scope === scope && state.redisEnabled,
    signalTyping,
  };
}

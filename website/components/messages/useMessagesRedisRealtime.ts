"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { sameTypingEntries, sameUserIds } from "@/lib/chatClientPerformance";

type TypingEntry = { name: string; at: number };
type PresenceResponse = { enabled: boolean; users: Array<{ userId: string; name: string; lastSeen: number }> };
type TypingResponse = { enabled: boolean; users: Array<{ userId: string; name: string; at: number }> };
const emptyOnline = new Set<string>();
const emptyTyping: Record<string, TypingEntry> = {};

/** Suspend timers and abort stale reads when a browser tab is hidden/offline. */
function startVisibleTasks(tasks: Array<{ read: (signal: AbortSignal) => Promise<void>; delay: () => number }>, onHidden: () => void) {
  let active = true;
  const visible = () => document.visibilityState === "visible" && navigator.onLine;
  const runners = tasks.map(task => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    const stop = () => { clearTimeout(timer); controller?.abort(); controller = null; };
    const run = async () => {
      if (!active || !visible() || controller) return;
      clearTimeout(timer);
      const request = new AbortController();
      controller = request;
      try { await task.read(request.signal); }
      catch { /* Realtime is best effort; the next visible refresh can retry. */ }
      finally {
        if (controller === request) {
          controller = null;
          if (active && visible()) timer = setTimeout(() => void run(), task.delay());
        }
      }
    };
    return { run, stop };
  });
  const wake = () => {
    if (visible()) runners.forEach(runner => void runner.run());
    else { runners.forEach(runner => runner.stop()); onHidden(); }
  };
  wake();
  window.addEventListener("online", wake);
  window.addEventListener("offline", wake);
  document.addEventListener("visibilitychange", wake);
  return () => {
    active = false;
    runners.forEach(runner => runner.stop());
    window.removeEventListener("online", wake);
    window.removeEventListener("offline", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}

export function useMessagesRedisRealtime({ userId, roomId, channelId, typingEnabled = true }: {
  userId: string; roomId: string; channelId: string; typingEnabled?: boolean;
}) {
  const roomScope = `${userId}:${roomId}`;
  const typingScope = `${roomScope}:${channelId}`;
  const [presence, setPresence] = useState({ scope: "", onlineUserIds: emptyOnline, redisEnabled: false });
  const [typing, setTyping] = useState({ scope: "", users: emptyTyping });
  const latestChannel = useRef(channelId);
  useEffect(() => { latestChannel.current = channelId; }, [channelId]);
  const lastTypingWriteRef = useRef({ scope: "", at: 0, active: false });
  const availabilityRef = useRef<{ scope: string; enabled?: boolean }>({ scope: "" });

  const signalTyping = useCallback(async (active: boolean) => {
    if (!userId || !roomId || !navigator.onLine || (active && (!typingEnabled || document.visibilityState !== "visible"))) return;
    if (availabilityRef.current.scope === roomScope && availabilityRef.current.enabled === false) return;
    const previous = lastTypingWriteRef.current;
    if (!active && (previous.scope !== typingScope || !previous.active)) return;
    const now = Date.now();
    if (active && previous.scope === typingScope && previous.active && now - previous.at < 900) return;
    lastTypingWriteRef.current = { scope: typingScope, at: now, active };
    try {
      await authenticatedFetchJson("/api/messages/typing", {
        method: "POST", body: JSON.stringify({ roomId, channelId: channelId || undefined, active }),
      });
    } catch { /* Typing is best effort; never retry a stale typing write. */ }
  }, [channelId, roomId, roomScope, typingScope, typingEnabled, userId]);

  // Presence belongs to the room. Switching text channels must not re-fetch the
  // same member list or consume an extra rate-limited heartbeat.
  useEffect(() => {
    if (!userId || !roomId) return;
    const commit = (signal: AbortSignal, update: Partial<typeof presence>) => {
      if (signal.aborted) return;
      if (update.redisEnabled !== undefined) availabilityRef.current = { scope: roomScope, enabled: update.redisEnabled };
      setPresence(previous => {
        const next = { ...(previous.scope === roomScope ? previous : { scope: roomScope, onlineUserIds: emptyOnline, redisEnabled: false }), ...update };
        if (previous.scope === roomScope && sameUserIds(previous.onlineUserIds, next.onlineUserIds)) next.onlineUserIds = previous.onlineUserIds;
        return previous.scope === roomScope && previous.onlineUserIds === next.onlineUserIds && previous.redisEnabled === next.redisEnabled ? previous : next;
      });
    };
    const delay = (interval: number) => () => availabilityRef.current.scope === roomScope && availabilityRef.current.enabled === false ? 60_000 : interval;
    return startVisibleTasks([
      { read: async signal => {
        const result = await authenticatedFetchJson<{ enabled: boolean }>("/api/messages/presence", {
          signal, method: "POST", body: JSON.stringify({ roomId, channelId: latestChannel.current || undefined }),
        });
        commit(signal, { redisEnabled: Boolean(result.enabled) });
      }, delay: delay(25_000) },
      { read: async signal => {
        try {
          const result = await authenticatedFetchJson<PresenceResponse>(`/api/messages/presence?roomId=${encodeURIComponent(roomId)}`, { signal });
          commit(signal, { onlineUserIds: new Set(result.users.map(entry => entry.userId)), redisEnabled: Boolean(result.enabled) });
        } catch { commit(signal, { onlineUserIds: emptyOnline }); }
      }, delay: delay(15_000) },
    ], () => {
      if (!navigator.onLine) setPresence(previous => previous.scope === roomScope && previous.onlineUserIds.size ? { ...previous, onlineUserIds: emptyOnline } : previous);
    });
  }, [userId, roomId, roomScope]);

  useEffect(() => {
    if (!userId || !roomId || !typingEnabled) return;
    const clearTyping = () => {
      setTyping(previous => previous.scope === typingScope && Object.keys(previous.users).length ? { scope: typingScope, users: emptyTyping } : previous);
      void signalTyping(false);
    };
    const stop = startVisibleTasks([{
      read: async signal => {
        const query = new URLSearchParams({ roomId });
        if (channelId) query.set("channelId", channelId);
        try {
          const result = await authenticatedFetchJson<TypingResponse>(`/api/messages/typing?${query}`, { signal });
          if (signal.aborted) return;
          availabilityRef.current = { scope: roomScope, enabled: Boolean(result.enabled) };
          const users = Object.fromEntries(result.users.filter(entry => Date.now() - entry.at < 5000).map(entry => [entry.userId, { name: entry.name, at: entry.at }]));
          setTyping(previous => previous.scope === typingScope && sameTypingEntries(previous.users, users) ? previous : { scope: typingScope, users });
        } catch { if (!signal.aborted) clearTyping(); }
      },
      delay: () => availabilityRef.current.scope === roomScope && availabilityRef.current.enabled === false ? 60_000 : 2_500,
    }], clearTyping);
    return () => { stop(); clearTyping(); };
  }, [userId, roomId, channelId, roomScope, typingScope, typingEnabled, signalTyping]);

  return {
    onlineUserIds: presence.scope === roomScope ? presence.onlineUserIds : emptyOnline,
    typingUsers: typingEnabled && typing.scope === typingScope ? typing.users : emptyTyping,
    redisEnabled: presence.scope === roomScope && presence.redisEnabled,
    signalTyping,
  };
}

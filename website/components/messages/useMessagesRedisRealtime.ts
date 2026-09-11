"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type TypingEntry = { name: string; at: number };
type PresenceResponse = {
  enabled: boolean;
  users: Array<{ userId: string; name: string; lastSeen: number; channelId?: string }>;
};
type TypingResponse = {
  enabled: boolean;
  users: Array<{ userId: string; name: string; at: number }>;
};

export function useMessagesRedisRealtime(input: {
  userId: string;
  roomId: string;
  channelId: string;
}) {
  const { userId, roomId, channelId } = input;
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [typingUsers, setTypingUsers] = useState<Record<string, TypingEntry>>({});
  const [redisEnabled, setRedisEnabled] = useState(false);
  const lastTypingWriteRef = useRef(0);

  const heartbeat = useCallback(async () => {
    if (!userId || !roomId) return;
    try {
      const response = await authenticatedFetchJson<{ enabled: boolean }>("/api/messages/presence", {
        method: "POST",
        body: JSON.stringify({ roomId, channelId: channelId || undefined }),
      });
      setRedisEnabled(Boolean(response.enabled));
    } catch {
      // Supabase Realtime and polling remain the fallback when Redis is unavailable.
    }
  }, [channelId, roomId, userId]);

  const refreshPresence = useCallback(async () => {
    if (!userId || !roomId) return;
    try {
      const response = await authenticatedFetchJson<PresenceResponse>(
        `/api/messages/presence?roomId=${encodeURIComponent(roomId)}`,
      );
      setRedisEnabled(Boolean(response.enabled));
      setOnlineUserIds(new Set((response.users || []).map((entry) => entry.userId)));
    } catch {
      setOnlineUserIds(new Set());
    }
  }, [roomId, userId]);

  const refreshTyping = useCallback(async () => {
    if (!userId || !roomId) return;
    try {
      const query = new URLSearchParams({ roomId });
      if (channelId) query.set("channelId", channelId);
      const response = await authenticatedFetchJson<TypingResponse>(
        `/api/messages/typing?${query.toString()}`,
      );
      setRedisEnabled(Boolean(response.enabled));
      setTypingUsers(
        Object.fromEntries(
          (response.users || []).map((entry) => [entry.userId, { name: entry.name, at: entry.at }]),
        ),
      );
    } catch {
      // The Supabase broadcast typing indicator continues to work independently.
    }
  }, [channelId, roomId, userId]);

  const signalTyping = useCallback(async (active: boolean) => {
    if (!userId || !roomId) return;
    const now = Date.now();
    if (active && now - lastTypingWriteRef.current < 900) return;
    lastTypingWriteRef.current = now;
    try {
      const response = await authenticatedFetchJson<{ enabled: boolean }>("/api/messages/typing", {
        method: "POST",
        body: JSON.stringify({ roomId, channelId: channelId || undefined, active }),
      });
      setRedisEnabled(Boolean(response.enabled));
    } catch {
      // Best effort only; Supabase broadcast remains the immediate path.
    }
  }, [channelId, roomId, userId]);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setOnlineUserIds(new Set());
      setTypingUsers({});
    }, 0);
    if (!userId || !roomId) return () => window.clearTimeout(resetTimer);
    void heartbeat();
    void refreshPresence();
    void refreshTyping();
    const heartbeatTimer = window.setInterval(() => void heartbeat(), 25_000);
    const presenceTimer = window.setInterval(() => void refreshPresence(), 15_000);
    const typingTimer = window.setInterval(() => void refreshTyping(), 2_500);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearInterval(heartbeatTimer);
      window.clearInterval(presenceTimer);
      window.clearInterval(typingTimer);
      void signalTyping(false);
    };
  }, [heartbeat, refreshPresence, refreshTyping, roomId, signalTyping, userId]);

  return { onlineUserIds, typingUsers, redisEnabled, signalTyping };
}

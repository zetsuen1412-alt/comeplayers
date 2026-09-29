"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { isTransactionChatRoom } from "@/lib/chatRoomScope";
import { notificationHref } from "@/lib/notificationInbox";
import { claimAlert, playMessageSound, showSystemAlert, unlockAlertAudio } from "@/lib/clientAlerts";
import { callsAllowedBySettings, shouldAlertNotification, type AccountAlertSettings, type NotificationRow } from "@/lib/notificationPresentation";
import SecureIncomingCallAlert from "./SecureIncomingCallAlert";

// Mounted once in the root layout so browsing the shop, a community or another
// conversation does not turn incoming messages and calls off.
export default function AccountNotificationCenter() {
  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<{ userId: string; value: AccountAlertSettings } | null>(null);
  const [toast, setToast] = useState<NotificationRow | null>(null);
  const activeUser = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    void supabase.auth.getSession().then(({ data }) => { if (active && !authEventReceived) setUserId(data.session?.user.id || null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { authEventReceived = true; if (active) setUserId(session?.user.id || null); });
    window.addEventListener("pointerdown", unlockAlertAudio, { passive: true });
    window.addEventListener("keydown", unlockAlertAudio);
    return () => {
      active = false; subscription.unsubscribe(); clearTimeout(toastTimer.current);
      window.removeEventListener("pointerdown", unlockAlertAudio); window.removeEventListener("keydown", unlockAlertAudio);
    };
  }, []);

  useEffect(() => {
    activeUser.current = userId;
    if (!userId) return;
    let active = true;
    let preferencesReady = false;
    let accountSettings: AccountAlertSettings = {};
    let mutedRoomIds = new Set<string>();
    let polling = false;
    const startedAt = Date.now();
    const seen = new Set<number>();
    const closeAlerts = new Set<() => void>();
    const isCurrent = () => active && activeUser.current === userId;

    async function loadPreferences() {
      try {
        const result = await authenticatedFetchJson<{ settings: AccountAlertSettings; mutedRoomIds: string[] }>("/api/messages/alert-preferences");
        if (!isCurrent()) return;
        accountSettings = result.settings;
        mutedRoomIds = new Set(result.mutedRoomIds);
        preferencesReady = true;
        setSettings({ userId: userId!, value: accountSettings });
      } catch {
        if (isCurrent()) { preferencesReady = false; setSettings(null); }
      }
    }

    async function receive(row: NotificationRow) {
      if (!isCurrent() || !preferencesReady || seen.has(row.id)) return;
      seen.add(row.id);
      if (seen.size > 300) seen.delete(seen.values().next().value!);
      const roomElement = document.querySelector<HTMLElement>("[data-active-chat-room]");
      const activeRoomId = roomElement?.getClientRects().length ? roomElement.dataset.activeChatRoom : null;
      const activeChannelId = activeRoomId ? roomElement?.dataset.activeChatChannel : null;
      if (!shouldAlertNotification({ row, userId: userId!, startedAt, settings: accountSettings, mutedRoomIds, activeRoomId, activeChannelId, visible: !document.hidden })) return;
      if (!await claimAlert(userId!, `notification:${row.id}`) || !isCurrent()) return;
      playMessageSound();
      setToast(row);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => { if (isCurrent()) setToast(null); }, 7000);
      if (document.hidden) {
        // Content previews are kept in-app; the lock-screen notification is generic.
        const close = await showSystemAlert({ title: "ComePlayers", body: row.type === "chat_message" ? "Ada pesan baru. Buka ComePlayers untuk membaca." : "Ada notifikasi baru di ComePlayers.", tag: `cp-notification-${row.id}`, href: notificationHref(row.link_url), onClick: () => window.location.assign(notificationHref(row.link_url)) });
        if (isCurrent()) closeAlerts.add(close); else close();
      }
    }

    async function poll() {
      if (!isCurrent() || polling || !navigator.onLine) return;
      polling = true;
      try {
        await loadPreferences();
        if (!isCurrent() || !preferencesReady) return;
        const result = await supabase.from("notifications")
          .select("id,user_id,type,title,message,link_url,is_read,created_at")
          .eq("user_id", userId!).eq("is_read", false)
          .gte("created_at", new Date(Math.max(startedAt, Date.now() - 120_000)).toISOString())
          .order("id", { ascending: true }).limit(100);
        if (!result.error && isCurrent()) for (const row of result.data || []) await receive(row);
      } catch { /* A later realtime event/focus/reconnect retries without stale alerts. */ }
      finally { polling = false; }
    }
    void poll();
    const channel = supabase.channel(`account-alerts:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, payload => { void receive(payload.new as NotificationRow); })
      .subscribe(status => { if (status === "SUBSCRIBED") void poll(); });
    const timer = setInterval(() => { void poll(); }, 15_000);
    const focus = () => { closeAlerts.forEach(close => close()); closeAlerts.clear(); void poll(); };
    window.addEventListener("focus", focus); window.addEventListener("online", focus);
    return () => {
      active = false; clearInterval(timer); clearTimeout(toastTimer.current);
      closeAlerts.forEach(close => close()); void supabase.removeChannel(channel);
      window.removeEventListener("focus", focus); window.removeEventListener("online", focus);
    };
  }, [userId]);

  const openCallRoom = useCallback(async (roomId: string) => {
    const result = await authenticatedFetchJson<{ room: { room_type?: string; product_id?: number | null; order_id?: number | null } }>(`/api/messages/rooms/${encodeURIComponent(roomId)}?limit=1`);
    // These conversation pages resolve query targets on mount. A user click
    // deliberately opens that target even when already on the same route.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Remount is required to resolve a different conversation on the same page.
    window.location.assign(`${isTransactionChatRoom(result.room) ? "/chat" : "/cpcommunity"}?room=${encodeURIComponent(roomId)}`);
  }, []);

  return <>
    {userId ? <SecureIncomingCallAlert key={userId} userId={userId} enabled={settings?.userId === userId && callsAllowedBySettings(settings.value)} onOpenRoom={openCallRoom} /> : null}
    {toast && toast.user_id === userId ? <aside role="status" aria-live="polite" className="fixed right-4 top-4 z-[10001] w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-cyan-400/30 bg-[#101923] p-4 text-white shadow-xl">
      <div className="flex items-start gap-3"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setToast(null); window.location.assign(notificationHref(toast.link_url)); }}><strong className="block truncate">{toast.title}</strong><span className="mt-1 block line-clamp-2 text-sm text-slate-300">{toast.message || "Notifikasi baru"}</span><span className="mt-2 block text-sm font-semibold text-cyan-300">Buka</span></button><button type="button" aria-label="Tutup notifikasi" className="min-h-11 min-w-11 rounded-lg hover:bg-white/10" onClick={() => setToast(null)}>×</button></div>
    </aside> : null}
  </>;
}

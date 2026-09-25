"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaBell, FaCheckDouble } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";
import {
  announceInboxChange,
  clearNotificationsThrough,
  markNotificationRead,
  notificationHref,
} from "@/lib/notificationInbox";

type NotificationItem = {
  id: number;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
};

export default function NotificationsPage() {
  const { locale } = useCurrency();
  const router = useRouter();
  const isIndonesian = locale.startsWith("id");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const busyRef = useRef(false);
  const requestRef = useRef(0);
  const userIdRef = useRef<string | null>(null);

  async function loadNotifications(background: boolean = false) {
    const request = ++requestRef.current;
    if (!background) setLoading(true);
    try {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (request !== requestRef.current) return;
      if (authError) throw new Error(authError.message);
      const userId = userData.user?.id || null;
      if (userId !== userIdRef.current) setNotifications([]);
      userIdRef.current = userId;
      if (!userId) {
        setNotifications([]);
        return;
      }
      const { data, error: loadError } = await supabase
        .from("notifications")
        .select("id,user_id,type,title,message,link_url,is_read,created_at")
        .eq("user_id", userId)
        .order("id", { ascending: false });
      if (request !== requestRef.current) return;
      if (loadError) throw new Error(loadError.message);
      setNotifications(data || []);
    } catch (cause) {
      if (request === requestRef.current) {
        console.error("Notification history load error:", cause);
        setError(isIndonesian ? "Notifikasi gagal dimuat. Coba muat ulang halaman." : "Could not load notifications. Please reload the page.");
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }

  async function persistRead(id?: number) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const latestId = notifications[0]?.id;
    try {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (authError || !userId || userId !== userIdRef.current) {
        throw new Error("The signed-in account has changed. Reload before retrying.");
      }
      if (id !== undefined) {
        await markNotificationRead(supabase, userId, id);
      } else {
        if (latestId === undefined) return false;
        await clearNotificationsThrough(supabase, userId, latestId);
      }
      if (userId !== userIdRef.current) return false;
      setNotifications((current) => current.map((item) =>
        item.user_id === userId && (id !== undefined ? item.id === id : latestId !== undefined && item.id <= latestId)
          ? { ...item, is_read: true }
          : item
      ));
      announceInboxChange(userId);
      return true;
    } catch (cause) {
      console.error("Notification read error:", cause);
      setError(isIndonesian ? "Notifikasi belum berhasil ditandai dibaca. Silakan coba lagi." : "Could not mark notifications as read. Please try again.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function openNotification(event: MouseEvent<HTMLAnchorElement>, item: NotificationItem) {
    const newTab = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    if (!newTab) event.preventDefault();
    const saved = item.is_read || await persistRead(item.id);
    if (saved && !newTab) router.push(notificationHref(item.link_url));
  }

  useEffect(() => {
    void loadNotifications();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id || null) === userIdRef.current) return;
      // Invalidate requests and clear private data immediately on account changes.
      requestRef.current += 1;
      userIdRef.current = session?.user.id || null;
      setNotifications([]);
      // Do not await Supabase queries inside the auth callback.
      window.setTimeout(() => { void loadNotifications(); }, 0);
    });
    return () => { requestRef.current += 1; subscription.unsubscribe(); };
    // The auth subscription owns account refreshes for this mounted page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLiveRefresh(async () => { await loadNotifications(true); }, { topics: 'account' });

  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const visibleNotifications = showHistory ? notifications : notifications.filter((item) => !item.is_read);

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-12 text-white">
      <section className="mx-auto max-w-5xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              {isIndonesian ? "Pusat Notifikasi" : "Notification Center"}
            </p>
            <h1 className="mt-5 text-4xl font-black sm:text-5xl">{isIndonesian ? "Notifikasi" : "Notifications"}</h1>
          </div>
          <button
            type="button"
            onClick={() => { void persistRead(); }}
            disabled={busy || loading || unreadCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-400 px-5 py-3 font-black text-cyan-300 hover:bg-cyan-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FaCheckDouble aria-hidden="true" />
            {busy ? (isIndonesian ? "Memproses..." : "Saving...") : (isIndonesian ? "Bersihkan semua" : "Clear all")}
          </button>
        </div>
        <p className="mt-5 text-sm text-gray-400">
          {isIndonesian ? "Notifikasi yang dibaca hilang dari daftar aktif. Riwayat tetap tersimpan." : "Read notifications leave your active inbox. Your history is preserved."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2" aria-label={isIndonesian ? "Filter notifikasi" : "Notification filters"}>
          <button type="button" onClick={() => setShowHistory(false)} aria-pressed={!showHistory}
            className={`rounded-full border px-4 py-2 text-sm font-bold ${!showHistory ? "border-cyan-400 bg-cyan-400/10 text-cyan-300" : "border-white/10 text-gray-400"}`}>
            {isIndonesian ? "Belum dibaca" : "Unread"} ({unreadCount})
          </button>
          <button type="button" onClick={() => setShowHistory(true)} aria-pressed={showHistory}
            className={`rounded-full border px-4 py-2 text-sm font-bold ${showHistory ? "border-cyan-400 bg-cyan-400/10 text-cyan-300" : "border-white/10 text-gray-400"}`}>
            {isIndonesian ? "Riwayat semua" : "All history"}
          </button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
        <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#0b1020]" aria-busy={busy || loading}>
          {loading ? (
            <div className="p-8 text-center text-gray-400">{isIndonesian ? "Memuat..." : "Loading..."}</div>
          ) : visibleNotifications.length === 0 ? (
            <div className="p-10 text-center">
              <FaBell className="mx-auto text-5xl text-gray-600" aria-hidden="true" />
              <p className="mt-4 text-gray-400">{isIndonesian ? "Tidak ada notifikasi di daftar ini." : "No notifications in this list."}</p>
            </div>
          ) : visibleNotifications.map((item) => (
            <Link key={item.id} href={notificationHref(item.link_url)}
              onClick={(event) => { void openNotification(event, item); }}
              aria-disabled={busy}
              className={`block border-b border-white/10 p-5 transition hover:bg-white/[0.04] ${item.is_read ? "bg-[#0b1020]" : "bg-cyan-400/10"}`}>
              <div className="flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300"><FaBell aria-hidden="true" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-black text-white">{item.title}</h2>
                    {!item.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                  </div>
                  <p className="mt-1 text-sm text-gray-300">{item.message || item.type}</p>
                  <p className="mt-2 text-xs text-gray-500">{new Date(item.created_at).toLocaleString(locale)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

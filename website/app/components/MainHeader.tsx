"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  FaBalanceScale,
  FaBars,
  FaBell,
  FaBullhorn,
  FaCommentDots,
  FaCog,
  FaFire,
  FaGamepad,
  FaHome,
  FaShoppingBag,
  FaSignOutAlt,
  FaStore,
  FaTimes,
  FaTrophy,
  FaUsers,
  FaWallet,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";
import MarketplaceSearch from "@/components/marketplace/MarketplaceSearch";
import AuthModal, { type AuthMode } from "@/components/auth/AuthModal";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import ComePlayersLogo from "@/components/brand/ComePlayersLogo";
import LocaleCurrencySwitcher from "@/components/layout/LocaleCurrencySwitcher";
import {
  NOTIFICATION_INBOX_CHANGED,
  clearNotificationsThrough,
  markAnnouncementsRead,
  markNotificationRead,
  notificationHref,
} from "@/lib/notificationInbox";



type Category = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
};

type Announcement = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  type: string;
  priority: string;
  status: string;
  is_pinned: boolean;
  publish_at: string | null;
  expire_at: string | null;
  created_at: string;
};

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

type ChatToast = {
  id: string;
  room_id: string;
  sender_id: string;
  message: string | null;
  created_at: string;
  sender_name: string;
};

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
  seller_status: string | null;
  avatar_url: string | null;
};

const mobileNavigation = [
  { href: "/", label: "Home", icon: FaHome },
  { href: "/marketplace", label: "Marketplace", icon: FaShoppingBag },
  { href: "/cpcommunity", label: "Community", icon: FaUsers },
  { href: "/games", label: "Games", icon: FaGamepad },
  { href: "/tournaments", label: "Tournaments", icon: FaTrophy },
  { href: "/flash-sales", label: "Flash Sales", icon: FaFire },
  { href: "/help-center", label: "Alexia Help Center", icon: FaBalanceScale },
] as const;



function isVisibleAnnouncement(item: Announcement) {
  const now = Date.now();

  if (item.status !== "published") return false;
  if (item.publish_at && new Date(item.publish_at).getTime() > now) return false;
  if (item.expire_at && new Date(item.expire_at).getTime() < now) return false;

  return true;
}

function formatShortDate(value: string | null | undefined, locale = "en-US") {
  if (!value) return "-";

  return new Date(value).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}



function getInitial(name?: string | null) {
  if (!name) return "U";
  return name.trim().charAt(0).toUpperCase();
}

function MainHeaderContent() {
  const { formatPrice, currency, locale, t } = useCurrency();
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);

  const [categories, setCategories] = useState<Category[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [chatToast, setChatToast] = useState<ChatToast | null>(null);
  const [announcementUnreadCount, setAnnouncementUnreadCount] = useState(0);
  const [latestNotifications, setLatestNotifications] = useState<
    NotificationItem[]
  >([]);
  const [latestAnnouncements, setLatestAnnouncements] = useState<
    Announcement[]
  >([]);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const notificationBusyRef = useRef(false);
  const notificationRequestRef = useRef(0);
  const announcementRequestRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);
  const isIndonesian = locale.startsWith("id");

  const [showNotificationDropdown, setShowNotificationDropdown] =
    useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showProfileSellingMenu, setShowProfileSellingMenu] = useState(false);
  const [showProfileSettingsMenu, setShowProfileSettingsMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<Extract<AuthMode, "login" | "register">>("login");

  const totalHeaderUnread = unreadCount + announcementUnreadCount;

  function setHeaderUser(currentUser: User | null) {
    const userId = currentUser?.id || null;
    if (activeUserIdRef.current !== userId) {
      activeUserIdRef.current = userId;
      notificationRequestRef.current += 1;
      announcementRequestRef.current += 1;
      setLatestNotifications([]);
      setLatestAnnouncements([]);
      setUnreadCount(0);
      setAnnouncementUnreadCount(0);
      setNotificationError(null);
    }
    setUser(currentUser);
  }

  useEffect(() => {
    if (!showMobileMenu) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowMobileMenu(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMobileMenu]);


  const visibleLatestAnnouncements = useMemo(() => {
    return latestAnnouncements.filter(isVisibleAnnouncement).slice(0, 4);
  }, [latestAnnouncements]);

  async function createInitialWallet() {
    try {
      await authenticatedFetchJson("/api/wallet/topups", {
        method: "POST",
        body: JSON.stringify({ action: "ensure-wallet" }),
      });
      return true;
    } catch (error) {
      console.error(
        "Create initial wallet error:",
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  async function ensureOAuthProfile(currentUser: User) {
    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) {
      console.error("OAuth profile lookup error:", profileError.message);
    }

    // Profile is created automatically by Supabase trigger.
    // Never insert/upsert profile from client header.
    await createInitialWallet();

    if (!existingProfile) {
      console.warn("Profile row is not ready yet. Fallback username will use auth email.");
    }
  }

  async function loadUserProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,username,role,seller_status,avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Profile load error:", error.message);
      setProfile(null);
      return;
    }

    setProfile(data || null);
  }

  async function loadWallet(userId: string) {
    const { data, error } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Wallet load error:", error.message);
      setWalletBalance(0);
      return;
    }

    setWalletBalance(Number(data?.balance || 0));
  }

  async function loadNotifications(userId: string) {
    const request = ++notificationRequestRef.current;
    const [countResult, listResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false),
      supabase
        .from("notifications")
        .select("id,user_id,type,title,message,link_url,is_read,created_at")
        .eq("user_id", userId)
        .eq("is_read", false)
        .order("id", { ascending: false })
        .limit(5),
    ]);

    if (request !== notificationRequestRef.current || activeUserIdRef.current !== userId) return;

    if (countResult.error) {
      console.error(
        "Unread notification count error:",
        countResult.error.message
      );
    } else {
      setUnreadCount(countResult.count || 0);
    }

    if (listResult.error) {
      console.error("Latest notifications error:", listResult.error.message);
    } else {
      setLatestNotifications(listResult.data || []);
    }
  }

  async function loadUnreadMessages() {
    try {
      const data = await authenticatedFetchJson<{ count: number }>(
        "/api/messages/unread"
      );
      setUnreadMessageCount(Number(data.count || 0));
    } catch (error) {
      console.error(
        "Unread message count error:",
        error instanceof Error ? error.message : error
      );
      setUnreadMessageCount(0);
    }
  }

  function playChatSound() {
    try {
      const audio = new Audio("/sounds/chat.mp3");
      audio.volume = 0.35;
      audio.play().catch(() => {
        // Browser may block sound until the user interacts with the page.
      });
    } catch {
      // Ignore sound errors.
    }
  }

  async function showChatToastFromMessage(messageRow: {
    id: string;
    room_id: string;
    sender_id: string;
    message: string | null;
    created_at: string;
  }) {
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("username,email")
      .eq("id", messageRow.sender_id)
      .maybeSingle();

    const senderName =
      senderProfile?.username ||
      senderProfile?.email ||
      "New message";

    setChatToast({
      id: messageRow.id,
      room_id: messageRow.room_id,
      sender_id: messageRow.sender_id,
      message: messageRow.message,
      created_at: messageRow.created_at,
      sender_name: senderName,
    });

    window.setTimeout(() => {
      setChatToast((current) =>
        current?.id === messageRow.id ? null : current
      );
    }, 7000);
  }

  async function loadAnnouncements(currentUserId?: string) {
    const request = ++announcementRequestRef.current;
    const isCurrentRequest = () => request === announcementRequestRef.current &&
      activeUserIdRef.current === (currentUserId || null);
    const { data: announcementData, error: announcementError } = await supabase
      .from("announcements")
      .select(
        "id,title,slug,summary,type,priority,status,is_pinned,publish_at,expire_at,created_at"
      )
      .eq("status", "published")
      .order("is_pinned", { ascending: false })
      .order("id", { ascending: false })
      .limit(12);

    if (!isCurrentRequest()) return;
    if (announcementError) {
      console.error("Announcement load error:", announcementError.message);
      return;
    }

    const visible = (announcementData || []).filter(isVisibleAnnouncement);

    if (!currentUserId || visible.length === 0) {
      setLatestAnnouncements([]);
      setAnnouncementUnreadCount(0);
      return;
    }

    const announcementIds = visible.map((item) => item.id);

    const { data: readData, error: readError } = await supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("user_id", currentUserId)
      .in("announcement_id", announcementIds);

    if (!isCurrentRequest()) return;
    if (readError) {
      console.error("Announcement reads error:", readError.message);
      return;
    }

    const readIds = new Set(
      (readData || []).map((item) => item.announcement_id)
    );
    const unread = visible.filter((item) => !readIds.has(item.id));
    setLatestAnnouncements(unread);
    setAnnouncementUnreadCount(unread.length);
  }

  async function runInboxAction(action: (userId: string) => Promise<void>) {
    const userId = activeUserIdRef.current;
    if (!userId || notificationBusyRef.current) return false;
    notificationBusyRef.current = true;
    setNotificationBusy(true);
    setNotificationError(null);
    // Do not let a read started before the mutation restore a stale inbox.
    notificationRequestRef.current += 1;
    announcementRequestRef.current += 1;
    try {
      await action(userId);
      return activeUserIdRef.current === userId;
    } catch (error) {
      console.error("Notification inbox update error:", error);
      if (activeUserIdRef.current === userId) {
        setNotificationError(isIndonesian
          ? "Notifikasi belum berhasil dibersihkan. Silakan coba lagi."
          : "Could not clear notifications. Please try again.");
      }
      return false;
    } finally {
      if (activeUserIdRef.current === userId) {
        await Promise.all([loadNotifications(userId), loadAnnouncements(userId)])
          .catch((error) => console.error("Notification inbox refresh error:", error));
      }
      notificationBusyRef.current = false;
      setNotificationBusy(false);
    }
  }

  async function openNotification(event: MouseEvent<HTMLAnchorElement>, notification: NotificationItem) {
    const newTab = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    if (!newTab) event.preventDefault();
    const saved = await runInboxAction((userId) => markNotificationRead(supabase, userId, notification.id));
    if (saved && !newTab) {
      setShowNotificationDropdown(false);
      router.push(notificationHref(notification.link_url));
    }
  }

  async function openAnnouncement(event: MouseEvent<HTMLAnchorElement>, announcement: Announcement) {
    const newTab = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    if (!newTab) event.preventDefault();
    const saved = await runInboxAction((userId) => markAnnouncementsRead(supabase, userId, [announcement.id]));
    if (saved && !newTab) {
      setShowNotificationDropdown(false);
      router.push(`/announcements/${encodeURIComponent(announcement.slug)}`);
    }
  }

  async function clearInbox() {
    const latestId = latestNotifications[0]?.id;
    const announcementIds = latestAnnouncements.map((item) => item.id);
    await runInboxAction(async (userId) => {
      if (latestId !== undefined) await clearNotificationsThrough(supabase, userId, latestId);
      await markAnnouncementsRead(supabase, userId, announcementIds);
    });
  }

  async function loadUserHeaderData(currentUser: User) {
    await ensureOAuthProfile(currentUser);

    await Promise.all([
      loadUserProfile(currentUser.id),
      loadWallet(currentUser.id),
      loadNotifications(currentUser.id),
      loadUnreadMessages(),
      loadAnnouncements(currentUser.id),
    ]);
  }

  useEffect(() => {
    async function initializeHeader() {
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData.user || null;

      setHeaderUser(currentUser);

      if (currentUser) {
        await loadUserHeaderData(currentUser);
      } else {
        setProfile(null);
        setWalletBalance(0);
        setUnreadCount(0);
        setUnreadMessageCount(0);
        setChatToast(null);
        setAnnouncementUnreadCount(0);
        setLatestNotifications([]);
        await loadAnnouncements();
      }

      const { data: categoryData } = await supabase
        .from("categories")
        .select("*")
        .order("id", { ascending: true });

      setCategories(categoryData || []);
    }

    initializeHeader();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null;

      setHeaderUser(currentUser);

      if (currentUser) {
        loadUserHeaderData(currentUser);
      } else {
        setProfile(null);
        setWalletBalance(0);
        setUnreadCount(0);
        setUnreadMessageCount(0);
        setChatToast(null);
        setAnnouncementUnreadCount(0);
        setLatestNotifications([]);
        setShowProfileDropdown(false);
        setShowNotificationDropdown(false);
        loadAnnouncements();
      }
    });

    return () => subscription.unsubscribe();
    // This initialization effect intentionally subscribes once; the auth listener
    // owns subsequent header refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;

    const notificationChannel = supabase
      .channel(`main-header-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadNotifications(user.id)
      )
      .subscribe();

    const messageChannel = supabase
      .channel(`main-header-messages-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        async (payload) => {
          await loadUnreadMessages();

          if (payload.eventType === "INSERT") {
            const newMessage = payload.new as {
              id: string;
              room_id: string;
              sender_id: string;
              message: string | null;
              created_at: string;
            };

            if (newMessage.sender_id !== user.id) {
              playChatSound();
              await showChatToastFromMessage(newMessage);
            }
          }
        }
      )
      .subscribe();

    const walletChannel = supabase
      .channel(`main-header-wallet-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadWallet(user.id)
      )
      .subscribe();

    const announcementReadChannel = supabase
      .channel(`main-header-announcement-reads-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcement_reads",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadAnnouncements(user.id)
      )
      .subscribe();

    const announcementChannel = supabase
      .channel("main-header-announcements")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements",
        },
        () => loadAnnouncements(user.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(walletChannel);
      supabase.removeChannel(announcementReadChannel);
      supabase.removeChannel(announcementChannel);
    };
  }, [user]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    const refresh = () => {
      void Promise.all([loadNotifications(userId), loadAnnouncements(userId)])
        .catch((error) => console.error("Notification inbox refresh error:", error));
    };
    const handleInboxChange = (event: Event) => {
      if ((event as CustomEvent<{ userId: string }>).detail?.userId === userId) refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(NOTIFICATION_INBOX_CHANGED, handleInboxChange);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(NOTIFICATION_INBOX_CHANGED, handleInboxChange);
    };
    // Refresh on navigation/open/focus even when Realtime is unavailable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pathname, showNotificationDropdown]);

  function openAuthModal(mode: Extract<AuthMode, "login" | "register">) {
    setAuthMode(mode);
    setShowAuthModal(true);
  }

  function closeAuthModal() {
    setShowAuthModal(false);
  }

  async function handleSellWithUs() {
    if (!user) {
      openAuthModal("login");
      return;
    }

    const { data: currentProfile, error } = await supabase
      .from("profiles")
      .select("seller_status")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      alert(error.message);
      return;
    }

    if (currentProfile?.seller_status === "approved") {
      router.push("/seller");
      return;
    }

    if (currentProfile?.seller_status === "pending") {
      alert("Your seller application is still under review.");
      return;
    }

    router.push("/seller/apply");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setHeaderUser(null);
    setProfile(null);
    setWalletBalance(0);
    setUnreadCount(0);
    setUnreadMessageCount(0);
    setChatToast(null);
    setAnnouncementUnreadCount(0);
    setLatestNotifications([]);
    setShowProfileDropdown(false);
    setShowNotificationDropdown(false);
  }

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-amber-400/30 bg-[#050505] px-3 py-1.5 shadow-[0_12px_35px_rgba(0,0,0,0.55)] sm:px-4 lg:px-5 lg:py-1">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-1.5 lg:min-h-16 lg:flex-row lg:items-center lg:gap-3">
          <div className="flex min-w-0 items-center justify-between gap-2 lg:shrink-0">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Link
                href="/"
                aria-label="Open the ComePlayers home page"
                className="flex min-w-0 cursor-pointer items-center"
              >
                <ComePlayersLogo
                  size="sm"
                  tone="dark"
                  className="[&>img]:h-auto [&>img]:max-h-6 min-[380px]:[&>img]:max-h-7 sm:[&>img]:max-h-10 lg:[&>img]:max-h-[72px]"
                />
              </Link>

              <div
                className="hidden items-stretch xl:flex"
                aria-label="ComePlayers destinations"
              >
                <Link
                  href="/marketplace"
                  aria-current={
                    pathname === "/marketplace" ||
                    pathname?.startsWith("/marketplace/")
                      ? "page"
                      : undefined
                  }
                  className="group relative flex min-h-11 items-center gap-2.5 rounded-lg px-3.5 text-sm font-black uppercase tracking-[0.02em] text-[#ffd21a] transition duration-200 hover:bg-[#ffd21a]/[0.07] hover:text-[#ffe45f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd21a]/70"
                >
                  <FaStore
                    className="shrink-0 text-base transition duration-200 group-hover:drop-shadow-[0_0_8px_rgba(255,210,26,0.7)]"
                    aria-hidden="true"
                  />
                  <span>Marketplace</span>
                  <span
                    className={`absolute inset-x-3.5 bottom-0 h-0.5 rounded-full bg-[#ffd21a] transition duration-200 ${
                      pathname === "/marketplace" ||
                      pathname?.startsWith("/marketplace/")
                        ? "opacity-100 shadow-[0_0_10px_rgba(255,210,26,0.6)]"
                        : "opacity-65 group-hover:opacity-100 group-hover:shadow-[0_0_10px_rgba(255,210,26,0.45)]"
                    }`}
                    aria-hidden="true"
                  />
                </Link>

                <Link
                  href="/cpcommunity"
                  className="group relative flex min-h-11 items-center gap-2.5 rounded-lg px-3.5 text-sm font-black uppercase tracking-[0.02em] text-[#20b8ff] transition duration-200 hover:bg-[#20b8ff]/[0.07] hover:text-[#68d0ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20b8ff]/70"
                >
                  <FaUsers
                    className="shrink-0 text-base transition duration-200 group-hover:drop-shadow-[0_0_8px_rgba(32,184,255,0.7)]"
                    aria-hidden="true"
                  />
                  <span>Community</span>
                  <span
                    className="absolute inset-x-3.5 bottom-0 h-0.5 rounded-full bg-[#20b8ff] opacity-65 transition duration-200 group-hover:opacity-100 group-hover:shadow-[0_0_10px_rgba(32,184,255,0.45)]"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 min-[380px]:gap-2 lg:hidden">
              <div className="hidden sm:block">
                <LocaleCurrencySwitcher compact />
              </div>

              {user ? (
                <>
                  <Link
                    href="/chat"
                    className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-[#111827] text-gray-300 transition hover:bg-[#1f2937] hover:text-white"
                    title={t("header.messages")}
                    aria-label={t("header.messages")}
                  >
                    <FaCommentDots />

                    {unreadMessageCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                        {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                      </span>
                    )}
                  </Link>

                  <button
                    onClick={() => {
                      setShowNotificationDropdown(!showNotificationDropdown);
                      setShowProfileDropdown(false);
                    }}
                    className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-[#111827] text-yellow-300 transition hover:bg-[#1f2937] hover:text-yellow-200"
                    title={t("header.notifications")}
                    aria-label={t("header.notifications")}
                  >
                    <FaBell />

                    {totalHeaderUnread > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                        {totalHeaderUnread > 99 ? "99+" : totalHeaderUnread}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setShowProfileDropdown(!showProfileDropdown);
                      setShowNotificationDropdown(false);
                    }}
                    className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-cyan-400/50 bg-[#0b1220] transition hover:border-cyan-400"
                    title={t("header.profile")}
                    aria-label={t("header.profile")}
                  >
                    {profile?.avatar_url ? (
                      <Image
                        src={profile.avatar_url}
                        alt={profile.username || "Profile"}
                        width={28}
                        height={28}
                        unoptimized
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-xs font-black text-black">
                        {getInitial(profile?.username || user?.email || "U")}
                      </div>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSellWithUs}
                    className="hidden rounded-lg border border-amber-400/60 bg-black/30 px-3 py-2 text-xs font-black text-amber-300 transition hover:bg-amber-400 hover:text-black sm:inline-flex"
                  >
                    {t("header.sell")}
                  </button>

                  <button
                    onClick={() => openAuthModal("login")}
                    className="rounded-lg border border-amber-300 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-3 py-2 text-xs font-black text-black transition hover:brightness-110 sm:px-4"
                  >
                    {t("header.login")}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu((value) => !value);
                  setShowNotificationDropdown(false);
                  setShowProfileDropdown(false);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/35 bg-amber-300/10 text-amber-200 transition hover:border-amber-300 hover:bg-amber-300 hover:text-black"
                aria-label={showMobileMenu ? "Close main menu" : "Open main menu"}
                aria-expanded={showMobileMenu}
                aria-controls="cp-mobile-main-menu"
              >
                {showMobileMenu ? <FaTimes /> : <FaBars />}
              </button>
            </div>
          </div>

          <div className="order-last w-full min-w-0 lg:order-none lg:flex lg:min-w-[360px] lg:max-w-[720px] lg:flex-1">
            <MarketplaceSearch
              categories={categories}
              placeholder={t("search.headerPlaceholder")}
              compact
            />
          </div>

          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <LocaleCurrencySwitcher />

            <button
              onClick={handleSellWithUs}
              className="hidden rounded-lg border border-amber-400/60 bg-black/30 px-4 py-2.5 text-sm font-black text-amber-300 transition hover:bg-amber-400 hover:text-black min-[1440px]:inline-flex"
            >
              {t("header.sellWithUs")}
            </button>

            {user ? (
              <>
                <Link
                  href="/chat"
                  className="relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-[#111827] text-gray-300 transition hover:bg-[#1f2937] hover:text-white"
                  title={t("header.messages")}
                >
                  <FaCommentDots />

                  {unreadMessageCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                      {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                    </span>
                  )}
                </Link>

                <button
                  onClick={() => {
                    setShowNotificationDropdown(!showNotificationDropdown);
                    setShowProfileDropdown(false);
                  }}
                  className="relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-[#111827] text-yellow-300 transition hover:bg-[#1f2937] hover:text-yellow-200"
                  title={t("header.notifications")}
                >
                  <FaBell />

                  {totalHeaderUnread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                      {totalHeaderUnread > 99 ? "99+" : totalHeaderUnread}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setShowProfileDropdown(!showProfileDropdown);
                    setShowNotificationDropdown(false);
                  }}
                  className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-cyan-400/50 bg-[#0b1220] transition hover:border-cyan-400"
                  title={t("header.profile")}
                >
                  {profile?.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={profile.username || "Profile"}
                      width={28}
                      height={28}
                      unoptimized
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-xs font-black text-black">
                      {getInitial(profile?.username || user?.email || "U")}
                    </div>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={() => openAuthModal("login")}
                className="rounded-lg border border-amber-300 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-4 py-2.5 text-sm font-black text-black shadow-[0_0_18px_rgba(250,204,21,0.2)] transition hover:brightness-110"
              >
                {t("header.loginSignup")}
              </button>
            )}
          </div>
        </div>
      </nav>

      {showMobileMenu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm lg:hidden"
            onClick={() => setShowMobileMenu(false)}
            aria-label="Close main menu"
          />
          <aside
            id="cp-mobile-main-menu"
            className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[82svh] flex-col overflow-hidden rounded-t-[28px] border border-amber-300/25 bg-[linear-gradient(180deg,#111827_0%,#070b12_100%)] text-white shadow-[0_-24px_80px_rgba(0,0,0,0.72)] lg:hidden"
            aria-label="ComePlayers mobile menu"
          >
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-white/20" aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-white/10 px-5 pb-4 pt-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                  ComePlayers
                </p>
                <h2 className="mt-1 text-xl font-black">Main Menu</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileMenu(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300"
                aria-label="Close main menu"
              >
                <FaTimes />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <nav className="grid grid-cols-2 gap-2" aria-label="Primary mobile navigation">
                {mobileNavigation.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname?.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setShowMobileMenu(false)}
                      className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black transition ${
                        active
                          ? "border-amber-300/60 bg-amber-300/15 text-amber-200"
                          : "border-white/10 bg-white/[0.035] text-slate-200 hover:border-amber-300/35 hover:text-white"
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/30 text-amber-300">
                        <Icon />
                      </span>
                      <span className="min-w-0 leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              {user ? (
                <section className="mt-4 border-t border-white/10 pt-4" aria-label="Account shortcuts">
                  <p className="mb-3 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Your Account
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { href: "/chat", label: t("header.messages"), icon: FaCommentDots },
                      { href: "/my-orders", label: t("header.myOrders"), icon: FaShoppingBag },
                      { href: "/wallet", label: t("header.wallet"), icon: FaWallet },
                      { href: "/account", label: t("header.account"), icon: FaCog },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setShowMobileMenu(false)}
                          className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-bold text-slate-300"
                        >
                          <Icon className="shrink-0 text-cyan-300" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMenu(false);
                      openAuthModal("login");
                    }}
                    className="min-h-12 rounded-xl border border-white/15 bg-white/5 px-4 font-black text-white"
                  >
                    {t("header.login")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMenu(false);
                      openAuthModal("register");
                    }}
                    className="min-h-12 rounded-xl border border-amber-200 bg-amber-300 px-4 font-black text-black"
                  >
                    Register
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/20 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
              <LocaleCurrencySwitcher compact />
              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  void handleSellWithUs();
                }}
                className="min-h-11 flex-1 rounded-xl border border-amber-300/50 bg-amber-300/10 px-4 text-sm font-black text-amber-200"
              >
                {t("header.sellWithUs")}
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {showNotificationDropdown && user && (
        <div
          className="fixed left-3 right-3 top-[128px] z-[99999] flex max-h-[calc(100dvh-148px)] flex-col overflow-hidden rounded-2xl border border-slate-700 shadow-[0_20px_60px_rgba(0,0,0,0.95)] sm:left-auto sm:right-6 sm:top-[120px] sm:w-[380px] sm:max-w-[calc(100vw-2rem)] lg:top-[92px] lg:max-h-[calc(100dvh-112px)]"
          aria-busy={notificationBusy}
          style={{
            backgroundColor: "#111827",
            opacity: 1,
            backdropFilter: "none",
          }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-[#1b2436] p-4">
            <div>
              <p className="font-black text-white">
                {t("header.notifications")}
              </p>
              <p className="text-xs text-gray-400">
                {t("header.unreadUpdates", { count: totalHeaderUnread })}
              </p>
            </div>

            <Link
              href="/notifications"
              onClick={() => setShowNotificationDropdown(false)}
              className="text-xs font-black text-cyan-300 hover:text-cyan-200"
            >
              {t("header.viewAll")}
            </Link>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700 bg-[#111827] px-4 py-3">
            <p className="text-[11px] text-gray-400">
              {isIndonesian ? "Riwayat tetap tersimpan." : "Your history is preserved."}
            </p>
            <button
              type="button"
              onClick={() => { void clearInbox(); }}
              disabled={notificationBusy || (latestNotifications.length === 0 && latestAnnouncements.length === 0)}
              className="shrink-0 rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-black text-cyan-300 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {notificationBusy ? (isIndonesian ? "Memproses..." : "Saving...") : (isIndonesian ? "Bersihkan semua" : "Clear all")}
            </button>
          </div>
          {notificationError && (
            <p role="alert" className="shrink-0 border-b border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-200">
              {notificationError}
            </p>
          )}

          <div className="min-h-0 max-h-[70vh] overflow-y-auto bg-[#111827]">
            {latestNotifications.length === 0 &&
            visibleLatestAnnouncements.length === 0 ? (
              <div className="p-5 text-center text-sm text-gray-400">
                {t("header.noUpdates")}
              </div>
            ) : (
              <>
                {latestNotifications.map((notification) => (
                  <Link
                    key={`notification-${notification.id}`}
                    href={notificationHref(notification.link_url)}
                    onClick={(event) => { void openNotification(event, notification); }}
                    aria-disabled={notificationBusy}
                    className="flex gap-3 border-b border-slate-800 bg-[#111827] p-4 transition hover:bg-[#202b42]"
                  >
                    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#123142] text-cyan-300">
                      <FaBell />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="line-clamp-1 font-black text-white">
                          {notification.title}
                        </p>

                        {!notification.is_read && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                        {notification.message || notification.type}
                      </p>

                      <p className="mt-2 text-xs text-gray-500">
                        {formatShortDate(notification.created_at, locale)}
                      </p>
                    </div>
                  </Link>
                ))}

                {visibleLatestAnnouncements.map((announcement) => (
                  <Link
                    key={`announcement-${announcement.id}`}
                    href={`/announcements/${encodeURIComponent(announcement.slug)}`}
                    onClick={(event) => { void openAnnouncement(event, announcement); }}
                    aria-disabled={notificationBusy}
                    className="flex gap-3 border-b border-slate-800 bg-[#111827] p-4 transition hover:bg-[#202b42]"
                  >
                    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#332b12] text-yellow-300">
                      <FaBullhorn />
                    </div>

                    <div className="min-w-0">
                      <p className="line-clamp-1 font-black text-white">
                        {announcement.title}
                      </p>

                      <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                        {announcement.summary ||
                          `${announcement.type} announcement`}
                      </p>

                      <p className="mt-2 text-xs text-gray-500">
                        {formatShortDate(
                          announcement.publish_at || announcement.created_at,
                          locale
                        )}
                      </p>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {showProfileDropdown && user && (
        <div
          className="fixed left-3 right-3 top-[128px] z-[99999] overflow-hidden rounded-2xl border border-slate-700 shadow-[0_20px_60px_rgba(0,0,0,0.95)] sm:left-auto sm:right-6 sm:top-[120px] sm:w-[300px] sm:max-w-[calc(100vw-2rem)] lg:top-[92px]"
          style={{
            backgroundColor: "#111827",
            opacity: 1,
            backdropFilter: "none",
          }}
        >
          <div className="border-b border-slate-700 bg-[#1b2436] p-5">
            <div className="flex items-center gap-4">
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.username || "User"}
                  width={56}
                  height={56}
                  unoptimized
                  className="h-14 w-14 rounded-full border border-cyan-400/30 object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-xl font-black text-black">
                  {getInitial(profile?.username || user.email)}
                </div>
              )}

              <div className="min-w-0">
                <p className="truncate font-black text-white">
                  {profile?.username || user.email?.split("@")[0] || "User"}
                </p>
                <p className="truncate text-xs text-gray-400">
                  {profile?.email || user.email}
                </p>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-700 bg-[#111827] p-4">
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-[#162b24] p-4">
              <div>
                <p className="text-xs font-bold text-gray-400">
                  {t("header.walletCredit")}
                </p>
                <p className="mt-1 text-lg font-black text-emerald-300">
                  {formatPrice(walletBalance)}
                </p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  {currency}
                </p>
              </div>
              <FaWallet className="text-2xl text-emerald-300" />
            </div>
          </div>

          <div className="grid gap-1 bg-[#111827] p-3">
            
                    <Link
                      href="/wallet"
                      onClick={() => setShowProfileDropdown(false)}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 font-bold text-gray-200 transition hover:bg-white/10 hover:text-white"
                    >
                      <FaWallet className="text-gray-300" />
                      {t("header.wallet")}
                    </Link>

                    <Link
                      href="/my-orders"
                      onClick={() => setShowProfileDropdown(false)}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 font-bold text-gray-200 transition hover:bg-white/10 hover:text-white"
                    >
                      <FaShoppingBag className="text-gray-300" />
                      {t("header.myOrders")}
                    </Link>

                    <Link
                      href="/resolution-center"
                      onClick={() => setShowProfileDropdown(false)}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 font-bold text-gray-200 transition hover:bg-white/10 hover:text-white"
                    >
                      <FaBalanceScale className="text-gray-300" />
                      {t("header.resolutionCenter")}
                    </Link>

                    <button
                      type="button"
                      onClick={() => setShowProfileSellingMenu((value) => !value)}
                      className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition ${
                        showProfileSellingMenu
                          ? "bg-white/10 text-white"
                          : "text-gray-200 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-3 font-bold">
                        <FaStore className="text-gray-300" />
                        {t("header.selling")}
                      </span>
                      <span className={`text-xs transition ${showProfileSellingMenu ? "rotate-180" : ""}`}>
                        v
                      </span>
                    </button>

                    {showProfileSellingMenu && (
                      <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-3">
                        <Link
                          href="/seller/apply"
                          onClick={() => setShowProfileDropdown(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-cyan-300"
                        >
                          {t("header.becomeSeller")}
                        </Link>
                        <Link
                          href="/seller"
                          onClick={() => setShowProfileDropdown(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-cyan-300"
                        >
                          {t("header.sellerDashboard")}
                        </Link>
                        <Link
                          href="/seller/products"
                          onClick={() => setShowProfileDropdown(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-cyan-300"
                        >
                          {t("header.manageProducts")}
                        </Link>
                        <Link
                          href="/seller/products/new"
                          onClick={() => setShowProfileDropdown(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-cyan-300"
                        >
                          {t("header.createProduct")}
                        </Link>
                        <Link
                          href="/seller/orders"
                          onClick={() => setShowProfileDropdown(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-cyan-300"
                        >
                          {t("header.manageOrders")}
                        </Link>
                        <Link
                          href="/wallet"
                          onClick={() => setShowProfileDropdown(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-cyan-300"
                        >
                          {t("header.payment")}
                        </Link>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowProfileSettingsMenu((value) => !value)}
                      className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition ${
                        showProfileSettingsMenu
                          ? "bg-white/10 text-white"
                          : "text-gray-200 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-3 font-bold">
                        <FaCog className="text-gray-300" />
                        {t("header.settings")}
                      </span>
                      <span className={`text-xs transition ${showProfileSettingsMenu ? "rotate-180" : ""}`}>
                        v
                      </span>
                    </button>

                    {showProfileSettingsMenu && (
                      <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-3">
                        <Link
                          href="/account"
                          onClick={() => setShowProfileDropdown(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-cyan-300"
                        >
                          {t("header.account")}
                        </Link>
                        <Link
                          href="/account/connects"
                          onClick={() => setShowProfileDropdown(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-cyan-300"
                        >
                          {t("header.socialConnect")}
                        </Link>
                        <Link
                          href="/account/security"
                          onClick={() => setShowProfileDropdown(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-cyan-300"
                        >
                          {t("header.privacySecurity")}
                        </Link>
                        <Link
                          href="/account/verification"
                          onClick={() => setShowProfileDropdown(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-cyan-300"
                        >
                          {t("header.verification")}
                        </Link>
                      </div>
                    )}

                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-black text-red-300 transition hover:bg-red-500/10"
                    >
                      <FaSignOutAlt />
                      {t("header.logout")}
                    </button>

          </div>
        </div>
      )}

      {chatToast && user && (
        <button
          onClick={() => {
            setChatToast(null);
            router.push(`/chat?room=${chatToast.room_id}`);
          }}
          className="fixed bottom-4 left-3 right-3 z-[10001] rounded-2xl border border-cyan-400/30 bg-[#111827] p-4 text-left shadow-[0_20px_60px_rgba(0,0,0,0.95)] transition hover:border-cyan-300 hover:bg-[#182238] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[360px] sm:max-w-[calc(100vw-2rem)]"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-400 font-black text-black">
              {getInitial(chatToast.sender_name)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate font-black text-white">
                  {chatToast.sender_name}
                </p>
                <span className="text-xs font-bold text-cyan-300">
                  {t("header.newChat")}
                </span>
              </div>

              <p className="mt-1 line-clamp-2 text-sm text-gray-300">
                {chatToast.message || t("header.sentMessage")}
              </p>

              <p className="mt-2 text-xs font-bold text-cyan-300">
                {t("header.openConversation")}
              </p>
            </div>

            <span
              onClick={(event) => {
                event.stopPropagation();
                setChatToast(null);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-sm font-black text-gray-400 hover:bg-white hover:text-black"
            >
              x
            </span>
          </div>
        </button>
      )}

      <AuthModal
        open={showAuthModal}
        initialMode={authMode}
        onClose={closeAuthModal}
      />
    </>
  );
}

export default function MainHeader() {
  const pathname = usePathname();

  if (
    pathname?.startsWith("/cpcommunity") ||
    pathname?.startsWith("/comeplayers") ||
    pathname?.startsWith("/messages")
  ) return null;

  return <MainHeaderContent />;
}

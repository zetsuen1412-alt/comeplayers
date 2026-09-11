"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
};

type Notification = {
  id: number;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
};

const typeFilters = [
  "all",
  "order",
  "payment",
  "review",
  "follower",
  "dispute",
  "seller",
  "system",
];

function getTypeClass(type: string) {
  if (type === "order") return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
  if (type === "payment") return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  if (type === "review") return "border-purple-400/20 bg-purple-400/10 text-purple-300";
  if (type === "follower") return "border-green-400/20 bg-green-400/10 text-green-300";
  if (type === "dispute") return "border-orange-400/20 bg-orange-400/10 text-orange-300";
  if (type === "seller") return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  return "border-white/10 bg-white/[0.04] text-gray-300";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminNotificationCenterV1Page() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredNotifications = useMemo(() => {
    const query = search.trim().toLowerCase();

    return notifications.filter((notification) => {
      const matchesType =
        activeType === "all" || notification.type === activeType;

      const matchesSearch =
        !query ||
        notification.title.toLowerCase().includes(query) ||
        (notification.message || "").toLowerCase().includes(query) ||
        notification.type.toLowerCase().includes(query) ||
        notification.user_id.toLowerCase().includes(query) ||
        String(notification.id).includes(query);

      return matchesType && matchesSearch;
    });
  }, [notifications, activeType, search]);

  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const orderCount = notifications.filter((item) => item.type === "order").length;
  const paymentCount = notifications.filter((item) => item.type === "payment").length;
  const reviewCount = notifications.filter((item) => item.type === "review").length;
  const followerCount = notifications.filter((item) => item.type === "follower").length;

  async function loadNotifications() {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setNotifications(data || []);
  }

  useEffect(() => {
    async function initializePage() {
      setLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError) {
        alert(userError.message);
        setLoading(false);
        return;
      }

      if (!userData.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(userData.user);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,username,role")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError) {
        alert(profileError.message);
        setLoading(false);
        return;
      }

      setAdminProfile(profileData || null);

      if (profileData?.role?.trim().toLowerCase() === "admin") {
        await loadNotifications();
      }

      setLoading(false);
    }

    initializePage();
  }, []);

  async function markAsRead(notificationId: number) {
    setUpdatingId(notificationId);

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (error) {
      alert(error.message);
      setUpdatingId(null);
      return;
    }

    await loadNotifications();
    setUpdatingId(null);
  }

  async function markAsUnread(notificationId: number) {
    setUpdatingId(notificationId);

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: false })
      .eq("id", notificationId);

    if (error) {
      alert(error.message);
      setUpdatingId(null);
      return;
    }

    await loadNotifications();
    setUpdatingId(null);
  }

  async function markAllAsRead() {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false);

    if (error) {
      alert(error.message);
      return;
    }

    await loadNotifications();
  }

  async function deleteNotification(notificationId: number) {
    if (!confirm("Delete this notification?")) return;

    setUpdatingId(notificationId);

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId);

    if (error) {
      alert(error.message);
      setUpdatingId(null);
      return;
    }

    await loadNotifications();
    setUpdatingId(null);
  }

  async function clearReadNotifications() {
    if (!confirm("Delete all read notifications?")) return;

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("is_read", true);

    if (error) {
      alert(error.message);
      return;
    }

    await loadNotifications();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading admin notifications...
        </p>
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Access Denied</h1>

          <p className="mt-4 text-gray-300">
            Only admin accounts can access notification center.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-purple-400/30 bg-purple-400/10 px-4 py-2 text-sm font-black text-purple-300">
              Admin Notification Center
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Notifications
            </h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Monitor marketplace notification activity across orders, payments,
              reviews, followers, disputes, sellers, and system events.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black transition hover:bg-cyan-300 disabled:opacity-50"
            >
              Mark All Read
            </button>

            <Link
              href="/admin"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Admin Home
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {notifications.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Unread</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {unreadCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Orders</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {orderCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Payments</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {paymentCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Reviews</p>
            <p className="mt-2 text-3xl font-black text-purple-300">
              {reviewCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Followers</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {followerCount}
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notifications by title, message, user ID, type, or notification ID..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="flex flex-wrap gap-3">
            {typeFilters.map((type) => (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  activeType === type
                    ? "bg-cyan-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-cyan-400 hover:text-white"
                }`}
              >
                {type === "all" ? "All" : type}
              </button>
            ))}
          </div>
        </div>

        {notifications.some((item) => item.is_read) && (
          <div className="mb-8">
            <button
              onClick={clearReadNotifications}
              className="rounded-full border border-red-400/40 px-5 py-3 font-bold text-red-300 transition hover:bg-red-500 hover:text-white"
            >
              Clear Read Notifications
            </button>
          </div>
        )}

        {filteredNotifications.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">No notifications found.</h2>

            <p className="mt-3 text-gray-400">
              System notifications will appear here after marketplace activity.
            </p>
          </div>
        ) : (
          <div className="grid gap-5">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-3xl border p-6 shadow-2xl shadow-black/20 ${
                  notification.is_read
                    ? "border-white/10 bg-white/[0.035]"
                    : "border-cyan-400/30 bg-cyan-400/10"
                }`}
              >
                <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${getTypeClass(
                          notification.type
                        )}`}
                      >
                        {notification.type}
                      </span>

                      {!notification.is_read && (
                        <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-black text-yellow-300">
                          Unread
                        </span>
                      )}

                      <span className="text-sm text-gray-500">
                        #{notification.id}
                      </span>

                      <span className="text-sm text-gray-500">
                        {formatDate(notification.created_at)}
                      </span>
                    </div>

                    <h2 className="mt-4 text-2xl font-black">
                      {notification.title}
                    </h2>

                    <p className="mt-3 leading-7 text-gray-300">
                      {notification.message || "No message."}
                    </p>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs text-gray-500">User ID</p>
                      <p className="mt-1 break-words text-sm font-bold text-gray-300">
                        {notification.user_id}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {notification.link_url && (
                      <Link
                        href={notification.link_url}
                        className="rounded-2xl bg-cyan-400 px-5 py-3 text-center font-black text-black transition hover:bg-cyan-300"
                      >
                        Open Link
                      </Link>
                    )}

                    {notification.is_read ? (
                      <button
                        onClick={() => markAsUnread(notification.id)}
                        disabled={updatingId === notification.id}
                        className="rounded-2xl border border-yellow-400/40 px-5 py-3 font-black text-yellow-300 transition hover:bg-yellow-400 hover:text-black disabled:opacity-60"
                      >
                        Mark Unread
                      </button>
                    ) : (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        disabled={updatingId === notification.id}
                        className="rounded-2xl border border-green-400/40 px-5 py-3 font-black text-green-300 transition hover:bg-green-400 hover:text-black disabled:opacity-60"
                      >
                        Mark Read
                      </button>
                    )}

                    <button
                      onClick={() => deleteNotification(notification.id)}
                      disabled={updatingId === notification.id}
                      className="rounded-2xl border border-red-400/40 px-5 py-3 font-black text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-60"
                    >
                      Delete
                    </button>

                    {updatingId === notification.id && (
                      <p className="text-center text-sm text-gray-400">
                        Updating...
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
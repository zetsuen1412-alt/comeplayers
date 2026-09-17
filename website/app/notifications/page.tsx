"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaBell, FaCheckDouble } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

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

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID");
}

export default function NotificationsPage() {
  const { formatPrice, currency } = useCurrency();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadNotifications() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id,user_id,type,title,message,link_url,is_read,created_at")
      .eq("user_id", userData.user.id)
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setNotifications(data || []);
    setLoading(false);
  }

  async function markAsRead(id: number) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    await loadNotifications();
  }

  async function markAllAsRead() {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) return;

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userData.user.id)
      .eq("is_read", false);

    await loadNotifications();
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-12 text-white">
      <section className="mx-auto max-w-5xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Notification Center
            </p>

            <h1 className="mt-5 text-5xl font-black">Notifications</h1>
          </div>

          <button
            onClick={markAllAsRead}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-400 px-5 py-3 font-black text-cyan-300 hover:bg-cyan-400 hover:text-black"
          >
            <FaCheckDouble />
            Mark all as read
          </button>
        </div>

        <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-[#0b1020]">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="p-10 text-center">
              <FaBell className="mx-auto text-5xl text-gray-600" />
              <p className="mt-4 text-gray-400">No notifications yet.</p>
            </div>
          ) : (
            notifications.map((item) => (
              <Link
                key={item.id}
                href={item.link_url || "#"}
                onClick={() => markAsRead(item.id)}
                className={`block border-b border-white/10 p-5 transition hover:bg-white/[0.04] ${
                  item.is_read ? "bg-[#0b1020]" : "bg-cyan-400/10"
                }`}
              >
                <div className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300">
                    <FaBell />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-black text-white">{item.title}</h2>

                      {!item.is_read && (
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                      )}
                    </div>

                    <p className="mt-1 text-sm text-gray-300">
                      {item.message || item.type}
                    </p>

                    <p className="mt-2 text-xs text-gray-500">
                      {formatDate(item.created_at)}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
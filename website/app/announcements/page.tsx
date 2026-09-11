"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Announcement = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  type: string;
  priority: string;
  status: string;
  is_pinned: boolean;
  image_url: string | null;
  link_url: string | null;
  publish_at: string | null;
  expire_at: string | null;
  created_at: string;
  updated_at: string;
};

const typeFilters = [
  "all",
  "general",
  "maintenance",
  "promo",
  "flash_sale",
  "wallet",
  "payment",
  "security",
  "seller",
  "system",
];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function getPriorityClass(priority: string) {
  if (priority === "urgent") return "border-red-400/20 bg-red-400/10 text-red-300";
  if (priority === "high") return "border-orange-400/20 bg-orange-400/10 text-orange-300";
  if (priority === "normal") return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
  return "border-white/10 bg-white/[0.04] text-gray-300";
}

function getTypeClass(type: string) {
  if (type === "security") return "border-red-400/20 bg-red-400/10 text-red-300";
  if (type === "maintenance" || type === "system") return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  if (type === "promo" || type === "flash_sale") return "border-purple-400/20 bg-purple-400/10 text-purple-300";
  if (type === "wallet" || type === "payment") return "border-green-400/20 bg-green-400/10 text-green-300";
  return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
}

function isVisibleAnnouncement(item: Announcement) {
  const now = Date.now();

  if (item.status !== "published") return false;

  if (item.publish_at && new Date(item.publish_at).getTime() > now) {
    return false;
  }

  if (item.expire_at && new Date(item.expire_at).getTime() < now) {
    return false;
  }

  return true;
}

export default function AnnouncementPageV1() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState("all");
  const [search, setSearch] = useState("");

  const visibleAnnouncements = useMemo(() => {
    return announcements.filter(isVisibleAnnouncement);
  }, [announcements]);

  const filteredAnnouncements = useMemo(() => {
    const query = search.trim().toLowerCase();

    return visibleAnnouncements.filter((item) => {
      const matchesType = activeType === "all" || item.type === activeType;

      const matchesSearch =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.slug.toLowerCase().includes(query) ||
        (item.summary || "").toLowerCase().includes(query) ||
        item.content.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        item.priority.toLowerCase().includes(query);

      return matchesType && matchesSearch;
    });
  }, [visibleAnnouncements, activeType, search]);

  const pinnedAnnouncements = filteredAnnouncements.filter((item) => item.is_pinned);
  const normalAnnouncements = filteredAnnouncements.filter((item) => !item.is_pinned);

  const urgentCount = visibleAnnouncements.filter((item) => item.priority === "urgent").length;
  const pinnedCount = visibleAnnouncements.filter((item) => item.is_pinned).length;

  async function loadAnnouncements() {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("status", "published")
      .order("is_pinned", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setAnnouncements(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAnnouncements();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading announcements...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(250,204,21,.18),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-300">
              Announcement Center
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Announcements
            </h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Marketplace updates, maintenance notices, promo events, wallet
              information, security alerts, and system news.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/support"
              className="inline-flex h-12 items-center justify-center rounded-full border border-purple-400 px-6 font-bold text-purple-300 transition hover:bg-purple-400 hover:text-black"
            >
              Support
            </Link>

            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Home
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-6">
            <p className="text-sm text-gray-300">Published</p>
            <p className="mt-2 text-4xl font-black text-cyan-300">
              {visibleAnnouncements.length}
            </p>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-6">
            <p className="text-sm text-gray-300">Pinned</p>
            <p className="mt-2 text-4xl font-black text-yellow-300">
              {pinnedCount}
            </p>
          </div>

          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6">
            <p className="text-sm text-gray-300">Urgent</p>
            <p className="mt-2 text-4xl font-black text-red-300">
              {urgentCount}
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search announcements by title, type, priority, or content..."
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

        {filteredAnnouncements.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">No announcements found.</h2>
            <p className="mt-3 text-gray-400">
              There are no published announcements matching your search.
            </p>
          </div>
        ) : (
          <div className="grid gap-8">
            {pinnedAnnouncements.length > 0 && (
              <section>
                <h2 className="mb-5 text-3xl font-black text-yellow-300">
                  Pinned Announcements
                </h2>

                <div className="grid gap-6">
                  {pinnedAnnouncements.map((item) => (
                    <AnnouncementCard key={item.id} item={item} pinned />
                  ))}
                </div>
              </section>
            )}

            {normalAnnouncements.length > 0 && (
              <section>
                <h2 className="mb-5 text-3xl font-black">
                  Latest Announcements
                </h2>

                <div className="grid gap-6 md:grid-cols-2">
                  {normalAnnouncements.map((item) => (
                    <AnnouncementCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function AnnouncementCard({
  item,
  pinned,
}: {
  item: Announcement;
  pinned?: boolean;
}) {
  return (
    <Link
      href={`/announcements/${item.slug}`}
      className={`group overflow-hidden rounded-3xl border bg-white/[0.035] shadow-2xl shadow-black/30 transition hover:-translate-y-1 hover:border-cyan-400 ${
        pinned ? "border-yellow-400/30" : "border-white/10"
      }`}
    >
      {item.image_url && (
        <div className="flex h-56 items-center justify-center overflow-hidden bg-black">
          <img
            src={item.image_url}
            alt={item.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        </div>
      )}

      <div className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          {pinned && (
            <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-black text-yellow-300">
              pinned
            </span>
          )}

          <span
            className={`rounded-full border px-3 py-1 text-xs font-black ${getTypeClass(
              item.type
            )}`}
          >
            {item.type}
          </span>

          <span
            className={`rounded-full border px-3 py-1 text-xs font-black ${getPriorityClass(
              item.priority
            )}`}
          >
            {item.priority}
          </span>
        </div>

        <h2 className="mt-4 text-3xl font-black group-hover:text-cyan-300">
          {item.title}
        </h2>

        <p className="mt-4 line-clamp-3 leading-7 text-gray-300">
          {item.summary || item.content}
        </p>

        <p className="mt-5 text-sm text-gray-500">
          Published: {formatDate(item.publish_at || item.created_at)}
        </p>
      </div>
    </Link>
  );
}
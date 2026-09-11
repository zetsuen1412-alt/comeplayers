"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
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

export default function AnnouncementDetailPageV1() {
  const params = useParams();
  const slug = String(params.slug || "");

  const [user, setUser] = useState<User | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [readSaved, setReadSaved] = useState(false);

  const paragraphs = useMemo(() => {
    return (announcement?.content || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }, [announcement]);

  async function loadAnnouncement() {
    const { data: userData } = await supabase.auth.getUser();
    const currentUser = userData.user || null;
    setUser(currentUser);

    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    if (!data || !isVisibleAnnouncement(data as Announcement)) {
      setAnnouncement(null);
      setLoading(false);
      return;
    }

    setAnnouncement(data as Announcement);
    setLoading(false);

    if (currentUser) {
      await markAsRead((data as Announcement).id, currentUser.id);
    }
  }

  async function markAsRead(announcementId: number, userId: string) {
    const { error } = await supabase.from("announcement_reads").upsert(
      {
        announcement_id: announcementId,
        user_id: userId,
        read_at: new Date().toISOString(),
      },
      {
        onConflict: "announcement_id,user_id",
      }
    );

    if (!error) {
      setReadSaved(true);
    }
  }

  useEffect(() => {
    if (slug) {
      loadAnnouncement();
    }
  }, [slug]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading announcement...</p>
      </main>
    );
  }

  if (!announcement) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">
            Announcement Not Found
          </h1>

          <p className="mt-4 text-gray-300">
            This announcement may be unpublished, expired, or deleted.
          </p>

          <Link
            href="/announcements"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Back to Announcements
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(250,204,21,.18),transparent_34%)]" />

        <div className="relative z-10 mx-auto max-w-5xl">
          <Link
            href="/announcements"
            className="mb-8 inline-flex rounded-full border border-white/10 px-5 py-3 font-bold text-gray-300 transition hover:bg-white hover:text-black"
          >
            ← Back to Announcements
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            {announcement.is_pinned && (
              <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-black text-yellow-300">
                pinned
              </span>
            )}

            <span
              className={`rounded-full border px-3 py-1 text-xs font-black ${getTypeClass(
                announcement.type
              )}`}
            >
              {announcement.type}
            </span>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-black ${getPriorityClass(
                announcement.priority
              )}`}
            >
              {announcement.priority}
            </span>

            {readSaved && (
              <span className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-xs font-black text-green-300">
                read
              </span>
            )}
          </div>

          <h1 className="mt-6 text-5xl font-black md:text-7xl">
            {announcement.title}
          </h1>

          {announcement.summary && (
            <p className="mt-6 max-w-4xl text-xl leading-8 text-gray-300">
              {announcement.summary}
            </p>
          )}

          <p className="mt-5 text-sm text-gray-500">
            Published: {formatDate(announcement.publish_at || announcement.created_at)}
            {" · "}
            Updated: {formatDate(announcement.updated_at)}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-8 py-10">
        {announcement.image_url && (
          <div className="mb-8 overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl shadow-black/30">
            <img
              src={announcement.image_url}
              alt={announcement.title}
              className="max-h-[520px] w-full object-cover"
            />
          </div>
        )}

        <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 shadow-2xl shadow-black/30">
          {paragraphs.length === 0 ? (
            <p className="text-gray-300">No announcement content.</p>
          ) : (
            <div className="space-y-5">
              {paragraphs.map((paragraph, index) => (
                <p
                  key={`${paragraph}-${index}`}
                  className="whitespace-pre-line text-lg leading-9 text-gray-200"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          )}

          {announcement.link_url && (
            <a
              href={announcement.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex rounded-full bg-cyan-400 px-6 py-3 font-black text-black transition hover:bg-cyan-300"
            >
              Open Related Link
            </a>
          )}
        </article>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/support"
            className="inline-flex h-12 items-center justify-center rounded-full border border-purple-400 px-6 font-bold text-purple-300 transition hover:bg-purple-400 hover:text-black"
          >
            Contact Support
          </Link>

          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            Back to Home
          </Link>
        </div>
      </section>
    </main>
  );
}
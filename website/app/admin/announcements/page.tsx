"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import { adminLabel, adminText } from "@/lib/adminLocale";
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
  seller_name: string | null;
  avatar_url: string | null;
};

type AnnouncementType =
  | "general"
  | "maintenance"
  | "promo"
  | "flash_sale"
  | "wallet"
  | "payment"
  | "security"
  | "seller"
  | "system";

type AnnouncementPriority = "low" | "normal" | "high" | "urgent";
type AnnouncementStatus = "draft" | "published" | "archived";

type Announcement = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  is_pinned: boolean;
  image_url: string | null;
  link_url: string | null;
  publish_at: string | null;
  expire_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profiles: Profile | null;
};

const typeOptions: AnnouncementType[] = [
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

const priorityOptions: AnnouncementPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

const statusOptions: AnnouncementStatus[] = [
  "draft",
  "published",
  "archived",
];

const filterOptions = ["all", "draft", "published", "archived", "pinned"];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function toDatetimeLocal(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);

  return localDate.toISOString().slice(0, 16);
}

function createSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getStatusClass(status: string) {
  if (status === "published") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  if (status === "draft") {
    return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  }

  if (status === "archived") {
    return "border-gray-400/20 bg-gray-400/10 text-gray-300";
  }

  return "border-white/10 bg-white/[0.04] text-gray-300";
}

function getPriorityClass(priority: string) {
  if (priority === "urgent") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  if (priority === "high") {
    return "border-orange-400/20 bg-orange-400/10 text-orange-300";
  }

  if (priority === "normal") {
    return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
  }

  return "border-white/10 bg-white/[0.04] text-gray-300";
}

function getTypeClass(type: string) {
  if (type === "security") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  if (type === "maintenance" || type === "system") {
    return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  }

  if (type === "promo" || type === "flash_sale") {
    return "border-purple-400/20 bg-purple-400/10 text-purple-300";
  }

  if (type === "wallet" || type === "payment") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
}

function isExpired(announcement: Announcement) {
  if (!announcement.expire_at) return false;
  return new Date(announcement.expire_at).getTime() < Date.now();
}

function isScheduled(announcement: Announcement) {
  if (!announcement.publish_at) return false;
  return new Date(announcement.publish_at).getTime() > Date.now();
}

export default function AdminAnnouncementManagerV1Page() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeType, setActiveType] = useState("all");

  const [editingId, setEditingId] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<AnnouncementType>("general");
  const [priority, setPriority] = useState<AnnouncementPriority>("normal");
  const [status, setStatus] = useState<AnnouncementStatus>("draft");
  const [isPinned, setIsPinned] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [expireAt, setExpireAt] = useState("");

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredAnnouncements = useMemo(() => {
    const query = search.trim().toLowerCase();

    return announcements.filter((item) => {
      const matchesFilter =
        activeFilter === "all" ||
        item.status === activeFilter ||
        (activeFilter === "pinned" && item.is_pinned);

      const matchesType = activeType === "all" || item.type === activeType;

      const matchesSearch =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.slug.toLowerCase().includes(query) ||
        (item.summary || "").toLowerCase().includes(query) ||
        item.content.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        item.priority.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query) ||
        String(item.id).includes(query);

      return matchesFilter && matchesType && matchesSearch;
    });
  }, [announcements, search, activeFilter, activeType]);

  const publishedCount = announcements.filter(
    (item) => item.status === "published"
  ).length;

  const draftCount = announcements.filter((item) => item.status === "draft").length;

  const archivedCount = announcements.filter(
    (item) => item.status === "archived"
  ).length;

  const pinnedCount = announcements.filter((item) => item.is_pinned).length;

  const urgentCount = announcements.filter(
    (item) => item.priority === "urgent"
  ).length;

  async function loadAnnouncements() {
    const { data, error } = await supabase
      .from("announcements")
      .select(
        `
        *,
        profiles:created_by (
          id,
          email,
          username,
          role,
          seller_name,
          avatar_url
        )
      `
      )
      .order("is_pinned", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      alert(adminText(error.message));
      return;
    }

    setAnnouncements((data || []) as unknown as Announcement[]);
  }

  useEffect(() => {
    async function initializePage() {
      setLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError) {
        alert(adminText(userError.message));
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
        .select("id,email,username,role,seller_name,avatar_url")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError) {
        alert(adminText(profileError.message));
        setLoading(false);
        return;
      }

      setAdminProfile(profileData || null);

      if (profileData?.role?.trim().toLowerCase() === "admin") {
        await loadAnnouncements();
      }

      setLoading(false);
    }

    initializePage();
  }, []);
  useLiveRefresh(async () => { await loadAnnouncements(); }, { topics: 'admin' });

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setSummary("");
    setContent("");
    setType("general");
    setPriority("normal");
    setStatus("draft");
    setIsPinned(false);
    setImageUrl("");
    setLinkUrl("");
    setPublishAt("");
    setExpireAt("");
  }

  function startEdit(item: Announcement) {
    setEditingId(item.id);
    setTitle(item.title || "");
    setSlug(item.slug || "");
    setSummary(item.summary || "");
    setContent(item.content || "");
    setType(item.type || "general");
    setPriority(item.priority || "normal");
    setStatus(item.status || "draft");
    setIsPinned(Boolean(item.is_pinned));
    setImageUrl(item.image_url || "");
    setLinkUrl(item.link_url || "");
    setPublishAt(toDatetimeLocal(item.publish_at));
    setExpireAt(toDatetimeLocal(item.expire_at));

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleTitleChange(value: string) {
    setTitle(value);

    if (!editingId) {
      setSlug(createSlug(value));
    }
  }

  function buildPayload() {
    return {
      title: title.trim(),
      slug: createSlug(slug || title),
      summary: summary.trim() || null,
      content: content.trim(),
      type,
      priority,
      status,
      is_pinned: isPinned,
      image_url: imageUrl.trim() || null,
      link_url: linkUrl.trim() || null,
      publish_at: publishAt ? new Date(publishAt).toISOString() : null,
      expire_at: expireAt ? new Date(expireAt).toISOString() : null,
      created_by: user?.id || null,
      updated_at: new Date().toISOString(),
    };
  }

  async function saveAnnouncement(event: React.FormEvent) {
    event.preventDefault();

    if (!user) return;

    const finalSlug = createSlug(slug || title);

    if (!title.trim()) {
      alert("Judul wajib diisi.");
      return;
    }

    if (!finalSlug) {
      alert("Alamat singkat wajib diisi.");
      return;
    }

    if (!content.trim()) {
      alert("Isi pengumuman wajib diisi.");
      return;
    }

    if (
      publishAt &&
      expireAt &&
      new Date(expireAt).getTime() <= new Date(publishAt).getTime()
    ) {
      alert("Tanggal berakhir harus setelah tanggal terbit.");
      return;
    }

    setSaving(true);

    const payload = buildPayload();

    if (editingId) {
      const { error } = await supabase
        .from("announcements")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        alert(adminText(error.message));
        setSaving(false);
        return;
      }

      alert("Pengumuman diperbarui.");
    } else {
      const { error } = await supabase.from("announcements").insert({
        ...payload,
        created_by: user.id,
      });

      if (error) {
        alert(adminText(error.message));
        setSaving(false);
        return;
      }

      alert("Pengumuman dibuat.");
    }

    await loadAnnouncements();
    resetForm();
    setSaving(false);
  }

  async function quickStatus(
    item: Announcement,
    nextStatus: AnnouncementStatus
  ) {
    setUpdatingId(item.id);

    const { error } = await supabase
      .from("announcements")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      alert(adminText(error.message));
      setUpdatingId(null);
      return;
    }

    await loadAnnouncements();
    setUpdatingId(null);
  }

  async function togglePinned(item: Announcement) {
    setUpdatingId(item.id);

    const { error } = await supabase
      .from("announcements")
      .update({
        is_pinned: !item.is_pinned,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      alert(adminText(error.message));
      setUpdatingId(null);
      return;
    }

    await loadAnnouncements();
    setUpdatingId(null);
  }

  async function deleteAnnouncement(item: Announcement) {
    if (!confirm(`Hapus pengumuman "${item.title}"?`)) return;

    setUpdatingId(item.id);

    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", item.id);

    if (error) {
      alert(adminText(error.message));
      setUpdatingId(null);
      return;
    }

    await loadAnnouncements();
    setUpdatingId(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Memuat pengelola pengumuman...
        </p>
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Akses Ditolak</h1>

          <p className="mt-4 text-gray-300">
            Hanya akun admin yang dapat mengakses pengelola pengumuman.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Kembali ke Beranda
          </Link>
        </div>
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
              Pengelola Pengumuman Admin
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Pengumuman
            </h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Terbitkan berita platform, pemberitahuan pemeliharaan, promosi, peringatan keamanan, informasi dompet, dan pengumuman penjual.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Masuk sebagai {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/announcements"
              className="inline-flex h-12 items-center justify-center rounded-full border border-yellow-400 px-6 font-bold text-yellow-300 transition hover:bg-yellow-400 hover:text-black"
            >
              Halaman Publik
            </Link>

            <Link
              href="/admin"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Beranda Admin
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {announcements.length}
            </p>
          </div>

          <div className="rounded-3xl border border-green-400/20 bg-green-400/10 p-5">
            <p className="text-sm text-gray-300">Diterbitkan</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {publishedCount}
            </p>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <p className="text-sm text-gray-300">Draf</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {draftCount}
            </p>
          </div>

          <div className="rounded-3xl border border-purple-400/20 bg-purple-400/10 p-5">
            <p className="text-sm text-gray-300">Disematkan</p>
            <p className="mt-2 text-3xl font-black text-purple-300">
              {pinnedCount}
            </p>
          </div>

          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-5">
            <p className="text-sm text-gray-300">Mendesak</p>
            <p className="mt-2 text-3xl font-black text-red-300">
              {urgentCount}
            </p>
          </div>
        </div>

        <form
          onSubmit={saveAnnouncement}
          className="mb-10 rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-7 shadow-2xl shadow-black/30"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-black text-yellow-300">
                {editingId ? "Ubah Pengumuman" : "Buat Pengumuman"}
              </h2>

              <p className="mt-2 text-sm text-gray-300">
                Tulis pengumuman platform untuk pengguna dan penjual.
              </p>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-white/10 px-5 py-2 font-bold text-gray-300 hover:bg-white hover:text-black"
              >
                Batalkan Perubahan
              </button>
            )}
          </div>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Judul
              </label>
              <input
                value={title}
                onChange={(event) => handleTitleChange(event.target.value)}
                placeholder={"Contoh: Pemberitahuan Pemeliharaan Dompet"}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Alamat Singkat
              </label>
              <input
                value={slug}
                onChange={(event) => setSlug(createSlug(event.target.value))}
                placeholder="wallet-maintenance-notice"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Jenis
              </label>
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as AnnouncementType)
                }
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-yellow-400"
              >
                {typeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Prioritas
              </label>
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as AnnouncementPriority)
                }
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-yellow-400"
              >
                {priorityOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Status
              </label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as AnnouncementStatus)
                }
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-yellow-400"
              >
                {statusOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black px-5 py-4">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(event) => setIsPinned(event.target.checked)}
                className="h-5 w-5"
              />
              <span className="font-black text-yellow-300">Disematkan</span>
            </label>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-bold text-gray-300">
              Ringkasan
            </label>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={"Ringkasan singkat pengumuman..."}
              rows={3}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
            />
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-bold text-gray-300">
              Isi
            </label>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={"Tulis isi lengkap pengumuman..."}
              rows={10}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
            />
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                URL Gambar
              </label>
              <input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder={"URL gambar (opsional)"}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                URL Tautan
              </label>
              <input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder={"Tautan internal/eksternal (opsional)"}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Waktu Terbit
              </label>
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(event) => setPublishAt(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Waktu Berakhir
              </label>
              <input
                type="datetime-local"
                value={expireAt}
                onChange={(event) => setExpireAt(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-yellow-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-7 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-black text-black transition hover:bg-yellow-300 disabled:opacity-60"
          >
            {saving
              ? "Menyimpan Pengumuman..."
              : editingId
              ? "Perbarui Pengumuman"
              : "Buat Pengumuman"}
          </button>
        </form>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={"Cari pengumuman berdasarkan judul, alamat singkat, jenis, prioritas, status, atau isi..."}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="flex flex-wrap gap-3">
            {filterOptions.map((item) => (
              <button
                key={item}
                onClick={() => setActiveFilter(item)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  activeFilter === item
                    ? "bg-cyan-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-cyan-400 hover:text-white"
                }`}
              >
                {item === "all" ? "Semua" : item}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-3">
          {["all", ...typeOptions].map((item) => (
            <button
              key={item}
              onClick={() => setActiveType(item)}
              className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                activeType === item
                  ? "bg-yellow-400 text-black"
                  : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-yellow-400 hover:text-white"
              }`}
            >
              {item === "all" ? "Semua Jenis" : item}
            </button>
          ))}
        </div>

        {filteredAnnouncements.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">Tidak ada pengumuman ditemukan.</h2>

            <p className="mt-3 text-gray-400">
              Buat pengumuman pertama melalui formulir di atas.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredAnnouncements.map((item) => {
              const expired = isExpired(item);
              const scheduled = isScheduled(item);

              return (
                <div
                  key={item.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
                >
                  <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        {item.is_pinned && (
                          <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-black text-yellow-300">
                            disematkan
                          </span>
                        )}

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(
                            item.status
                          )}`}
                        >
                          {adminLabel(item.status)}
                        </span>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getPriorityClass(
                            item.priority
                          )}`}
                        >
                          {item.priority}
                        </span>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getTypeClass(
                            item.type
                          )}`}
                        >
                          {adminLabel(item.type)}
                        </span>

                        {scheduled && (
                          <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-black text-blue-300">
                            terjadwal
                          </span>
                        )}

                        {expired && (
                          <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs font-black text-red-300">
                            kedaluwarsa
                          </span>
                        )}

                        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-black text-gray-300">
                          #{item.id}
                        </span>
                      </div>

                      <h2 className="mt-4 text-3xl font-black">{item.title}</h2>

                      <p className="mt-2 text-sm text-gray-500">/{item.slug}</p>

                      {item.summary && (
                        <p className="mt-4 leading-7 text-gray-300">
                          {item.summary}
                        </p>
                      )}

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Waktu Terbit</p>
                          <p className="mt-1 font-black">
                            {formatDate(item.publish_at)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Waktu Berakhir</p>
                          <p className="mt-1 font-black">
                            {formatDate(item.expire_at)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Dibuat</p>
                          <p className="mt-1 font-black">
                            {formatDate(item.created_at)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Diperbarui</p>
                          <p className="mt-1 font-black">
                            {formatDate(item.updated_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => startEdit(item)}
                        disabled={updatingId === item.id}
                        className="rounded-2xl bg-cyan-400 px-5 py-3 font-black text-black hover:bg-cyan-300 disabled:opacity-60"
                      >
                        Ubah
                      </button>

                      <button
                        onClick={() => quickStatus(item, "published")}
                        disabled={updatingId === item.id}
                        className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white hover:bg-green-400 disabled:opacity-60"
                      >
                        Terbitkan
                      </button>

                      <button
                        onClick={() => quickStatus(item, "draft")}
                        disabled={updatingId === item.id}
                        className="rounded-2xl bg-yellow-400 px-5 py-3 font-black text-black hover:bg-yellow-300 disabled:opacity-60"
                      >
                        Draf
                      </button>

                      <button
                        onClick={() => quickStatus(item, "archived")}
                        disabled={updatingId === item.id}
                        className="rounded-2xl bg-gray-500 px-5 py-3 font-black text-white hover:bg-gray-400 disabled:opacity-60"
                      >
                        Arsipkan
                      </button>

                      <button
                        onClick={() => togglePinned(item)}
                        disabled={updatingId === item.id}
                        className="rounded-2xl border border-yellow-400 px-5 py-3 font-black text-yellow-300 hover:bg-yellow-400 hover:text-black disabled:opacity-60"
                      >
                        {item.is_pinned ? "Lepas Sematan" : "Sematkan"}
                      </button>

                      {item.status === "published" && (
                        <Link
                          href={`/announcements/${item.slug}`}
                          className="rounded-2xl border border-cyan-400 px-5 py-3 text-center font-black text-cyan-300 hover:bg-cyan-400 hover:text-black"
                        >
                          Lihat Halaman Publik
                        </Link>
                      )}

                      <button
                        onClick={() => deleteAnnouncement(item)}
                        disabled={updatingId === item.id}
                        className="rounded-2xl border border-red-400/40 px-5 py-3 font-black text-red-300 hover:bg-red-500 hover:text-white disabled:opacity-60"
                      >
                        Hapus
                      </button>

                      {updatingId === item.id && (
                        <p className="text-center text-sm text-gray-400">
                          Memperbarui pengumuman...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
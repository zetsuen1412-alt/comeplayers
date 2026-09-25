"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import { adminLabel, adminText } from "@/lib/adminLocale";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { csvRowsToRecords, parseCsv } from "@/lib/csv";
import {
  authenticatedFetch,
  authenticatedFetchJson,
} from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
};

type Category = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  created_at?: string | null;
};

type ImportSummary = {
  total: number;
  created: number;
  updated: number;
  failed: number;
};

type ImportResult = {
  rowNumber: number;
  id: number | null;
  name: string;
  slug: string;
  action: "create" | "update" | "failed";
  ok: boolean;
  error: string;
};

function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function AdminCategoriesPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newIcon, setNewIcon] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editIcon, setEditIcon] = useState("");

  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();

    return categories.filter((category) => {
      return (
        !query ||
        String(category.id).includes(query) ||
        category.name.toLowerCase().includes(query) ||
        category.slug.toLowerCase().includes(query)
      );
    });
  }, [categories, search]);

  async function loadCategories() {
    const payload = await authenticatedFetchJson<{ categories: Category[] }>(
      "/api/admin/categories"
    );
    setCategories(payload.categories || []);
  }

  useEffect(() => {
    async function initializePage() {
      try {
        setLoading(true);
        setError("");

        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError) throw new Error(userError.message);
        if (!userData.user) {
          setUser(null);
          return;
        }

        setUser(userData.user);

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id,email,username,role")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (profileError) throw new Error(profileError.message);

        setAdminProfile(profileData || null);

        if (profileData?.role?.trim().toLowerCase() === "admin") {
          await loadCategories();
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Gagal memuat kategori."
        );
      } finally {
        setLoading(false);
      }
    }

    initializePage();
  }, []);
  useLiveRefresh(async () => { await loadCategories(); }, { topics: 'admin' });

  function resetCreateForm() {
    setNewName("");
    setNewSlug("");
    setNewIcon("");
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await authenticatedFetchJson("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          slug: newSlug || createSlug(newName),
          icon: newIcon,
        }),
      });

      resetCreateForm();
      await loadCategories();
      setMessage("Kategori disimpan.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Gagal menyimpan kategori."
      );
    } finally {
      setBusy(false);
    }
  }

  function startEditing(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditSlug(category.slug);
    setEditIcon(category.icon || "");
    setMessage("");
    setError("");
  }

  async function saveEdit(categoryId: number) {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await authenticatedFetchJson("/api/admin/categories", {
        method: "PATCH",
        body: JSON.stringify({
          id: categoryId,
          name: editName,
          slug: editSlug || createSlug(editName),
          icon: editIcon,
        }),
      });

      setEditingId(null);
      await loadCategories();
      setMessage("Kategori diperbarui.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Gagal memperbarui kategori."
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(category: Category) {
    if (!confirm(`Hapus kategori "${category.name}"?`)) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await authenticatedFetchJson("/api/admin/categories", {
        method: "DELETE",
        body: JSON.stringify({ id: category.id }),
      });

      await loadCategories();
      setMessage("Kategori dihapus.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Gagal menghapus kategori."
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadCsv(mode: "template" | "export") {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await authenticatedFetch(
        `/api/admin/categories?mode=${mode}`
      );
      const blob = await response.blob();
      saveBlob(
        blob,
        mode === "template"
          ? "comeplayers-category-template.csv"
          : `comeplayers-categories-${new Date().toISOString().slice(0, 10)}.csv`
      );
      setMessage(mode === "template" ? "Templat diunduh." : "CSV diekspor.");
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Gagal mengunduh CSV."
      );
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    setImportSummary(null);
    setImportResults([]);

    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("Ukuran file CSV maksimal 2 MB.");
      }

      const text = await file.text();
      const rows = parseCsv(text);
      const records = csvRowsToRecords(rows).map((record, index) => ({
        row_number: index + 2,
        ...record,
      }));

      if (records.length === 0) {
        throw new Error("CSV tidak memiliki baris kategori.");
      }

      const payload = await authenticatedFetchJson<{
        summary: ImportSummary;
        results: ImportResult[];
      }>("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({ rows: records }),
      });

      setImportSummary(payload.summary);
      setImportResults(payload.results || []);
      await loadCategories();
      setMessage("Impor CSV selesai.");
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "Impor CSV gagal."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Memuat kategori...</p>
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Akses Ditolak</h1>
          <p className="mt-4 text-gray-300">
            Hanya akun admin yang dapat mengakses pengelolaan kategori.
          </p>
          <Link
            href="/admin"
            className="mt-6 inline-flex h-12 items-center rounded-full bg-cyan-400 px-6 font-black text-black"
          >
            Beranda Admin
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="border-b border-white/10 px-8 py-10">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Katalog Admin
            </p>
            <h1 className="text-4xl font-black md:text-6xl">
              Pengelolaan Kategori
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-gray-300">
              Penambahan kategori manual, impor CSV, dan ekspor CSV menggunakan satu tabel public.categories.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadCsv("template")}
              className="rounded-xl border border-white/10 px-5 py-3 font-black text-gray-200 transition hover:border-cyan-400 disabled:opacity-50"
            >
              Templat CSV
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadCsv("export")}
              className="rounded-xl border border-cyan-400/50 px-5 py-3 font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black disabled:opacity-50"
            >
              Ekspor CSV
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-xl border border-violet-400/50 px-5 py-3 font-black text-violet-300 transition hover:bg-violet-400 hover:text-black disabled:opacity-50"
            >
              Impor CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importCsv(file);
                event.target.value = "";
              }}
            />
            <Link
              href="/admin"
              className="rounded-xl border border-white/10 px-5 py-3 font-black text-gray-200 transition hover:bg-white hover:text-black"
            >
              Kembali ke Admin
            </Link>
          </div>
        </div>
      </section>

      <section className="px-8 py-8">
        {message ? (
          <div className="mb-5 rounded-2xl border border-green-400/20 bg-green-400/10 p-4 text-green-200">
            {adminText(message)}
          </div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-red-200">
            {adminText(error)}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <aside className="h-fit rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <h2 className="text-2xl font-black">Tambah Kategori</h2>

            <form onSubmit={createCategory} className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm font-bold text-gray-300">
                Nama
                <input
                  value={newName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNewName(value);
                    setNewSlug((current) => current || createSlug(value));
                  }}
                  className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-cyan-400"
                  placeholder={"Koin Gim"}
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-gray-300">
                Alamat Singkat
                <input
                  value={newSlug}
                  onChange={(event) => setNewSlug(createSlug(event.target.value))}
                  className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-cyan-400"
                  placeholder="game-coins"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-gray-300">
                Ikon
                <input
                  value={newIcon}
                  onChange={(event) => setNewIcon(event.target.value)}
                  className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-cyan-400"
                  placeholder={"Opsional"}
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-cyan-400 px-5 py-3 font-black text-black transition hover:bg-cyan-300 disabled:opacity-50"
              >
                Simpan Kategori
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-gray-300">
              Kolom CSV: id, name, slug, icon, created_at. Kosongkan id untuk membuat; isi id atau slug yang sudah ada untuk memperbarui.
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Total" value={String(categories.length)} />
                <Metric
                  label={"Ditampilkan"}
                  value={String(categories.filter((item) => item.slug).length)}
                />
                <Metric
                  label={"Tersaring"}
                  value={String(filteredCategories.length)}
                />
              </div>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
                placeholder={"Cari kategori..."}
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.035]">
              <div className="grid min-w-[1220px] grid-cols-[80px_1fr_1fr_120px_190px_220px] border-b border-white/10 bg-black/30 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-gray-400">
                <span>ID</span>
                <span>Nama</span>
                <span>Alamat Singkat</span>
                <span>Ikon</span>
                <span>Dibuat</span>
                <span>Tindakan</span>
              </div>

              {filteredCategories.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  Tidak ada kategori ditemukan.
                </div>
              ) : (
                filteredCategories.map((category) => {
                  const editing = editingId === category.id;

                  return (
                    <div
                      key={category.id}
                      className="grid min-w-[1220px] grid-cols-[80px_1fr_1fr_120px_190px_220px] items-center gap-3 border-b border-white/10 px-4 py-4 text-sm last:border-b-0"
                    >
                      <span className="font-mono text-gray-400">
                        {category.id}
                      </span>

                      {editing ? (
                        <>
                          <input
                            value={editName}
                            onChange={(event) => {
                              const value = event.target.value;
                              setEditName(value);
                              setEditSlug((current) => current || createSlug(value));
                            }}
                            className="min-w-0 rounded-lg border border-white/10 bg-black px-3 py-2 text-white outline-none focus:border-cyan-400"
                          />
                          <input
                            value={editSlug}
                            onChange={(event) =>
                              setEditSlug(createSlug(event.target.value))
                            }
                            className="min-w-0 rounded-lg border border-white/10 bg-black px-3 py-2 text-white outline-none focus:border-cyan-400"
                          />
                          <input
                            value={editIcon}
                            onChange={(event) => setEditIcon(event.target.value)}
                            className="min-w-0 rounded-lg border border-white/10 bg-black px-3 py-2 text-white outline-none focus:border-cyan-400"
                          />
                        </>
                      ) : (
                        <>
                          <span className="font-black text-white">
                            {category.name}
                          </span>
                          <span className="font-mono text-cyan-300">
                            {category.slug}
                          </span>
                          <span className="text-xl">{category.icon || "-"}</span>
                        </>
                      )}

                      <span className="text-xs text-gray-400">
                        {formatDate(category.created_at)}
                      </span>

                      <div className="flex flex-wrap gap-2">
                        {editing ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void saveEdit(category.id)}
                              className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-black text-black disabled:opacity-50"
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditingId(null)}
                              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-gray-300 disabled:opacity-50"
                            >
                              Batal
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => startEditing(category)}
                              className="rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-black text-cyan-300 disabled:opacity-50"
                            >
                              Ubah
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteCategory(category)}
                              className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-black text-red-300 disabled:opacity-50"
                            >
                              Hapus
                            </button>
                            <Link
                              href={`/games?category=${category.slug}`}
                              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-gray-300"
                            >
                              Pratinjau
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {importSummary ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <h2 className="text-xl font-black">Hasil Impor</h2>
                <p className="mt-2 text-sm text-gray-300">
                  Total {importSummary.total}, dibuat {importSummary.created}, diperbarui {importSummary.updated}, gagal {importSummary.failed}.
                </p>

                {importResults.length > 0 ? (
                  <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-white/10">
                    {importResults.map((result) => (
                      <div
                        key={`${result.rowNumber}-${result.slug}-${result.action}`}
                        className="grid grid-cols-[90px_1fr_120px] gap-3 border-b border-white/10 px-4 py-3 text-sm last:border-b-0"
                      >
                        <span className="font-mono text-gray-400">
                          Baris {result.rowNumber}
                        </span>
                        <span className={result.ok ? "text-gray-200" : "text-red-300"}>
                          {result.name || result.slug || "-"}
                          {adminText(result.error ? ` - ${result.error}` : "")}
                        </span>
                        <span
                          className={
                            result.ok ? "text-cyan-300" : "text-red-300"
                          }
                        >
                          {adminLabel(result.action)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-cyan-300">{value}</p>
    </div>
  );
}

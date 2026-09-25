"use client";
import { useLiveQuery } from '@/lib/live/use-live-query';

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import GameCsvTools from "@/components/admin/GameCsvTools";
import GameBulkAddForm from "@/components/admin/GameBulkAddForm";
import GameImageUploader from "@/components/admin/GameImageUploader";
import GameCoverImage from "@/components/games/GameCoverImage";
import GameCategoryCheckboxes, { type AdminGameCategory } from "@/components/admin/GameCategoryCheckboxes";
import { adminCategoryLabel, effectiveGameCategoryIds } from "@/lib/bulkGameInput";
import type { GameCatalogImageSource } from "@/lib/gameCatalogImages";
import { supabase } from "@/lib/supabase";
import { adminText } from "@/lib/adminLocale";

type Game = GameCatalogImageSource & {
  id: number; name: string; slug: string; first_letter: string | null;
  status: string; is_active: boolean; category_id: number | null;
  image_url: string | null; catalog_image_url: string | null;
  icon_url: string | null; logo_url: string | null; banner_url: string | null;
  mobile_banner_url: string | null; background_url: string | null; hero_url: string | null;
  description: string | null; created_at: string;
  category_links: { category_id: number; status: string }[];
};

const ASSET_FIELDS = [
  ["image_url", "URL gambar"], ["icon_url", "URL ikon"], ["logo_url", "URL logo"],
  ["banner_url", "URL banner"], ["mobile_banner_url", "URL banner seluler"],
  ["background_url", "URL latar belakang"], ["hero_url", "URL gambar utama"],
] as const;
type AssetField = (typeof ASSET_FIELDS)[number][0];
type EditDetails = Record<AssetField | "name" | "slug" | "description" | "status", string>;
type EditState = { id: number; details: EditDetails; categoryIds: number[] };
type ImageFilter = "all" | "missing" | "ready";

const PAGE_SIZE = 30;
const LETTERS = ["all", "0-9", "#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const INPUT_CLASS = "w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:opacity-50";
const GAME_COLUMNS = "id,name,slug,first_letter,status,is_active,category_id,image_url,catalog_image_url,cover_image_url,banner_image_url,background_image,provider_cover_url,provider_background_url,icon_url,logo_url,banner_url,mobile_banner_url,background_url,hero_url,description,created_at,category_links:category_game_master(category_id,status)";

function messageFrom(cause: unknown) {
  if (typeof cause === "object" && cause !== null && "message" in cause) return adminText(cause.message);
  return "Terjadi kesalahan. Silakan coba lagi.";
}

export default function AdminGameMasterManagementPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [categories, setCategories] = useState<AdminGameCategory[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, missing: 0 });
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [letter, setLetter] = useState("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imagePending, setImagePending] = useState(false);
  const availableIds = categories.map((category) => category.id);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const working = savingId !== null || imageBusy;

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) return;
        const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (profile?.role?.trim().toLowerCase() !== "admin") return;
        const { data, error: categoryError } = await supabase.from("categories").select("id,name,slug,icon").order("id");
        if (categoryError) throw categoryError;
        if (!cancelled) { setCategories((data || []) as AdminGameCategory[]); setIsAdmin(true); }
      } catch (cause) {
        if (!cancelled) setError(messageFrom(cause));
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useLiveQuery((background) => {
    if (!isAdmin) return;
    const controller = new AbortController();
    async function load() {
      if (!background) setLoading(true);
      setError("");
      try {
        let query = supabase.from("game_master").select(GAME_COLUMNS, { count: "exact" });
        const safeSearch = search.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
        if (safeSearch) {
          const filters = [`name.ilike.%${safeSearch}%`, `slug.ilike.%${safeSearch.replace(/\s+/g, "-")}%`];
          if (/^\d+$/.test(safeSearch) && Number.isSafeInteger(Number(safeSearch))) filters.push(`id.eq.${Number(safeSearch)}`);
          query = query.or(filters.join(","));
        }
        if (letter === "0-9") query = query.in("first_letter", [..."0123456789"]);
        else if (letter !== "all") query = query.eq("first_letter", letter);
        if (imageFilter === "missing") query = query.is("catalog_image_url", null);
        if (imageFilter === "ready") query = query.not("catalog_image_url", "is", null);
        const [rows, totals, active, missing] = await Promise.all([
          query.order("name").order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).abortSignal(controller.signal),
          supabase.from("game_master").select("id", { count: "exact", head: true }).abortSignal(controller.signal),
          supabase.from("game_master").select("id", { count: "exact", head: true }).eq("status", "active").eq("is_active", true).abortSignal(controller.signal),
          supabase.from("game_master").select("id", { count: "exact", head: true }).is("catalog_image_url", null).abortSignal(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        if (rows.error) throw rows.error;
        if (totals.error) throw totals.error;
        if (active.error) throw active.error;
        if (missing.error) throw missing.error;
        const nextCount = rows.count || 0;
        const lastPage = Math.max(1, Math.ceil(nextCount / PAGE_SIZE));
        if (page > lastPage) { setPage(lastPage); return; }
        setGames((rows.data || []) as unknown as Game[]);
        setCount(nextCount);
        setStats({ total: totals.count || 0, active: active.count || 0, missing: missing.count || 0 });
      } catch (cause) {
        if (!controller.signal.aborted) setError(messageFrom(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [isAdmin, search, letter, imageFilter, page, refresh], { topics: 'admin,catalog' });

  function startEditing(game: Game) {
    if (working) return;
    const details: EditDetails = {
      name: game.name, slug: game.slug, status: game.status === "active" && game.is_active ? "active" : "inactive",
      description: game.description || "", image_url: game.image_url || "", icon_url: game.icon_url || "",
      logo_url: game.logo_url || "", banner_url: game.banner_url || "", mobile_banner_url: game.mobile_banner_url || "",
      background_url: game.background_url || "", hero_url: game.hero_url || "",
    };
    setImagePending(false);
    setEdit({ id: game.id, details, categoryIds: effectiveGameCategoryIds(game, availableIds) });
    setError(""); setNotice("");
  }

  function setDetail(field: keyof EditDetails, value: string) {
    setEdit((current) => current ? { ...current, details: { ...current.details, [field]: value } } : null);
  }

  async function saveGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit || working || imagePending) return;
    setSavingId(edit.id); setError(""); setNotice("");
    try {
      const { error: saveError } = await supabase.rpc("cp_admin_save_game_catalog", {
        p_game_id: edit.id, p_details: edit.details, p_category_ids: edit.categoryIds,
      });
      if (saveError) throw saveError;
      setEdit(null);
      setNotice("Game, gambar katalog, dan semua kategorinya berhasil disimpan.");
      setRefresh((value) => value + 1);
    } catch (cause) { setError(messageFrom(cause)); }
    finally { setSavingId(null); }
  }

  async function changeStatus(game: Game, status: "active" | "inactive") {
    if (working) return;
    setSavingId(game.id); setError(""); setNotice("");
    try {
      const { data, error: updateError } = await supabase.from("game_master").update({ status, is_active: status === "active" }).eq("id", game.id).select("id").single();
      if (updateError) throw updateError;
      if (!data) throw new Error("Status game tidak berhasil diubah.");
      setNotice(`Status ${game.name} berhasil diubah.`); setRefresh((value) => value + 1);
    } catch (cause) { setError(messageFrom(cause)); }
    finally { setSavingId(null); }
  }

  async function deleteGame(game: Game) {
    if (working || !window.confirm(`Hapus ${game.name}? Tindakan ini dapat memengaruhi kategori dan produk yang menggunakan game ini.`)) return;
    setSavingId(game.id); setError(""); setNotice("");
    try {
      const { data, error: deleteError } = await supabase.from("game_master").delete().eq("id", game.id).select("id").single();
      if (deleteError) throw deleteError;
      if (!data) throw new Error("Game tidak berhasil dihapus.");
      if (edit?.id === game.id) setEdit(null);
      setNotice(`${game.name} berhasil dihapus.`); setRefresh((value) => value + 1);
    } catch (cause) { setError(messageFrom(cause)); }
    finally { setSavingId(null); }
  }

  if (authLoading) return <main className="p-8"><p role="status">Memuat pengelolaan game…</p></main>;
  if (!isAdmin) return <main className="p-8"><h1 className="text-2xl font-black">Akses khusus admin</h1><p className="mt-3">Masuk menggunakan akun admin untuk mengelola game.</p>{error && <p role="alert" className="mt-3 text-red-500">{error}</p>}<Link href="/admin" className="mt-5 inline-block underline">Kembali ke admin</Link></main>;

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="border-b border-white/10 px-6 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><h1 className="text-3xl font-black md:text-4xl">Pengelolaan Game</h1><p className="mt-3 max-w-3xl text-gray-400">Kelola katalog, unggah atau tempel gambar, dan atur beberapa kategori untuk setiap game tanpa membuat data ganda.</p></div>
          <div className="flex flex-wrap gap-3"><Link href="/admin/games/igdb" className="rounded-xl border border-cyan-400/30 px-4 py-3 font-bold text-cyan-300">Impor dari IGDB</Link><Link href="/games" target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 px-4 py-3">Lihat katalog</Link><Link href="/admin" className="rounded-xl border border-white/10 px-4 py-3">Kembali ke admin</Link></div>
        </div>
      </section>
      <section className="px-6 py-8 md:px-8">
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[["Total game", stats.total], ["Aktif", stats.active], ["Nonaktif", stats.total - stats.active], ["Belum ada gambar asli", stats.missing]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-sm text-gray-400">{label}</p><p className="mt-2 text-3xl font-black">{Number(value).toLocaleString("id-ID")}</p></div>)}
        </div>
        <GameBulkAddForm categories={categories} onSaved={() => setRefresh((value) => value + 1)} />
        <p className="mb-5 text-sm text-gray-400">Untuk game baru, tambahkan nama dan kategorinya terlebih dahulu. Setelah tersimpan, pilih Ubah game &amp; gambar di daftar berikut.</p>
        {notice && <p role="status" className="mb-5 rounded-xl border border-green-400/30 bg-green-400/10 p-4">{notice}</p>}
        {error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4"><p>{error}</p><button type="button" disabled={working} onClick={() => setRefresh((value) => value + 1)} className="mt-2 underline disabled:opacity-50">Muat ulang katalog</button></div>}
        <div className="mb-6 space-y-4 rounded-2xl border border-white/10 p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <label className="block"><span className="mb-2 block text-sm font-bold">Cari di seluruh katalog</span><input value={searchInput} disabled={working} onChange={(event) => setSearchInput(event.target.value)} placeholder="Nama game, slug, atau ID…" className={INPUT_CLASS} /></label>
            <label className="block"><span className="mb-2 block text-sm font-bold">Kelengkapan gambar</span><select value={imageFilter} disabled={working} onChange={(event) => { setImageFilter(event.target.value as ImageFilter); setPage(1); }} className={INPUT_CLASS}><option value="all">Semua game</option><option value="missing">Belum ada gambar asli</option><option value="ready">Sudah ada gambar</option></select></label>
          </div>
          <div className="flex flex-wrap gap-2">{LETTERS.map((value) => <button key={value} type="button" disabled={working} onClick={() => { setLetter(value); setPage(1); }} aria-pressed={letter === value} className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${letter === value ? "border-cyan-400 bg-cyan-400 text-black" : "border-white/10"}`}>{value === "all" ? "Semua" : value}</button>)}</div>
          <p className="text-xs text-gray-400">Gambar placeholder tidak dihitung sebagai gambar asli. Tautan eksternal yang rusak tetap perlu diperiksa melalui pratinjau.</p>
        </div>
        {loading ? <p role="status" className="p-6">Memuat daftar game…</p> : games.length === 0 ? <p className="p-6">Tidak ada game yang cocok. Coba nama atau filter lain.</p> : <div className="space-y-5">
          {games.map((game) => {
            const gameCategories = effectiveGameCategoryIds(game, availableIds);
            const active = game.status === "active" && game.is_active;
            return <article key={game.id} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              {edit?.id === game.id ? <form onSubmit={saveGame}>
                <fieldset disabled={savingId !== null}>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">Ubah game #{game.id}</h2><div className="flex gap-3"><button type="button" disabled={working} onClick={() => { setEdit(null); setImagePending(false); }} className="rounded-xl border border-white/20 px-4 py-2 disabled:opacity-50">Batal</button><button type="submit" disabled={working || imagePending} className="rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black disabled:opacity-50">{savingId === game.id ? "Menyimpan…" : "Simpan perubahan"}</button></div></div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label>Nama game<input required maxLength={200} value={edit.details.name} onChange={(event) => setDetail("name", event.target.value)} className={`${INPUT_CLASS} mt-2`} /></label>
                    <label>Slug<input required maxLength={300} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={edit.details.slug} onChange={(event) => setDetail("slug", event.target.value)} className={`${INPUT_CLASS} mt-2`} /><span className="mt-1 block text-xs text-gray-400">Huruf kecil, angka, dan tanda hubung. Mengubah slug akan mengubah alamat halaman game.</span></label>
                    <label>Status<select value={edit.details.status} onChange={(event) => setDetail("status", event.target.value)} className={`${INPUT_CLASS} mt-2`}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
                  </div>
                  <GameImageUploader key={game.id} game={{ ...game, name: edit.details.name }} value={edit.details.image_url} onChange={(url) => setDetail("image_url", url)} onBusyChange={setImageBusy} onPendingChange={setImagePending} disabled={savingId !== null} />
                  <details className="mt-5 rounded-xl border border-white/10 p-4"><summary className="cursor-pointer font-bold">Ikon, logo, dan banner tambahan (opsional)</summary><div className="mt-4 grid gap-4 md:grid-cols-2">{ASSET_FIELDS.filter(([field]) => field !== "image_url").map(([field, label]) => <label key={field}>{label}<input value={edit.details[field]} onChange={(event) => setDetail(field, event.target.value)} className={`${INPUT_CLASS} mt-2`} /></label>)}</div></details>
                  <div className="mt-5"><GameCategoryCheckboxes categories={categories} selectedIds={edit.categoryIds} onChange={(categoryIds) => setEdit((current) => current ? { ...current, categoryIds } : null)} disabled={savingId !== null} /><p className="mt-2 text-xs text-gray-400">Pilihan ini mengganti pemetaan kategori game. Produk yang sudah diterbitkan tetap memiliki kategorinya sendiri.</p></div>
                  <label className="mt-5 block">Deskripsi<textarea value={edit.details.description} onChange={(event) => setDetail("description", event.target.value)} rows={4} className={`${INPUT_CLASS} mt-2`} /></label>
                  <div className="mt-5 flex flex-wrap items-center gap-3"><button type="submit" disabled={working || imagePending} className="rounded-xl bg-cyan-400 px-5 py-3 font-bold text-black disabled:opacity-50">{savingId === game.id ? "Menyimpan…" : "Simpan perubahan"}</button>{imageBusy ? <p className="text-sm text-cyan-300">Tunggu hingga gambar selesai diproses.</p> : imagePending ? <p className="text-sm text-yellow-300">Terapkan URL gambar dengan tombol Gunakan URL terlebih dahulu.</p> : null}</div>
                </fieldset>
              </form> : <div className="grid gap-5 md:grid-cols-[180px_1fr] xl:grid-cols-[180px_1fr_190px]">
                <div><GameCoverImage game={game} className="aspect-video w-full rounded-2xl" fallbackLabel="Gambar belum tersedia" />{!game.catalog_image_url && <span className="mt-2 inline-block rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 text-xs text-yellow-300">Perlu gambar asli</span>}</div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h2 className="break-words text-xl font-black">{game.name}</h2><span className={`rounded-full border px-3 py-1 text-xs ${active ? "border-green-400/30 text-green-400" : "border-red-400/30 text-red-400"}`}>{active ? "Aktif" : "Nonaktif"}</span></div><p className="mt-2 break-all text-xs text-gray-400">#{game.id} · {game.slug}</p><p className="mt-3 line-clamp-2 text-sm text-gray-400">{game.description || "Belum ada deskripsi."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">{gameCategories.length === 0 ? <span className="text-sm text-gray-400">Tanpa kategori</span> : gameCategories.map((id) => { const category = categories.find((item) => item.id === id); return category ? <span key={id} className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-xs">{category.icon} {adminCategoryLabel(category)}</span> : null; })}</div>
                  <p className="mt-3 text-xs text-gray-400">Dibuat: {game.created_at ? new Date(game.created_at).toLocaleString("id-ID") : "—"}</p>
                </div>
                <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-1"><button type="button" disabled={working} onClick={() => startEditing(game)} className="rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black disabled:opacity-50">Ubah game &amp; gambar</button><Link href={`/games/${game.slug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-white/20 px-4 py-2 text-center text-sm">Lihat halaman game</Link><button type="button" disabled={working} onClick={() => changeStatus(game, active ? "inactive" : "active")} className="rounded-xl border border-white/20 px-4 py-2 disabled:opacity-50">{active ? "Nonaktifkan" : "Aktifkan"}</button><button type="button" disabled={working} onClick={() => deleteGame(game)} className="rounded-xl border border-red-400/30 px-4 py-2 text-red-400 disabled:opacity-50">Hapus game</button></div>
              </div>}
            </article>;
          })}
        </div>}
        <nav aria-label="Halaman daftar game" className="mt-6 flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-gray-400">{count.toLocaleString("id-ID")} hasil · Halaman {page} dari {totalPages}</p><div className="flex gap-3"><button type="button" disabled={page <= 1 || loading || working} onClick={() => setPage((value) => value - 1)} className="rounded-xl border border-white/20 px-4 py-2 disabled:opacity-40">Sebelumnya</button><button type="button" disabled={page >= totalPages || loading || working} onClick={() => setPage((value) => value + 1)} className="rounded-xl border border-white/20 px-4 py-2 disabled:opacity-40">Berikutnya</button></div></nav>
      </section>
      <GameCsvTools />
    </main>
  );
}

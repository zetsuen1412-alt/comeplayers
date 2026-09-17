"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
import GameCsvTools from "@/components/admin/GameCsvTools";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
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
};

type GameMaster = {
  id: number;
  name: string;
  slug: string;
  first_letter: string | null;
  status: string | null;
  category_id: number | null;
  image_url: string | null;
  icon_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  mobile_banner_url: string | null;
  background_url: string | null;
  hero_url: string | null;
  description: string | null;
  source?: string | null;
  igdb_id?: number | null;
  sync_status?: string | null;
  local_override_fields?: string[] | null;
  created_at: string;
};

const letters = [
  "all",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

const statusOptions = ["active", "inactive"];

function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function getStatusClass(status: string | null) {
  if (status === "active") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  return "border-red-400/20 bg-red-400/10 text-red-300";
}

export default function AdminGameMasterManagementV1Page() {
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [games, setGames] = useState<GameMaster[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeLetter, setActiveLetter] = useState("all");
  const [search, setSearch] = useState("");

  const [editingGameId, setEditingGameId] = useState<number | null>(null);
  const [savingGameId, setSavingGameId] = useState<number | null>(null);

  const [newGameName, setNewGameName] = useState("");
  const [newGameCategoryId, setNewGameCategoryId] = useState("");

  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editIconUrl, setEditIconUrl] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [editMobileBannerUrl, setEditMobileBannerUrl] = useState("");
  const [editBackgroundUrl, setEditBackgroundUrl] = useState("");
  const [editHeroUrl, setEditHeroUrl] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase();

    return games.filter((game) => {
      const gameLetter = (game.first_letter || game.name.charAt(0)).toUpperCase();

      const matchesLetter = activeLetter === "all" || gameLetter === activeLetter;

      const matchesSearch =
        !query ||
        game.name.toLowerCase().includes(query) ||
        game.slug.toLowerCase().includes(query) ||
        String(game.id).includes(query);

      return matchesLetter && matchesSearch;
    });
  }, [games, search, activeLetter]);

  const activeCount = games.filter((game) => game.status === "active").length;
  const inactiveCount = games.filter((game) => game.status !== "active").length;
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  async function loadGames() {
    const { data, error } = await supabase
      .from("game_master")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      alert(adminText(error.message));
      return;
    }

    setGames(data || []);
  }

  async function loadCategories() {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug,icon")
      .order("id", { ascending: true });

    if (error) {
      alert(adminText(error.message));
      return;
    }

    const categoryRows = (data || []) as Category[];
    setCategories(categoryRows);
    setNewGameCategoryId((current) => current || String(categoryRows[0]?.id || ""));
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
        .select("id,email,username,role")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError) {
        alert(adminText(profileError.message));
        setLoading(false);
        return;
      }

      setAdminProfile(profileData || null);

      if (profileData?.role?.trim().toLowerCase() === "admin") {
        await Promise.all([loadCategories(), loadGames()]);
      }

      setLoading(false);
    }

    initializePage();
  }, []);

  function startEditing(game: GameMaster) {
    setEditingGameId(game.id);
    setEditName(game.name || "");
    setEditSlug(game.slug || "");
    setEditStatus(game.status || "active");
    setEditCategoryId(game.category_id ? String(game.category_id) : "");
    setEditImageUrl(game.image_url || "");
    setEditIconUrl(game.icon_url || "");
    setEditLogoUrl(game.logo_url || "");
    setEditBannerUrl(game.banner_url || "");
    setEditMobileBannerUrl(game.mobile_banner_url || "");
    setEditBackgroundUrl(game.background_url || "");
    setEditHeroUrl(game.hero_url || "");
    setEditDescription(game.description || "");
  }

  function cancelEditing() {
    setEditingGameId(null);
  }

  async function saveGame(gameId: number) {
    if (!isAdmin) return;

    const currentGame = games.find((game) => game.id === gameId);
    if (!currentGame) return;

    if (!editName.trim()) {
      alert("Nama gim wajib diisi.");
      return;
    }

    if (!editSlug.trim()) {
      alert("Alamat singkat gim wajib diisi.");
      return;
    }

    setSavingGameId(gameId);

    const nextValues = {
      name: editName.trim(),
      slug: createSlug(editSlug),
      image_url: editImageUrl.trim() || null,
      description: editDescription.trim() || null,
    };
    const overrideFields = new Set(currentGame.local_override_fields || []);

    if (nextValues.name !== currentGame.name) overrideFields.add("name");
    if (nextValues.slug !== currentGame.slug) overrideFields.add("slug");
    if (nextValues.image_url !== currentGame.image_url) overrideFields.add("image_url");
    if (nextValues.description !== currentGame.description) overrideFields.add("description");

    const { error } = await supabase
      .from("game_master")
      .update({
        ...nextValues,
        normalized_name: nextValues.name.toLowerCase().trim(),
        first_letter: nextValues.name.charAt(0).toUpperCase(),
        status: editStatus,
        category_id: editCategoryId ? Number(editCategoryId) : null,
        icon_url: editIconUrl.trim() || null,
        logo_url: editLogoUrl.trim() || null,
        banner_url: editBannerUrl.trim() || null,
        mobile_banner_url: editMobileBannerUrl.trim() || null,
        background_url: editBackgroundUrl.trim() || null,
        hero_url: editHeroUrl.trim() || null,
        local_override_fields: Array.from(overrideFields),
      })
      .eq("id", gameId);

    if (error) {
      alert(adminText(error.message));
      setSavingGameId(null);
      return;
    }

    await loadGames();
    setSavingGameId(null);
    setEditingGameId(null);
  }

  async function quickStatus(gameId: number, status: string) {
    setSavingGameId(gameId);

    const { error } = await supabase
      .from("game_master")
      .update({ status })
      .eq("id", gameId);

    if (error) {
      alert(adminText(error.message));
      setSavingGameId(null);
      return;
    }

    await loadGames();
    setSavingGameId(null);
  }

  async function createGame(event: React.FormEvent) {
    event.preventDefault();

    if (!newGameName.trim()) {
      alert("Nama gim wajib diisi.");
      return;
    }

    const gameName = newGameName.trim();
    const slug = createSlug(gameName);

    const { error } = await supabase.from("game_master").insert({
      name: gameName,
      slug,
      normalized_name: gameName.toLowerCase().trim(),
      first_letter: gameName.charAt(0).toUpperCase(),
      status: "active",
      is_active: true,
      source: "manual",
      sync_status: "manual",
      category_id: newGameCategoryId ? Number(newGameCategoryId) : null,
      local_override_fields: ["name", "slug", "description", "image_url"],
      image_url: null,
      icon_url: null,
      logo_url: null,
      banner_url: null,
      mobile_banner_url: null,
      background_url: null,
      hero_url: null,
      description: null,
    });

    if (error) {
      alert(adminText(error.message));
      return;
    }

    setNewGameName("");
    await loadGames();
  }

  async function deleteGame(game: GameMaster) {
    if (
      !confirm(
        `Hapus ${game.name}? Ini dapat memengaruhi pemetaan kategori dan produk yang sudah ada.`
      )
    ) {
      return;
    }

    setSavingGameId(game.id);

    const { error } = await supabase.from("game_master").delete().eq("id", game.id);

    if (error) {
      alert(adminText(error.message));
      setSavingGameId(null);
      return;
    }

    await loadGames();
    setSavingGameId(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Memuat data induk gim...
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
            Hanya akun admin yang dapat mengakses pengelolaan data induk gim.
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
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_34%)]" />

        <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Data Induk Gim Admin
            </p>

            <h1 className="text-5xl font-black md:text-7xl">Gim A–Z</h1>

            <Link
              href="/admin/games/igdb"
              className="mt-5 inline-flex rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 font-black text-cyan-200 transition hover:bg-cyan-400 hover:text-black"
            >
              Buka penampungan IGDB →
            </Link>

            <p className="mt-5 max-w-2xl text-gray-300">
              Kelola katalog gim ComePlayers, aset, spanduk, logo, dan data marketplace gim.
            </p>
          </div>

          <Link
            href="/admin"
            className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            Kembali ke Admin
          </Link>
        </div>
      </section>

      <section className="px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Gim</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {games.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Aktif</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {activeCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Nonaktif</p>
            <p className="mt-2 text-3xl font-black text-red-300">
              {inactiveCount}
            </p>
          </div>
        </div>

        <form
          onSubmit={createGame}
          className="mb-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
        >
          <h2 className="text-2xl font-black">Tambah Gim Baru</h2>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_260px_180px]">
            <input
              value={newGameName}
              onChange={(event) => setNewGameName(event.target.value)}
              placeholder={"Contoh: Mobile Legends"}
              className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
            />

            <select
              value={newGameCategoryId}
              onChange={(event) => setNewGameCategoryId(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
            >
              <option value="">Tanpa kategori</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon ? `${category.icon} ` : ""}
                  {category.name}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="rounded-2xl bg-cyan-400 px-5 py-4 font-black text-black transition hover:bg-cyan-300"
            >
              Tambah Gim
            </button>
          </div>
        </form>

        <div className="mb-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={"Cari berdasarkan nama gim, alamat singkat, atau ID..."}
              className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
            />

            <div className="flex flex-wrap gap-2">
              {letters.map((letter) => (
                <button
                  key={letter}
                  onClick={() => setActiveLetter(letter)}
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${
                    activeLetter === letter
                      ? "bg-cyan-400 text-black"
                      : "border border-white/10 bg-black/30 text-gray-300 hover:border-cyan-400 hover:text-white"
                  }`}
                  type="button"
                >
                  {letter === "all" ? "Semua" : letter}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center">
            <h2 className="text-3xl font-black">Tidak ada gim ditemukan.</h2>
            <p className="mt-3 text-gray-400">
              Coba kata kunci atau filter huruf lain.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredGames.map((game) => {
              const isEditing = editingGameId === game.id;

              return (
                <div
                  key={game.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
                >
                  {!isEditing ? (
                    <div className="grid gap-6 xl:grid-cols-[180px_1fr_280px]">
                      <div className="flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-black">
                        {game.image_url || game.icon_url || game.logo_url ? (
                          <div
                            role="img"
                            aria-label={game.name}
                            className="h-full w-full bg-cover bg-center"
                            style={{
                              backgroundImage: `url(${game.image_url || game.icon_url || game.logo_url || ""})`,
                            }}
                          />
                        ) : (
                          <span className="text-5xl">🎮</span>
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-2xl font-black">{game.name}</h2>

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(
                              game.status
                            )}`}
                          >
                            {adminLabel(game.status || "inactive")}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-gray-400">
                          alamat singkat: {game.slug}
                        </p>

                        <p className="mt-4 line-clamp-3 text-gray-300">
                          {game.description || "Belum ada deskripsi."}
                        </p>

                        <div className="mt-5 grid gap-4 md:grid-cols-4">
                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs text-gray-500">ID Gim</p>
                            <p className="mt-1 font-bold">#{game.id}</p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs text-gray-500">Huruf</p>
                            <p className="mt-1 font-bold">
                              {game.first_letter || "-"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs text-gray-500">Kategori</p>
                            <p className="mt-1 font-bold">
                              {game.category_id
                                ? categoryNameById.get(Number(game.category_id)) || "-"
                                : "-"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs text-gray-500">Dibuat</p>
                            <p className="mt-1 font-bold">
                              {game.created_at
                                ? new Date(game.created_at).toLocaleString()
                                : "-"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => startEditing(game)}
                          className="rounded-2xl bg-cyan-400 px-5 py-3 font-black text-black hover:bg-cyan-300"
                        >
                          Ubah Gim
                        </button>

                        <button
                          onClick={() => quickStatus(game.id, "active")}
                          disabled={savingGameId === game.id}
                          className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white hover:bg-green-400 disabled:opacity-60"
                        >
                          Aktifkan
                        </button>

                        <button
                          onClick={() => quickStatus(game.id, "inactive")}
                          disabled={savingGameId === game.id}
                          className="rounded-2xl bg-red-500 px-5 py-3 font-black text-white hover:bg-red-400 disabled:opacity-60"
                        >
                          Nonaktifkan
                        </button>

                        <button
                          onClick={() => deleteGame(game)}
                          disabled={savingGameId === game.id}
                          className="rounded-2xl border border-red-400/40 px-5 py-3 font-black text-red-300 hover:bg-red-500 hover:text-white disabled:opacity-60"
                        >
                          Hapus Gim
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                        <h2 className="text-3xl font-black">Ubah {game.name}</h2>

                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="rounded-full border border-white/10 px-5 py-2 font-bold text-gray-300 hover:bg-white hover:text-black"
                          >
                            Batal
                          </button>

                          <button
                            type="button"
                            onClick={() => saveGame(game.id)}
                            disabled={savingGameId === game.id}
                            className="rounded-full bg-cyan-400 px-5 py-2 font-black text-black hover:bg-cyan-300 disabled:opacity-60"
                          >
                            {savingGameId === game.id ? "Menyimpan..." : "Simpan"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-5 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            Nama
                          </label>
                          <input
                            value={editName}
                            onChange={(event) => {
                              setEditName(event.target.value);
                              setEditSlug(createSlug(event.target.value));
                            }}
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            Alamat Singkat
                          </label>
                          <input
                            value={editSlug}
                            onChange={(event) => setEditSlug(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            Status
                          </label>
                          <select
                            value={editStatus}
                            onChange={(event) => setEditStatus(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          >
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {adminLabel(status)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            Kategori Marketplace
                          </label>
                          <select
                            value={editCategoryId}
                            onChange={(event) => setEditCategoryId(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          >
                            <option value="">Tanpa kategori</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.icon ? `${category.icon} ` : ""}
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            URL Gambar
                          </label>
                          <input
                            value={editImageUrl}
                            onChange={(event) => setEditImageUrl(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            URL Ikon
                          </label>
                          <input
                            value={editIconUrl}
                            onChange={(event) => setEditIconUrl(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            URL Logo
                          </label>
                          <input
                            value={editLogoUrl}
                            onChange={(event) => setEditLogoUrl(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            URL Spanduk
                          </label>
                          <input
                            value={editBannerUrl}
                            onChange={(event) => setEditBannerUrl(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            URL Spanduk Seluler
                          </label>
                          <input
                            value={editMobileBannerUrl}
                            onChange={(event) =>
                              setEditMobileBannerUrl(event.target.value)
                            }
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            URL Latar Belakang
                          </label>
                          <input
                            value={editBackgroundUrl}
                            onChange={(event) =>
                              setEditBackgroundUrl(event.target.value)
                            }
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold text-gray-300">
                            URL Gambar Utama
                          </label>
                          <input
                            value={editHeroUrl}
                            onChange={(event) => setEditHeroUrl(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                          />
                        </div>
                      </div>

                      <div className="mt-5">
                        <label className="mb-2 block text-sm font-bold text-gray-300">
                          Deskripsi
                        </label>
                        <textarea
                          value={editDescription}
                          onChange={(event) => setEditDescription(event.target.value)}
                          rows={5}
                          className="w-full resize-none rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
          <GameCsvTools />
    </main>
  );
}

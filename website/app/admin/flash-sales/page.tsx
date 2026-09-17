"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
};

type Product = {
  id: number;
  title: string | null;
  price: string | number | null;
  seller_id: string | null;
  seller_name: string | null;
  category: string | null;
  game_name: string | null;
  image_url: string | null;
  stock: number | null;
  status: string | null;
};

type FlashSale = {
  id: number;
  product_id: number;
  title: string;
  description: string | null;
  original_price: string | number;
  flash_price: string | number;
  stock_limit: number | null;
  sold_count: number;
  start_at: string;
  end_at: string;
  status: "active" | "inactive";
  created_at: string;
  products: Product | null;
};

const statusFilters = ["all", "active", "inactive", "running", "upcoming", "ended"];


function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function getFlashState(item: FlashSale) {
  const now = Date.now();
  const start = new Date(item.start_at).getTime();
  const end = new Date(item.end_at).getTime();

  if (item.status !== "active") return "inactive";
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "running";
}

function getStateClass(state: string) {
  if (state === "running") return "border-green-400/20 bg-green-400/10 text-green-300";
  if (state === "upcoming") return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  if (state === "ended") return "border-red-400/20 bg-red-400/10 text-red-300";
  return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
}

function toInputDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

export default function AdminFlashSaleManagerV1Page() {
  const { formatPrice } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [flashSales, setFlashSales] = useState<FlashSale[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [flashPrice, setFlashPrice] = useState("");
  const [stockLimit, setStockLimit] = useState("");
  const [soldCount, setSoldCount] = useState("0");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";


  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    return products
      .filter((product) => {
        return (
          !query ||
          (product.title || "").toLowerCase().includes(query) ||
          (product.category || "").toLowerCase().includes(query) ||
          (product.game_name || "").toLowerCase().includes(query) ||
          (product.seller_name || "").toLowerCase().includes(query) ||
          String(product.id).includes(query)
        );
      })
      .slice(0, 30);
  }, [products, productSearch]);

  const filteredFlashSales = useMemo(() => {
    const query = search.trim().toLowerCase();

    return flashSales.filter((item) => {
      const state = getFlashState(item);
      const product = item.products;

      const matchesStatus =
        activeStatus === "all" ||
        item.status === activeStatus ||
        state === activeStatus;

      const matchesSearch =
        !query ||
        item.title.toLowerCase().includes(query) ||
        (item.description || "").toLowerCase().includes(query) ||
        (product?.title || "").toLowerCase().includes(query) ||
        (product?.category || "").toLowerCase().includes(query) ||
        (product?.game_name || "").toLowerCase().includes(query) ||
        String(item.id).includes(query) ||
        String(item.product_id).includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [flashSales, search, activeStatus]);

  const runningCount = flashSales.filter((item) => getFlashState(item) === "running").length;
  const upcomingCount = flashSales.filter((item) => getFlashState(item) === "upcoming").length;
  const endedCount = flashSales.filter((item) => getFlashState(item) === "ended").length;
  const activeCount = flashSales.filter((item) => item.status === "active").length;

  async function loadData() {
    const [productResult, flashSaleResult] = await Promise.all([
      supabase
        .from("products")
        .select("id,title,price,seller_id,seller_name,category,game_name,image_url,stock,status")
        .order("id", { ascending: false }),
      supabase
        .from("flash_sales")
        .select(
          `
          *,
          products:product_id (
            id,
            title,
            price,
            seller_id,
            seller_name,
            category,
            game_name,
            image_url,
            stock,
            status
          )
        `
        )
        .order("id", { ascending: false }),
    ]);

    if (productResult.error) {
      alert(adminText(productResult.error.message));
      return;
    }

    if (flashSaleResult.error) {
      alert(adminText(flashSaleResult.error.message));
      return;
    }

    setProducts(productResult.data || []);
    setFlashSales((flashSaleResult.data || []) as unknown as FlashSale[]);
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
        await loadData();
      }

      setLoading(false);
    }

    initializePage();
  }, []);


  function resetForm() {
    setEditingId(null);
    setProductId("");
    setTitle("");
    setDescription("");
    setOriginalPrice("");
    setFlashPrice("");
    setStockLimit("");
    setSoldCount("0");
    setStartAt("");
    setEndAt("");
    setStatus("active");
    setProductSearch("");
  }

  function startEdit(item: FlashSale) {
    setEditingId(item.id);
    setProductId(String(item.product_id));
    setTitle(item.title || "");
    setDescription(item.description || "");
    setOriginalPrice(String(item.original_price || ""));
    setFlashPrice(String(item.flash_price || ""));
    setStockLimit(item.stock_limit !== null ? String(item.stock_limit) : "");
    setSoldCount(String(item.sold_count || 0));
    setStartAt(toInputDateTime(item.start_at));
    setEndAt(toInputDateTime(item.end_at));
    setStatus(item.status || "active");
    setProductSearch(item.products?.title || "");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildPayload() {
    return {
      product_id: Number(productId),
      title: title.trim(),
      description: description.trim() || null,
      original_price: Number(originalPrice || 0),
      flash_price: Number(flashPrice || 0),
      stock_limit: stockLimit.trim() === "" ? null : Number(stockLimit || 0),
      sold_count: Number(soldCount || 0),
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      status,
    };
  }

  async function saveFlashSale(event: React.FormEvent) {
    event.preventDefault();

    if (!productId) return alert("Pilih produk terlebih dahulu.");
    if (!title.trim()) return alert("Judul promo kilat wajib diisi.");
    if (Number(originalPrice || 0) <= 0) return alert("Harga awal tidak valid.");
    if (Number(flashPrice || 0) <= 0) return alert("Harga promo tidak valid.");
    if (Number(flashPrice) >= Number(originalPrice)) {
      return alert("Harga promo harus lebih rendah dari harga awal.");
    }
    if (!startAt || !endAt) return alert("Tanggal mulai dan berakhir wajib diisi.");
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return alert("Tanggal berakhir harus setelah tanggal mulai.");
    }
    if (stockLimit && Number(stockLimit) <= 0) {
      return alert("Batas stok harus kosong atau lebih besar dari 0.");
    }
    if (Number(soldCount || 0) < 0) return alert("Jumlah terjual tidak boleh negatif.");

    try {
      setSaving(true);
      const payload = buildPayload();
      await authenticatedFetchJson("/api/admin/flash-sales", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(
          editingId ? { flashSaleId: editingId, ...payload } : payload
        ),
      });

      alert(adminText(editingId ? "Promo kilat diperbarui." : "Promo kilat dibuat."));
      await loadData();
      resetForm();
    } catch (error) {
      alert(adminText(error instanceof Error ? error.message : "Gagal menyimpan promo kilat."));
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(item: FlashSale, nextStatus: "active" | "inactive") {
    try {
      setUpdatingId(item.id);
      await authenticatedFetchJson("/api/admin/flash-sales", {
        method: "PATCH",
        body: JSON.stringify({
          flashSaleId: item.id,
          action: "status",
          status: nextStatus,
        }),
      });
      await loadData();
    } catch (error) {
      alert(adminText(error instanceof Error ? error.message : "Gagal memperbarui promo kilat."));
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteFlashSale(item: FlashSale) {
    if (!confirm(`Hapus promo kilat "${item.title}"?`)) return;

    try {
      setUpdatingId(item.id);
      await authenticatedFetchJson("/api/admin/flash-sales", {
        method: "DELETE",
        body: JSON.stringify({ flashSaleId: item.id }),
      });
      await loadData();
    } catch (error) {
      alert(adminText(error instanceof Error ? error.message : "Gagal menghapus promo kilat."));
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Memuat pengelola promo kilat...
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
            Hanya akun admin yang dapat mengelola promo kilat.
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(239,68,68,.16),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-300">
              Pengelola Promo Kilat Admin
            </p>

            <h1 className="text-5xl font-black md:text-7xl">Promo Kilat</h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Buat diskon produk berbatas waktu, jadwalkan kampanye, atur batas stok, dan kelola promo kilat aktif.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Masuk sebagai {user.email}
            </p>
          </div>

          <Link
            href="/admin"
            className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            Beranda Admin
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Promo Kilat</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {flashSales.length}
            </p>
          </div>

          <div className="rounded-3xl border border-green-400/20 bg-green-400/10 p-5">
            <p className="text-sm text-gray-300">Berlangsung</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {runningCount}
            </p>
          </div>

          <div className="rounded-3xl border border-blue-400/20 bg-blue-400/10 p-5">
            <p className="text-sm text-gray-300">Akan Datang</p>
            <p className="mt-2 text-3xl font-black text-blue-300">
              {upcomingCount}
            </p>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <p className="text-sm text-gray-300">Catatan Aktif</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {activeCount}
            </p>
          </div>
        </div>

        <form
          onSubmit={saveFlashSale}
          className="mb-10 rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-7 shadow-2xl shadow-black/30"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-black text-yellow-300">
                {editingId ? "Ubah Promo Kilat" : "Buat Promo Kilat"}
              </h2>

              <p className="mt-2 text-sm text-gray-300">
                Pilih produk, lalu tentukan harga diskon dan masa berlakunya.
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

          <div className="mt-7">
            <label className="mb-2 block text-sm font-bold text-gray-300">
              Cari Produk
            </label>

            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder={"Cari produk berdasarkan judul, gim, kategori, penjual, atau ID..."}
              className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
            />

            <div className="mt-4 grid max-h-[360px] gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-4 md:grid-cols-2">
              {filteredProducts.length === 0 ? (
                <p className="text-gray-400">Tidak ada produk ditemukan.</p>
              ) : (
                filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      setProductId(String(product.id));
                      setProductSearch(product.title || "");
                      setOriginalPrice(String(product.price || ""));
                      if (!editingId) {
                        setTitle(`${product.title || "Produk"} Promo Kilat`);
                      }
                    }}
                    className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${
                      productId === String(product.id)
                        ? "border-yellow-400 bg-yellow-400/10"
                        : "border-white/10 bg-black/30 hover:border-cyan-400"
                    }`}
                  >
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.title || "Produk"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">🎮</span>
                      )}
                    </div>

                    <div>
                      <p className="font-black">{product.title || "Tanpa judul"}</p>
                      <p className="mt-1 text-sm text-gray-400">
                        #{product.id} · {product.category || "-"} ·{" "}
                        {product.game_name || "-"}
                      </p>
                      <p className="mt-1 text-sm font-black text-cyan-300">
                        {formatPrice(product.price)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Judul Promo Kilat
              </label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={"Promo Kilat Akhir Pekan"}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Status
              </label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "active" | "inactive")
                }
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-yellow-400"
              >
                <option value="active">aktif</option>
                <option value="inactive">nonaktif</option>
              </select>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Harga Awal
              </label>
              <input
                type="number"
                value={originalPrice}
                onChange={(event) => setOriginalPrice(event.target.value)}
                placeholder="100000"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Harga Promo
              </label>
              <input
                type="number"
                value={flashPrice}
                onChange={(event) => setFlashPrice(event.target.value)}
                placeholder="75000"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Batas Stok
              </label>
              <input
                type="number"
                value={stockLimit}
                onChange={(event) => setStockLimit(event.target.value)}
                placeholder={"Opsional"}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Jumlah Terjual
              </label>
              <input
                type="number"
                value={soldCount}
                onChange={(event) => setSoldCount(event.target.value)}
                placeholder="0"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Waktu Mulai
              </label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Waktu Berakhir
              </label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-yellow-400"
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-bold text-gray-300">
              Deskripsi
            </label>

            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={"Jelaskan kampanye promo kilat ini..."}
              rows={4}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-7 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-black text-black transition hover:bg-yellow-300 disabled:opacity-60"
          >
            {saving
              ? "Menyimpan Promo Kilat..."
              : editingId
              ? "Perbarui Promo Kilat"
              : "Buat Promo Kilat"}
          </button>
        </form>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={"Cari promo kilat berdasarkan judul, produk, kategori, gim, atau ID..."}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="flex flex-wrap gap-3">
            {statusFilters.map((item) => (
              <button
                key={item}
                onClick={() => setActiveStatus(item)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  activeStatus === item
                    ? "bg-cyan-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-cyan-400 hover:text-white"
                }`}
              >
                {item === "all" ? "Semua" : item}
              </button>
            ))}
          </div>
        </div>

        {endedCount > 0 && (
          <div className="mb-8 rounded-3xl border border-red-400/20 bg-red-400/10 p-5">
            <p className="font-black text-red-300">
              {endedCount} kampanye promo kilat telah berakhir.
            </p>
          </div>
        )}

        {filteredFlashSales.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">Tidak ada promo kilat ditemukan.</h2>
            <p className="mt-3 text-gray-400">
              Buat kampanye promo kilat pertama melalui formulir di atas.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredFlashSales.map((item) => {
              const state = getFlashState(item);
              const product = item.products;
              const discountPercent =
                Number(item.original_price || 0) > 0
                  ? Math.round(
                      ((Number(item.original_price || 0) -
                        Number(item.flash_price || 0)) /
                        Number(item.original_price || 0)) *
                        100
                    )
                  : 0;

              const stockText =
                item.stock_limit === null
                  ? `${item.sold_count} / Unlimited`
                  : `${item.sold_count} / ${item.stock_limit}`;

              return (
                <div
                  key={item.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
                >
                  <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getStateClass(
                            state
                          )}`}
                        >
                          {adminLabel(state)}
                        </span>

                        <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-black text-yellow-300">
                          -{discountPercent}%
                        </span>

                        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-black text-gray-300">
                          #{item.id}
                        </span>
                      </div>

                      <div className="mt-5 flex flex-col gap-5 md:flex-row">
                        <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black md:w-36">
                          {product?.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.title || item.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-5xl">🎮</span>
                          )}
                        </div>

                        <div className="flex-1">
                          <p className="text-sm font-black text-cyan-300">
                            {product?.category || "-"} /{" "}
                            {product?.game_name || "-"}
                          </p>

                          <h2 className="mt-2 text-3xl font-black">
                            {item.title}
                          </h2>

                          <p className="mt-2 text-sm text-gray-400">
                            Produk: {product?.title || `#${item.product_id}`}
                          </p>

                          <p className="mt-4 text-sm leading-6 text-gray-300">
                            {item.description || "Tidak ada deskripsi."}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-4 md:grid-cols-4">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">
                            Harga Awal
                          </p>
                          <p className="mt-1 font-black line-through text-gray-400">
                            {formatPrice(item.original_price)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Harga Promo</p>
                          <p className="mt-1 text-xl font-black text-yellow-300">
                            {formatPrice(item.flash_price)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Stok</p>
                          <p className="mt-1 font-black">{stockText}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Status</p>
                          <p className="mt-1 font-black">{adminLabel(item.status)}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 md:col-span-2">
                          <p className="text-xs text-gray-500">Mulai</p>
                          <p className="mt-1 font-black">
                            {formatDate(item.start_at)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 md:col-span-2">
                          <p className="text-xs text-gray-500">Berakhir</p>
                          <p className="mt-1 font-black">
                            {formatDate(item.end_at)}
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
                        Ubah Promo Kilat
                      </button>

                      <button
                        onClick={() => quickStatus(item, "active")}
                        disabled={updatingId === item.id}
                        className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white hover:bg-green-400 disabled:opacity-60"
                      >
                        Aktifkan
                      </button>

                      <button
                        onClick={() => quickStatus(item, "inactive")}
                        disabled={updatingId === item.id}
                        className="rounded-2xl bg-yellow-500 px-5 py-3 font-black text-black hover:bg-yellow-400 disabled:opacity-60"
                      >
                        Nonaktifkan
                      </button>

                      {product && (
                        <Link
                          href={`/product/${product.id}`}
                          className="rounded-2xl border border-cyan-400 px-5 py-3 text-center font-black text-cyan-300 hover:bg-cyan-400 hover:text-black"
                        >
                          Lihat Produk
                        </Link>
                      )}

                      <button
                        onClick={() => deleteFlashSale(item)}
                        disabled={updatingId === item.id}
                        className="rounded-2xl border border-red-400/40 px-5 py-3 font-black text-red-300 hover:bg-red-500 hover:text-white disabled:opacity-60"
                      >
                        Hapus Promo Kilat
                      </button>

                      {updatingId === item.id && (
                        <p className="text-center text-sm text-gray-400">
                          Memperbarui promo kilat...
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
"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

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
  created_at: string;
  title: string | null;
  price: string | number | null;
  seller: string | null;
  seller_id: string | null;
  seller_name: string | null;
  description: string | null;
  category: string | null;
  category_id: number | null;
  game_name: string | null;
  game_category_id: number | null;
  slug: string | null;
  image_url: string | null;
  stock: number | null;
  status: string | null;
};

const productStatuses = ["all", "active", "hidden", "pending", "rejected"];

const statusOptions = ["active", "hidden", "pending", "rejected"];


function getStatusClass(status: string | null) {
  if (status === "active") return "border-green-400/20 bg-green-400/10 text-green-300";
  if (status === "hidden") return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  if (status === "rejected") return "border-red-400/20 bg-red-400/10 text-red-300";
  return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
}

export default function AdminProductManagementV1Page() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [updatingProductId, setUpdatingProductId] = useState<number | null>(null);

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const status = product.status || "active";
      const matchesStatus = activeStatus === "all" || status === activeStatus;

      const matchesSearch =
        !query ||
        String(product.id).includes(query) ||
        (product.title || "").toLowerCase().includes(query) ||
        (product.seller || "").toLowerCase().includes(query) ||
        (product.seller_name || "").toLowerCase().includes(query) ||
        (product.category || "").toLowerCase().includes(query) ||
        (product.game_name || "").toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [products, activeStatus, search]);

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .or("status.is.null,status.neq.deleted")
      .order("id", { ascending: false });

    if (error) {
      alert(adminText(error.message));
      return;
    }

    setProducts(data || []);
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
        await loadProducts();
      }

      setLoading(false);
    }

    initializePage();
  }, []);
  useLiveRefresh(async () => { await loadProducts(); }, { topics: 'admin' });

  async function updateProductStatus(productId: number, status: string) {
    setUpdatingProductId(productId);

    try {
      await authenticatedFetchJson("/api/admin/products", {
        method: "PATCH",
        body: JSON.stringify({ productId, status }),
      });

      await loadProducts();
    } catch (error) {
      alert(adminText(error instanceof Error ? error.message : "Gagal memperbarui status produk."));
    } finally {
      setUpdatingProductId(null);
    }
  }

  async function deleteProduct(productId: number) {
    const confirmed = confirm(
      "Hapus produk ini? Produk yang digunakan pesanan lama akan disembunyikan dari marketplace, sedangkan riwayat pesanan tetap disimpan.",
    );

    if (!confirmed) return;

    setUpdatingProductId(productId);

    try {
      const result = await authenticatedFetchJson<{
        ok: boolean;
        mode: "deleted" | "archived";
        message?: string;
      }>("/api/admin/products", {
        method: "DELETE",
        body: JSON.stringify({ productId }),
      });

      await loadProducts();

      if (result.mode === "archived") {
        alert(adminText(result.message || "Produk dihapus dari marketplace dan riwayat pesanan dipertahankan."));
      }
    } catch (error) {
      alert(adminText(error instanceof Error ? error.message : "Gagal menghapus produk."));
    } finally {
      setUpdatingProductId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Memuat produk admin...</p>
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Akses Ditolak</h1>
          <p className="mt-4 text-gray-300">Hanya admin yang dapat mengakses halaman ini.</p>
          <Link href="/" className="mt-6 inline-flex h-12 items-center rounded-full bg-cyan-400 px-6 font-black text-black">
            Kembali ke Beranda
          </Link>
        </div>
      </main>
    );
  }

  const activeCount = products.filter((p) => (p.status || "active") === "active").length;
  const hiddenCount = products.filter((p) => p.status === "hidden").length;
  const pendingCount = products.filter((p) => p.status === "pending").length;

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_34%)]" />

        <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Dasbor Admin
            </p>

            <h1 className="text-5xl font-black md:text-7xl">Pengelolaan Produk</h1>

            <p className="mt-5 max-w-2xl text-gray-300">
              Tinjau, sembunyikan, setujui, tolak, atau hapus produk penjual.
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
        <div className="mb-8 grid gap-5 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Produk</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">{products.length}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Aktif</p>
            <p className="mt-2 text-3xl font-black text-green-300">{activeCount}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Disembunyikan</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">{hiddenCount}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Menunggu</p>
            <p className="mt-2 text-3xl font-black text-blue-300">{pendingCount}</p>
          </div>
        </div>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={"Cari berdasarkan produk, penjual, kategori, gim, atau ID..."}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="flex flex-wrap gap-3">
            {productStatuses.map((status) => (
              <button
                key={status}
                onClick={() => setActiveStatus(status)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  activeStatus === status
                    ? "bg-cyan-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-cyan-400 hover:text-white"
                }`}
              >
                {adminLabel(status === "all" ? "Semua" : status)}
              </button>
            ))}
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center">
            <h2 className="text-3xl font-black">Tidak ada produk ditemukan.</h2>
            <p className="mt-3 text-gray-400">Produk muncul di sini setelah penjual mengunggah penawaran.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredProducts.map((product) => {
              const status = product.status || "active";

              return (
                <div
                  key={product.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
                >
                  <div className="grid gap-6 xl:grid-cols-[180px_1fr_280px]">
                    <div className="flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-black">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.title || "Produk"} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-5xl">🎮</span>
                      )}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black">{product.title || "Produk Tanpa Judul"}</h2>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(status)}`}>
                          {adminLabel(status)}
                        </span>
                      </div>

                      <p className="mt-3 text-3xl font-black text-cyan-300">
                        {formatPrice(product.price)}
                      </p>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">ID Produk</p>
                          <p className="mt-1 font-bold">#{product.id}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Penjual</p>
                          <p className="mt-1 break-words font-bold">
                            {product.seller_name || product.seller || product.seller_id || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Kategori</p>
                          <p className="mt-1 font-bold">{product.category || "-"}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Gim</p>
                          <p className="mt-1 font-bold">{product.game_name || "-"}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Stok</p>
                          <p className="mt-1 font-bold">{product.stock || 0}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Dibuat</p>
                          <p className="mt-1 font-bold">
                            {product.created_at ? new Date(product.created_at).toLocaleString() : "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <label className="text-sm font-bold text-gray-400">Status Admin</label>

                      <select
                        value={status}
                        onChange={(event) => updateProductStatus(product.id, event.target.value)}
                        disabled={updatingProductId === product.id}
                        className="rounded-2xl border border-white/10 bg-black px-4 py-3 font-bold text-white outline-none focus:border-cyan-400 disabled:opacity-60"
                      >
                        {statusOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => updateProductStatus(product.id, "active")}
                        disabled={updatingProductId === product.id}
                        className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white hover:bg-green-400 disabled:opacity-60"
                      >
                        Setujui / Tampilkan
                      </button>

                      <button
                        onClick={() => updateProductStatus(product.id, "hidden")}
                        disabled={updatingProductId === product.id}
                        className="rounded-2xl bg-yellow-400 px-5 py-3 font-black text-black hover:bg-yellow-300 disabled:opacity-60"
                      >
                        Sembunyikan Produk
                      </button>

                      <button
                        onClick={() => updateProductStatus(product.id, "rejected")}
                        disabled={updatingProductId === product.id}
                        className="rounded-2xl bg-red-500 px-5 py-3 font-black text-white hover:bg-red-400 disabled:opacity-60"
                      >
                        Tolak Produk
                      </button>

                      <Link
                        href={`/product/${product.id}`}
                        className="rounded-2xl border border-cyan-400/40 px-5 py-3 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
                      >
                        Lihat Produk
                      </Link>

                      {product.seller_id && (
                        <Link
                          href={`/seller-profile/${product.seller_id}`}
                          className="rounded-2xl border border-white/10 px-5 py-3 text-center font-black text-gray-300 transition hover:bg-white hover:text-black"
                        >
                          Lihat Penjual
                        </Link>
                      )}

                      <button
                        onClick={() => deleteProduct(product.id)}
                        disabled={updatingProductId === product.id}
                        className="rounded-2xl border border-red-400/40 px-5 py-3 font-black text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-60"
                      >
                        Hapus Produk
                      </button>

                      {updatingProductId === product.id && (
                        <p className="text-center text-sm text-gray-400">Memperbarui produk...</p>
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
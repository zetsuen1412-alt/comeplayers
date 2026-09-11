"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  FaBoxOpen,
  FaCheckCircle,
  FaCubes,
  FaEdit,
  FaExclamationTriangle,
  FaEye,
  FaFilter,
  FaGamepad,
  FaPauseCircle,
  FaPlus,
  FaPowerOff,
  FaSearch,
  FaStar,
  FaTag,
  FaThLarge,
  FaTrashAlt,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type SellerProfile = {
  id: string;
  email: string | null;
  seller_name: string | null;
  username: string | null;
};

type Product = {
  id: number;
  title: string;
  description: string | null;
  price: string | number | null;
  stock: number | null;
  image_url: string | null;
  status: string | null;
  category_name: string | null;
  category: string | null;
  created_at: string;
  has_variants?: boolean | null;
  variant_count?: number | null;
  min_variant_price?: string | number | null;
  max_variant_price?: string | number | null;
};

type FilterMode = "all" | "active" | "inactive" | "out-of-stock";
type SortMode = "newest" | "oldest" | "price-low" | "price-high" | "stock-high";

type MetricCardProps = {
  active?: boolean;
  icon: ReactNode;
  label: string;
  value: string | number;
  onClick?: () => void;
};

function productImageLoader({ src }: { src: string }) {
  return src;
}

function getProductStatus(product: Product) {
  const stock = Number(product.stock || 0);

  if (stock <= 0) {
    return {
      label: "Out Of Stock",
      className: "border-red-400/35 bg-red-500/10 text-red-300",
    };
  }

  if (product.status === "active") {
    return {
      label: "Active",
      className: "border-emerald-400/35 bg-emerald-500/10 text-emerald-300",
    };
  }

  return {
    label: "Inactive",
    className: "border-[#ffcc00]/35 bg-[#ffcc00]/10 text-[#ffe165]",
  };
}

function MetricCard({ active = false, icon, label, value, onClick }: MetricCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? active : undefined}
      className={`group relative min-h-[155px] overflow-hidden rounded-2xl border p-5 text-left transition duration-200 disabled:cursor-default sm:p-6 ${
        active
          ? "border-[#ffd21f] bg-[linear-gradient(145deg,rgba(255,204,0,.12),rgba(10,10,10,.96))] shadow-[0_18px_45px_rgba(255,190,0,.12)]"
          : onClick
          ? "border-[#ffcc00]/25 bg-[linear-gradient(145deg,rgba(255,255,255,.04),rgba(5,5,5,.95))] hover:-translate-y-0.5 hover:border-[#ffcc00]/55"
          : "border-[#ffcc00]/25 bg-[linear-gradient(145deg,rgba(255,255,255,.04),rgba(5,5,5,.95))]"
      }`}
    >
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#ffcc00]/80 to-transparent opacity-75" />
      <div className="flex items-center gap-3 text-[#ffcc00]">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#ffcc00]/25 bg-[#ffcc00]/10 text-lg">
          {icon}
        </span>
        <span className="text-sm font-bold text-[#b9bec8]">{label}</span>
      </div>
      <p className="mt-5 text-4xl font-black tracking-[-0.03em] text-white sm:text-5xl">
        {value}
      </p>
    </button>
  );
}

export default function SellerProductsPage() {
  const { formatPrice } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      const data = await authenticatedFetchJson<{
        profile: SellerProfile;
        products: Product[];
      }>("/api/seller/catalog");

      setSeller(data.profile);
      setProducts(data.products || []);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteProduct(id: number) {
    if (!confirm("Delete or archive this product?")) return;

    setUpdatingId(id);
    try {
      const result = await authenticatedFetchJson<{ archived?: boolean }>(
        "/api/seller/catalog",
        {
          method: "DELETE",
          body: JSON.stringify({ productId: id }),
        }
      );

      if (result.archived) {
        alert("This product has order history, so it was safely deactivated instead of deleted.");
      }
      await loadProducts();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to remove product.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleStatus(product: Product) {
    setUpdatingId(product.id);

    try {
      await authenticatedFetchJson("/api/seller/catalog", {
        method: "PATCH",
        body: JSON.stringify({
          productId: product.id,
          action: "status",
          status: product.status === "active" ? "inactive" : "active",
        }),
      });
      await loadProducts();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update product status.");
    } finally {
      setUpdatingId(null);
    }
  }

  const activeProducts = products.filter(
    (product) => product.status === "active" && Number(product.stock || 0) > 0
  ).length;

  const inactiveProducts = products.filter(
    (product) => product.status !== "active"
  ).length;

  const outOfStockProducts = products.filter(
    (product) => Number(product.stock || 0) <= 0
  ).length;

  const totalStock = products.reduce(
    (sum, product) => sum + Number(product.stock || 0),
    0
  );

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const result = products.filter((product) => {
      const matchesSearch =
        !keyword ||
        product.title.toLowerCase().includes(keyword) ||
        (product.description || "").toLowerCase().includes(keyword) ||
        (product.category_name || "").toLowerCase().includes(keyword) ||
        (product.category || "").toLowerCase().includes(keyword);

      if (!matchesSearch) return false;

      if (filter === "active") {
        return product.status === "active" && Number(product.stock || 0) > 0;
      }

      if (filter === "inactive") {
        return product.status !== "active";
      }

      if (filter === "out-of-stock") {
        return Number(product.stock || 0) <= 0;
      }

      return true;
    });

    return [...result].sort((a, b) => {
      if (sort === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }

      if (sort === "price-low") {
        return Number(a.price || 0) - Number(b.price || 0);
      }

      if (sort === "price-high") {
        return Number(b.price || 0) - Number(a.price || 0);
      }

      if (sort === "stock-high") {
        return Number(b.stock || 0) - Number(a.stock || 0);
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [filter, products, search, sort]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
        <div className="text-center">
          <div className="mx-auto h-11 w-11 animate-spin rounded-full border-2 border-[#ffcc00]/20 border-t-[#ffcc00]" />
          <p className="mt-5 font-bold text-[#d8d8d8]">Loading products...</p>
        </div>
      </main>
    );
  }

  const sellerName =
    seller?.seller_name || seller?.username || seller?.email || "Seller";

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <section className="relative mx-auto mt-6 max-w-[1500px] overflow-hidden rounded-3xl border border-[#ffcc00]/35 bg-[#090909] shadow-[0_18px_65px_rgba(0,0,0,.45)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(255,196,0,.12),transparent_32%),linear-gradient(115deg,#090909_0%,#060606_55%,#120d00_100%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,204,0,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,204,0,.07)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:linear-gradient(to_right,black,transparent_72%)]" />
        <div
          className="pointer-events-none absolute -right-12 top-1/2 hidden h-[430px] w-[560px] -translate-y-1/2 bg-contain bg-center bg-no-repeat opacity-[0.12] grayscale sepia lg:block"
          style={{ backgroundImage: "url('/brand/comeplayers-cp-v6.png')" }}
        />
        <div className="absolute right-0 top-0 hidden h-full w-[48%] bg-[linear-gradient(135deg,transparent_18%,rgba(255,204,0,.08)_18.3%,transparent_18.7%,transparent_57%,rgba(255,204,0,.07)_57.3%,transparent_57.7%)] lg:block" />

        <div className="relative z-10 px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
          <div className="flex flex-col gap-7 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#ffcc00]/30 bg-black/50 px-4 py-2 text-sm font-black text-[#ffd739]">
                <FaStar /> Seller Products V18
              </p>

              <h1 className="mt-7 text-5xl font-black tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                My{" "}
                <span className="bg-gradient-to-b from-[#fff5a6] via-[#ffd431] to-[#eaa300] bg-clip-text text-transparent">
                  Products
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-[#b8bec9] sm:text-lg">
                Search, filter, edit, publish, pause, and manage your marketplace listings from one seller inventory dashboard.
              </p>

              <p className="mt-5 text-sm font-semibold text-[#747b88]">
                Seller: <span className="text-[#b9bec8]">{sellerName}</span>
              </p>
            </div>

            <div className="flex max-w-3xl flex-wrap gap-3 xl:justify-end">
              <Link
                href="/seller"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/35 px-5 py-3 font-bold text-[#e2e5ea] transition hover:border-[#ffcc00]/60 hover:text-[#ffdc45]"
              >
                <FaThLarge /> Dashboard
              </Link>

              <Link
                href="/seller/inventory"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/35 px-5 py-3 font-bold text-[#e2e5ea] transition hover:border-[#ffcc00]/60 hover:text-[#ffdc45]"
              >
                <FaCubes /> Bulk Inventory
              </Link>

              <Link
                href="/seller/products/import"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/35 px-5 py-3 font-bold text-[#e2e5ea] transition hover:border-[#ffcc00]/60 hover:text-[#ffdc45]"
              >
                <FaTag /> Spreadsheet Center
              </Link>

              <Link
                href="/seller/products/new"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#ffe56a] bg-gradient-to-r from-[#ffd936] via-[#ffc400] to-[#efa500] px-6 py-3 font-black text-black shadow-[0_12px_32px_rgba(255,186,0,.2)] transition hover:-translate-y-0.5 hover:brightness-110"
              >
                <FaPlus /> Add Product
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-0 lg:py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            active={filter === "all"}
            icon={<FaBoxOpen />}
            label="Total Products"
            value={products.length}
            onClick={() => setFilter("all")}
          />
          <MetricCard
            active={filter === "active"}
            icon={<FaCheckCircle />}
            label="Active"
            value={activeProducts}
            onClick={() => setFilter("active")}
          />
          <MetricCard
            active={filter === "inactive"}
            icon={<FaPauseCircle />}
            label="Inactive"
            value={inactiveProducts}
            onClick={() => setFilter("inactive")}
          />
          <MetricCard
            active={filter === "out-of-stock"}
            icon={<FaExclamationTriangle />}
            label="Out Of Stock"
            value={outOfStockProducts}
            onClick={() => setFilter("out-of-stock")}
          />
          <MetricCard icon={<FaCubes />} label="Total Stock" value={totalStock} />
        </div>

        <div className="mt-7 rounded-2xl border border-[#ffcc00]/25 bg-[linear-gradient(145deg,rgba(255,255,255,.035),rgba(5,5,5,.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">
          <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
            <label className="relative block">
              <FaSearch className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#8f96a3]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by title, description, or category..."
                className="w-full rounded-xl border border-[#ffcc00]/25 bg-[#070707] py-4 pl-12 pr-5 text-white outline-none placeholder:text-[#626a78] transition focus:border-[#ffcc00]/70 focus:shadow-[0_0_0_3px_rgba(255,204,0,.08)]"
              />
            </label>

            <label className="relative block">
              <FaFilter className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#ffcc00]" />
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as FilterMode)}
                className="w-full appearance-none rounded-xl border border-[#ffcc00]/25 bg-[#070707] py-4 pl-12 pr-12 font-bold text-white outline-none transition focus:border-[#ffcc00]/70"
              >
                <option value="all">All Products</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="out-of-stock">Out Of Stock</option>
              </select>
              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[#ffcc00]">⌄</span>
            </label>
          </div>
        </div>

        <div className="mt-7 overflow-hidden rounded-2xl border border-[#ffcc00]/25 bg-[linear-gradient(145deg,rgba(255,255,255,.025),rgba(5,5,5,.97))]">
          <div className="flex flex-col gap-4 border-b border-[#ffcc00]/20 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2 className="text-2xl font-black">Products ({filteredProducts.length})</h2>
              <p className="mt-1 text-sm text-[#7e8591]">Manage every listing from one clean ComePlayers workspace.</p>
            </div>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="rounded-xl border border-[#ffcc00]/25 bg-[#080808] px-4 py-3 font-bold text-white outline-none transition focus:border-[#ffcc00]/70"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="stock-high">Highest Stock</option>
            </select>
          </div>

          {products.length === 0 ? (
            <div className="px-5 py-16 text-center sm:px-8">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl border border-[#ffcc00]/30 bg-[#ffcc00]/10 text-3xl text-[#ffcc00]">
                <FaGamepad />
              </div>
              <h2 className="mt-6 text-3xl font-black">No Products Yet</h2>
              <p className="mt-3 text-[#8d94a1]">Create your first ComePlayers marketplace listing.</p>
              <Link
                href="/seller/products/new"
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#ffd936] to-[#f0a900] px-6 py-3 font-black text-black transition hover:brightness-110"
              >
                <FaPlus /> Add Product
              </Link>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="px-5 py-16 text-center sm:px-8">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl border border-[#ffcc00]/30 bg-[#ffcc00]/10 text-3xl text-[#ffcc00]">
                <FaSearch />
              </div>
              <h2 className="mt-6 text-3xl font-black">No Products Found</h2>
              <p className="mt-3 text-[#8d94a1]">Try another keyword or change your product filter.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
                className="mt-7 rounded-xl border border-[#ffcc00]/50 px-6 py-3 font-black text-[#ffdc45] transition hover:bg-[#ffcc00] hover:text-black"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div className="grid gap-5 p-4 sm:p-6">
              {filteredProducts.map((product) => {
                const status = getProductStatus(product);
                const isUpdating = updatingId === product.id;

                return (
                  <article
                    key={product.id}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,.035),rgba(5,5,5,.98))] transition hover:border-[#ffcc00]/45"
                  >
                    <div className="grid lg:grid-cols-[230px_1fr]">
                      <div className="relative flex min-h-[210px] items-center justify-center overflow-hidden border-b border-white/10 bg-black/55 lg:border-b-0 lg:border-r">
                        {product.image_url ? (
                          <Image
                            loader={productImageLoader}
                            unoptimized
                            fill
                            sizes="(min-width: 1024px) 230px, 100vw"
                            src={product.image_url}
                            alt={product.title}
                            className="object-cover transition duration-500 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="text-center text-[#ffcc00]">
                            <FaGamepad className="mx-auto text-5xl" />
                            <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-[#6f7682]">ComePlayers</p>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                      </div>

                      <div className="p-5 sm:p-6">
                        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="break-words text-2xl font-black tracking-[-0.02em]">
                                {product.title}
                              </h3>
                              <span className={`rounded-full border px-3 py-1 text-xs font-black ${status.className}`}>
                                {status.label}
                              </span>
                              {product.has_variants ? (
                                <span className="rounded-full border border-[#ffcc00]/25 bg-[#ffcc00]/10 px-3 py-1 text-xs font-black text-[#ffd83d]">
                                  {Number(product.variant_count || 0)} Variants
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-3 inline-flex items-center gap-2 text-sm font-black text-[#ffcc00]">
                              <FaTag /> {product.category_name || product.category || "Game Product"}
                            </p>

                            <p className="mt-4 line-clamp-3 max-w-3xl leading-6 text-[#979eaa]">
                              {product.description || "No description provided."}
                            </p>

                            <p className="mt-4 text-xs font-semibold text-[#5f6672]">
                              Created: {product.created_at ? new Date(product.created_at).toLocaleString("en-US") : "-"}
                            </p>
                          </div>

                          <div className="grid min-w-[230px] grid-cols-2 gap-3 rounded-xl border border-[#ffcc00]/20 bg-black/35 p-4 xl:grid-cols-1">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#747c88]">Price</p>
                              <p className="mt-1 text-2xl font-black text-[#ffd638]">
                                {formatPrice(product.price)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#747c88]">Stock</p>
                              <p className={`mt-1 text-2xl font-black ${Number(product.stock || 0) <= 0 ? "text-red-300" : "text-white"}`}>
                                {Number(product.stock || 0).toLocaleString("en-US")}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-5">
                          <Link
                            href={`/seller/products/${product.id}/edit`}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#ffd936] to-[#f0a900] px-5 py-3 font-black text-black transition hover:brightness-110"
                          >
                            <FaEdit /> Edit
                          </Link>

                          <Link
                            href={`/product/${product.id}`}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/25 px-5 py-3 font-black text-[#e0e4e9] transition hover:border-[#ffcc00]/60 hover:text-[#ffdc45]"
                          >
                            <FaEye /> View Product
                          </Link>

                          <button
                            type="button"
                            onClick={() => toggleStatus(product)}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#ffcc00]/35 bg-[#ffcc00]/10 px-5 py-3 font-black text-[#ffdb42] transition hover:bg-[#ffcc00] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <FaPowerOff />
                            {isUpdating ? "Updating..." : product.status === "active" ? "Deactivate" : "Activate"}
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteProduct(product.id)}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-3 font-black text-red-300 transition hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <FaTrashAlt /> {isUpdating ? "Processing..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

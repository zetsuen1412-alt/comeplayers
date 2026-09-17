import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Category = {
  id: number | string;
  name: string;
  slug?: string | null;
  icon?: string | null;
};

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function AdminCategoryMappingUnifiedPage() {
  const { data: categories } = await supabase
    .from("categories")
    .select("id,name,slug,icon")
    .order("id", { ascending: true });

  const categoryShortcuts = (categories || []) as Category[];

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_34%)]" />

        <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Katalog Marketplace Terpadu
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Pemetaan Kategori
            </h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Halaman kategori ComePlayers menggunakan pemetaan data induk gim dan penawaran aktif. Tambahkan kategori marketplace ke gim, atau terbitkan produk aktif dalam kategori tersebut agar muncul di katalog kategori publik.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/categories"
              className="inline-flex h-12 items-center justify-center rounded-full border border-violet-400/50 px-6 font-black text-violet-300 transition hover:bg-violet-400 hover:text-black"
            >
              Kelola Kategori
            </Link>

            <Link
              href="/admin/games"
              className="inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black transition hover:bg-cyan-300"
            >
              Kelola Data Induk Gim
            </Link>

            <Link
              href="/admin"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 px-6 font-bold text-gray-300 transition hover:bg-white hover:text-black"
            >
              Kembali ke Admin
            </Link>
          </div>
        </div>
      </section>

      <section className="px-8 py-10">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black text-cyan-300">
              Aturan katalog
            </h2>

            <div className="mt-6 space-y-4 text-gray-300">
              <p>
                URL kategori publik membuka halaman gim lokal dengan filter kategori:
              </p>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-5 font-mono text-sm text-gray-200">
                /categories/category-slug → /games?category=category-slug
              </div>

              <p>
                Saat pembeli memilih gim yang dipetakan, pembeli langsung diarahkan ke halaman penawaran gim dengan filter tersebut:
              </p>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-5 font-mono text-sm text-gray-200">
                /games/mobile-legends/offers?category=category-name
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">Tindakan admin</h2>

            <p className="mt-4 text-gray-300">
              Untuk mengatur tampilan marketplace, kelola gim aktif di Data Induk Gim, tetapkan kategori gim, dan pastikan produk penjual/admin tetap aktif agar penawarannya ditampilkan.
            </p>

            <div className="mt-6 grid gap-3">
              <Link
                href="/admin/games"
                className="rounded-2xl border border-cyan-400/40 px-5 py-4 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
              >
                Buka Data Induk Gim
              </Link>

              <Link
                href="/admin/products"
                className="rounded-2xl border border-purple-400/40 px-5 py-4 text-center font-black text-purple-300 transition hover:bg-purple-400 hover:text-black"
              >
                Buka Pengelolaan Produk
              </Link>

              <Link
                href="/games"
                className="rounded-2xl border border-white/10 px-5 py-4 text-center font-black text-gray-300 transition hover:bg-white hover:text-black"
              >
                Pratinjau Katalog Gim Publik
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
          <h2 className="text-3xl font-black">Pintasan kategori aktif</h2>

          {categoryShortcuts.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-5 text-yellow-100">
              Tidak ada kategori ditemukan. Tambahkan baris pada tabel categories agar filter marketplace muncul di sini.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {categoryShortcuts.map((category) => {
                const slug = category.slug || toSlug(category.name);

                return (
                  <Link
                    key={category.id || slug}
                    href={`/games?category=${slug}`}
                    className="group rounded-3xl border border-white/10 bg-black/30 p-6 transition hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-400/10"
                  >
                    <div className="text-4xl">{category.icon || "🏷️"}</div>
                    <h3 className="mt-4 text-xl font-black group-hover:text-cyan-300">
                      {category.name}
                    </h3>
                    <p className="mt-2 text-sm text-gray-400">
                      Pratinjau filter katalog yang dipetakan
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

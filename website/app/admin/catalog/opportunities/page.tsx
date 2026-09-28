"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { createCsv } from "@/lib/csv";

type CategoryCode = "coin" | "boosting" | "item" | "account";
type CategoryFilter = "all" | CategoryCode;

type Opportunity = {
  gameId: number;
  gameName: string;
  gameSlug: string;
  categoryCode: CategoryCode;
  sourceUrl: string | null;
  title: string;
  description: string;
};

type OpportunityResponse = {
  items: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 50;
const MAX_CSV_ROWS = 5000;

const CATEGORIES: Array<{
  code: CategoryFilter;
  label: string;
  csvLabel?: string;
}> = [
  { code: "all", label: "Semua" },
  { code: "boosting", label: "Jasa Joki", csvLabel: "Boosting" },
  { code: "item", label: "Item", csvLabel: "Game Items" },
  { code: "coin", label: "Koin Game", csvLabel: "Game Coins" },
  { code: "account", label: "Akun Game", csvLabel: "Game Accounts" },
];

const CSV_HEADERS = [
  "category",
  "game",
  "product_title",
  "currency",
  "price",
  "stock",
  "delivery_eta",
  "region",
  "platform",
  "server_realm",
  "description",
  "status",
];

function opportunityUrl(
  page: number,
  category: CategoryFilter,
  search: string,
  pageSize = PAGE_SIZE,
) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (category !== "all") params.set("category", category);
  if (search) params.set("search", search);
  return `/api/admin/catalog/opportunities?${params.toString()}`;
}

function categoryLabel(code: CategoryCode) {
  return CATEGORIES.find((category) => category.code === code)?.label || code;
}

function csvCategoryLabel(code: CategoryCode) {
  return CATEGORIES.find((category) => category.code === code)?.csvLabel || code;
}

function sourceLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      (url.hostname === "g2g.com" || url.hostname.endsWith(".g2g.com"))
    ) {
      return url.toString();
    }
  } catch {
    // A missing category reference does not prevent drafting an offer.
  }
  return null;
}

function offerLink(item: Opportunity) {
  const params = new URLSearchParams({
    game: item.gameSlug,
    category: item.categoryCode,
    offerTemplate: "evo-gaming",
  });
  return `/seller/products/new?${params.toString()}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function CatalogOpportunitiesPage() {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<OpportunityResponse | null>(null);
  const [counts, setCounts] = useState<{
    search: string;
    values: Partial<Record<CategoryFilter, number>>;
  }>({ search: "", values: {} });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError("");
    });

    void authenticatedFetchJson<OpportunityResponse>(
      opportunityUrl(page, category, search),
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setPayload(data);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setPayload(null);
          setError(errorMessage(loadError, "Gagal memuat ide penawaran."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [category, page, search]);

  useEffect(() => {
    const controller = new AbortController();

    void Promise.allSettled(
      CATEGORIES.map((entry) =>
        authenticatedFetchJson<OpportunityResponse>(
          opportunityUrl(1, entry.code, search, 1),
          { signal: controller.signal },
        ),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const nextCounts: Partial<Record<CategoryFilter, number>> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          nextCounts[CATEGORIES[index].code] = result.value.total;
        }
      });
      setCounts({ search, values: nextCounts });
    });

    return () => controller.abort();
  }, [search]);

  async function downloadCsv() {
    setExporting(true);
    setError("");
    setExportMessage("");

    try {
      const firstPage = await authenticatedFetchJson<OpportunityResponse>(
        opportunityUrl(1, category, search),
      );
      if (firstPage.total < 1) {
        setExportMessage("Tidak ada ide untuk diunduh pada filter ini.");
        return;
      }

      const limit = Math.min(firstPage.total, MAX_CSV_ROWS);
      const items = [...firstPage.items];
      const pages = Math.ceil(limit / PAGE_SIZE);
      for (let first = 2; first <= pages; first += 5) {
        const pageNumbers = Array.from(
          { length: Math.min(5, pages - first + 1) },
          (_, index) => first + index,
        );
        const group = await Promise.all(
          pageNumbers.map((nextPage) =>
            authenticatedFetchJson<OpportunityResponse>(
              opportunityUrl(nextPage, category, search),
            ),
          ),
        );
        group.forEach((next) => items.push(...next.items));
      }

      const rows = items.slice(0, limit).map((item) => [
        csvCategoryLabel(item.categoryCode),
        item.gameName,
        item.title,
        "IDR",
        "",
        0,
        "ISI ETA",
        "Global",
        "Any",
        "",
        item.description,
        "inactive",
      ]);
      const csv = `\uFEFF${createCsv(CSV_HEADERS, rows)}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `comeplayers-ide-penawaran-${category}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setExportMessage(
        firstPage.total > MAX_CSV_ROWS
          ? `CSV berisi ${MAX_CSV_ROWS.toLocaleString("id-ID")} ide pertama. Gunakan filter kategori atau pencarian untuk mengunduh sisanya.`
          : `${rows.length.toLocaleString("id-ID")} ide berhasil diunduh sebagai CSV draf.`,
      );
    } catch (downloadError) {
      setError(errorMessage(downloadError, "Gagal mengunduh CSV draf."));
    } finally {
      setExporting(false);
    }
  }

  const total = payload?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstVisible = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastVisible = Math.min(page * PAGE_SIZE, total);

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.17),transparent_38%),radial-gradient(circle_at_top_right,rgba(250,204,21,.12),transparent_38%)] px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-200">
              Peluang Katalog ComePlayers
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
              Ide penawaran per game
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Daftar ini membantu tim EVO GAMING FARMING HOUSE menyiapkan layanan dan produk untuk game yang ada di katalog. Judul dan deskripsi adalah ide asli ComePlayers, bukan salinan penawaran penjual G2G. Periksa katalog penjual sebelum membuat produk agar tidak duplikat.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/seller/products/import" className="rounded-xl border border-cyan-400/40 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-400/10">
              Buka Impor Spreadsheet
            </Link>
            <Link href="/admin/games" className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-slate-200 transition hover:border-white/40">
              Katalog Game
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100 sm:p-5">
          <strong className="block text-base">Ide katalog untuk ditinjau</strong>
          Kartu ini tidak memeriksa apakah produk serupa sudah dijual. Pastikan tim dapat memenuhi pesanan, lalu tetapkan harga, stok, cakupan layanan, dan waktu pengerjaan yang benar. CSV draf berisi harga kosong, stok 0, penanda <span className="font-bold">ISI ETA</span>, dan status <span className="font-bold">inactive</span>. Setelah data dilengkapi dan diimpor, aktifkan produk secara manual. Hindari impor ulang CSV yang sama agar tidak membuat duplikat.
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <label className="grid w-full max-w-xl gap-2 text-sm font-semibold text-slate-200">
              Cari nama game
              <input
                type="search"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
                placeholder="Contoh: Aion atau Wuthering Waves"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
              />
            </label>
            <button
              type="button"
              disabled={exporting || loading || total === 0}
              onClick={() => void downloadCsv()}
              className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Menyiapkan CSV..." : "Unduh CSV draf"}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter kategori">
            {CATEGORIES.map((entry) => {
              const active = category === entry.code;
              const count = counts.search === search ? counts.values[entry.code] : undefined;
              return (
                <button
                  key={entry.code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setCategory(entry.code);
                    setPage(1);
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-bold transition ${active ? "border-cyan-300 bg-cyan-400 text-slate-950" : "border-white/15 bg-slate-950 text-slate-200 hover:border-cyan-400/60"}`}
                >
                  {entry.label} <span className={active ? "text-slate-800" : "text-slate-400"}>{count === undefined ? "· …" : `· ${count.toLocaleString("id-ID")}`}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error ? <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{error}</div> : null}
        {exportMessage ? <div role="status" className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">{exportMessage}</div> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <p aria-live="polite">
            {loading ? "Memuat ide penawaran..." : `Menampilkan ${firstVisible.toLocaleString("id-ID")}–${lastVisible.toLocaleString("id-ID")} dari ${total.toLocaleString("id-ID")} ide`}
          </p>
          <p>Harga &amp; stok perlu diisi sebelum dijual</p>
        </div>

        {!loading && payload?.items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-slate-300">
            Tidak ada ide yang cocok. Coba kata kunci atau kategori lain.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(loading ? [] : payload?.items || []).map((item) => {
            const reference = sourceLink(item.sourceUrl);
            return (
              <article key={`${item.gameId}-${item.categoryCode}-${item.title}`} className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-cyan-200">{categoryLabel(item.categoryCode)}</span>
                  <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-amber-100">Ide katalog</span>
                </div>
                <p className="mt-5 text-sm font-semibold text-slate-400">{item.gameName}</p>
                <h2 className="mt-1 text-xl font-black leading-snug text-white">{item.title}</h2>
                <p className="mt-3 flex-1 text-sm leading-6 text-slate-300">{item.description}</p>
                <p className="mt-4 text-xs font-semibold text-amber-200">Harga &amp; stok perlu diisi · ETA perlu dikonfirmasi</p>
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4 text-sm">
                  <Link href={offerLink(item)} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-slate-950 transition hover:bg-cyan-300">
                    Buat penawaran
                  </Link>
                  {reference ? (
                    <a href={reference} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-300 underline decoration-slate-600 underline-offset-4 hover:text-white">
                      Referensi kategori
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {!loading && total > PAGE_SIZE ? (
          <nav aria-label="Halaman ide penawaran" className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold disabled:opacity-40">
              Sebelumnya
            </button>
            <span className="text-sm text-slate-300">Halaman {page.toLocaleString("id-ID")} dari {totalPages.toLocaleString("id-ID")}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold disabled:opacity-40">
              Berikutnya
            </button>
          </nav>
        ) : null}
      </div>
    </main>
  );
}

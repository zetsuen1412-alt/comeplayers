"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCurrency } from "@/components/CurrencyProvider";
import {
  authenticatedFetch,
  authenticatedFetchJson,
} from "@/lib/authenticatedFetch";
import {
  BULK_LISTING_API_BATCH_ROWS,
  readBulkListingFile,
  type BulkListingRecord,
} from "@/lib/bulkListingSpreadsheet";

type PreviewRow = {
  rowNumber: number;
  action: "create" | "update";
  productId: number | null;
  title: string;
  description: string;
  priceCurrency: string | null;
  enteredPrice: number;
  price: number;
  stock: number;
  status: "active" | "inactive";
  deliveryEtaMinutes: number;
  categoryId: number | null;
  category: string;
  gameId: number | null;
  gameName: string;
  imageUrl: string;
  offerRegion: string;
  offerPlatform: string;
  offerServer: string;
  offerTags: string[];
  slug: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
};

type PreviewResponse = {
  rows: PreviewRow[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    creates: number;
    updates: number;
    warnings: number;
  };
};

type CommitResponse = {
  ok: boolean;
  idempotent?: boolean;
  summary: {
    total: number;
    created: number;
    updated: number;
    pendingReview: number;
    failed: number;
  };
  results: Array<{
    rowNumber: number;
    action: "create" | "update";
    productId: number | null;
    title: string;
    ok: boolean;
    published?: boolean;
    error?: string;
  }>;
  history?: {
    id: string | null;
    recorded: boolean;
    warning: string | null;
  };
};

type ImportHistoryItem = {
  id: string;
  request_token: string;
  source_filename: string;
  source_format: "csv" | "xlsx";
  source_sheet: string | null;
  source_size_bytes: number;
  status: "processing" | "completed" | "partial" | "failed";
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  created_rows: number;
  updated_rows: number;
  pending_review_rows: number;
  failed_rows: number;
  warning_count: number;
  started_at: string;
  completed_at: string | null;
};

type ImportHistoryResponse = {
  available: boolean;
  migration?: string;
  imports: ImportHistoryItem[];
};

const EN_COPY = {
  badge: "Seller Spreadsheet Center",
  title: "Manage Products with a Spreadsheet",
  intro:
    "Create up to 5,000 products from one spreadsheet, validate every row before publishing, export your current catalog, and keep a complete import history.",
  products: "Products",
  inventory: "Inventory Center",
  orders: "Seller Orders",
  stepTemplate: "Step 1 · Download template",
  templateTitle: "Start with the controlled product template",
  templateCopy:
    "The file starts blank. Category, Game, Currency, Delivery ETA, and Platform use controlled dropdowns. Active games are loaded from the ComePlayers database when the file is downloaded.",
  downloadTemplate: "Download Product Template",
  downloading: "Downloading...",
  exportTitle: "Export your current products",
  exportEyebrow: "Catalog export",
  exportCopy:
    "Download your seller catalog as an Excel spreadsheet for backup, review, or reporting. Each product keeps the currency and amount chosen by the seller.",
  exportButton: "Export Products to Excel",
  exporting: "Exporting...",
  tenColumns: "Exactly 11 columns",
  columnsAria: "Spreadsheet columns",
  workflowOne: "Download the controlled Excel template.",
  workflowTwo: "Fill one product per row using the provided choices.",
  workflowThree: "Upload and validate before anything is saved.",
  guideTitle: "What to fill in each column",
  guideCopy:
    "Do not add, delete, or rename columns. Product numbers, IDs, status, and URLs are created automatically by ComePlayers.",
  column: "Column",
  required: "Required",
  entryGuide: "What to enter",
  example: "Example",
  yes: "Yes",
  optional: "Optional",
  uploadTitle: "Step 2 · Upload and validate",
  uploadEmpty: "Choose an Excel .xlsx or UTF-8 CSV file, maximum 8 MB and 5,000 rows. Large files are processed safely in automatic batches.",
  reset: "Reset",
  reading: "Reading...",
  chooseFile: "Choose CSV / Excel",
  validating: "Validating...",
  validate: "Validate Preview",
  rows: "Rows",
  valid: "Valid",
  invalid: "Invalid",
  newProducts: "New Products",
  warnings: "Warnings",
  reviewTitle: "Step 3 · Review and import",
  reviewFix: "Fix invalid rows in the spreadsheet, upload it again, and revalidate.",
  reviewReady: "All rows passed server validation and are ready to import.",
  importing: "Importing...",
  importButton: "Import Validated Products",
  no: "No.",
  product: "Product",
  gameCategory: "Game / Category",
  priceStock: "Price / Stock",
  delivery: "Delivery",
  validation: "Validation",
  untitled: "Untitled",
  noDescription: "No description",
  invalidValue: "Invalid",
  stock: "Stock",
  minutes: "minutes",
  ready: "Ready",
  correction: "Needs correction",
  completed: "Import completed",
  completedErrors: "Import completed with errors",
  duplicateSafe:
    "This request had already been processed, so no duplicate products were created.",
  viewProducts: "View Products",
  historyTitle: "Import History",
  historyCopy: "Review the latest 30 imports and download row-level result reports.",
  refreshing: "Refreshing...",
  refresh: "Refresh History",
  historyUnavailable:
    "Import history is not available yet. Spreadsheet import remains available.",
  noHistory: "No committed imports yet.",
  date: "Date",
  source: "Source",
  status: "Status",
  createdUpdated: "Created / Updated",
  reviewFailed: "Review / Failed",
  report: "Report",
  warning: "warning",
  downloadCsv: "Download CSV",
  confirmImport: "Import {creates} new products now?",
  resultSummary: "Created {created}, pending review {review}, failed {failed}.",
  rowError: "Row {row} · {title}: {error}",
  unknownError: "Unknown error",
  downloadReportError: "Failed to download the import report.",
  downloadTemplateError: "Failed to download the spreadsheet.",
  exportError: "Failed to export products.",
  readError: "Failed to read CSV or Excel file.",
  validateError: "Failed to validate the uploaded file.",
  importError: "Failed to import products.",
} as const;

const ID_COPY: Record<keyof typeof EN_COPY, string> = {
  badge: "Pusat Spreadsheet Penjual",
  title: "Kelola Produk dengan Spreadsheet",
  intro:
    "Buat hingga 5.000 produk dari satu spreadsheet, periksa setiap baris sebelum diterbitkan, ekspor katalog, dan lihat riwayat impor secara lengkap.",
  products: "Produk",
  inventory: "Pusat Inventaris",
  orders: "Pesanan Penjual",
  stepTemplate: "Langkah 1 · Unduh template",
  templateTitle: "Mulai dengan template produk terkontrol",
  templateCopy:
    "File dimulai kosong. Kategori, Game, Mata Uang, Estimasi Pengiriman, dan Platform memakai pilihan terkontrol. Daftar game aktif diambil dari database ComePlayers saat file diunduh.",
  downloadTemplate: "Unduh Template Produk",
  downloading: "Mengunduh...",
  exportTitle: "Ekspor produk Anda saat ini",
  exportEyebrow: "Ekspor katalog",
  exportCopy:
    "Unduh katalog penjual dalam Excel untuk cadangan, pemeriksaan, atau laporan. Setiap produk mempertahankan mata uang dan nominal yang dipilih seller.",
  exportButton: "Ekspor Produk ke Excel",
  exporting: "Mengekspor...",
  tenColumns: "Tepat 11 kolom",
  columnsAria: "Kolom spreadsheet",
  workflowOne: "Unduh template Excel dengan pilihan terkontrol.",
  workflowTwo: "Isi satu produk per baris memakai pilihan yang tersedia.",
  workflowThree: "Unggah dan validasi sebelum data disimpan.",
  guideTitle: "Panduan pengisian setiap kolom",
  guideCopy:
    "Jangan menambah, menghapus, atau mengganti nama kolom. Nomor, ID produk, status, dan URL dibuat otomatis oleh ComePlayers.",
  column: "Kolom",
  required: "Wajib",
  entryGuide: "Yang harus diisi",
  example: "Contoh",
  yes: "Ya",
  optional: "Opsional",
  uploadTitle: "Langkah 2 · Unggah dan validasi",
  uploadEmpty: "Pilih file Excel .xlsx atau CSV UTF-8, maksimal 8 MB dan 5.000 baris. File besar diproses otomatis dalam beberapa batch aman.",
  reset: "Atur Ulang",
  reading: "Membaca...",
  chooseFile: "Pilih CSV / Excel",
  validating: "Memvalidasi...",
  validate: "Validasi Pratinjau",
  rows: "Baris",
  valid: "Valid",
  invalid: "Tidak Valid",
  newProducts: "Produk Baru",
  warnings: "Peringatan",
  reviewTitle: "Langkah 3 · Periksa dan impor",
  reviewFix: "Perbaiki baris yang tidak valid, unggah kembali, lalu validasi ulang.",
  reviewReady: "Semua baris lolos validasi server dan siap diimpor.",
  importing: "Mengimpor...",
  importButton: "Impor Produk Tervalidasi",
  no: "No.",
  product: "Produk",
  gameCategory: "Game / Kategori",
  priceStock: "Harga / Stok",
  delivery: "Pengiriman",
  validation: "Validasi",
  untitled: "Tanpa judul",
  noDescription: "Tidak ada deskripsi",
  invalidValue: "Tidak valid",
  stock: "Stok",
  minutes: "menit",
  ready: "Siap",
  correction: "Perlu diperbaiki",
  completed: "Impor selesai",
  completedErrors: "Impor selesai dengan kesalahan",
  duplicateSafe:
    "Permintaan ini sudah pernah diproses, sehingga produk duplikat tidak dibuat.",
  viewProducts: "Lihat Produk",
  historyTitle: "Riwayat Impor",
  historyCopy: "Lihat 30 impor terakhir dan unduh laporan hasil setiap baris.",
  refreshing: "Memuat ulang...",
  refresh: "Perbarui Riwayat",
  historyUnavailable:
    "Riwayat impor belum tersedia. Fitur impor spreadsheet tetap dapat digunakan.",
  noHistory: "Belum ada impor yang disimpan.",
  date: "Tanggal",
  source: "Sumber",
  status: "Status",
  createdUpdated: "Dibuat / Diperbarui",
  reviewFailed: "Ditinjau / Gagal",
  report: "Laporan",
  warning: "peringatan",
  downloadCsv: "Unduh CSV",
  confirmImport: "Impor {creates} produk baru sekarang?",
  resultSummary: "Dibuat {created}, menunggu peninjauan {review}, gagal {failed}.",
  rowError: "Baris {row} · {title}: {error}",
  unknownError: "Kesalahan tidak diketahui",
  downloadReportError: "Gagal mengunduh laporan impor.",
  downloadTemplateError: "Gagal mengunduh spreadsheet.",
  exportError: "Gagal mengekspor produk.",
  readError: "Gagal membaca file CSV atau Excel.",
  validateError: "Gagal memvalidasi file yang diunggah.",
  importError: "Gagal mengimpor produk.",
};

const FIELD_GUIDE = [
  ["Category", "Choose the product type from the dropdown.", "Boosting", true],
  ["Game", "Search and choose an active game from the database list.", "Wuthering Waves", true],
  ["Product Title", "Write a clear product or service name.", "3 Hours Piloting", true],
  ["Currency", "Choose the currency you use for this product price.", "US Dollar (USD)", true],
  ["Price", "Enter only the nominal amount in the selected currency.", "25.00", true],
  ["Stock", "Enter the available quantity as a whole number.", "10", true],
  ["Delivery ETA", "Choose the promised delivery time from the dropdown.", "1 hour", true],
  ["Region", "Enter the supported sales or game region.", "Global", true],
  ["Platform", "Choose Any, PC, XBOX, Nintendo, or Playstation.", "PC", true],
  ["Server / Realm", "Enter the server or realm when the game requires it.", "SEA-1", false],
  ["Description", "Explain contents, requirements, and delivery clearly (minimum 20 characters).", "Includes setup and delivery instructions.", true],
] as const;

const FIELD_GUIDE_ID: Record<string, string> = {
  "Choose the product type from the dropdown.": "Pilih jenis produk dari dropdown.",
  "Search and choose an active game from the database list.": "Cari dan pilih game aktif dari daftar database.",
  "Write a clear product or service name.": "Tulis nama produk atau layanan dengan jelas.",
  "Choose the currency you use for this product price.": "Pilih mata uang yang Anda gunakan untuk harga produk ini.",
  "Enter only the nominal amount in the selected currency.": "Masukkan hanya nominal sesuai mata uang yang dipilih.",
  "Enter the available quantity as a whole number.": "Masukkan jumlah stok tersedia dalam bilangan bulat.",
  "Choose the promised delivery time from the dropdown.": "Pilih estimasi waktu pengiriman dari dropdown.",
  "Enter the supported sales or game region.": "Masukkan wilayah penjualan atau game yang didukung.",
  "Choose Any, PC, XBOX, Nintendo, or Playstation.": "Pilih Any, PC, XBOX, Nintendo, atau Playstation.",
  "Enter the server or realm when the game requires it.": "Isi server atau realm jika diperlukan oleh game.",
  "Explain contents, requirements, and delivery clearly (minimum 20 characters).": "Jelaskan isi, persyaratan, dan proses pengiriman dengan jelas (minimal 20 karakter).",
};

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
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

function filenameFromDisposition(value: string | null, fallback: string) {
  const match = value?.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

function formatImportDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createRequestToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function chunkRows(rows: BulkListingRecord[]) {
  const batches: BulkListingRecord[][] = [];
  for (let start = 0; start < rows.length; start += BULK_LISTING_API_BATCH_ROWS) {
    batches.push(rows.slice(start, start + BULK_LISTING_API_BATCH_ROWS));
  }
  return batches;
}

export default function BulkListingImportPage() {
  const { locale, formatPrice } =
    useCurrency();
  const isIndonesian = locale === "id-ID";
  const copy = isIndonesian ? ID_COPY : EN_COPY;
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [requestToken, setRequestToken] = useState(createRequestToken);
  const [batchRequestTokens, setBatchRequestTokens] = useState<string[]>([]);
  const [rows, setRows] = useState<BulkListingRecord[]>([]);
  const [fileFormat, setFileFormat] = useState<"csv" | "xlsx" | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [downloading, setDownloading] = useState<
    "template" | "export" | "report" | null
  >(null);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [historyAvailable, setHistoryAvailable] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const data = await authenticatedFetchJson<ImportHistoryResponse>(
        "/api/seller/catalog/bulk?mode=history"
      );
      setHistoryAvailable(data.available);
      setHistory(data.imports || []);
    } catch {
      setHistoryAvailable(false);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function downloadImportReport(importId: string) {
    setDownloading("report");
    setError("");
    try {
      const response = await authenticatedFetch(
        `/api/seller/catalog/bulk?mode=report&id=${encodeURIComponent(importId)}`
      );
      const blob = await response.blob();
      saveBlob(
        blob,
        filenameFromDisposition(
          response.headers.get("content-disposition"),
          `comeplayers-import-report-${importId.slice(0, 8)}.csv`
        )
      );
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : copy.downloadReportError
      );
    } finally {
      setDownloading(null);
    }
  }

  async function downloadProductTemplate() {
    setDownloading("template");
    setError("");
    try {
      const response = await authenticatedFetch(
        "/api/seller/catalog/bulk?mode=template&format=xlsx"
      );
      const blob = await response.blob();
      saveBlob(
        blob,
        filenameFromDisposition(
          response.headers.get("content-disposition"),
          "comeplayers-product-template.xlsx"
        )
      );
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : copy.downloadTemplateError
      );
    } finally {
      setDownloading(null);
    }
  }

  async function downloadProducts() {
    setDownloading("export");
    setError("");
    try {
      const response = await authenticatedFetch(
        "/api/seller/catalog/bulk?format=xlsx"
      );
      const blob = await response.blob();
      saveBlob(
        blob,
        filenameFromDisposition(
          response.headers.get("content-disposition"),
          "comeplayers-products.xlsx"
        )
      );
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : copy.exportError
      );
    } finally {
      setDownloading(null);
    }
  }

  async function readFile(file: File) {
    setLoadingFile(true);
    setError("");
    setPreview(null);
    setResult(null);

    try {
      const parsed = await readBulkListingFile(file);
      setRows(parsed.records);
      setFileName(file.name);
      setFileSize(file.size);
      const nextRequestToken = createRequestToken();
      setRequestToken(nextRequestToken);
      setBatchRequestTokens(
        Array.from(
          { length: Math.ceil(parsed.records.length / BULK_LISTING_API_BATCH_ROWS) },
          () => createRequestToken()
        )
      );
      setFileFormat(parsed.format);
      setSheetName(parsed.sheetName);
    } catch (fileError) {
      setRows([]);
      setFileName("");
      setFileSize(0);
      setRequestToken(createRequestToken());
      setBatchRequestTokens([]);
      setFileFormat(null);
      setSheetName(null);
      setError(
        fileError instanceof Error
          ? fileError.message
          : copy.readError
      );
    } finally {
      setLoadingFile(false);
    }
  }

  async function previewImport() {
    if (rows.length === 0) return;
    setPreviewing(true);
    setError("");
    setResult(null);

    try {
      const batches = chunkRows(rows);
      const combined: PreviewResponse = {
        rows: [],
        summary: {
          total: 0,
          valid: 0,
          invalid: 0,
          creates: 0,
          updates: 0,
          warnings: 0,
        },
      };

      for (const batch of batches) {
        const data = await authenticatedFetchJson<PreviewResponse>(
          "/api/seller/catalog/bulk",
          {
            method: "POST",
            body: JSON.stringify({ mode: "preview", rows: batch }),
          }
        );
        combined.rows.push(...data.rows);
        combined.summary.total += data.summary.total;
        combined.summary.valid += data.summary.valid;
        combined.summary.invalid += data.summary.invalid;
        combined.summary.creates += data.summary.creates;
        combined.summary.updates += data.summary.updates;
        combined.summary.warnings += data.summary.warnings;
      }

      setPreview(combined);
    } catch (previewError) {
      setPreview(null);
      setError(
        previewError instanceof Error
          ? previewError.message
          : copy.validateError
      );
    } finally {
      setPreviewing(false);
    }
  }

  async function commitImport() {
    if (!preview || preview.summary.invalid > 0 || rows.length === 0) return;
    if (
      !confirm(interpolate(copy.confirmImport, { creates: preview.summary.creates }))
    ) {
      return;
    }

    setCommitting(true);
    setError("");
    try {
      const batches = chunkRows(rows);
      const tokens =
        batchRequestTokens.length === batches.length
          ? batchRequestTokens
          : batches.map(() => createRequestToken());

      if (batchRequestTokens.length !== batches.length) {
        setBatchRequestTokens(tokens);
      }

      const combined: CommitResponse = {
        ok: true,
        idempotent: true,
        summary: {
          total: 0,
          created: 0,
          updated: 0,
          pendingReview: 0,
          failed: 0,
        },
        results: [],
        history: {
          id: null,
          recorded: true,
          warning: null,
        },
      };
      const historyWarnings: string[] = [];

      for (let index = 0; index < batches.length; index += 1) {
        const data = await authenticatedFetchJson<CommitResponse>(
          "/api/seller/catalog/bulk",
          {
            method: "POST",
            body: JSON.stringify({
              mode: "commit",
              rows: batches[index],
              requestToken: tokens[index],
              fileName:
                batches.length > 1
                  ? `${fileName} · batch ${index + 1}/${batches.length}`
                  : fileName,
              fileSize,
              fileFormat,
              sheetName,
            }),
          }
        );

        combined.ok = combined.ok && data.ok;
        combined.idempotent = Boolean(combined.idempotent && data.idempotent);
        combined.summary.total += data.summary.total;
        combined.summary.created += data.summary.created;
        combined.summary.updated += data.summary.updated;
        combined.summary.pendingReview += data.summary.pendingReview;
        combined.summary.failed += data.summary.failed;
        combined.results.push(...data.results);

        if (data.history?.warning) historyWarnings.push(data.history.warning);
        if (data.history?.recorded === false && combined.history) {
          combined.history.recorded = false;
        }
      }

      if (combined.history) {
        combined.history.warning =
          historyWarnings.length > 0
            ? Array.from(new Set(historyWarnings)).join(" ")
            : null;
      }

      setResult(combined);
      await loadHistory();
    } catch (commitError) {
      setError(
        commitError instanceof Error
          ? commitError.message
          : copy.importError
      );
    } finally {
      setCommitting(false);
    }
  }

  function reset() {
    setRows([]);
    setFileName("");
    setFileSize(0);
    setRequestToken(createRequestToken());
    setBatchRequestTokens([]);
    setFileFormat(null);
    setSheetName(null);
    setPreview(null);
    setResult(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.2),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,211,238,.14),transparent_32%)] px-6 py-10 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-7 lg:flex-row lg:items-start">
          <div>
            <p className="inline-flex rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-black text-violet-200">
              {copy.badge}
            </p>
            <h1 className="mt-4 text-4xl font-black md:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-3xl text-slate-300">
              {copy.intro}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/seller/products"
              className="rounded-xl border border-white/10 px-5 py-3 font-black transition hover:border-white/30"
            >
              {copy.products}
            </Link>
            <Link
              href="/seller/inventory"
              className="rounded-xl border border-cyan-400/30 px-5 py-3 font-black text-cyan-200 transition hover:border-cyan-300"
            >
              {copy.inventory}
            </Link>
            <Link
              href="/seller/orders"
              className="rounded-xl border border-emerald-400/30 px-5 py-3 font-black text-emerald-200 transition hover:border-emerald-300"
            >
              {copy.orders}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:px-10 md:py-10 lg:mr-36 2xl:mx-auto">
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.65fr)] 2xl:items-stretch">
          <section className="rounded-3xl border border-violet-400/20 bg-[linear-gradient(145deg,rgba(139,92,246,.12),rgba(34,211,238,.05))] p-6 shadow-2xl shadow-black/30 md:p-8">
            <div className="flex h-full flex-col">
              <div className="max-w-3xl">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">
                  {copy.stepTemplate}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
                  {copy.templateTitle}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {copy.templateCopy}
                </p>
              </div>

              <div className="mt-7 border-t border-white/10 pt-6">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">
                  {copy.tenColumns}
                </p>
                <div
                  className="mt-4 flex flex-wrap gap-2"
                  aria-label={copy.columnsAria}
                >
                  {[
                    "Category",
                    "Game",
                    "Product Title",
                    "Currency",
                    "Price",
                    "Stock",
                    "Delivery ETA",
                    "Region",
                    "Platform",
                    "Server / Realm",
                    "Description",
                  ].map((column) => (
                    <span
                      key={column}
                      className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-bold text-slate-200"
                    >
                      {column}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void downloadProductTemplate()}
                disabled={downloading !== null}
                className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-400 px-6 py-3.5 font-black text-black transition hover:bg-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
              >
                {downloading === "template"
                  ? copy.downloading
                  : copy.downloadTemplate}
              </button>
            </div>
          </section>

          <aside className="flex h-full flex-col rounded-3xl border border-cyan-400/20 bg-[linear-gradient(145deg,rgba(34,211,238,.1),rgba(15,23,42,.7))] p-6 shadow-2xl shadow-black/30 md:p-8 lg:pr-40 2xl:pr-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
              {copy.exportEyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">
              {copy.exportTitle}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              {copy.exportCopy}
            </p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-slate-300">
              <p className="font-black text-white">
                {isIndonesian ? "Harga pembeli otomatis" : "Automatic buyer pricing"}
              </p>
              <p className="mt-2 leading-6">
                {isIndonesian
                  ? "Harga yang dilihat pembeli otomatis mengikuti mata uang pilihan mereka."
                  : "Buyer-facing prices automatically follow their selected currency."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void downloadProducts()}
              disabled={downloading !== null}
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-cyan-400 px-5 py-3.5 font-black text-black transition hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 lg:max-w-md 2xl:mt-auto 2xl:max-w-none"
            >
              {downloading === "export" ? copy.exporting : copy.exportButton}
            </button>
          </aside>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[copy.workflowOne, copy.workflowTwo, copy.workflowThree].map((step, index) => (
            <div
              key={step}
              className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-slate-300 shadow-xl shadow-black/20"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-300/30 bg-violet-400/10 font-black text-violet-200">
                {index + 1}
              </span>
              <p className="pt-1">{step}</p>
            </div>
          ))}
        </div>

        <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30">
          <div className="border-b border-white/10 p-6 md:px-8 md:py-7">
            <h2 className="text-2xl font-black tracking-tight">{copy.guideTitle}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
              {copy.guideCopy}
            </p>
          </div>

          <div className="divide-y divide-white/[0.07] md:hidden">
            {FIELD_GUIDE.map(([column, description, example, required]) => (
              <article key={column} className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-black text-white">{column}</h3>
                  <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-black ${required ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-slate-400"}`}>
                    {required ? copy.yes : copy.optional}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {isIndonesian ? FIELD_GUIDE_ID[description] : description}
                </p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                  {copy.example}
                </p>
                <p className="mt-1 break-words text-sm font-bold text-cyan-200">{example}</p>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[920px] table-fixed divide-y divide-white/10 text-sm">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[12%]" />
                <col className="w-[42%]" />
                <col className="w-[26%]" />
              </colgroup>
              <thead className="bg-black/25 text-left text-xs font-black uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">{copy.column}</th>
                  <th className="whitespace-nowrap px-6 py-4">{copy.required}</th>
                  <th className="px-6 py-4">{copy.entryGuide}</th>
                  <th className="px-6 py-4">{copy.example}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {FIELD_GUIDE.map(([column, description, example, required]) => (
                  <tr key={column} className="align-top transition-colors hover:bg-white/[0.025]">
                    <td className="px-6 py-5 font-black text-white">
                      {column}
                    </td>
                    <td className="px-6 py-5">
                      <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-black ${required ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-slate-400"}`}>
                        {required ? copy.yes : copy.optional}
                      </span>
                    </td>
                    <td className="px-6 py-5 leading-6 text-slate-300">
                      {isIndonesian ? FIELD_GUIDE_ID[description] : description}
                    </td>
                    <td className="break-words px-6 py-5 font-bold leading-6 text-cyan-200">
                      {example}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black">{copy.uploadTitle}</h2>
              <p className="mt-2 text-sm text-slate-400">
                {fileName
                  ? `${fileName} · ${fileFormat === "xlsx" ? `Excel${sheetName ? ` · ${isIndonesian ? "lembar" : "sheet"} “${sheetName}”` : ""}` : "CSV"} · ${rows.length} ${isIndonesian ? "baris data" : `data row${rows.length === 1 ? "" : "s"}`}`
                  : copy.uploadEmpty}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {rows.length > 0 ? (
                <button
                  type="button"
                  onClick={reset}
                  disabled={previewing || committing}
                  className="rounded-xl border border-white/10 px-5 py-3 font-black disabled:opacity-50"
                >
                  {copy.reset}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={loadingFile || previewing || committing}
                className="rounded-xl border border-white/20 px-5 py-3 font-black disabled:opacity-50"
              >
                {loadingFile ? copy.reading : copy.chooseFile}
              </button>
              <button
                type="button"
                onClick={() => void previewImport()}
                disabled={rows.length === 0 || previewing || committing}
                className="rounded-xl bg-violet-400 px-5 py-3 font-black text-black disabled:opacity-40"
              >
                {previewing ? copy.validating : copy.validate}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readFile(file);
                }}
              />
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-5 font-bold text-red-200">
            {error}
          </p>
        ) : null}

        {preview ? (
          <section className="mt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryCard label={copy.rows} value={preview.summary.total} />
              <SummaryCard label={copy.valid} value={preview.summary.valid} tone="green" />
              <SummaryCard label={copy.invalid} value={preview.summary.invalid} tone="red" />
              <SummaryCard label={copy.newProducts} value={preview.summary.creates} tone="violet" />
              <SummaryCard label={copy.warnings} value={preview.summary.warnings} tone="yellow" />
            </div>

            <div className="mt-5 flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:flex-row md:items-center">
              <div>
                <h2 className="text-xl font-black">{copy.reviewTitle}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {preview.summary.invalid > 0
                    ? copy.reviewFix
                    : copy.reviewReady}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void commitImport()}
                disabled={
                  preview.summary.invalid > 0 ||
                  preview.summary.valid === 0 ||
                  committing ||
                  result !== null
                }
                className="rounded-xl bg-cyan-400 px-6 py-3 font-black text-black disabled:opacity-40"
              >
                {committing ? copy.importing : copy.importButton}
              </button>
            </div>

            <div className="mt-5 overflow-x-auto rounded-3xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/[0.06] text-left text-slate-300">
                  <tr>
                    <th className="px-4 py-4">{copy.no}</th>
                    <th className="px-4 py-4">{copy.product}</th>
                    <th className="px-4 py-4">{copy.gameCategory}</th>
                    <th className="px-4 py-4">{copy.priceStock}</th>
                    <th className="px-4 py-4">{copy.delivery}</th>
                    <th className="px-4 py-4">{copy.validation}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {preview.rows.map((row, rowIndex) => (
                    <tr key={`${row.rowNumber}-${row.productId || row.title}`} className="bg-black/20 align-top">
                      <td className="px-4 py-4 font-black">{rowIndex + 1}</td>
                      <td className="max-w-sm px-4 py-4">
                        <p className="font-black">{row.title || copy.untitled}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                          {row.description || copy.noDescription}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-bold text-cyan-200">{row.gameName || "-"}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.category || "-"}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-black">{Number.isFinite(row.price) ? formatPrice(row.price) : copy.invalidValue}</p>
                        {Number.isFinite(row.enteredPrice) && row.priceCurrency ? (
                          <p className="mt-1 text-xs text-cyan-200/80">
                            {row.enteredPrice.toLocaleString()} {row.priceCurrency}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">{copy.stock} {row.stock}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-bold">{row.deliveryEtaMinutes} {copy.minutes}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.offerRegion} · {row.offerPlatform}
                          {row.offerServer ? ` · ${row.offerServer}` : ""}
                        </p>
                      </td>
                      <td className="min-w-72 px-4 py-4">
                        <p className={`font-black ${row.valid ? "text-green-300" : "text-red-300"}`}>
                          {row.valid ? copy.ready : copy.correction}
                        </p>
                        {row.errors.map((message) => (
                          <p key={message} className="mt-2 text-xs leading-5 text-red-200">• {message}</p>
                        ))}
                        {row.warnings.map((message) => (
                          <p key={message} className="mt-2 text-xs leading-5 text-yellow-200">• {message}</p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {result ? (
          <section className={`mt-6 rounded-3xl border p-6 ${result.summary.failed > 0 ? "border-yellow-400/30 bg-yellow-400/10" : "border-green-400/30 bg-green-400/10"}`}>
            <h2 className="text-2xl font-black">
              {result.summary.failed > 0 ? copy.completedErrors : copy.completed}
            </h2>
            <p className="mt-3 text-slate-200">
              {interpolate(copy.resultSummary, {
                created: result.summary.created,
                review: result.summary.pendingReview,
                failed: result.summary.failed,
              })}
            </p>
            {result.idempotent ? (
              <p className="mt-3 text-sm font-bold text-cyan-100">
                {copy.duplicateSafe}
              </p>
            ) : null}
            {result.history?.warning ? (
              <p className="mt-3 text-sm font-bold text-yellow-100">
                {result.history.warning}
              </p>
            ) : null}
            {result.summary.failed > 0 ? (
              <div className="mt-4 space-y-2">
                {result.results.filter((item) => !item.ok).map((item) => (
                  <p key={`${item.rowNumber}-${item.title}`} className="text-sm text-yellow-100">
                    {interpolate(copy.rowError, {
                      row: item.rowNumber,
                      title: item.title,
                      error: item.error || copy.unknownError,
                    })}
                  </p>
                ))}
              </div>
            ) : null}
            <Link
              href="/seller/products"
              className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 font-black text-black"
            >
              {copy.viewProducts}
            </Link>
          </section>
        ) : null}

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black">{copy.historyTitle}</h2>
              <p className="mt-2 text-sm text-slate-400">
                {copy.historyCopy}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={loadingHistory}
              className="rounded-xl border border-cyan-400/30 px-5 py-3 font-black text-cyan-200 disabled:opacity-50"
            >
              {loadingHistory ? copy.refreshing : copy.refresh}
            </button>
          </div>

          {!historyAvailable ? (
            <div className="mt-5 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-5 text-sm leading-6 text-yellow-100">
              {copy.historyUnavailable}
            </div>
          ) : history.length === 0 && !loadingHistory ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-slate-400">
              {copy.noHistory}
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/[0.06] text-left text-slate-300">
                  <tr>
                    <th className="px-4 py-4">{copy.date}</th>
                    <th className="px-4 py-4">{copy.source}</th>
                    <th className="px-4 py-4">{copy.status}</th>
                    <th className="px-4 py-4">{copy.rows}</th>
                    <th className="px-4 py-4">{copy.createdUpdated}</th>
                    <th className="px-4 py-4">{copy.reviewFailed}</th>
                    <th className="px-4 py-4">{copy.report}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {history.map((item) => (
                    <tr key={item.id} className="bg-black/20 align-top">
                      <td className="whitespace-nowrap px-4 py-4 text-slate-300">
                        {formatImportDate(item.started_at, locale)}
                      </td>
                      <td className="max-w-xs px-4 py-4">
                        <p className="truncate font-black" title={item.source_filename}>
                          {item.source_filename}
                        </p>
                        <p className="mt-1 text-xs uppercase text-slate-500">
                          {item.source_format}
                          {item.source_sheet ? ` · ${item.source_sheet}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${
                            item.status === "completed"
                              ? "border-green-400/30 bg-green-400/10 text-green-200"
                              : item.status === "processing"
                                ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                                : item.status === "partial"
                                  ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
                                  : "border-red-400/30 bg-red-400/10 text-red-200"
                          }`}
                        >
                          {isIndonesian
                            ? ({
                                completed: "selesai",
                                processing: "diproses",
                                partial: "sebagian",
                                failed: "gagal",
                              } as const)[item.status]
                            : item.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-black">{item.total_rows}</td>
                      <td className="px-4 py-4">
                        <p className="font-black text-green-200">
                          {item.created_rows} / {item.updated_rows}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-black text-yellow-200">
                          {item.pending_review_rows} / {item.failed_rows}
                        </p>
                        {item.warning_count > 0 ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {item.warning_count} {copy.warning}
                            {!isIndonesian && item.warning_count !== 1 ? "s" : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => void downloadImportReport(item.id)}
                          disabled={
                            downloading !== null || item.status === "processing"
                          }
                          className="rounded-lg border border-white/15 px-3 py-2 font-black text-slate-200 disabled:opacity-40"
                        >
                          {copy.downloadCsv}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "green" | "red" | "violet" | "cyan" | "yellow";
}) {
  const toneClass = {
    default: "text-white",
    green: "text-green-300",
    red: "text-red-300",
    violet: "text-violet-300",
    cyan: "text-cyan-300",
    yellow: "text-yellow-300",
  }[tone];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

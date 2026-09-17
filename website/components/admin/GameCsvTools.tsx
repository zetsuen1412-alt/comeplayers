"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type CsvRow = Record<string, string>;

type ExportGame = {
  id: number;
  name: string;
  slug: string;
  category_slug: string;
  category_name: string;
  status: string;
  description: string;
  image_url: string;
  icon_url: string;
  logo_url: string;
  banner_url: string;
  mobile_banner_url: string;
  background_url: string;
  hero_url: string;
  source_url: string;
  steam_app_id: number | null;
  is_featured: boolean;
  is_trending: boolean;
};

type ExportResponse = {
  games: ExportGame[];
  exportedAt: string;
};

type ImportResponse = {
  ok: boolean;
  total: number;
  inserted: number;
  updated: number;
  mappedCategories: number;
};

const CSV_HEADERS = [
  "name",
  "slug",
  "category_slug",
  "category_name",
  "status",
  "description",
  "image_url",
  "icon_url",
  "logo_url",
  "banner_url",
  "mobile_banner_url",
  "background_url",
  "hero_url",
  "source_url",
  "steam_app_id",
  "is_featured",
  "is_trending",
] as const;

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function detectDelimiter(input: string) {
  const firstLine = input.split(/\r?\n/, 1)[0] || "";
  let commas = 0;
  let semicolons = 0;
  let quoted = false;

  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index];
    const next = firstLine[index + 1];
    if (character === '"' && quoted && next === '"') {
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === ",") commas += 1;
    if (!quoted && character === ";") semicolons += 1;
  }

  return semicolons > commas ? ";" : ",";
}

function parseCsv(input: string): CsvRow[] {
  const delimiter = detectDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((values) =>
    values.some((value) => value.trim().length > 0)
  );

  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0].map(normalizeHeader);

  return nonEmptyRows.slice(1).map((values) => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      if (header) record[header] = values[index]?.trim() ?? "";
    });
    return record;
  });
}

function protectSpreadsheetFormula(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  const text = protectSpreadsheetFormula(value).replace(/"/g, '""');
  return `"${text}"`;
}

function serializeCsv(headers: readonly string[], rows: CsvRow[]) {
  const headerLine = headers.map(csvCell).join(",");
  const dataLines = rows.map((row) =>
    headers.map((header) => csvCell(row[header] ?? "")).join(",")
  );
  return `\uFEFF${[headerLine, ...dataLines].join("\r\n")}`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export default function GameCsvTools() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const previewRows = useMemo(() => rows.slice(0, 8), [rows]);

  function resetFeedback() {
    setMessage("");
    setError("");
  }

  async function exportCsv() {
    resetFeedback();
    setBusy("export");

    try {
      const payload = await authenticatedFetchJson<ExportResponse>(
        "/api/admin/games/csv"
      );

      const exportRows: CsvRow[] = payload.games.map((game) => ({
        name: game.name,
        slug: game.slug,
        category_slug: game.category_slug,
        category_name: game.category_name,
        status: game.status,
        description: game.description,
        image_url: game.image_url,
        icon_url: game.icon_url,
        logo_url: game.logo_url,
        banner_url: game.banner_url,
        mobile_banner_url: game.mobile_banner_url,
        background_url: game.background_url,
        hero_url: game.hero_url,
        source_url: game.source_url,
        steam_app_id: game.steam_app_id === null ? "" : String(game.steam_app_id),
        is_featured: game.is_featured ? "true" : "false",
        is_trending: game.is_trending ? "true" : "false",
      }));

      downloadText(
        `comeplayers-game-catalog-${todayStamp()}.csv`,
        serializeCsv(CSV_HEADERS, exportRows)
      );
      setMessage(`${payload.games.length} permainan berhasil diekspor.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Gagal mengekspor katalog permainan."
      );
    } finally {
      setBusy(null);
    }
  }

  function downloadTemplate() {
    resetFeedback();
    downloadText(
      "comeplayers-game-catalog-template.csv",
      serializeCsv(CSV_HEADERS, [])
    );
    setMessage("Templat CSV berhasil diunduh.");
  }

  async function selectFile(file: File | null) {
    resetFeedback();
    setRows([]);
    setFilename("");

    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Pilih berkas dengan ekstensi .csv.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran CSV tidak boleh melebihi 5 MB.");
      return;
    }

    try {
      const parsedRows = parseCsv(await file.text());
      if (parsedRows.length === 0) {
        setError("CSV tidak berisi baris data.");
        return;
      }
      if (!("name" in parsedRows[0])) {
        setError("Kolom wajib \"name\" tidak ditemukan. Gunakan templat CSV.");
        return;
      }
      if (parsedRows.length > 1000) {
        setError("Maksimal 1.000 permainan dapat diimpor sekaligus.");
        return;
      }

      setRows(parsedRows);
      setFilename(file.name);
      setMessage(`${parsedRows.length} baris siap ditinjau.`);
    } catch {
      setError("CSV tidak dapat dibaca. Pastikan format dan pengodeannya benar.");
    }
  }

  async function importCsv() {
    if (rows.length === 0) return;

    resetFeedback();
    setBusy("import");

    try {
      const result = await authenticatedFetchJson<ImportResponse>(
        "/api/admin/games/csv",
        {
          method: "POST",
          body: JSON.stringify({ rows }),
        }
      );

      setMessage(
        `${result.total} permainan diproses: ${result.inserted} baru, ${result.updated} diperbarui, ${result.mappedCategories} kategori dipetakan.`
      );
      setRows([]);
      setFilename("");
      if (inputRef.current) inputRef.current.value = "";

      window.setTimeout(() => window.location.reload(), 1200);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impor katalog permainan gagal."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[70] rounded-2xl border border-cyan-300/40 bg-cyan-400 px-5 py-3 font-black text-black shadow-2xl shadow-cyan-500/20 transition hover:bg-cyan-300"
      >
        Impor / Ekspor CSV
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-cyan-400/25 bg-[#07101f] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-300">
                  Lembar Kerja Katalog Permainan
                </p>
                <h2 className="mt-2 text-3xl font-black">Impor dan Ekspor CSV</h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Slug digunakan sebagai kunci pembaruan. Baris dengan slug yang sudah ada akan diperbarui; slug baru akan membuat permainan baru. Sel kosong tidak menghapus data yang sudah ada. Gunakan [CLEAR] untuk mengosongkan kolom URL atau deskripsi.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 font-bold text-slate-300 hover:bg-white hover:text-black"
              >
                Tutup
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <button
                type="button"
                onClick={exportCsv}
                disabled={busy !== null}
                className="rounded-2xl bg-cyan-400 px-5 py-4 font-black text-black hover:bg-cyan-300 disabled:opacity-50"
              >
                {busy === "export" ? "Mengekspor..." : "Ekspor Semua Permainan"}
              </button>

              <button
                type="button"
                onClick={downloadTemplate}
                disabled={busy !== null}
                className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-4 font-black text-cyan-200 hover:bg-cyan-400 hover:text-black disabled:opacity-50"
              >
                Unduh Templat
              </button>

              <label className="cursor-pointer rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-4 text-center font-black hover:border-cyan-400">
                Pilih CSV
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    selectFile(event.target.files?.[0] || null)
                  }
                />
              </label>
            </div>

            {message ? (
              <div className="mt-5 rounded-2xl border border-green-400/25 bg-green-400/10 px-5 py-4 text-green-200">
                {adminText(message)}
              </div>
            ) : null}

            {error ? (
              <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 px-5 py-4 text-red-200">
                {adminText(error)}
              </div>
            ) : null}

            {rows.length > 0 ? (
              <div className="mt-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-xl font-black">Pratinjau Impor</h3>
                    <p className="text-sm text-slate-400">
                      {filename} · {rows.length} baris
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={importCsv}
                    disabled={busy !== null}
                    className="rounded-2xl bg-green-500 px-6 py-3 font-black text-white hover:bg-green-400 disabled:opacity-50"
                  >
                    {busy === "import" ? "Mengimpor..." : `Impor ${rows.length} Gim`}
                  </button>
                </div>

                <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-white/[0.06] text-slate-300">
                      <tr>
                        <th className="px-4 py-3">Nama</th>
                        <th className="px-4 py-3">Alamat Singkat</th>
                        <th className="px-4 py-3">Kategori</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">URL Gambar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, index) => (
                        <tr key={`${row.slug || row.name}-${index}`} className="border-t border-white/10">
                          <td className="max-w-[260px] px-4 py-3 font-bold">{row.name || "-"}</td>
                          <td className="max-w-[220px] px-4 py-3 text-slate-300">{row.slug || "auto"}</td>
                          <td className="px-4 py-3 text-cyan-300">{row.category_slug || row.category || "-"}</td>
                          <td className="px-4 py-3">{adminLabel(row.status || "active")}</td>
                          <td className="max-w-[280px] truncate px-4 py-3 text-slate-400">{row.image_url || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {rows.length > previewRows.length ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Menampilkan {previewRows.length} dari {rows.length} baris.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

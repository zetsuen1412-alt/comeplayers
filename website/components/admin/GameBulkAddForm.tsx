"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { MAX_BULK_INPUT_LENGTH, parseBulkGameNames, type GameInputSeparator } from "@/lib/bulkGameInput";
import GameCategoryCheckboxes, { type AdminGameCategory } from "./GameCategoryCheckboxes";

type BulkResult = {
  created: number;
  existing: number;
  category_links: number;
  games: { id: number; name: string; created: boolean; active: boolean }[];
};

function isBulkResult(value: unknown): value is BulkResult {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return [row.created, row.existing, row.category_links].every(
    (count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0
  ) && Array.isArray(row.games) && row.games.every((game: unknown) => {
    if (typeof game !== "object" || game === null) return false;
    const item = game as Record<string, unknown>;
    return typeof item.id === "number" && Number.isSafeInteger(item.id) && item.id > 0
      && typeof item.name === "string" && typeof item.created === "boolean"
      && typeof item.active === "boolean";
  });
}

export default function GameBulkAddForm({ categories, onSaved }: { categories: AdminGameCategory[]; onSaved: () => void | Promise<void> }) {
  const [input, setInput] = useState("");
  const [separator, setSeparator] = useState<GameInputSeparator>("mixed");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const inFlight = useRef(false);
  const preview = useMemo(() => parseBulkGameNames(input, separator), [input, separator]);
  const canSave = preview.names.length > 0 && preview.errors.length === 0 && selectedIds.length > 0 && !saving;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    setResult(null);
    setRefreshWarning("");
    try {
      const { data, error: saveError } = await supabase.rpc("cp_admin_bulk_add_games", {
        p_names: preview.names,
        p_category_ids: selectedIds,
      });
      if (saveError) {
        throw new Error(saveError.code === "PGRST202"
          ? "Fitur input massal belum aktif di database. Terapkan migrasi katalog game terlebih dahulu."
          : saveError.message);
      }
      if (!isBulkResult(data)) {
        throw new Error("Respons penyimpanan tidak dikenali. Muat ulang katalog sebelum mencoba lagi.");
      }
      setResult(data);
      setInput("");
      // A failed list refresh must not turn a successful database commit into a save error.
      try {
        await onSaved();
      } catch {
        setRefreshWarning("Game sudah tersimpan, tetapi daftar belum berhasil diperbarui. Muat ulang halaman untuk melihatnya.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan game. Silakan coba lagi.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="mb-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
      <h2 className="text-2xl font-black">Tambah Game Sekaligus</h2>
      <p className="mt-2 text-sm text-gray-400">Masukkan satu atau banyak game. Semua kategori yang dicentang berlaku untuk setiap game dalam daftar.</p>
      <form onSubmit={submit} className="mt-5 space-y-5" aria-busy={saving}>
        <fieldset disabled={saving} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="bulk-game-names" className="font-bold">Daftar nama game</label>
            <label className="flex items-center gap-2 text-sm">
              Pemisah
              <select value={separator} onChange={(event) => setSeparator(event.target.value as GameInputSeparator)} className="rounded-lg border border-white/10 bg-black px-3 py-2 text-white">
                <option value="mixed">Koma, titik koma, atau baris baru</option>
                <option value="lines">Satu game per baris</option>
              </select>
            </label>
          </div>
          <textarea id="bulk-game-names" value={input} onChange={(event) => { setInput(event.target.value); setError(""); }} rows={5} maxLength={MAX_BULK_INPUT_LENGTH} placeholder={"GTA 5\nNaruto\nDragonball"} aria-describedby="bulk-game-help" className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-cyan-400" />
          <p id="bulk-game-help" className="text-sm text-gray-400">Maksimal 100 game per simpan. Untuk judul yang mengandung koma atau titik koma, pilih “Satu game per baris”. Gunakan nama resmi agar mudah dicari.</p>
        </fieldset>
        <GameCategoryCheckboxes categories={categories} selectedIds={selectedIds} onChange={setSelectedIds} disabled={saving} />
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4" aria-live="polite">
          <p className="font-bold">Pratinjau: {preview.names.length} game × {selectedIds.length} kategori</p>
          {preview.names.length > 0 && <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto">{preview.names.map((name) => <span key={name.toLowerCase()} className="rounded-lg border border-white/10 px-3 py-1 text-sm">{name}</span>)}</div>}
          {preview.duplicates > 0 && <p className="mt-2 text-sm text-gray-400">{preview.duplicates} nama berulang diabaikan.</p>}
          <p className="mt-3 text-sm text-gray-400">Game dengan nama yang sama (tanpa membedakan huruf besar/kecil dan spasi berulang) akan dipakai kembali. Kategori lama, gambar, dan deskripsinya tidak ditimpa. Singkatan atau nama lain tidak dicocokkan otomatis.</p>
        </div>
        {preview.errors.map((message) => <p key={message} role="alert" className="text-sm text-red-300">{message}</p>)}
        {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-300">{error}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={!canSave} className="rounded-xl bg-cyan-400 px-6 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Menyimpan semua game…" : `Simpan ${preview.names.length || ""} Game & Kategori`}</button>
          {selectedIds.length === 0 && <p className="text-sm text-gray-400">Pilih minimal satu kategori.</p>}
        </div>
      </form>
      {result && <div role="status" className="mt-5 rounded-2xl border border-green-400/30 bg-green-400/10 p-4">
        <p className="font-bold">Selesai: {result.created} game baru, {result.existing} game lama dipakai kembali.</p>
        {refreshWarning && <p className="mt-2 text-sm" role="alert">{refreshWarning}</p>}
        <p className="mt-1 text-sm">{result.category_links} hubungan kategori ditambahkan atau diaktifkan.</p>
        {result.games.some((game) => !game.active) && <p className="mt-2 text-sm">Beberapa game lama masih nonaktif. Statusnya tidak diubah otomatis; aktifkan melalui daftar game bila diperlukan.</p>}
        <details className="mt-3"><summary className="cursor-pointer font-bold">Lihat hasil penyimpanan</summary><div className="mt-2 max-h-48 overflow-y-auto text-sm">{result.games.map((game) => <p key={game.id}>#{game.id} — {game.name} · {game.created ? "Baru" : "Sudah ada"}{!game.active ? " · Nonaktif" : ""}</p>)}</div></details>
      </div>}
    </section>
  );
}

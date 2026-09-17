"use client";

import { adminCategoryLabel } from "@/lib/bulkGameInput";

export type AdminGameCategory = { id: number; name: string; slug: string; icon: string | null };

type Props = {
  categories: AdminGameCategory[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
};

export default function GameCategoryCheckboxes({ categories, selectedIds, onChange, disabled = false }: Props) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-bold text-gray-300">Kategori marketplace — boleh pilih lebih dari satu</legend>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => onChange(categories.map((category) => category.id))} className="font-bold text-cyan-300 underline disabled:opacity-50">Pilih semua</button>
        <button type="button" onClick={() => onChange([])} className="text-gray-400 underline disabled:opacity-50">Kosongkan pilihan</button>
        <span className="text-gray-400">{selectedIds.length} kategori dipilih</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {categories.map((category) => (
          <label key={category.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedIds.includes(category.id) ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 bg-black/20"}`}>
            <input type="checkbox" checked={selectedIds.includes(category.id)} onChange={(event) => onChange(event.target.checked ? [...selectedIds, category.id] : selectedIds.filter((id) => id !== category.id))} className="h-4 w-4 shrink-0 accent-cyan-500" />
            <span className="text-sm">{category.icon} {adminCategoryLabel(category)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

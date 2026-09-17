"use client";

import { adminText } from "@/lib/adminLocale";
import { FormEvent, useMemo, useState } from "react";
import { useDemoProductGames } from "@/features/payroll/lib/demo-product-store";
import type { ProductGameRegion } from "@/features/payroll/types/domain";

type DraftRegion = { rowId: string; name: string; serversText: string };

function newRegion(): DraftRegion {
  return { rowId: `region-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: "", serversText: "" };
}

export function ProductCatalogManager() {
  const { games, addGame, resetGames } = useDemoProductGames();
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [regions, setRegions] = useState<DraftRegion[]>([newRegion()]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("id-ID");
    if (!q) return games;
    return games.filter((game) => [game.code, game.name, ...(game.aliases ?? [])].join(" ").toLocaleLowerCase("id-ID").includes(q));
  }, [games, query]);

  function updateRegion(rowId: string, patch: Partial<DraftRegion>) {
    setRegions((rows) => rows.map((row) => row.rowId === rowId ? { ...row, ...patch } : row));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const normalizedRegions: ProductGameRegion[] = regions
      .map((row) => ({
        name: row.name.trim(),
        servers: row.serversText.split(",").map((server) => server.trim()).filter(Boolean),
      }))
      .filter((row) => row.name || row.servers.length);

    const result = addGame({
      code,
      name,
      aliases: aliasesText.split(",").map((alias) => alias.trim()).filter(Boolean),
      regions: normalizedRegions,
    });
    if (!result.ok) return setMessage(`⚠ ${result.message}`);

    setMessage(`✓ ${result.row.name} berhasil ditambahkan. Sekarang permainan ini bisa dicari saat membuat Pesanan.`);
    setCode("");
    setName("");
    setAliasesText("");
    setRegions([newRegion()]);
  }

  const inputClass = "mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 outline-none focus:border-yellow-400";

  return (
    <>
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="cp-card p-5">
          <div className="text-sm text-zinc-500">Permainan aktif</div>
          <div className="mt-1 text-3xl font-semibold text-yellow-300">{games.length}</div>
          <div className="mt-2 text-sm text-zinc-500">Hanya permainan dari daftar ini yang bisa dipilih saat membuat Pesanan.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowForm((value) => !value)} className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-bold text-black">{showForm ? "Tutup Form" : "+ Tambah Permainan"}</button>
          <button type="button" onClick={() => confirm("Atur Ulang daftar permainan demo ke kondisi awal?") && resetGames()} className="rounded-xl bg-zinc-800 px-4 py-3 text-sm font-semibold">Atur Ulang Demo</button>
        </div>
      </div>

      {showForm ? (
        <form onSubmit={submit} className="cp-card mb-5 p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Tambah Produk / Permainan</h2>
          <p className="mt-1 text-sm text-zinc-500">Masukkan permainan sekali. Wilayah dan Server yang Anda daftarkan akan menjadi pilihan tetap di Pesanan.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm">Kode permainan
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Contoh: GW2" className={inputClass} required />
            </label>
            <label className="text-sm">Nama permainan
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Guild Wars 2" className={inputClass} required />
            </label>
            <label className="text-sm">Nama pencarian lain
              <input value={aliasesText} onChange={(event) => setAliasesText(event.target.value)} placeholder="Pisahkan dengan koma" className={inputClass} />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Wilayah &amp; Server</h3>
              <p className="mt-1 text-sm text-zinc-500">Satu Wilayah boleh memiliki beberapa Server. Pisahkan nama Server dengan koma.</p>
            </div>
            <button type="button" onClick={() => setRegions((rows) => [...rows, newRegion()])} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold">+ Tambah Wilayah</button>
          </div>

          <div className="mt-4 space-y-3">
            {regions.map((region, index) => (
              <div key={region.rowId} className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 md:grid-cols-[1fr_2fr_auto]">
                <label className="text-sm">Wilayah {index + 1}
                  <input value={region.name} onChange={(event) => updateRegion(region.rowId, { name: event.target.value })} placeholder="Contoh: SEA" className={inputClass} />
                </label>
                <label className="text-sm">Server
                  <input value={region.serversText} onChange={(event) => updateRegion(region.rowId, { serversText: event.target.value })} placeholder="Contoh: Server 1, Server 2" className={inputClass} />
                </label>
                <div className="flex items-end">
                  {regions.length > 1 ? <button type="button" onClick={() => setRegions((rows) => rows.filter((row) => row.rowId !== region.rowId))} className="mb-1 rounded-xl bg-red-500/10 px-3 py-3 text-sm font-semibold text-red-300">Hapus</button> : null}
                </div>
              </div>
            ))}
          </div>

          {message ? <div className="mt-4 rounded-xl bg-zinc-900 p-3 text-sm">{adminText(message)}</div> : null}
          <button type="submit" className="mt-4 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black">Simpan Permainan</button>
        </form>
      ) : null}

      <div className="cp-card mb-4 p-4">
        <label className="text-sm">Cari permainan
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={"Ketik nama atau kode permainan..."} className={inputClass} />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((game) => (
          <section key={game.id} className="cp-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{game.name}</h2>
                <div className="mt-1 text-sm text-yellow-300">{game.code}</div>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">Aktif</span>
            </div>
            {game.aliases?.length ? <div className="mt-3 text-xs text-zinc-500">Bisa dicari dengan: {game.aliases.join(", ")}</div> : null}
            <div className="mt-4 space-y-2">
              {game.regions.map((region) => (
                <div key={region.name} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="font-semibold">{region.name}</div>
                  <div className="mt-1 text-sm text-zinc-400">Server: {region.servers.join(", ")}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {!filtered.length ? <div className="cp-card p-6 text-sm text-zinc-500">Permainan tidak ditemukan.</div> : null}
    </>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";
import { useDemoEmployees } from "@/lib/demo-employee-store";
import { useDemoProductGames } from "@/lib/demo-product-store";
import { serversForRegion } from "@/lib/product-catalog";
import { useDemoInventory } from "@/lib/demo-inventory-store";
import { getAvailableStock } from "@/lib/inventory";
import { exportInventoryMovementsSpreadsheet, exportInventorySpreadsheet } from "@/lib/spreadsheet-export";
import type { InventoryMovement, StockType } from "@/types/domain";

type Filter = "all" | StockType;
type InventoryView = "current" | "in" | "out";

type MatrixRow = {
  key: string;
  employeeName: string;
  employeeCode: string;
  team: string;
  game: string;
  itemName: string;
  stockType: StockType;
  byDate: Record<string, { quantity: number; weightedValue: number }>;
};

function jakartaDateKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dateTitle(key: string) {
  const date = new Date(`${key}T00:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function dayTitle(key: string) {
  const date = new Date(`${key}T00:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long" }).format(date).toUpperCase();
}

function movementMatrix(movements: InventoryMovement[]) {
  const dates = [...new Set(movements.map((row) => jakartaDateKey(row.occurredAt)))].sort();
  const map = new Map<string, MatrixRow>();
  for (const movement of movements) {
    const key = `${movement.employeeCode}|${movement.game}|${movement.itemName}|${movement.stockType}`;
    const date = jakartaDateKey(movement.occurredAt);
    const row = map.get(key) ?? {
      key,
      employeeName: movement.employeeName,
      employeeCode: movement.employeeCode,
      team: movement.team,
      game: movement.game,
      itemName: movement.itemName,
      stockType: movement.stockType,
      byDate: {},
    };
    const cell = row.byDate[date] ?? { quantity: 0, weightedValue: 0 };
    cell.quantity += movement.quantity;
    cell.weightedValue += movement.quantity * Math.max(0, movement.rateMinor ?? 0);
    row.byDate[date] = cell;
    map.set(key, row);
  }
  const rows = [...map.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName, "id") || a.itemName.localeCompare(b.itemName, "id"));
  return { dates, rows };
}

export function InventoryManager() {
  const { inventory, movements, addStock, resetInventory } = useDemoInventory();
  const { employees } = useDemoEmployees();
  const { games } = useDemoProductGames();
  const [view, setView] = useState<InventoryView>("current");
  const [filter, setFilter] = useState<Filter>("all");
  const [gameFilter, setGameFilter] = useState("SEMUA");
  const [employeeFilter, setEmployeeFilter] = useState("SEMUA");
  const [showForm, setShowForm] = useState(false);
  const [stockType, setStockType] = useState<StockType>("gold");
  const [game, setGame] = useState("");
  const [region, setRegion] = useState("");
  const [server, setServer] = useState("");
  const [itemName, setItemName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const employee = employees.find((x) => x.id === employeeId);
  const selectedGame = games.find((x) => x.code === game);
  const availableRegions = selectedGame?.regions ?? [];
  const availableServers = serversForRegion(selectedGame, region);
  const rows = useMemo(() => inventory.filter((row) => {
    if (filter !== "all" && row.stockType !== filter) return false;
    if (gameFilter !== "SEMUA" && row.game !== gameFilter) return false;
    if (employeeFilter !== "SEMUA" && row.employeeCode !== employeeFilter) return false;
    return true;
  }), [employeeFilter, filter, gameFilter, inventory]);
  const stockGames = useMemo(() => [...new Set([...inventory.map((row) => row.game), ...movements.map((row) => row.game)])].sort(), [inventory, movements]);
  const filteredMovements = useMemo(() => movements.filter((row) => {
    if (view === "in" && row.movementType !== "in") return false;
    if (view === "out" && row.movementType !== "out") return false;
    if (filter !== "all" && row.stockType !== filter) return false;
    if (gameFilter !== "SEMUA" && row.game !== gameFilter) return false;
    if (employeeFilter !== "SEMUA" && row.employeeCode !== employeeFilter) return false;
    return true;
  }), [employeeFilter, filter, gameFilter, movements, view]);
  const matrix = useMemo(() => movementMatrix(filteredMovements), [filteredMovements]);

  function changeEmployee(id: string) {
    setEmployeeId(id);
  }

  function changeStockType(value: StockType) {
    setStockType(value);
    if (value === "gold") setItemName("");
  }

  function changeGame(code: string) {
    setGame(code);
    const picked = games.find((row) => row.code === code);
    const firstRegion = picked?.regions[0]?.name ?? "";
    setRegion(firstRegion);
    setServer(picked?.regions[0]?.servers[0] ?? "");
  }

  function changeRegion(value: string) {
    setRegion(value);
    setServer(serversForRegion(selectedGame, value)[0] ?? "");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!game.trim() || !region || !server || !employee) return setMessage("Lengkapi game, Region, Server, dan karyawan.");
    if (stockType === "item" && !itemName.trim()) return setMessage("Nama item wajib diisi untuk stok Item.");
    if (quantity <= 0) return setMessage("Jumlah stok harus lebih dari 0.");

    const storedItemName = stockType === "gold" ? "Gold" : itemName.trim();
    const storedLocationName = "";
    const now = Date.now();
    addStock({
      id: `stock-user-${now}`,
      stockType,
      game: game.trim().toUpperCase(),
      region,
      server,
      itemName: storedItemName,
      locationName: storedLocationName,
      employeeCode: employee.code,
      employeeName: employee.name,
      team: employee.team,
      onHand: quantity,
      reserved: 0,
      sold: 0,
      avgCostMinor: 0,
    });
    setMessage(stockType === "gold"
      ? `✓ Stok Gold berhasil dicatat untuk ${employee.name} (${employee.team}).`
      : `✓ Stok Item ${itemName.trim()} berhasil dicatat untuk ${employee.name} (${employee.team}).`);
    setGame("");
    setRegion("");
    setServer("");
    setItemName("");
    setQuantity(0);
    setView("in");
  }

  async function exportCurrent() {
    setExporting(true);
    try {
      const employeeLabel = employeeFilter === "SEMUA" ? "SEMUA_KARYAWAN" : (employees.find((row) => row.code === employeeFilter)?.name ?? employeeFilter);
      if (view === "current") await exportInventorySpreadsheet(rows, `${gameFilter}_${filter}_${employeeLabel}`);
      else await exportInventoryMovementsSpreadsheet(filteredMovements, `${view === "in" ? "STOK_MASUK" : "STOK_KELUAR"}_${gameFilter}_${filter}_${employeeLabel}`);
    } finally {
      setExporting(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 outline-none focus:border-yellow-400";
  const movementUnitLabel = filter === "gold" ? "Gold" : filter === "item" ? "Item" : "Jumlah";

  return (
    <>
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="cp-card p-5">
          <div className="text-sm text-zinc-500">Data stok aktif</div>
          <div className="mt-1 text-3xl font-semibold text-yellow-300">{inventory.length.toLocaleString("id-ID")}</div>
          <div className="mt-2 text-sm text-zinc-500">Stok Gudang dicatat sebagai Stok Masuk. Saat order Gold/Item selesai, sistem membuat Stok Keluar otomatis.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setShowForm((value) => !value); setView("in"); }} className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-bold text-black">{showForm ? "Tutup Form" : "+ Tambah Stok Masuk"}</button>
          <button onClick={() => confirm("Kosongkan semua data stok/gudang beserta riwayat Stok Masuk/Keluar?") && resetInventory()} className="rounded-xl bg-zinc-800 px-4 py-3 text-sm font-semibold">Kosongkan Stok</button>
        </div>
      </div>

      <div className="mb-5 cp-card p-4">
        <div className="text-sm font-semibold">Menu Stok / Gudang</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setView("current")} className={`rounded-xl px-4 py-2 text-sm font-bold ${view === "current" ? "bg-yellow-400 text-black" : "bg-zinc-800"}`}>Stok Saat Ini</button>
          <button onClick={() => setView("in")} className={`rounded-xl px-4 py-2 text-sm font-bold ${view === "in" ? "bg-cyan-400 text-black" : "bg-zinc-800"}`}>Stok Masuk</button>
          <button onClick={() => setView("out")} className={`rounded-xl px-4 py-2 text-sm font-bold ${view === "out" ? "bg-rose-400 text-black" : "bg-zinc-800"}`}>Stok Keluar</button>
        </div>
      </div>

      {showForm ? (
        <form onSubmit={submit} className="cp-card mb-5 p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Tambah Stok Masuk</h2>
          <p className="mt-1 text-sm text-zinc-500">Identitas gudang cukup memakai nama karyawan. Untuk Item, tambahkan nama item; tidak ada kolom lokasi gudang.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm">Jenis stok
              <select value={stockType} onChange={(e) => changeStockType(e.target.value as StockType)} className={inputClass}>
                <option value="gold">Gold</option>
                <option value="item">Item</option>
              </select>
            </label>
            <label className="text-sm">Game
              <select value={game} onChange={(e) => changeGame(e.target.value)} className={inputClass}>
                <option value="">Pilih game</option>
                {games.map((row) => <option key={row.id} value={row.code}>{row.name} — {row.code}</option>)}
              </select>
            </label>
            <label className="text-sm">Region
              <select value={region} onChange={(e) => changeRegion(e.target.value)} className={inputClass} disabled={!selectedGame}>
                <option value="">Pilih Region</option>
                {availableRegions.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Server
              <select value={server} onChange={(e) => setServer(e.target.value)} className={inputClass} disabled={!region}>
                <option value="">Pilih Server</option>
                {availableServers.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            {stockType === "item" ? (
              <label className="text-sm">Nama Item
                <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Contoh: Ancient Core" className={inputClass} />
              </label>
            ) : null}
            <label className="text-sm">Karyawan pemegang stok
              <select value={employeeId} onChange={(e) => changeEmployee(e.target.value)} className={inputClass}>
                <option value="">Pilih karyawan</option>
                {employees.map((row) => <option key={row.id} value={row.id}>{row.name} — {row.team}</option>)}
              </select>
            </label>
            <div className="text-sm">FH
              <div className="mt-2 min-h-[50px] rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-semibold text-yellow-300">{employee?.team ?? "Otomatis"}</div>
            </div>
            <label className="text-sm">Jumlah stok masuk
              <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))} className={inputClass} />
            </label>
          </div>
          {message ? <div className="mt-4 rounded-xl bg-zinc-900 p-3 text-sm">{message}</div> : null}
          <button type="submit" className="mt-4 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black">Simpan Stok Masuk</button>
        </form>
      ) : null}

      <div className="mb-4 cp-card p-4">
        <div className="text-sm font-semibold">Filter data</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", "gold", "item"] as Filter[]).map((value) => (
            <button key={value} onClick={() => setFilter(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${filter === value ? "bg-yellow-400 text-black" : "bg-zinc-800"}`}>
              {value === "all" ? "Semua jenis" : value === "gold" ? "Gold" : "Item"}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setGameFilter("SEMUA")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${gameFilter === "SEMUA" ? "bg-emerald-500 text-black" : "bg-zinc-800"}`}>Semua Game</button>
          {stockGames.map((gameCode) => <button key={gameCode} onClick={() => setGameFilter(gameCode)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${gameFilter === gameCode ? "bg-emerald-500 text-black" : "bg-zinc-800"}`}>{gameCode}</button>)}
        </div>
        <div className="mt-3 grid gap-2 sm:max-w-sm">
          <label className="text-sm text-zinc-400">Filter karyawan / gudang
            <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className={inputClass}>
              <option value="SEMUA">Semua Karyawan</option>
              {employees.map((row) => <option key={row.id} value={row.code}>{row.name} — {row.team}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-4">
          <button onClick={exportCurrent} disabled={exporting} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">{exporting ? "Membuat Excel..." : `⬇ Export ${view === "current" ? `Stok (${rows.length})` : view === "in" ? `Stok Masuk (${filteredMovements.length})` : `Stok Keluar (${filteredMovements.length})`}`}</button>
          <span className="text-sm text-zinc-500">Export mengikuti Game, Jenis, Karyawan, dan menu Stok yang sedang dipilih.</span>
        </div>
      </div>

      {view === "current" ? (
        <div className="cp-card overflow-x-auto">
          <table className="cp-table">
            <thead><tr><th>Karyawan / Gudang</th><th>FH</th><th>Jenis</th><th>Game</th><th>Region</th><th>Server</th>{filter !== "gold" ? <th>Nama Item</th> : null}<th>Stok</th><th>Sudah dipesan</th><th>Stok terjual</th><th>Bisa dipakai</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-semibold">{row.employeeName}<div className="text-xs font-normal text-zinc-500">{row.employeeCode}</div></td>
                  <td><span className="rounded-full bg-yellow-400/10 px-2 py-1 text-xs font-semibold text-yellow-300">{row.team}</span></td>
                  <td>{row.stockType === "gold" ? "Gold" : "Item"}</td>
                  <td>{row.game}</td>
                  <td>{row.region ?? "—"}</td>
                  <td>{row.server ?? "—"}</td>
                  {filter !== "gold" ? <td className="min-w-[180px] font-semibold">{row.stockType === "gold" ? "—" : row.itemName}</td> : null}
                  <td>{row.onHand.toLocaleString("id-ID")}</td>
                  <td>{row.reserved.toLocaleString("id-ID")}</td>
                  <td className="font-semibold text-sky-300">{(row.sold ?? 0).toLocaleString("id-ID")}</td>
                  <td className="font-semibold text-emerald-300">{getAvailableStock(row).toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <div className="p-6 text-sm text-zinc-500">Belum ada stok pada pilihan ini.</div> : null}
        </div>
      ) : (
        <div className="cp-card overflow-x-auto p-0">
          <div className="min-w-max">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th rowSpan={2} className="sticky left-0 z-20 min-w-[220px] border border-zinc-700 bg-cyan-400 px-4 py-3 text-left font-black text-black">NAMA / STOK</th>
                  {matrix.dates.map((date) => (
                    <th key={date} colSpan={view === "out" ? 2 : 1} className="border border-zinc-700 bg-cyan-400 px-4 py-2 text-center font-black text-black">{dateTitle(date)}</th>
                  ))}
                </tr>
                <tr>
                  {matrix.dates.flatMap((date) => view === "out" ? [
                    <th key={`${date}-qty`} className="min-w-[110px] border border-zinc-700 bg-emerald-400 px-3 py-2 text-center font-black text-black">{movementUnitLabel}</th>,
                    <th key={`${date}-rate`} className="min-w-[110px] border border-zinc-700 bg-yellow-400 px-3 py-2 text-center font-black text-black">Rate</th>,
                  ] : [
                    <th key={`${date}-qty`} className="min-w-[120px] border border-zinc-700 bg-emerald-400 px-3 py-2 text-center font-black text-black">{movementUnitLabel}</th>,
                  ])}
                </tr>
                <tr>
                  <th className="sticky left-0 z-20 border border-zinc-700 bg-orange-400 px-4 py-2 text-left font-black text-black">KARYAWAN • GAME • ITEM</th>
                  {matrix.dates.flatMap((date) => view === "out" ? [
                    <th key={`${date}-day-q`} className="border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-xs font-bold text-white">{dayTitle(date)}</th>,
                    <th key={`${date}-day-r`} className="border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-xs font-bold text-white">RATE</th>,
                  ] : [
                    <th key={`${date}-day-q`} className="border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-xs font-bold text-white">{dayTitle(date)}</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.key}>
                    <td className="sticky left-0 z-10 border border-zinc-700 bg-orange-400 px-4 py-3 font-black text-black">
                      {row.employeeName}
                      <div className="text-xs font-semibold">{row.team} • {row.game}{row.stockType === "item" ? ` • ${row.itemName}` : ""}</div>
                    </td>
                    {matrix.dates.flatMap((date) => {
                      const cell = row.byDate[date];
                      const rate = cell?.quantity ? Math.round(cell.weightedValue / cell.quantity) : 0;
                      return view === "out" ? [
                        <td key={`${row.key}-${date}-qty`} className={`border border-zinc-700 px-4 py-3 text-center font-black ${cell?.quantity ? "bg-cyan-400 text-black" : "bg-zinc-800 text-zinc-600"}`}>{cell?.quantity ? cell.quantity.toLocaleString("id-ID") : ""}</td>,
                        <td key={`${row.key}-${date}-rate`} className={`border border-zinc-700 px-4 py-3 text-center font-bold ${cell?.quantity ? "bg-yellow-300 text-black" : "bg-zinc-800 text-zinc-600"}`}>{cell?.quantity ? `Rp ${rate.toLocaleString("id-ID")}` : ""}</td>,
                      ] : [
                        <td key={`${row.key}-${date}-qty`} className={`border border-zinc-700 px-4 py-3 text-center font-black ${cell?.quantity ? "bg-cyan-400 text-black" : "bg-zinc-800 text-zinc-600"}`}>{cell?.quantity ? cell.quantity.toLocaleString("id-ID") : ""}</td>,
                      ];
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!matrix.rows.length ? <div className="p-6 text-sm text-zinc-500">Belum ada riwayat {view === "in" ? "Stok Masuk" : "Stok Keluar"} pada filter ini.</div> : null}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4 text-sm leading-6 text-sky-100">
        <strong>Identitas gudang = nama karyawan.</strong> Tidak ada kolom Lokasi Gudang untuk Gold maupun Item. Gunakan filter karyawan untuk mengecek gudang masing-masing. <strong>Stok Masuk</strong> dicatat saat stok ditambahkan, sedangkan <strong>Stok Keluar</strong> dibuat otomatis ketika order Gold/Item ditandai selesai. Pada tabel Stok Keluar, jumlah Gold/Item dan <strong>Rate order</strong> tampil berdampingan per tanggal.
      </div>
    </>
  );
}

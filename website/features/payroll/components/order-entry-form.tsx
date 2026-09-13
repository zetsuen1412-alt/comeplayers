"use client";

import { authenticatedFetch } from "@/lib/authenticatedFetch";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoProductGames } from "@/features/payroll/lib/demo-product-store";
import { searchGames, serversForRegion } from "@/features/payroll/lib/product-catalog";
import { useDemoInventory } from "@/features/payroll/lib/demo-inventory-store";
import { getAvailableStock } from "@/features/payroll/lib/inventory";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { formatDateTimeID } from "@/features/payroll/lib/date";
import { formatMoney } from "@/features/payroll/lib/money";
import { nextAutomaticOrderCode } from "@/features/payroll/lib/order-code";
import { checkAllocationQuantity } from "@/features/payroll/lib/order-allocation";
import type { Order, OrderInventoryAllocation, OrderType, OrderWorkerAssignment } from "@/features/payroll/types/domain";

const sources = ["G2G", "ComePlayers", "Direct", "Telegram", "OverGear", "FunPay", "PlayerAuction", "Lainnya"];
const processes = ["JOKI", "FARM", "MAIL", "AH", "F2F", "LAINNYA"];

const orderTypeLabels: Record<OrderType, string> = {
  gold: "Gold",
  item: "Item",
  boosting: "Boosting",
};

type DraftWorker = { rowId: string; employeeId: string; process: string; quantity: number };
type DraftStock = { rowId: string; inventoryStockId: string; quantity: number };

function newWorkerRow(quantity = 0): DraftWorker {
  return { rowId: `worker-${Date.now()}-${Math.random().toString(36).slice(2)}`, employeeId: "", process: "JOKI", quantity };
}

function newStockRow(quantity = 0): DraftStock {
  return { rowId: `stock-${Date.now()}-${Math.random().toString(36).slice(2)}`, inventoryStockId: "", quantity };
}

async function getServerTime() {
  const response = await authenticatedFetch("/api/admin/payroll/workspace/time", { cache: "no-store" });
  if (!response.ok) throw new Error("SERVER_TIME_UNAVAILABLE");
  const data = await response.json() as { now?: string };
  if (!data.now || Number.isNaN(new Date(data.now).getTime())) throw new Error("SERVER_TIME_INVALID");
  return data.now;
}

export function OrderEntryForm() {
  const { allOrders, userOrders, addOrder } = useDemoOrders();
  const { inventory, reserveAllocations } = useDemoInventory();
  const { employees } = useDemoEmployees();
  const { games } = useDemoProductGames();
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("boosting");
  const [source, setSource] = useState("G2G");
  const [buyer, setBuyer] = useState("");
  const [orderName, setOrderName] = useState("");
  const [gameQuery, setGameQuery] = useState("");
  const [selectedGameId, setSelectedGameId] = useState("");
  const [region, setRegion] = useState("");
  const [server, setServer] = useState("");
  const [showGameSuggestions, setShowGameSuggestions] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState(0);
  const [workerRows, setWorkerRows] = useState<DraftWorker[]>(() => [newWorkerRow(1)]);
  const [stockRows, setStockRows] = useState<DraftStock[]>([]);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string; code?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const now = await getServerTime();
        if (active) setServerTime(now);
      } catch {
        if (active) setServerTime(null);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const automaticCode = useMemo(() => {
    try {
      const autoHistory = userOrders.filter((order) => order.orderNumber.startsWith("CP-DEMO-AUTO-")).map((order) => order.externalReference);
      return nextAutomaticOrderCode(autoHistory, allOrders.map((order) => order.externalReference));
    } catch {
      return "Kode habis";
    }
  }, [allOrders, userOrders]);

  const selectedGame = useMemo(() => games.find((row) => row.id === selectedGameId) ?? null, [games, selectedGameId]);
  const gameSuggestions = useMemo(() => searchGames(games, gameQuery), [games, gameQuery]);
  const availableRegions = selectedGame?.regions ?? [];
  const availableServers = useMemo(() => serversForRegion(selectedGame, region), [selectedGame, region]);
  const gameCode = selectedGame?.code ?? "";

  const total = useMemo(() => Math.max(0, Math.round(quantity * rate)), [quantity, rate]);
  const workerAllocationCheck = useMemo(() => checkAllocationQuantity(quantity, workerRows.map((row) => row.quantity)), [quantity, workerRows]);
  const assignedQuantity = workerAllocationCheck.assignedQuantity;
  const workerDifference = workerAllocationCheck.difference;
  const hasBlankWorker = workerRows.some((row) => !row.employeeId);
  const hasInvalidWorkerQuantity = workerRows.some((row) => row.quantity <= 0);
  const employeeIds = workerRows.map((row) => row.employeeId).filter(Boolean);
  const hasDuplicateWorker = new Set(employeeIds).size !== employeeIds.length;
  const workerAllocationMatches = workerAllocationCheck.matches;
  const workerQuantityMustMatch = orderType !== "boosting";
  const workerSplitOk = !hasBlankWorker && !hasInvalidWorkerQuantity && !hasDuplicateWorker && (!workerQuantityMustMatch || workerAllocationMatches);

  const needsStock = orderType === "gold" || orderType === "item";
  const stockType = orderType === "item" ? "item" : "gold";
  const availableStockChoices = useMemo(() => inventory.filter((row) => {
    if (row.stockType !== stockType) return false;
    if (gameCode && row.game.toUpperCase() !== gameCode.toUpperCase()) return false;
    if (region && row.region !== region) return false;
    if (server && row.server !== server) return false;
    return true;
  }), [inventory, stockType, gameCode, region, server]);
  const stockAllocationCheck = useMemo(() => checkAllocationQuantity(quantity, stockRows.map((row) => row.quantity)), [quantity, stockRows]);
  const stockDifference = stockAllocationCheck.difference;
  const stockAssignedQuantity = stockAllocationCheck.assignedQuantity;
  const hasBlankStock = needsStock && stockRows.some((row) => !row.inventoryStockId);
  const hasInvalidStockQuantity = needsStock && stockRows.some((row) => row.quantity <= 0);
  const stockIds = stockRows.map((row) => row.inventoryStockId).filter(Boolean);
  const hasDuplicateStock = needsStock && new Set(stockIds).size !== stockIds.length;
  const hasWrongStockType = needsStock && stockRows.some((row) => {
    const stock = inventory.find((x) => x.id === row.inventoryStockId);
    return Boolean(stock && stock.stockType !== stockType);
  });
  const hasInsufficientStock = needsStock && stockRows.some((row) => {
    const stock = inventory.find((x) => x.id === row.inventoryStockId);
    return Boolean(stock && row.quantity > getAvailableStock(stock));
  });
  const hasWrongGameStock = needsStock && stockRows.some((row) => {
    const stock = inventory.find((x) => x.id === row.inventoryStockId);
    return Boolean(stock && gameCode && stock.game.toUpperCase() !== gameCode.toUpperCase());
  });
  const hasWrongRegionStock = needsStock && stockRows.some((row) => {
    const stock = inventory.find((x) => x.id === row.inventoryStockId);
    return Boolean(stock && region && stock.region !== region);
  });
  const hasWrongServerStock = needsStock && stockRows.some((row) => {
    const stock = inventory.find((x) => x.id === row.inventoryStockId);
    return Boolean(stock && server && stock.server !== server);
  });
  const stockMatches = !needsStock || (stockAllocationCheck.matches && !hasBlankStock && !hasInvalidStockQuantity && !hasDuplicateStock && !hasWrongStockType && !hasInsufficientStock && !hasWrongGameStock && !hasWrongRegionStock && !hasWrongServerStock);

  const canSave = Boolean(serverTime)
    && automaticCode !== "Kode habis"
    && Boolean(buyer.trim())
    && Boolean(selectedGame)
    && Boolean(region)
    && Boolean(server)
    && (orderType === "gold" || Boolean(orderName.trim()))
    && !hasBlankWorker
    && !hasInvalidWorkerQuantity
    && !hasDuplicateWorker
    && (!workerQuantityMustMatch || workerAllocationMatches)
    && stockMatches
    && !saving;

  function updateWorker(rowId: string, patch: Partial<DraftWorker>) {
    setWorkerRows((rows) => rows.map((row) => row.rowId === rowId ? { ...row, ...patch } : row));
  }

  function updateStock(rowId: string, patch: Partial<DraftStock>) {
    setStockRows((rows) => rows.map((row) => row.rowId === rowId ? { ...row, ...patch } : row));
  }

  function changeOrderQuantity(value: number) {
    const next = Math.max(0, value);
    setQuantity(next);
    setWorkerRows((rows) => rows.length === 1 ? [{ ...rows[0], quantity: next }] : rows);
    setStockRows((rows) => rows.length === 1 ? [{ ...rows[0], quantity: next }] : rows);
  }

  function changeOrderType(value: OrderType) {
    setOrderType(value);
    if (value === "gold") setOrderName("");
    if (value === "boosting") setStockRows([]);
    else setStockRows([newStockRow(quantity)]);
  }

  function chooseGame(gameId: string) {
    const picked = games.find((row) => row.id === gameId);
    if (!picked) return;
    setSelectedGameId(picked.id);
    setGameQuery(`${picked.name} (${picked.code})`);
    setShowGameSuggestions(false);
    const firstRegion = picked.regions[0]?.name ?? "";
    setRegion(firstRegion);
    const firstServer = picked.regions[0]?.servers[0] ?? "";
    setServer(firstServer);
    setStockRows((rows) => rows.map((row) => ({ ...row, inventoryStockId: "" })));
  }

  function changeGameQuery(value: string) {
    setGameQuery(value);
    setShowGameSuggestions(true);
    if (selectedGame && value !== `${selectedGame.name} (${selectedGame.code})`) {
      setSelectedGameId("");
      setRegion("");
      setServer("");
      setStockRows((rows) => rows.map((row) => ({ ...row, inventoryStockId: "" })));
    }
  }

  function changeRegion(value: string) {
    setRegion(value);
    setServer(serversForRegion(selectedGame, value)[0] ?? "");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (!buyer.trim()) return setMessage({ type: "error", text: "Nama buyer wajib diisi." });
    if (orderType !== "gold" && !orderName.trim()) return setMessage({ type: "error", text: "Nama order wajib diisi." });
    if (!selectedGame) return setMessage({ type: "error", text: "Game harus dipilih dari rekomendasi Produk / Game." });
    if (!region) return setMessage({ type: "error", text: "Region wajib dipilih dari daftar game." });
    if (!server) return setMessage({ type: "error", text: "Server wajib dipilih dari daftar game." });
    if (quantity <= 0) return setMessage({ type: "error", text: "Jumlah order harus lebih dari 0." });
    if (rate < 0) return setMessage({ type: "error", text: "Rate tidak boleh minus." });
    if (hasBlankWorker) return setMessage({ type: "error", text: "Pilih karyawan pada semua baris pembagian." });
    if (hasInvalidWorkerQuantity) return setMessage({ type: "error", text: "Jumlah yang dikerjakan setiap karyawan harus lebih dari 0." });
    if (hasDuplicateWorker) return setMessage({ type: "error", text: "Karyawan yang sama tidak boleh dimasukkan dua kali dalam satu order." });
    if (workerQuantityMustMatch && !workerAllocationMatches) {
      const text = workerDifference > 0
        ? `Pembagian karyawan melebihi jumlah order sebanyak ${workerDifference.toLocaleString("id-ID")}. Kurangi jumlah sebelum menyimpan.`
        : `Pembagian karyawan masih kurang ${Math.abs(workerDifference).toLocaleString("id-ID")}. Total pembagian harus sama dengan jumlah order.`;
      return setMessage({ type: "error", text });
    }

    if (needsStock) {
      if (!stockRows.length || hasBlankStock) return setMessage({ type: "error", text: `Pilih stok gudang untuk order ${orderTypeLabels[orderType]}.` });
      if (hasDuplicateStock) return setMessage({ type: "error", text: "Stok gudang yang sama tidak boleh dipilih dua kali." });
      if (hasWrongStockType) return setMessage({ type: "error", text: `Stok yang dipilih harus berjenis ${orderTypeLabels[orderType]}.` });
      if (hasWrongGameStock) return setMessage({ type: "error", text: "Game stok harus sama dengan game pada pesanan." });
      if (hasWrongRegionStock) return setMessage({ type: "error", text: "Region stok harus sama dengan Region pesanan." });
      if (hasWrongServerStock) return setMessage({ type: "error", text: "Server stok harus sama dengan Server pesanan." });
      if (hasInsufficientStock) return setMessage({ type: "error", text: "Ada jumlah yang melebihi stok tersedia. Kurangi jumlah atau pilih gudang lain." });
      if (!stockAllocationCheck.matches) {
        const text = stockDifference > 0
          ? `Jumlah stok yang diambil melebihi order sebanyak ${stockDifference.toLocaleString("id-ID")}.`
          : `Jumlah stok yang dipilih masih kurang ${Math.abs(stockDifference).toLocaleString("id-ID")}.`;
        return setMessage({ type: "error", text });
      }
    }

    if (allOrders.some((x) => x.externalReference.toLowerCase() === automaticCode.toLowerCase())) {
      return setMessage({ type: "error", text: `Kode otomatis ${automaticCode} sudah digunakan. Muat ulang halaman untuk mendapatkan kode berikutnya.` });
    }

    setSaving(true);
    try {
      const orderTime = await getServerTime();
      setServerTime(orderTime);
      const due = new Date(new Date(orderTime).getTime() + 24 * 60 * 60 * 1000).toISOString();
      const nowCode = Date.now();

      const assignments: OrderWorkerAssignment[] = workerRows.map((row, index) => {
        const employee = employees.find((item) => item.id === row.employeeId)!;
        return {
          id: `asg-${nowCode}-${index + 1}`,
          employeeCode: employee.code,
          employeeName: employee.name,
          team: employee.team,
          process: row.process,
          quantity: row.quantity,
        };
      });

      const inventoryAllocations: OrderInventoryAllocation[] = needsStock ? stockRows.map((row, index) => {
        const stock = inventory.find((item) => item.id === row.inventoryStockId)!;
        return {
          id: `inv-asg-${nowCode}-${index + 1}`,
          inventoryStockId: stock.id,
          stockType: stock.stockType,
          game: stock.game,
          region: stock.region,
          server: stock.server,
          itemName: stock.itemName,
          locationName: stock.locationName,
          employeeCode: stock.employeeCode,
          employeeName: stock.employeeName,
          team: stock.team,
          quantity: row.quantity,
        };
      }) : [];

      if (needsStock) {
        const reservation = reserveAllocations(inventoryAllocations);
        if (!reservation.ok) {
          setMessage({ type: "error", text: reservation.message });
          return;
        }
      }

      const first = assignments[0];
      const order: Order = {
        id: `ord-user-${nowCode}`,
        orderNumber: `CP-DEMO-AUTO-${automaticCode}`,
        externalReference: automaticCode,
        source,
        buyerName: buyer.trim(),
        orderName: orderType === "gold" ? undefined : orderName.trim(),
        orderType,
        game: selectedGame.code,
        gameId: selectedGame.id,
        gameName: selectedGame.name,
        region,
        server,
        service: orderTypeLabels[orderType],
        process: first?.process,
        employeeCode: first?.employeeCode,
        employeeName: first?.employeeName,
        team: first?.team,
        quantity,
        rateMinor: rate,
        grossMinor: total,
        workerAssignments: assignments,
        inventoryAllocations,
        transferStatus: "PENDING",
        operationalStatus: assignments.length ? "assigned" : "assignment_pending",
        financeStatus: "pending",
        expectedPaymentMinor: total,
        matchedPaymentMinor: 0,
        orderedAt: orderTime,
        dueAt: due,
      };

      addOrder(order);
      setMessage({
        type: "ok",
        text: needsStock
          ? `Pesanan ${automaticCode} berhasil disimpan. Stok ${orderTypeLabels[orderType]} sudah dicadangkan dari gudang dan data otomatis masuk Mutasi.`
          : `Pesanan ${automaticCode} berhasil disimpan dengan ${assignments.length} karyawan dan otomatis masuk Mutasi.`,
        code: automaticCode,
      });
      setBuyer("");
      setOrderName("");
      setGameQuery("");
      setSelectedGameId("");
      setRegion("");
      setServer("");
      setQuantity(1);
      setRate(0);
      setWorkerRows([newWorkerRow(1)]);
      setStockRows(orderType === "boosting" ? [] : [newStockRow(1)]);
    } catch {
      setMessage({ type: "error", text: "Pesanan belum tersimpan. Coba lagi." });
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 outline-none focus:border-yellow-400";

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="cp-card p-5 sm:p-6">
        <div className="mb-5 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-100">
          <strong>Tanggal dan kode order dibuat otomatis.</strong> Untuk jenis <strong>Gold</strong> atau <strong>Item</strong>, stok wajib dipilih dari Gudang.
        </div>

        <h2 className="text-xl font-semibold">1. Data Pesanan</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="text-sm">Hari & tanggal order
            <div className="mt-2 min-h-[50px] rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-medium">{serverTime ? formatDateTimeID(serverTime) : "Mengambil waktu server..."}</div>
          </div>
          <div className="text-sm">Kode order otomatis
            <div className="mt-2 min-h-[50px] rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-3 text-lg font-bold text-yellow-300">{automaticCode}</div>
            <div className="mt-1 text-xs text-zinc-500">EG1 → EG9999 → EGA0001 → ... → EGZ9999</div>
          </div>
          <label className="text-sm">Sumber
            <select value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>{sources.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="text-sm">Jenis Order
            <select value={orderType} onChange={(e) => changeOrderType(e.target.value as OrderType)} className={inputClass}>
              <option value="gold">Gold</option>
              <option value="item">Item</option>
              <option value="boosting">Boosting</option>
            </select>
          </label>
          <label className="text-sm">Nama buyer
            <input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Nama buyer" className={inputClass} required />
          </label>
          {orderType !== "gold" ? (
            <label className="text-sm">Nama order
              <input value={orderName} onChange={(e) => setOrderName(e.target.value)} placeholder={orderType === "item" ? "Contoh: Ancient Core x10" : "Contoh: Level 1-60"} className={inputClass} required />
            </label>
          ) : null}
          <div className="relative text-sm">Game
            <input
              value={gameQuery}
              onChange={(e) => changeGameQuery(e.target.value)}
              onFocus={() => setShowGameSuggestions(true)}
              placeholder="Ketik nama game, lalu pilih rekomendasi"
              className={inputClass}
              autoComplete="off"
            />
            {showGameSuggestions ? (
              <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-zinc-700 bg-zinc-950 p-1 shadow-2xl">
                {gameSuggestions.length ? gameSuggestions.map((row) => (
                  <button key={row.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseGame(row.id)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-800">
                    <div className="font-semibold">{row.name}</div>
                    <div className="text-xs text-zinc-500">{row.code}{row.aliases?.length ? ` · ${row.aliases.join(", ")}` : ""}</div>
                  </button>
                )) : <div className="px-3 py-3 text-xs text-zinc-500">Tidak ada game. Tambahkan dulu di menu Produk / Game.</div>}
              </div>
            ) : null}
            <div className="mt-1 text-xs text-zinc-500">Game tidak bisa diketik bebas; harus dipilih dari daftar Produk / Game.</div>
          </div>
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
        </div>
      </section>

      <section className="cp-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">2. Karyawan, Proses & Jumlah</h2>
            <p className="mt-1 text-sm text-zinc-500">Satu order boleh dikerjakan beberapa karyawan. Untuk Boosting, harga otomatis dibagi rata. Untuk Gold/Item, total jumlah karyawan harus sama dengan jumlah order.</p>
          </div>
          <button type="button" onClick={() => setWorkerRows((rows) => [...rows, newWorkerRow(orderType === "boosting" ? Math.max(1, quantity) : 0)])} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold hover:bg-zinc-700">+ Tambah karyawan</button>
        </div>

        <div className="mt-4 space-y-3">
          {workerRows.map((row, index) => {
            const employee = employees.find((x) => x.id === row.employeeId);
            const portionGross = orderType === "boosting" && workerRows.length > 0
              ? Math.floor(total / workerRows.length) + (index < (total % workerRows.length) ? 1 : 0)
              : Math.max(0, Math.round(row.quantity * rate));
            return (
              <div key={row.rowId} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-semibold">Karyawan {index + 1}</div>
                  {workerRows.length > 1 ? <button type="button" onClick={() => setWorkerRows((rows) => rows.filter((item) => item.rowId !== row.rowId))} className="text-xs font-semibold text-red-300">Hapus</button> : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-sm">Karyawan
                    <select value={row.employeeId} onChange={(e) => updateWorker(row.rowId, { employeeId: e.target.value })} className={inputClass}>
                      <option value="">Pilih karyawan</option>
                      {employees.filter((x) => x.workforceStatus !== "RESIGN").map((x) => <option key={x.id} value={x.id}>{x.name} — {x.team} — {x.workforceStatus}</option>)}
                    </select>
                  </label>
                  <div className="text-sm">FH
                    <div className="mt-2 flex min-h-[50px] items-center rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-semibold text-yellow-300">{employee?.team ?? "Otomatis"}</div>
                  </div>
                  <label className="text-sm">Proses
                    <select value={row.process} onChange={(e) => updateWorker(row.rowId, { process: e.target.value })} className={inputClass}>{processes.map((x) => <option key={x}>{x}</option>)}</select>
                  </label>
                  {orderType === "boosting" ? (
                    <div className="text-sm">Pembagian harga
                      <div className="mt-2 flex min-h-[50px] items-center rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-semibold text-emerald-300">{formatMoney(portionGross)} otomatis</div>
                    </div>
                  ) : (
                    <label className="text-sm">Jumlah dikerjakan
                      <input type="number" min="0" step="any" value={row.quantity} onChange={(e) => updateWorker(row.rowId, { quantity: Math.max(0, Number(e.target.value)) })} className={inputClass} />
                    </label>
                  )}
                </div>
                {employee ? <div className="mt-3 text-xs text-zinc-500">Nilai pekerjaan {employee.name}: <span className="font-semibold text-yellow-300">{formatMoney(portionGross)}</span>. Persentase gaji karyawan ini dihitung nanti di menu Gaji.</div> : null}
              </div>
            );
          })}
        </div>
      </section>

      {needsStock ? (
        <section className="cp-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">3. Ambil Stok dari Gudang</h2>
              <p className="mt-1 text-sm text-zinc-500">Khusus {orderTypeLabels[orderType]}. Pilih stok milik karyawan. Nama karyawan dan FH berasal otomatis dari data stok.</p>
            </div>
            <button type="button" onClick={() => setStockRows((rows) => [...rows, newStockRow(0)])} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold hover:bg-zinc-700">+ Ambil dari gudang lain</button>
          </div>

          <div className="mt-4 space-y-3">
            {stockRows.map((row, index) => {
              const stock = inventory.find((x) => x.id === row.inventoryStockId);
              const available = stock ? getAvailableStock(stock) : 0;
              const over = Boolean(stock && row.quantity > available);
              const wrongGame = Boolean(stock && gameCode && stock.game.toUpperCase() !== gameCode.toUpperCase());
              const wrongRegion = Boolean(stock && region && stock.region !== region);
              const wrongServer = Boolean(stock && server && stock.server !== server);
              return (
                <div key={row.rowId} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="font-semibold">Sumber Stok {index + 1}</div>
                    {stockRows.length > 1 ? <button type="button" onClick={() => setStockRows((rows) => rows.filter((item) => item.rowId !== row.rowId))} className="text-xs font-semibold text-red-300">Hapus</button> : null}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label className="text-sm xl:col-span-2">Stok Karyawan
                      <select value={row.inventoryStockId} onChange={(e) => updateStock(row.rowId, { inventoryStockId: e.target.value })} className={inputClass}>
                        <option value="">Pilih stok</option>
                        {availableStockChoices.map((x) => <option key={x.id} value={x.id}>{x.stockType === "gold" ? `${x.employeeName} (${x.team}) · ${x.game} · ${x.region ?? "—"} · ${x.server ?? "—"} · tersedia ${getAvailableStock(x).toLocaleString("id-ID")}` : `${x.employeeName} (${x.team}) · ${x.game} · ${x.region ?? "—"} · ${x.server ?? "—"} · ${x.itemName} · tersedia ${getAvailableStock(x).toLocaleString("id-ID")}`}</option>)}
                      </select>
                    </label>
                    <div className="text-sm">Karyawan & FH
                      <div className="mt-2 min-h-[50px] rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">{stock ? <><strong>{stock.employeeName}</strong> · <span className="text-yellow-300">{stock.team}</span></> : "Otomatis"}</div>
                    </div>
                    <label className="text-sm">Jumlah diambil
                      <input type="number" min="0" step="any" value={row.quantity} onChange={(e) => updateStock(row.rowId, { quantity: Math.max(0, Number(e.target.value)) })} className={inputClass} />
                    </label>
                  </div>
                  {stock ? <div className={`mt-3 rounded-xl p-3 text-sm ${over || wrongGame || wrongRegion || wrongServer ? "bg-red-500/10 text-red-200" : "bg-emerald-500/10 text-emerald-100"}`}>
                    {stock.stockType === "item" ? <><strong>{stock.itemName}</strong> · </> : null}Game {stock.game} · Region {stock.region ?? "—"} · Server {stock.server ?? "—"} · Stok {stock.onHand.toLocaleString("id-ID")} · Sudah dipesan {stock.reserved.toLocaleString("id-ID")} · <strong>Bisa dipakai {available.toLocaleString("id-ID")}</strong>
                    {wrongGame ? <div className="mt-1 font-semibold">⚠ Game stok berbeda dengan game pesanan.</div> : null}
                    {wrongRegion ? <div className="mt-1 font-semibold">⚠ Region stok berbeda dengan Region pesanan.</div> : null}
                    {wrongServer ? <div className="mt-1 font-semibold">⚠ Server stok berbeda dengan Server pesanan.</div> : null}
                    {over ? <div className="mt-1 font-semibold">⚠ Jumlah yang diambil melebihi stok tersedia.</div> : null}
                  </div> : null}
                </div>
              );
            })}
          </div>

          <div className={`mt-4 rounded-2xl border p-4 ${stockMatches ? "border-emerald-500/30 bg-emerald-500/10" : hasInsufficientStock || hasWrongGameStock || hasWrongRegionStock || hasWrongServerStock || hasWrongStockType || hasDuplicateStock ? "border-red-500/30 bg-red-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
            <div className="font-semibold">Pengecekan stok: Order {quantity.toLocaleString("id-ID")} · Diambil {stockAssignedQuantity.toLocaleString("id-ID")}</div>
            <div className="mt-1 text-sm">{stockMatches ? "✓ Stok cocok dan cukup." : hasInsufficientStock ? "⚠ Ada stok yang tidak cukup." : hasWrongStockType ? "⚠ Jenis stok tidak cocok dengan jenis order." : hasWrongGameStock ? "⚠ Ada stok dari game yang berbeda." : hasWrongRegionStock ? "⚠ Ada stok dari Region yang berbeda." : hasWrongServerStock ? "⚠ Ada stok dari Server yang berbeda." : hasDuplicateStock ? "⚠ Stok yang sama dipilih dua kali." : stockDifference > 0 ? `⚠ Melebihi ${stockDifference.toLocaleString("id-ID")}.` : `⚠ Masih kurang ${Math.abs(stockDifference).toLocaleString("id-ID")}.`}</div>
          </div>
        </section>
      ) : null}

      <section className="cp-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">{needsStock ? "4" : "3"}. Harga</h2>
        <p className="mt-1 text-sm text-zinc-500">Di Pesanan hanya dicatat nilai order. Persentase gaji tidak lagi diatur di sini.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm">Jumlah order
            <input type="number" min="0.00000001" step="any" value={quantity} onChange={(e) => changeOrderQuantity(Number(e.target.value))} className={inputClass} />
          </label>
          <label className="text-sm">Rate / harga per unit
            <input type="number" min="0" step="1" value={rate} onChange={(e) => setRate(Math.max(0, Number(e.target.value)))} className={inputClass} />
          </label>
        </div>

        <div className="mt-5 rounded-xl bg-zinc-950 p-4">
          <div className="text-sm text-zinc-500">Total harga order</div>
          <div className="mt-1 text-3xl font-semibold">{formatMoney(total)}</div>
          <div className="mt-1 text-xs text-zinc-600">Jumlah × Rate · Persentase gaji diatur per karyawan melalui menu Gaji.</div>
        </div>

        <div className={`mt-5 rounded-2xl border p-4 ${workerSplitOk ? "border-emerald-500/30 bg-emerald-500/10" : workerDifference > 0 || hasDuplicateWorker ? "border-red-500/30 bg-red-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-zinc-400">Pengecekan pembagian karyawan</div>
              {orderType === "boosting" ? (
                <div className="mt-1 text-lg font-semibold">1 order · {workerRows.length} karyawan · harga {formatMoney(total)} dibagi otomatis</div>
              ) : (
                <div className="mt-1 text-lg font-semibold">Order: {quantity.toLocaleString("id-ID")} · Dibagi: {assignedQuantity.toLocaleString("id-ID")}</div>
              )}
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-bold ${workerSplitOk ? "bg-emerald-500 text-black" : workerDifference > 0 || hasDuplicateWorker ? "bg-red-500 text-white" : "bg-amber-400 text-black"}`}>
              {hasDuplicateWorker ? "KARYAWAN DUPLIKAT" : hasBlankWorker ? "PILIH KARYAWAN" : hasInvalidWorkerQuantity ? "JUMLAH BELUM BENAR" : orderType === "boosting" ? "HARGA DIBAGI OTOMATIS" : workerAllocationMatches ? "JUMLAH COCOK" : workerDifference > 0 ? `MELEBIHI ${workerDifference.toLocaleString("id-ID")}` : `KURANG ${Math.abs(workerDifference).toLocaleString("id-ID")}`}
            </div>
          </div>
          {workerQuantityMustMatch && !workerAllocationMatches ? <p className="mt-2 text-sm">Untuk Gold/Item, total jumlah yang dikerjakan semua karyawan harus sama persis dengan jumlah order.</p> : null}
          {orderType === "boosting" && workerRows.length > 1 ? <p className="mt-2 text-sm">Contoh: order Rp10.000 dengan 2 karyawan = nilai pekerjaan Rp5.000 per karyawan, tetapi tetap hanya 1 order di Mutasi.</p> : null}
        </div>
      </section>

      {message ? (
        <section className={`rounded-2xl border p-5 ${message.type === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-red-500/30 bg-red-500/10 text-red-100"}`}>
          <div className="font-semibold">{message.type === "ok" ? "✓ Berhasil" : "⚠ Periksa lagi"}</div>
          <div className="mt-1 text-sm">{message.text}</div>
          {message.type === "ok" ? <div className="mt-4 flex flex-wrap gap-2"><Link href="/admin/payroll/mutations" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black">Lihat di Mutasi</Link><Link href="/admin/payroll/inventory" className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold">Lihat Gudang</Link></div> : null}
        </section>
      ) : null}

      <button type="submit" disabled={!canSave} className="w-full rounded-2xl bg-yellow-400 px-5 py-4 text-base font-bold text-black disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 sm:w-auto">
        {saving ? "Menyimpan..." : canSave ? "Simpan Pesanan & Buat Mutasi" : needsStock && !stockMatches ? "Periksa Stok Sebelum Simpan" : "Periksa Pembagian Karyawan Sebelum Simpan"}
      </button>
    </form>
  );
}

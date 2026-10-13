"use client";

import { adminLabel } from "@/lib/adminLocale";
import { flushPayroll, withPayrollBatch } from "@/features/payroll/lib/workspace-store";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import { useDemoProductGames } from "@/features/payroll/lib/demo-product-store";
import { useBoostingCatalog } from "@/features/payroll/lib/boosting-catalog-store";
import { searchGames, serversForRegion } from "@/features/payroll/lib/product-catalog";
import { useDemoInventory } from "@/features/payroll/lib/demo-inventory-store";
import { getAvailableStock } from "@/features/payroll/lib/inventory";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { jakartaDateTimeLocalNow } from "@/features/payroll/lib/date";
import { parseManualOrderTime } from "@/features/payroll/lib/manual-order-time";
import { ManualOrderDateField } from "@/features/payroll/components/manual-order-date-field";
import { formatMoney } from "@/features/payroll/lib/money";
import { manualOrderCode } from "@/features/payroll/lib/manual-order-code";
import { checkAllocationQuantity } from "@/features/payroll/lib/order-allocation";
import { buildDailyWorkSchedule } from "@/features/payroll/lib/daily-orders";
import { boostingPlanLabel, parseBoostingPackagePlan } from "@/features/payroll/lib/boosting-package";
import type { Order, OrderInventoryAllocation, OrderScheduleMode, OrderType, OrderWorkerAssignment } from "@/features/payroll/types/domain";

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

export function OrderEntryForm() {
  const { allOrders, addOrder } = useDemoOrders();
  const { inventory, reserveAllocations } = useDemoInventory();
  const { employees } = useDemoEmployees();
  const { games } = useDemoProductGames();
  const { active: boostingPlans } = useBoostingCatalog();
  const [boostingCatalogId, setBoostingCatalogId] = useState("");
  const [orderDateTime, setOrderDateTime] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("boosting");
  const [scheduleMode, setScheduleMode] = useState<OrderScheduleMode>("single");
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleDays, setScheduleDays] = useState(7);
  const [source, setSource] = useState("G2G");
  const [manualCode, setManualCode] = useState("");
  const [buyer, setBuyer] = useState("");
  const [orderName, setOrderName] = useState("");
  const [task, setTask] = useState("");
  const [gameQuery, setGameQuery] = useState("");
  const [selectedGameId, setSelectedGameId] = useState("");
  const [region, setRegion] = useState("");
  const [server, setServer] = useState("");
  const [showGameSuggestions, setShowGameSuggestions] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState(0);
  const [workerRows, setWorkerRows] = useState<DraftWorker[]>(() => [newWorkerRow(1)]);
  const [division, setDivision] = useState("");
  const [assignmentMode, setAssignmentMode] = useState<"leader" | "direct">("leader");
  const leaderChooses = assignmentMode === "leader";
  const [stockRows, setStockRows] = useState<DraftStock[]>([]);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string; code?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Initialize once after hydration. Manual edits are never refreshed by a timer.
    setOrderDateTime(current => current || jakartaDateTimeLocalNow());
    setScheduleStartDate(current => current || new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()));
  }, []);

  const orderTimeResult = useMemo(() => parseManualOrderTime(orderDateTime), [orderDateTime]);
  const packagePlan = useMemo(() => parseBoostingPackagePlan(orderName), [orderName]);

  useEffect(() => {
    if (orderType !== "boosting" || !packagePlan.isDaily) return;
    setScheduleMode("daily");
    setScheduleDays(packagePlan.totalDays);
  }, [orderType, packagePlan.isDaily, packagePlan.totalDays]);

  const orderCode = manualCode.trim();
  let codeError = "";
  try { manualOrderCode(orderCode,allOrders.map(row=>row.externalReference)); }
  catch(e) { codeError=e instanceof Error?e.message:"Kode pesanan tidak valid."; }

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
  const hasWrongDivision = workerRows.some(row => {
    const employee = employees.find(item => item.id === row.employeeId);
    return employee && (employee.team !== division || !["NEW", "SHIFT", "FULL"].includes(employee.workforceStatus));
  });
  const workerSplitOk = Boolean(division) && (leaderChooses || (!hasBlankWorker && !hasInvalidWorkerQuantity && !hasDuplicateWorker && !hasWrongDivision && (!workerQuantityMustMatch || workerAllocationMatches)));

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

  const canSave = orderTimeResult.ok
    && !codeError
    && Boolean(buyer.trim())
    && Boolean(selectedGame)
    && Boolean(region)
    && Boolean(server)
    && (orderType === "gold" || Boolean(orderName.trim()))
    && workerSplitOk
    && stockMatches
    && (scheduleMode !== "daily" || (orderType === "boosting" && Boolean(scheduleStartDate) && scheduleDays >= 2 && scheduleDays <= 366))
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
    if (value === "gold" && !["FH1", "FH2", "FH3"].includes(division)) {
      setDivision(""); setWorkerRows([newWorkerRow(quantity)]);
    }
    if (value === "gold") setOrderName("");
    setBoostingCatalogId("");
    if (value === "boosting") setStockRows([]);
    else {
      setScheduleMode("single");
      setStockRows([newStockRow(quantity)]);
    }
  }

  function chooseGame(gameId: string) {
    const picked = games.find((row) => row.id === gameId);
    if (!picked) return;
    setSelectedGameId(picked.id);
    setBoostingCatalogId("");
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
    if (saving) return;
    setMessage(null);
    const submittedTime = parseManualOrderTime(orderDateTime);
    if (!submittedTime.ok) return setMessage({ type: "error", text: submittedTime.error });

    if (!buyer.trim()) return setMessage({ type: "error", text: "Nama pembeli wajib diisi." });
    if (orderType !== "gold" && !orderName.trim()) return setMessage({ type: "error", text: "Nama pesanan wajib diisi." });
    if (!selectedGame) return setMessage({ type: "error", text: "Permainan harus dipilih dari rekomendasi Produk / Permainan." });
    if (!region) return setMessage({ type: "error", text: "Wilayah wajib dipilih dari daftar permainan." });
    if (!server) return setMessage({ type: "error", text: "Server wajib dipilih dari daftar permainan." });
    if (quantity <= 0) return setMessage({ type: "error", text: "Jumlah pesanan harus lebih dari 0." });
    if (rate < 0) return setMessage({ type: "error", text: "Tarif tidak boleh minus." });
    if (!division) return setMessage({ type: "error", text: "Pilih divisi tujuan pesanan." });
    if (!leaderChooses && hasWrongDivision) return setMessage({ type: "error", text: "Pilih karyawan aktif dari divisi tujuan." });
    if (!leaderChooses && hasBlankWorker) return setMessage({ type: "error", text: "Pilih karyawan pada semua baris pembagian." });
    if (!leaderChooses && hasInvalidWorkerQuantity) return setMessage({ type: "error", text: "Jumlah yang dikerjakan setiap karyawan harus lebih dari 0." });
    if (!leaderChooses && hasDuplicateWorker) return setMessage({ type: "error", text: "Karyawan yang sama tidak boleh dimasukkan dua kali dalam satu pesanan." });
    if (!leaderChooses && workerQuantityMustMatch && !workerAllocationMatches) {
      const text = workerDifference > 0
        ? `Pembagian karyawan melebihi jumlah pesanan sebanyak ${workerDifference.toLocaleString("id-ID")}. Kurangi jumlah sebelum menyimpan.`
        : `Pembagian karyawan masih kurang ${Math.abs(workerDifference).toLocaleString("id-ID")}. Total pembagian harus sama dengan jumlah order.`;
      return setMessage({ type: "error", text });
    }

    if (needsStock) {
      if (!stockRows.length || hasBlankStock) return setMessage({ type: "error", text: `Pilih stok gudang untuk pesanan ${orderTypeLabels[orderType]}.` });
      if (hasDuplicateStock) return setMessage({ type: "error", text: "Stok gudang yang sama tidak boleh dipilih dua kali." });
      if (hasWrongStockType) return setMessage({ type: "error", text: `Stok yang dipilih harus berjenis ${orderTypeLabels[orderType]}.` });
      if (hasWrongGameStock) return setMessage({ type: "error", text: "Permainan stok harus sama dengan permainan pada pesanan." });
      if (hasWrongRegionStock) return setMessage({ type: "error", text: "Wilayah stok harus sama dengan Wilayah pesanan." });
      if (hasWrongServerStock) return setMessage({ type: "error", text: "Server stok harus sama dengan Server pesanan." });
      if (hasInsufficientStock) return setMessage({ type: "error", text: "Ada jumlah yang melebihi stok tersedia. Kurangi jumlah atau pilih gudang lain." });
      if (!stockAllocationCheck.matches) {
        const text = stockDifference > 0
          ? `Jumlah stok yang diambil melebihi pesanan sebanyak ${stockDifference.toLocaleString("id-ID")}.`
          : `Jumlah stok yang dipilih masih kurang ${Math.abs(stockDifference).toLocaleString("id-ID")}.`;
        return setMessage({ type: "error", text });
      }
    }

    if (scheduleMode === "daily") {
      if (orderType !== "boosting") return setMessage({ type: "error", text: "Pesanan Harian Berjangka saat ini hanya tersedia untuk Boosting." });
      if (!scheduleStartDate) return setMessage({ type: "error", text: "Tanggal mulai pekerjaan harian wajib diisi." });
      if (!Number.isInteger(scheduleDays) || scheduleDays < 2 || scheduleDays > 366) return setMessage({ type: "error", text: "Jumlah hari pekerjaan harus 2 sampai 366 hari." });
    }
    if (codeError) return setMessage({ type: "error", text: codeError });

    setSaving(true);
    try {
      const { orderedAt: orderTime, dueAt: due } = submittedTime;
      const nowCode = Date.now();

      const assignments: OrderWorkerAssignment[] = (leaderChooses ? [] : workerRows).map((row, index) => {
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

      const first = assignments[0];
      const order: Order = {
        id: `ord-user-${crypto.randomUUID()}`,
        orderNumber: orderCode,
        externalReference: orderCode,
        source,
        buyerName: buyer.trim(),
        orderName: orderType === "gold" ? undefined : orderName.trim(),
        boostingCatalogId: orderType === "boosting" ? boostingCatalogId || undefined : undefined,
        task: task.trim() || undefined,
        orderType,
        scheduleMode,
        scheduleStartDate: scheduleMode === "daily" ? scheduleStartDate : undefined,
        scheduleTotalDays: scheduleMode === "daily" ? scheduleDays : undefined,
        dailyHours: scheduleMode === "daily" ? packagePlan.dailyHours : undefined,
        dailyWork: scheduleMode === "daily" ? buildDailyWorkSchedule(scheduleStartDate, scheduleDays, total, { dailyHours: packagePlan.dailyHours, workerAssignments: assignments }) : undefined,
        game: selectedGame.code,
        gameId: selectedGame.id,
        gameName: selectedGame.name,
        region,
        server,
        service: orderTypeLabels[orderType],
        process: first?.process,
        employeeCode: first?.employeeCode,
        employeeName: first?.employeeName,
        team: division,
        assignmentMode: leaderChooses ? "leader" : "direct",
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

      withPayrollBatch(()=>{
        if (needsStock) {
          const reservation=reserveAllocations(inventoryAllocations);
          if(!reservation.ok)throw new Error(reservation.message);
        }
        addOrder(order);
      });
      await flushPayroll();
      setMessage({
        type: "ok",
        text: needsStock
          ? `Pesanan ${orderCode} berhasil disimpan. Stok ${orderTypeLabels[orderType]} sudah dicadangkan dari gudang dan data otomatis masuk Mutasi.`
          : leaderChooses ? `Pesanan ${orderCode} disimpan untuk ${division}. Leader akan menentukan karyawan melalui Telegram.` : `Pesanan ${orderCode} berhasil disimpan dengan ${assignments.length} karyawan dan otomatis masuk Mutasi.`,
        code: orderCode,
      });
      setManualCode("");
      setBuyer("");
      setOrderName("");
      setBoostingCatalogId("");
      setTask("");
      setScheduleMode("single");
      setScheduleDays(7);
      setGameQuery("");
      setSelectedGameId("");
      setRegion("");
      setServer("");
      setQuantity(1);
      setRate(0);
      setWorkerRows([newWorkerRow(1)]);
      setDivision("");
      setStockRows(orderType === "boosting" ? [] : [newStockRow(1)]);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Pesanan belum terkonfirmasi tersimpan. Muat ulang status sebelum mencoba lagi." });
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 outline-none focus:border-yellow-400";

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="cp-card p-5 sm:p-6">
        <div className="mb-5 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-100">
          <strong>Isi kode, tanggal, dan jam pesanan secara manual (WIB).</strong> Tanggal lama dapat dipilih sesuai data spreadsheet. Untuk jenis <strong>Gold</strong> atau <strong>Item</strong>, stok wajib dipilih dari Gudang.
        </div>

        <h2 className="text-xl font-semibold">1. Data Pesanan</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ManualOrderDateField value={orderDateTime} onChange={setOrderDateTime} disabled={saving} inputClass={inputClass} />
          <label className="text-sm">Kode pesanan manual
            <input value={manualCode} onChange={e=>setManualCode(e.target.value)} maxLength={64} required autoComplete="off" placeholder="Contoh: G2G-20260917-001" aria-describedby="order-code-help" aria-invalid={!!manualCode && !!codeError} className={inputClass} />
            <span id="order-code-help" className={`mt-1 block text-xs ${manualCode && codeError ? "text-red-300" : "text-zinc-400"}`}>{manualCode && codeError ? codeError : "1–64 karakter: huruf, angka, titik, tanda hubung atau garis bawah. Kode harus unik."}</span>
          </label>
          <label className="text-sm">Sumber
            <select value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>{sources.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </label>
          <label className="text-sm">Jenis Pesanan
            <select value={orderType} onChange={(e) => changeOrderType(e.target.value as OrderType)} className={inputClass}>
              <option value="gold">Gold</option>
              <option value="item">Item</option>
              <option value="boosting">Boosting</option>
            </select>
          </label>
          {orderType === "boosting" ? (
            <label className="text-sm">Metode pengerjaan
              <select value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value as OrderScheduleMode)} className={inputClass}>
                <option value="single">Sekali Selesai</option>
                <option value="daily">Harian Berjangka</option>
              </select>
              <span className="mt-1 block text-xs text-zinc-500">Harian Berjangka membayar hanya hari yang sudah ditandai Selesai.</span>
            </label>
          ) : null}
          {orderType === "boosting" && scheduleMode === "daily" ? (
            <>
              <label className="text-sm">Tanggal mulai pekerjaan
                <input type="date" value={scheduleStartDate} onChange={(e) => setScheduleStartDate(e.target.value)} className={inputClass} required />
              </label>
              <label className="text-sm">Jumlah hari pekerjaan
                <input type="number" min="2" max="366" step="1" value={scheduleDays} onChange={(e) => setScheduleDays(Math.max(2, Math.min(366, Math.floor(Number(e.target.value) || 2))))} className={inputClass} required />
                <span className="mt-1 block text-xs text-zinc-500">Contoh: 7 hari atau 30 hari. Nilai pesanan dibagi rata per hari.</span>
              </label>
            </>
          ) : null}
          <label className="text-sm">Nama pembeli
            <input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder={"Nama pembeli"} className={inputClass} required />
          </label>
          {orderType === "boosting" ? <label className="text-sm">Pilih dari Daftar Boosting (opsional)
            <select value={boostingCatalogId} onChange={e=>{const id=e.target.value;const plan=boostingPlans.find(p=>p.id===id);if(plan){chooseGame(plan.gameId);setBoostingCatalogId(id);setOrderName(plan.name);setRate(plan.rateMinor);}else setBoostingCatalogId("");}} className={inputClass}>
              <option value="">Pilih paket Boosting atau isi manual</option>
              {boostingPlans.filter(p=>games.some(g=>g.id===p.gameId)).map(p=><option key={p.id} value={p.id}>{games.find(g=>g.id===p.gameId)?.name} · {p.name} — {formatMoney(p.rateMinor)}</option>)}
            </select><span className="mt-1 block text-xs text-zinc-400">Memilih paket juga mengisi game, region, server, nama, dan harga default. Harga bisa diubah manual; RATE mutasi dari Sheet tidak berubah. <Link href="/admin/payroll/boosting" className="text-yellow-300 underline">Kelola Daftar Boosting</Link>.</span>
          </label> : null}
          {orderType !== "gold" ? (
            <label className="text-sm">Nama pesanan
              <input value={orderName} onChange={(e) => setOrderName(e.target.value)} placeholder={orderType === "item" ? "Contoh: Ancient Core x10" : "Contoh: Level 1-60"} className={inputClass} required />
              {orderType === "boosting" && packagePlan.isDaily ? <span className="mt-1 block text-xs text-sky-300">Terdeteksi otomatis: {boostingPlanLabel(packagePlan)}. Sistem membuat Hari 1 sampai Hari {packagePlan.totalDays}.</span> : null}
            </label>
          ) : null}
          <label className="text-sm xl:col-span-2">TASK
            <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={4} placeholder="Keterangan TASK / pekerjaan yang harus dilakukan" className={inputClass} />
            <span className="mt-1 block text-xs text-zinc-500">Opsional. Tidak ada batas karakter khusus untuk TASK dan keterangan otomatis ikut tampil di Mutasi.</span>
          </label>
          <div className="relative text-sm">GAME
            <input
              value={gameQuery}
              onChange={(e) => changeGameQuery(e.target.value)}
              onFocus={() => setShowGameSuggestions(true)}
              placeholder={"Ketik nama permainan, lalu pilih rekomendasi"}
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
                )) : <div className="px-3 py-3 text-xs text-zinc-500">Tidak ada permainan. Tambahkan dulu di menu Produk / Permainan.</div>}
              </div>
            ) : null}
            <div className="mt-1 text-xs text-zinc-500">GAME tidak bisa diketik bebas; harus dipilih dari daftar Produk / Permainan.</div>
          </div>
          <label className="text-sm">Wilayah
            <select value={region} onChange={(e) => changeRegion(e.target.value)} className={inputClass} disabled={!selectedGame}>
              <option value="">Pilih Wilayah</option>
              {availableRegions.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Server
            <select value={server} onChange={(e) => setServer(e.target.value)} className={inputClass} disabled={!region}>
              <option value="">Pilih Server</option>
              {availableServers.map((value) => <option key={value} value={value}>{adminLabel(value)}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="cp-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">2. Divisi & Karyawan</h2>
            <p className="mt-1 text-sm text-zinc-500">Pilih divisi tujuan. Serahkan pemilihan karyawan kepada leader atau pilih langsung untuk request booster tertentu.</p>
          </div>
          {!leaderChooses && <button type="button" onClick={() => setWorkerRows((rows) => [...rows, newWorkerRow(orderType === "boosting" ? Math.max(1, quantity) : 0)])} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold hover:bg-zinc-700">+ Tambah karyawan</button>}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm">Divisi tujuan
            <select required value={division} onChange={e => { setDivision(e.target.value); setWorkerRows([newWorkerRow(quantity)]); }} className={inputClass}>
              <option value="">Pilih divisi</option>
              {(orderType === "gold" ? ["FH1", "FH2", "FH3"] : ["FH1", "FH2", "FH3", "ADMIN", "BANDAR"]).map(team => <option key={team}>{team}</option>)}
            </select>
          </label>
          <label className="text-sm">Penentuan karyawan
            <select value={assignmentMode} onChange={e => setAssignmentMode(e.target.value as "leader" | "direct")} className={inputClass}>
              <option value="leader">Ditentukan leader melalui Telegram</option>
              <option value="direct">Pilih karyawan langsung / Request booster</option>
            </select>
          </label>
        </div>
        {leaderChooses ? <p className="mt-4 rounded-xl bg-sky-500/10 p-4 text-sm text-sky-100">Order dikirim ke leader divisi yang dipilih. Leader memilih karyawan aktif dan mengirim bukti atas nama karyawan. Karyawan tidak memerlukan akun Telegram.</p> : <div className="mt-4 space-y-3">
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
                      {employees.filter((x) => x.team === division && ["NEW", "SHIFT", "FULL"].includes(x.workforceStatus)).map((x) => <option key={x.id} value={x.id}>{x.name} — {x.team} — {adminLabel(x.workforceStatus)}</option>)}
                    </select>
                  </label>
                  <div className="text-sm">FH
                    <div className="mt-2 flex min-h-[50px] items-center rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-semibold text-yellow-300">{division || "Pilih divisi di atas"}</div>
                  </div>
                  <label className="text-sm">Proses
                    <select value={row.process} onChange={(e) => updateWorker(row.rowId, { process: e.target.value })} className={inputClass}>{processes.map((x) => <option key={x} value={x}>{x}</option>)}</select>
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
        </div>}
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
                    {stock.stockType === "item" ? <><strong>{stock.itemName}</strong> · </> : null}GAME {stock.game} · Wilayah {stock.region ?? "—"} · Server {stock.server ?? "—"} · Stok {stock.onHand.toLocaleString("id-ID")} · Sudah dipesan {stock.reserved.toLocaleString("id-ID")} · <strong>Bisa dipakai {available.toLocaleString("id-ID")}</strong>
                    {wrongGame ? <div className="mt-1 font-semibold">⚠ Permainan stok berbeda dengan permainan pesanan.</div> : null}
                    {wrongRegion ? <div className="mt-1 font-semibold">⚠ Wilayah stok berbeda dengan Wilayah pesanan.</div> : null}
                    {wrongServer ? <div className="mt-1 font-semibold">⚠ Server stok berbeda dengan Server pesanan.</div> : null}
                    {over ? <div className="mt-1 font-semibold">⚠ Jumlah yang diambil melebihi stok tersedia.</div> : null}
                  </div> : null}
                </div>
              );
            })}
          </div>

          <div className={`mt-4 rounded-2xl border p-4 ${stockMatches ? "border-emerald-500/30 bg-emerald-500/10" : hasInsufficientStock || hasWrongGameStock || hasWrongRegionStock || hasWrongServerStock || hasWrongStockType || hasDuplicateStock ? "border-red-500/30 bg-red-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
            <div className="font-semibold">Pengecekan stok: Pesanan {quantity.toLocaleString("id-ID")} · Diambil {stockAssignedQuantity.toLocaleString("id-ID")}</div>
            <div className="mt-1 text-sm">{stockMatches ? "✓ Stok cocok dan cukup." : hasInsufficientStock ? "⚠ Ada stok yang tidak cukup." : hasWrongStockType ? "⚠ Jenis stok tidak cocok dengan jenis pesanan." : hasWrongGameStock ? "⚠ Ada stok dari permainan yang berbeda." : hasWrongRegionStock ? "⚠ Ada stok dari Wilayah yang berbeda." : hasWrongServerStock ? "⚠ Ada stok dari Server yang berbeda." : hasDuplicateStock ? "⚠ Stok yang sama dipilih dua kali." : stockDifference > 0 ? `⚠ Melebihi ${stockDifference.toLocaleString("id-ID")}.` : `⚠ Masih kurang ${Math.abs(stockDifference).toLocaleString("id-ID")}.`}</div>
          </div>
        </section>
      ) : null}

      <section className="cp-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">{needsStock ? "4" : "3"}. Harga</h2>
        <p className="mt-1 text-sm text-zinc-500">Di Pesanan hanya dicatat nilai pesanan. Persentase gaji tidak lagi diatur di sini.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm">Jumlah pesanan
            <input type="number" min="0.00000001" step="any" value={quantity} onChange={(e) => changeOrderQuantity(Number(e.target.value))} className={inputClass} />
          </label>
          <label className="text-sm">Tarif / harga per unit
            <input type="number" min="0" step="1" value={rate} onChange={(e) => setRate(Math.max(0, Number(e.target.value)))} className={inputClass} />
          </label>
        </div>

        <div className="mt-5 rounded-xl bg-zinc-950 p-4">
          <div className="text-sm text-zinc-500">Total harga pesanan</div>
          <div className="mt-1 text-3xl font-semibold">{formatMoney(total)}</div>
          <div className="mt-1 text-xs text-zinc-600">Jumlah × Tarif · Persentase gaji diatur per karyawan melalui menu Gaji.</div>
          {orderType === "boosting" && scheduleMode === "daily" ? (
            <div className="mt-3 rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-sm text-sky-100">
              Harian Berjangka: {scheduleDays} hari · sekitar {formatMoney(scheduleDays > 0 ? Math.floor(total / scheduleDays) : 0)} per hari. Hari berikutnya tidak masuk Gaji sebelum ditandai Selesai.
            </div>
          ) : null}
        </div>

        {leaderChooses ? <p className="mt-5 rounded-xl bg-sky-500/10 p-4 text-sm text-sky-100">{division ? `Divisi ${division} · Menunggu penentuan karyawan oleh leader.` : "Pilih divisi tujuan sebelum menyimpan."}</p> : <div className={`mt-5 rounded-2xl border p-4 ${workerSplitOk ? "border-emerald-500/30 bg-emerald-500/10" : workerDifference > 0 || hasDuplicateWorker ? "border-red-500/30 bg-red-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-zinc-400">Pengecekan pembagian karyawan</div>
              {orderType === "boosting" ? (
                <div className="mt-1 text-lg font-semibold">1 pesanan · {workerRows.length} karyawan · harga {formatMoney(total)} dibagi otomatis</div>
              ) : (
                <div className="mt-1 text-lg font-semibold">Pesanan: {quantity.toLocaleString("id-ID")} · Dibagi: {assignedQuantity.toLocaleString("id-ID")}</div>
              )}
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-bold ${workerSplitOk ? "bg-emerald-500 text-black" : workerDifference > 0 || hasDuplicateWorker ? "bg-red-500 text-white" : "bg-amber-400 text-black"}`}>
              {hasDuplicateWorker ? "KARYAWAN DUPLIKAT" : hasBlankWorker ? "PILIH KARYAWAN" : hasInvalidWorkerQuantity ? "JUMLAH BELUM BENAR" : orderType === "boosting" ? "HARGA DIBAGI OTOMATIS" : workerAllocationMatches ? "JUMLAH COCOK" : workerDifference > 0 ? `MELEBIHI ${workerDifference.toLocaleString("id-ID")}` : `KURANG ${Math.abs(workerDifference).toLocaleString("id-ID")}`}
            </div>
          </div>
          {workerQuantityMustMatch && !workerAllocationMatches ? <p className="mt-2 text-sm">Untuk Gold/Item, total jumlah yang dikerjakan semua karyawan harus sama persis dengan jumlah pesanan.</p> : null}
          {orderType === "boosting" && workerRows.length > 1 ? <p className="mt-2 text-sm">Contoh: pesanan Rp10.000 dengan 2 karyawan = nilai pekerjaan Rp5.000 per karyawan, tetapi tetap hanya 1 pesanan di Mutasi.</p> : null}
        </div>}
      </section>

      {message ? (
        <section className={`rounded-2xl border p-5 ${message.type === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-red-500/30 bg-red-500/10 text-red-100"}`}>
          <div className="font-semibold">{adminLabel(message.type === "ok" ? "✓ Berhasil" : "⚠ Periksa lagi")}</div>
          <div className="mt-1 text-sm">{message.text}</div>
          {message.type === "ok" ? <div className="mt-4 flex flex-wrap gap-2"><Link href="/admin/payroll/mutations" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black">Lihat di Mutasi</Link><Link href="/admin/payroll/inventory" className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold">Lihat Gudang</Link></div> : null}
        </section>
      ) : null}

      <button type="submit" disabled={!canSave} className="w-full rounded-2xl bg-yellow-400 px-5 py-4 text-base font-bold text-black disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 sm:w-auto">
        {saving ? "Menyimpan..." : canSave ? "Simpan Pesanan & Buat Mutasi" : !orderTimeResult.ok ? "Periksa Tanggal & Jam Sebelum Simpan" : needsStock && !stockMatches ? "Periksa Stok Sebelum Simpan" : "Periksa Pembagian Karyawan Sebelum Simpan"}
      </button>
    </form>
  );
}

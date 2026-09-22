"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
import { useMemo, useState } from "react";
import { formatMoney } from "@/features/payroll/lib/money";
import { getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { useDemoEmployees } from "@/features/payroll/lib/demo-employee-store";
import type { MutationChange } from "@/features/payroll/lib/demo-mutation-history-store";
import type { Order, OrderWorkerAssignment } from "@/features/payroll/types/domain";

const sourceOptions = ["G2G", "ComePlayers", "Direct", "Telegram", "OverGear", "FunPay", "PlayerAuction", "Lainnya"];

type Props = {
  order: Order;
  onClose: () => void;
  onSave: (patch: Partial<Order>, changes: MutationChange[], reason?: string) => void;
};

function text(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

export function MutationEditModal({ order, onClose, onSave }: Props) {
  const { employees } = useDemoEmployees();
  const originalAssignments = useMemo(() => getOrderAssignments(order), [order]);
  const [source, setSource] = useState(order.source);
  const [buyerName, setBuyerName] = useState(order.buyerName ?? "");
  const [orderName, setOrderName] = useState(order.orderName ?? "");
  const [task, setTask] = useState(order.task ?? "");
  const [quantity, setQuantity] = useState(String(order.quantity));
  const [rateMinor, setRateMinor] = useState(String(order.rateMinor ?? (order.quantity > 0 ? Math.round(order.grossMinor / order.quantity) : 0)));
  const [assignments, setAssignments] = useState<OrderWorkerAssignment[]>(originalAssignments.map((row) => ({ ...row })));
  const [employeeTeam, setEmployeeTeam] = useState<"SEMUA" | OrderWorkerAssignment["team"]>("SEMUA");
  const [employeeCodeToAdd, setEmployeeCodeToAdd] = useState("");
  const [newEmployeeProcess, setNewEmployeeProcess] = useState(order.process ?? "JOKI");
  const [newEmployeeQuantity, setNewEmployeeQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isFinished = order.operationalStatus === "verified" || Boolean(order.payrollClosedAt);
  const stockLocksQuantity = Boolean(order.inventoryAllocations?.length);
  const availableEmployees = useMemo(() => employees
    .filter((employee) => employee.workforceStatus !== "RESIGN")
    .filter((employee) => !assignments.some((assignment) => assignment.employeeCode === employee.code))
    .filter((employee) => employeeTeam === "SEMUA" || employee.team === employeeTeam)
    .sort((a, b) => a.team.localeCompare(b.team, "id") || a.name.localeCompare(b.name, "id")),
  [assignments, employeeTeam, employees]);

  function updateAssignment(index: number, patch: Partial<OrderWorkerAssignment>) {
    setAssignments((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function addAssignment() {
    setError(null);
    if (stockLocksQuantity) return setError("Karyawan tidak dapat ditambah pada pesanan yang jumlahnya terkunci oleh Stok/Gudang.");
    const employee = employees.find((row) => row.code === employeeCodeToAdd);
    if (!employee) return setError("Pilih karyawan yang ingin ditambahkan.");
    if (assignments.some((row) => row.employeeCode === employee.code)) return setError(employee.name + " sudah ada pada pesanan ini.");

    const quantityValue = order.orderType === "boosting" ? 1 : Number(newEmployeeQuantity);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) return setError("Jumlah pembagian karyawan baru harus lebih dari 0.");

    const assignment: OrderWorkerAssignment = {
      id: "edit-" + order.id + "-" + employee.code + "-" + Date.now(),
      employeeCode: employee.code,
      employeeName: employee.name,
      team: employee.team,
      process: newEmployeeProcess.trim() || order.process || "JOKI",
      quantity: quantityValue,
    };

    setAssignments((current) => [...current, assignment]);
    setEmployeeCodeToAdd("");
    setNewEmployeeQuantity("1");
  }

  function save() {
    setError(null);
    const parsedQuantity = Number(quantity);
    const parsedRate = Math.round(Number(rateMinor));
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return setError("Jumlah pesanan harus lebih dari 0.");
    if (!Number.isFinite(parsedRate) || parsedRate < 0) return setError("Tarif / harga per unit tidak valid.");
    if (isFinished && !reason.trim()) return setError("Untuk pesanan yang sudah selesai, isi alasan perubahan agar riwayat jelas.");

    if (order.orderType !== "boosting" && !stockLocksQuantity) {
      const assigned = assignments.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      if (Math.abs(assigned - parsedQuantity) > 0.0000001) {
        return setError(`Total jumlah karyawan (${assigned.toLocaleString("id-ID")}) harus sama dengan jumlah pesanan (${parsedQuantity.toLocaleString("id-ID")}).`);
      }
    }

    const nextGross = Math.max(0, Math.round(parsedQuantity * parsedRate));
    const changes: MutationChange[] = [];
    const push = (field: string, label: string, before: unknown, after: unknown) => {
      if (String(before ?? "") !== String(after ?? "")) changes.push({ field, label, before: text(before), after: text(after) });
    };

    push("source", "Sumber", order.source, source);
    push("buyerName", "Pembeli", order.buyerName ?? "", buyerName.trim());
    if (order.orderType !== "gold") push("orderName", "Nama pesanan", order.orderName ?? "", orderName.trim());
    push("task", "TASK", order.task ?? "", task.trim());
    if (!stockLocksQuantity) push("quantity", "Jumlah pesanan", order.quantity, parsedQuantity);
    push("rateMinor", "Tarif / harga per unit", formatMoney(order.rateMinor ?? 0), formatMoney(parsedRate));
    push("grossMinor", "Total harga pesanan", formatMoney(order.grossMinor), formatMoney(nextGross));

    assignments.forEach((row, index) => {
      const before = originalAssignments.find((item) => item.employeeCode === row.employeeCode);
      if (!before) {
        const after = row.employeeName + " · " + row.team + " · " + row.process + (order.orderType === "boosting" ? "" : " · jumlah " + row.quantity);
        push("workerAssignments." + index, "Tambah karyawan " + row.employeeName, "", after);
        return;
      }
      push("workerAssignments." + index + ".process", "Proses " + row.employeeName, before.process, row.process);
      if (order.orderType !== "boosting" && !stockLocksQuantity) {
        push("workerAssignments." + index + ".quantity", "Jumlah " + row.employeeName, before.quantity, row.quantity);
      }
    });

    if (!changes.length) return setError("Tidak ada perubahan untuk disimpan.");

    const nextAssignments = assignments.map((row) => {
      const original = originalAssignments.find((item) => item.employeeCode === row.employeeCode);
      return {
        ...row,
        quantity: order.orderType === "boosting" || stockLocksQuantity ? original?.quantity ?? row.quantity : Number(row.quantity),
      };
    });

    onSave({
      source,
      buyerName: buyerName.trim() || undefined,
      orderName: order.orderType === "gold" ? order.orderName : (orderName.trim() || undefined),
      task: task.trim() || undefined,
      quantity: stockLocksQuantity ? order.quantity : parsedQuantity,
      rateMinor: parsedRate,
      grossMinor: stockLocksQuantity ? Math.max(0, Math.round(order.quantity * parsedRate)) : nextGross,
      expectedPaymentMinor: stockLocksQuantity ? Math.max(0, Math.round(order.quantity * parsedRate)) : nextGross,
      workerAssignments: nextAssignments,
    }, changes, reason.trim() || undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 sm:p-8" role="dialog" aria-modal="true">
      <div className="w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 p-5 sm:p-6">
          <div>
            <div className="text-sm font-semibold text-yellow-300">Edit Mutasi</div>
            <h2 className="mt-1 text-2xl font-semibold">{order.externalReference}</h2>
            <p className="mt-1 text-sm text-zinc-500">Bisa diedit walaupun pesanan sudah selesai. Semua perubahan disimpan di Riwayat Perubahan.</p>
          </div>
          <button onClick={onClose} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold">Tutup</button>
        </div>

        {isFinished ? (
          <div className={`m-5 rounded-xl border p-4 text-sm leading-6 sm:m-6 ${order.payrollClosedAt ? "border-red-500/30 bg-red-500/10 text-red-100" : "border-amber-500/30 bg-amber-500/10 text-amber-100"}`}>
            <strong>{order.payrollClosedAt ? "Pesanan ini sudah Tutup Buku/Gajian." : "Pesanan ini sudah selesai."}</strong> Edit tetap diizinkan dan akan ditandai khusus di Riwayat Perubahan.{order.payrollClosedAt ? " Data gaji Tutup Buku lama tidak dihitung ulang otomatis; perubahan setelah Tutup Buku menjadi catatan koreksi." : ""}
          </div>
        ) : null}

        <div className="grid gap-4 p-5 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
          <label className="text-sm">Sumber<select value={source} onChange={(e) => setSource(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3">{[...new Set([...sourceOptions, order.source])].map((value) => <option key={value} value={value}>{adminLabel(value)}</option>)}</select></label>
          <label className="text-sm">Pembeli<input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3" /></label>
          {order.orderType !== "gold" ? <label className="text-sm sm:col-span-2">Nama pesanan<input value={orderName} onChange={(e) => setOrderName(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3" /></label> : null}
          <label className="text-sm sm:col-span-2">TASK<textarea value={task} onChange={(e) => setTask(e.target.value)} rows={5} placeholder="Keterangan TASK / pekerjaan" className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3" /></label>
          <label className="text-sm">Jumlah pesanan<input type="number" step="any" value={quantity} disabled={stockLocksQuantity} onChange={(e) => setQuantity(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 disabled:opacity-50" />{stockLocksQuantity ? <span className="mt-1 block text-xs text-zinc-500">Dikunci karena jumlah terkait stok Gudang.</span> : null}</label>
          <label className="text-sm">Tarif / harga per unit<input type="number" min="0" value={rateMinor} onChange={(e) => setRateMinor(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3" /></label>
        </div>

        {assignments.length ? <div className="border-t border-zinc-800 p-5 sm:p-6"><h3 className="font-semibold">Karyawan & proses</h3><div className="mt-3 space-y-3">{assignments.map((row, index) => <div key={row.id} className="grid gap-3 rounded-xl bg-zinc-900/70 p-4 sm:grid-cols-[1fr_1fr_180px]"><div><div className="text-xs text-zinc-500">Karyawan</div><div className="mt-1 font-semibold">{row.employeeName} · {row.team}</div></div><label className="text-sm">Proses<input value={row.process} onChange={(e) => updateAssignment(index, { process: e.target.value })} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2" /></label>{order.orderType !== "boosting" ? <label className="text-sm">Jumlah<input type="number" step="any" disabled={stockLocksQuantity} value={row.quantity} onChange={(e) => updateAssignment(index, { quantity: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 disabled:opacity-50" /></label> : <div className="text-sm"><div className="text-zinc-500">Nilai kerja</div><div className="mt-2 font-semibold">Dibagi rata</div></div>}</div>)}</div></div> : null}

        <div className="border-t border-zinc-800 p-5 sm:p-6">
          <label className="text-sm">Alasan / catatan perubahan {isFinished ? <strong className="text-amber-300">(wajib karena pesanan sudah selesai)</strong> : <span className="text-zinc-500">(opsional)</span>}<textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={"Contoh: Salah input tarif saat pesanan dibuat"} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3" /></label>
          {error ? <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{adminText(error)}</div> : null}
          <div className="mt-4 flex flex-wrap justify-end gap-3"><button onClick={onClose} className="rounded-xl bg-zinc-800 px-5 py-3 text-sm font-semibold">Batal</button><button onClick={save} className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-black">Simpan Perubahan</button></div>
        </div>
      </div>
    </div>
  );
}

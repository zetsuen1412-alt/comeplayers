"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { calculateWorkerEarning } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useDemoPayrollSettings } from "@/lib/demo-payroll-settings-store";

export function OrderSimulator() {
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(640000);
  const { settings } = useDemoPayrollSettings();
  const total = useMemo(() => Math.max(0, Math.round(quantity * unitPrice)), [quantity, unitPrice]);
  const earning = useMemo(() => calculateWorkerEarning(total, Math.round(settings.defaultSharePercent * 100)), [total, settings.defaultSharePercent]);

  return (
    <div className="cp-card max-w-4xl p-5 sm:p-6">
      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-100">
        Persentase gaji diatur <strong>per karyawan di menu Gaji</strong>. Nilai bawaan untuk karyawan baru: <strong>{settings.defaultSharePercent}%</strong>.
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Jumlah
          <input className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3" type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </label>
        <label className="text-sm">Harga per unit
          <input className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3" type="number" min="0" step="1" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} />
        </label>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-zinc-950 p-4"><div className="text-sm text-zinc-500">Nilai pekerjaan</div><div className="mt-1 text-2xl font-semibold">{formatMoney(total)}</div></div>
        <div className="rounded-xl bg-yellow-400/10 p-4"><div className="text-sm text-zinc-500">Perkiraan gaji sebelum potongan ({settings.defaultSharePercent}%)</div><div className="mt-1 text-2xl font-semibold text-yellow-300">{formatMoney(earning)}</div></div>
      </div>

      <Link href="/admin/payroll" className="mt-4 inline-flex rounded-xl bg-yellow-400 px-4 py-2 text-sm font-bold text-black">Atur persentase karyawan di Gaji →</Link>
    </div>
  );
}

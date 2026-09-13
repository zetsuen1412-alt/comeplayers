"use client";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useDemoOrders } from "@/lib/demo-order-store";
import { getOrderAssignments } from "@/lib/order-workers";

export default function OperationsPage() {
  const { allOrders } = useDemoOrders();
  return (
    <><PageHeader eyebrow="Antrean operasional" title="Penugasan, progres, dan SLA" description="Status operasional dipisahkan dari status keuangan dan pembayaran." />
      <div className="grid gap-4 lg:grid-cols-3">
        {allOrders.map((order) => {
          const assignments = getOrderAssignments(order);
          const teams = [...new Set(assignments.map((row) => row.team))].join(", ") || "—";
          return (
          <div key={order.id} className="cp-card p-5">
            <div className="flex justify-between gap-3"><div><div className="font-semibold">{order.externalReference}</div><div className="text-xs text-zinc-500">{order.game} · {order.service}</div></div><StatusBadge value={order.operationalStatus} /></div>
            <div className="mt-5 text-sm"><span className="text-zinc-500">Karyawan:</span> {assignments.length ? assignments.map((row) => `${row.employeeName} (${row.quantity.toLocaleString("id-ID")})`).join(", ") : "Belum ditugaskan"}</div>
            <div className="mt-2 text-sm"><span className="text-zinc-500">Tim:</span> {teams}</div>
            <div className="mt-2 text-sm"><span className="text-zinc-500">Batas waktu:</span> {new Date(order.dueAt).toLocaleString("id-ID")}</div>
          </div>
          );
        })}
        {!allOrders.length ? <div className="cp-card p-6 text-sm text-zinc-500 lg:col-span-3">Belum ada pesanan.</div> : null}
      </div>
    </>
  );
}

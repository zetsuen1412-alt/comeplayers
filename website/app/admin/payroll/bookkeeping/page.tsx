"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/features/payroll/components/page-header";
import { useDemoOrders } from "@/features/payroll/lib/demo-order-store";
import { useDemoClosings } from "@/features/payroll/lib/demo-closing-store";
import { bookkeepingEntries, type BookkeepingEntry } from "@/features/payroll/lib/mutation-bookkeeping";
import { formatDateTimeID, toJakartaDateInput } from "@/features/payroll/lib/date";
import { formatMoney } from "@/features/payroll/lib/money";
import { exportMutationsSpreadsheet } from "@/features/payroll/lib/spreadsheet-export";
import { formatMutationDistribution, mutationDayLabel } from "@/features/payroll/lib/mutation-rows";
import { LegacyFHArchive } from "@/features/payroll/components/legacy-fh-archive";

export default function BookkeepingPage() {
  const {allOrders,archivedOrders} = useDemoOrders();
  const {closings} = useDemoClosings();
  const [period,setPeriod] = useState("all");
  const [search,setSearch] = useState("");
  const [date,setDate] = useState("");
  const [employee,setEmployee] = useState("");
  const [transfer,setTransfer] = useState("all");
  const [expanded,setExpanded] = useState<string|null>(null);
  const [exporting,setExporting] = useState(false);
  const entries = useMemo(()=>bookkeepingEntries(closings,[...allOrders,...archivedOrders]),[closings,allOrders,archivedOrders]);
  const filtered = useMemo(()=>entries.filter(entry=>{
    const row=entry.row, order=row.order;
    if(period!=="all" && entry.closing.id!==period) return false;
    if(date && toJakartaDateInput(row.orderedAt)!==date) return false;
    if(employee && !row.assignments.some(w=>(w.employeeName+" "+w.employeeCode+" "+w.team).toLocaleLowerCase("id-ID").includes(employee.toLocaleLowerCase("id-ID"))))return false;
    const status=(row.day?.sourceTransferStatus??order.transferStatus??"UNKNOWN").toUpperCase();
    if(transfer!=="all" && status!==transfer) return false;
    const term=search.trim().toLocaleLowerCase("id-ID");
    if(term && ![order.externalReference,order.buyerName,order.orderName,order.service,order.gameName,order.game,order.source,
      row.day?`D${row.day.sequence}`:"",...row.assignments.flatMap(w=>[w.employeeName,w.employeeCode,w.team])]
      .join(" ").toLocaleLowerCase("id-ID").includes(term)) return false;
    return true;
  }),[entries,period,date,employee,transfer,search]);
  const total=filtered.reduce((sum,item)=>sum+item.row.grossMinor,0);
  const uniquePeriodIds=new Set(filtered.map(entry=>entry.closing.id)).size;
  async function exportArchive(){
    if(exporting||!filtered.length)return;
    setExporting(true);
    try{await exportMutationsSpreadsheet(filtered.map(entry=>entry.row), "Data Pembukuan - Mutasi Closed");}
    finally{setExporting(false);}
  }
  return <div className="space-y-5">
    <PageHeader title="Data Pembukuan" description="Arsip historis MUTASI FH sebelum X2754 serta snapshot Tutup Buku yang tercatat. Data lama tidak masuk kembali ke Gaji aktif."/>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-zinc-400">Nilai berasal dari snapshot saat Closing. Untuk paket beberapa hari, hanya DAY yang masuk Closing tersebut yang ditampilkan.</p>
      <Link href="/admin/payroll/mutations" className="rounded-lg bg-zinc-800 px-4 py-2 text-sm">← Kembali ke Mutasi Aktif</Link>
    </div>
    <LegacyFHArchive />
    <section className="cp-card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Cari arsip mutasi</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">Periode Tutup Buku
          <select value={period} onChange={event=>setPeriod(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5">
            <option value="all">Semua periode</option>
            {closings.map(closing=><option key={closing.id} value={closing.id}>{toJakartaDateInput(closing.closedAt)} · {closing.id.slice(0,12)} · {closing.from.slice(0,10)}–{closing.to.slice(0,10)}</option>)}
          </select>
        </label>
        <label className="text-sm">Cari KODE / buyer / paket / game
          <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Contoh: X2754 / 12 Hours" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5"/>
        </label>
        <label className="text-sm">Tanggal pekerjaan
          <input type="date" value={date} onChange={event=>setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5"/>
        </label>
        <label className="text-sm">Nama / kode karyawan / divisi
          <input value={employee} onChange={event=>setEmployee(event.target.value)} placeholder="Contoh: RANGGA / FH3" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5"/>
        </label>
        <label className="text-sm">STATUS TRANSFER saat Closing
          <select value={transfer} onChange={event=>setTransfer(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5">
            <option value="all">Semua status</option><option value="DELIVERED">DELIVERED</option><option value="PENDING">PENDING</option><option value="UNKNOWN">Tidak tercatat</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="button" onClick={()=>{setPeriod("all");setSearch("");setDate("");setEmployee("");setTransfer("all");}} className="rounded-lg bg-zinc-800 px-3 py-2.5 text-sm">Reset filter</button>
          <button type="button" disabled={exporting||!filtered.length} onClick={()=>void exportArchive()} className="rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{exporting?"Mengekspor...":"⬇ Ekspor arsip"}</button>
        </div>
      </div>
    </section>
    <div className="grid gap-3 sm:grid-cols-3">
      {[[ "Baris sudah Tutup Buku",String(filtered.length)],["Periode",String(uniquePeriodIds)],["Total nilai pekerjaan",formatMoney(total)]].map(([name,value])=><div key={name} className="cp-card p-4"><p className="text-sm text-zinc-400">{name}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
    </div>
    <section className="cp-card overflow-x-auto p-4">
      <h2 className="mb-3 text-lg font-semibold">Riwayat mutasi tertutup</h2>
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead><tr className="border-b border-zinc-700 text-zinc-400">
          <th className="p-3">Kode / hari</th><th className="p-3">Tanggal kerja</th><th className="p-3">Buyer & pesanan</th>
          <th className="p-3">Karyawan / FH</th><th className="p-3">Transfer</th><th className="p-3 text-right">RATE / TOTAL</th><th className="p-3">Tutup Buku</th>
        </tr></thead>
        <tbody>{filtered.map((entry:BookkeepingEntry)=>{
          const row=entry.row,order=row.order,open=expanded===entry.key;
          const transferStatus=row.day?.sourceTransferStatus??order.transferStatus??"—";
          const rate=row.day?.rateMinor??order.rateMinor;
          return <tr key={entry.key} className="border-b border-zinc-800 align-top">
            <td className="p-3"><button className="font-semibold text-yellow-300 underline" aria-expanded={open} onClick={()=>setExpanded(open?null:entry.key)}>{order.externalReference} {row.day?mutationDayLabel(row):""} {open?"⌃":"⌄"}</button>
              {open?<div className="mt-2 max-w-xs space-y-1 text-xs text-zinc-400"><p>Divisi: {order.team??"—"} · Game: {order.gameName??order.game}</p><p>Pembagian: {formatMutationDistribution(row)}</p><p>Jumlah: {row.quantity}</p>{order.task?<p>Task: {order.task}</p>:null}<p>{entry.hasSnapshot?"Snapshot saat Closing":"Data arsip dari penanda Closing"}</p></div>:null}
            </td>
            <td className="p-3">{formatDateTimeID(row.orderedAt)}</td>
            <td className="p-3"><strong>{order.buyerName||"—"}</strong><p className="mt-1 text-zinc-400">{order.orderName??order.service}</p></td>
            <td className="p-3">{row.assignments.length?row.assignments.map(w=><p key={w.id}>{w.employeeName} · {w.team}</p>):"—"}</td>
            <td className="p-3"><span className={transferStatus.toUpperCase()==="DELIVERED"?"text-emerald-300":"text-zinc-300"}>{transferStatus}</span></td>
            <td className="p-3 text-right">{rate===undefined?"—":formatMoney(rate)}<p className="mt-1 font-semibold">{formatMoney(row.grossMinor)}</p></td>
            <td className="p-3">{formatDateTimeID(entry.closing.closedAt)}<p className="mt-1 text-xs text-zinc-500">Periode {entry.closing.from.slice(0,10)}–{entry.closing.to.slice(0,10)}</p></td>
          </tr>;
        })}</tbody>
      </table>
      {!filtered.length?<p className="p-6 text-center text-sm text-zinc-400">Belum ada data arsip pada filter ini. Data baru muncul setelah Closing benar-benar tercatat; baris spreadsheet lama tidak otomatis dianggap sudah dibayar.</p>:null}
    </section>
    <p className="text-sm text-zinc-500">Data Pembukuan bersifat baca saja. Koreksi atau penghapusan arsip pembayaran tidak dilakukan dari halaman ini. Buka <Link href="/admin/payroll/finance/closing" className="text-yellow-300 underline">Keuangan → Tutup Buku</Link> untuk melihat total penggajian dan snapshot gaji per karyawan.</p>
  </div>;
}

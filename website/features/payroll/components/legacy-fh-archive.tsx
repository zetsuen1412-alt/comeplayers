"use client";

import { useEffect, useMemo, useState } from "react";
import { payrollStorage } from "@/features/payroll/lib/workspace-store";
import { workspaceKeys } from "@/features/payroll/lib/workspace-model";
import { formatMoney } from "@/features/payroll/lib/money";
import { type LegacyMutationSnapshot, FH_NEW_BOOK_CODE, FH_NEW_BOOK_ROW } from "@/features/payroll/lib/legacy-fh-cutover";

const PAGE_SIZE=80;
function readLegacyRows():LegacyMutationSnapshot[] {
  try {
    const rows=JSON.parse(payrollStorage.getItem(workspaceKeys.legacyFhArchive)??"[]");
    return Array.isArray(rows)?rows:[];
  }catch{return [];}
}
function csvCell(value:string|number) {
  const content=String(value).replace(/^[=+@\-]/,"'$&");
  return '"'+content.replace(/"/g,'""')+'"';
}

export function LegacyFHArchive(){
  const [rows,setRows]=useState<LegacyMutationSnapshot[]>([]);
  const [search,setSearch]=useState("");
  const [team,setTeam]=useState("");
  const [transfer,setTransfer]=useState("all");
  const [page,setPage]=useState(1);
  useEffect(()=>{
    const reload=()=>setRows(readLegacyRows());
    reload();
    window.addEventListener("storage",reload);
    window.addEventListener("focus",reload);
    const timer=window.setInterval(reload,30000);
    return()=>{window.removeEventListener("storage",reload);window.removeEventListener("focus",reload);window.clearInterval(timer);};
  },[]);
  const filtered=useMemo(()=>rows.filter(row=>{
    if(transfer!=="all" && row.transferStatus.toUpperCase()!==transfer)return false;
    if(team && ![row.team,row.booster].join(" ").toLowerCase().includes(team.toLowerCase()))return false;
    const term=search.trim().toLowerCase();
    return !term || [row.code,row.sourceDate,row.buyerName,row.orderName,row.game,row.source,row.process,row.booster,row.team]
      .join(" ").toLowerCase().includes(term);
  }).sort((a,b)=>b.sourceRow-a.sourceRow),[rows,search,team,transfer]);
  const countPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const currentPage=Math.min(countPages,page);
  const visible=filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const total=filtered.reduce((sum,row)=>sum+row.grossMinor,0);
  function exportCsv(){
    if(!filtered.length)return;
    const header=["Baris Sheet","Tanggal sumber","KODE","Sumber","Buyer","Nama order","Booster","FH","Game","Proses","Jumlah","Rate","Total","Status transfer"];
    const lines=[header,...filtered.map(row=>[row.sourceRow,row.sourceDate,row.code,row.source,row.buyerName,row.orderName,row.booster,row.team,row.game,row.process,row.quantity,row.rateMinor,row.grossMinor,row.transferStatus])];
    const blob=new Blob(["\uFEFF"+lines.map(row=>row.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="Arsip-Mutasi-FH-sebelum-X2754.csv";link.click();
    URL.revokeObjectURL(url);
  }
  return <section className="cp-card p-4 sm:p-5">
    <h2 className="text-xl font-semibold">📕 Arsip buku lama MUTASI FH · sebelum {FH_NEW_BOOK_CODE}</h2>
    <p className="mt-2 text-sm text-zinc-400">Baris sumber 3–{FH_NEW_BOOK_ROW-1} dipisahkan dari Mutasi Aktif. Ini adalah arsip data historis berdasarkan batas yang ditetapkan admin, <strong>bukan pelaksanaan Closing atau pembayaran ulang</strong>. Snapshot gaji resmi tetap ada di riwayat Tutup Buku di bawah.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg bg-zinc-950 p-3"><p className="text-sm text-zinc-400">Baris sudah tersalin dari Sheet</p><p className="text-xl font-semibold">{rows.length.toLocaleString("id-ID")}</p></div>
      <div className="rounded-lg bg-zinc-950 p-3"><p className="text-sm text-zinc-400">Baris hasil filter</p><p className="text-xl font-semibold">{filtered.length.toLocaleString("id-ID")}</p></div>
      <div className="rounded-lg bg-zinc-950 p-3"><p className="text-sm text-zinc-400">Total nilai Mutasi (bukan gaji)</p><p className="text-xl font-semibold">{formatMoney(total)}</p></div>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-4">
      <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Cari KODE / buyer / paket / tanggal" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm sm:col-span-2"/>
      <input value={team} onChange={e=>{setTeam(e.target.value);setPage(1);}} placeholder="Cari Booster / FH" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm"/>
      <select value={transfer} onChange={e=>{setTransfer(e.target.value);setPage(1);}} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm">
        <option value="all">Semua status transfer</option><option value="DELIVERED">DELIVERED</option><option value="PENDING">PENDING</option><option value="MOVED">MOVED</option>
      </select>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-zinc-400">Sumber: Google Sheets MUTASI FH · arsip diisi bertahap oleh sinkronisasi setelah aktivasi Apps Script.</p>
      <button onClick={exportCsv} disabled={!filtered.length} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-40">⬇ Ekspor CSV lama</button>
    </div>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead><tr className="border-b border-zinc-700 text-zinc-400">{["Baris","Waktu","KODE","Buyer / Order","Booster / FH","Game / Proses","Jumlah","RATE","TOTAL","Transfer"].map(v=><th key={v} className="p-2">{v}</th>)}</tr></thead>
        <tbody>{visible.map(r=><tr key={r.id} className="border-b border-zinc-800 align-top">
          <td className="p-2">{r.sourceRow}</td><td className="p-2">{r.sourceDate||"—"}</td>
          <td className="p-2 font-semibold text-yellow-300">{r.code}</td>
          <td className="p-2">{r.buyerName||"—"}<p className="mt-1 text-zinc-400">{r.orderName||"—"}</p></td>
          <td className="p-2">{r.booster||"—"}<p className="text-zinc-400">{r.team}</p></td>
          <td className="p-2">{r.game||"—"}<p className="text-zinc-400">{r.process}</p></td>
          <td className="p-2">{r.quantity}</td><td className="p-2">{formatMoney(r.rateMinor)}</td><td className="p-2 font-semibold">{formatMoney(r.grossMinor)}</td>
          <td className="p-2">{r.transferStatus||"—"}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length?<p className="p-5 text-sm text-amber-300">Arsip historis belum tersinkronkan. Perbarui dan aktifkan Apps Script sumber untuk mengimpor baris sebelum X2754. Baris lama tetap dilindungi dari gaji aktif.</p>:null}
      {rows.length>0&&!filtered.length?<p className="p-5 text-sm text-zinc-400">Tidak ada baris yang cocok dengan filter.</p>:null}
    </div>
    {filtered.length>PAGE_SIZE?<div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm"><span>Halaman {currentPage} dari {countPages}</span><div className="flex gap-2"><button disabled={currentPage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40">← Sebelumnya</button><button disabled={currentPage>=countPages} onClick={()=>setPage(p=>Math.min(countPages,p+1))} className="rounded-lg bg-zinc-800 px-3 py-2 disabled:opacity-40">Berikutnya →</button></div></div>:null}
  </section>;
}

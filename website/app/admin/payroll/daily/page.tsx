"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {useDemoOrders} from "@/features/payroll/lib/demo-order-store";
import {useDemoEmployees} from "@/features/payroll/lib/demo-employee-store";
import {expandMutationRows,mutationRowStatusText} from "@/features/payroll/lib/mutation-rows";
import {getDailyPayrollValidationError,getDailyAssignments} from "@/features/payroll/lib/daily-orders";
import {dailyPackageOverview,packageScheduledForDate} from "@/features/payroll/lib/daily-dashboard";
import {formatMoney} from "@/features/payroll/lib/money";
import {todayJakartaDateInput,toJakartaDateInput} from "@/features/payroll/lib/date";
import type {MutationViewRow} from "@/features/payroll/lib/mutation-rows";

function isDone(row:MutationViewRow){return row.day?Boolean(row.day.status==="verified"||row.day.payrollClosedAt||row.day.payrollPeriodId):Boolean(row.order.operationalStatus==="verified"||row.order.payrollClosedAt||row.order.payrollPeriodId);}
function isClosed(row:MutationViewRow){return Boolean(row.order.payrollClosedAt||row.order.payrollPeriodId||row.day?.payrollClosedAt||row.day?.payrollPeriodId);}
function isProblem(row:MutationViewRow){return row.day?row.day.status==="on_hold":row.order.operationalStatus==="on_hold";}
function rowDate(row:MutationViewRow){return row.day?.workDate??toJakartaDateInput(row.orderedAt);}
function statusClass(row:MutationViewRow){return isProblem(row)?"text-red-300":isClosed(row)?"text-emerald-300":isDone(row)?"text-sky-300":"text-amber-300";}
export default function DailyOrdersPage(){
 const {allOrders}=useDemoOrders();const {employees}=useDemoEmployees();
 const [date,setDate]=useState(todayJakartaDateInput);
 const [filter,setFilter]=useState("all");const [search,setSearch]=useState("");
 const [expanded,setExpanded]=useState<string|null>(null);
 const [expandedPackage,setExpandedPackage]=useState<string|null>(null);
 const rows=useMemo(()=>expandMutationRows(allOrders),[allOrders]);
 const todays=rows.filter(r=>rowDate(r)===date);
 const visible=todays.filter(r=>{
  if(filter==="open"&&isDone(r))return false;
  if(filter==="done"&&!isDone(r))return false;
  if(filter==="problem"&&!isProblem(r))return false;
  const text=[r.order.externalReference,r.order.buyerName,r.order.orderName,r.order.gameName,r.order.game,...r.assignments.map(x=>x.employeeName)].join(" ").toLocaleLowerCase("id-ID");
  return text.includes(search.toLocaleLowerCase("id-ID"));
 }).sort((a,b)=>a.order.externalReference.localeCompare(b.order.externalReference,"id",{numeric:true})||(a.day?.sequence??0)-(b.day?.sequence??0));
 const activePackages=allOrders.filter(o=>packageScheduledForDate(o,date));
 const currentValue=todays.reduce((n,r)=>n+r.grossMinor,0);
 const readyValue=todays.filter(r=>isDone(r)&&!isClosed(r)).reduce((n,r)=>n+r.grossMinor,0);
 const incomplete=todays.filter(r=>!isDone(r)).length;
 function changeDay(offset:number){const d=new Date(date+"T12:00:00+07:00");if(Number.isNaN(d.getTime()))return;d.setUTCDate(d.getUTCDate()+offset);setDate(d.toISOString().slice(0,10));}
 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Pembagian Order Harian</h1><p className="mt-1 text-sm text-zinc-400">Ringkasan langsung dari Mutasi dan Sheet. Paket beberapa hari tetap satu order induk, tetapi setiap hari punya nilai, karyawan, dan status sendiri.</p></div><Link href="/admin/payroll/mutations" className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold">Buka Mutasi Lengkap →</Link></div>
  <section className="cp-card flex flex-wrap items-end gap-3 p-4"><button onClick={()=>changeDay(-1)} className="rounded-lg bg-zinc-800 px-3 py-2" aria-label="Hari sebelumnya">←</button><label className="text-sm">Tanggal kerja<input type="date" value={date} onChange={e=>setDate(e.target.value)} className="ml-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label><button onClick={()=>changeDay(1)} className="rounded-lg bg-zinc-800 px-3 py-2" aria-label="Hari berikutnya">→</button><button onClick={()=>setDate(todayJakartaDateInput())} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm">Hari ini</button></section>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Baris hari ini",String(todays.length)],["Belum selesai",String(incomplete)],["Paket berhari-hari",String(activePackages.length)],["Nilai pekerjaan",formatMoney(currentValue)],["Selesai, belum Closing",formatMoney(readyValue)]].map(([label,value])=><div key={label} className="cp-card p-4"><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</div>
  <section className="cp-card p-4"><div className="mb-3"><h2 className="text-lg font-semibold">Paket berhari-hari ({activePackages.length})</h2><p className="mt-1 text-sm text-zinc-400">Klik paket untuk melihat semua hari. Hari yang belum diterima dari Sheet ditampilkan sebagai kosong, bukan transaksi baru.</p></div>
   <div className="space-y-2">{activePackages.map(order=>{
    const summary=dailyPackageOverview(order);
    const open=expandedPackage===order.id;
    return <article key={order.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
     <button className="flex w-full flex-wrap items-center justify-between gap-3 text-left" aria-expanded={open} onClick={()=>setExpandedPackage(open?null:order.id)}>
      <div><p className="font-semibold">{order.externalReference} · {order.orderName??"Boosting"}</p><p className="mt-1 text-sm text-zinc-400">{order.gameName??order.game} · {summary.completed}/{summary.totalDays} hari selesai · {summary.recorded} hari tercatat</p></div>
      <div className="text-right"><p className="font-semibold">{formatMoney(order.grossMinor)}</p><p className={summary.missing?"text-sm text-amber-300":"text-sm text-emerald-300"}>{summary.missing?summary.missing+" hari belum tercatat":"Semua hari tercatat"} {open?"⌃":"⌄"}</p></div>
     </button>
     <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-emerald-500" style={{width:(summary.totalDays?100*summary.completed/summary.totalDays:0)+"%"}}/></div>
     {open?<div className="mt-4 space-y-2 border-t border-zinc-800 pt-3">
      <p className="text-sm text-zinc-400">Nilai baris yang sudah tercatat: {formatMoney(summary.recordedGrossMinor)} · Nilai hari selesai: {formatMoney(summary.finishedGrossMinor)} · Sudah Closing: {summary.closed} hari. Nilai hari yang belum tercatat tidak dibuat otomatis.</p>
      <div className="grid gap-2 md:grid-cols-2">{summary.timeline.map(item=>{
       const day=item.day;
       const assignments=day?getDailyAssignments(order,day):[];
       const closed=Boolean(day?.payrollClosedAt||day?.payrollPeriodId);
       const label=!day?"Belum tercatat di Sheet":closed?"Sudah Closing":day.status==="verified"?"Selesai, menunggu Closing":day.status==="on_hold"?"Bermasalah":day.status==="in_progress"?"Dikerjakan":"Proses";
       return <div key={item.sequence} className="rounded-lg border border-zinc-800 p-3 text-sm"><div className="flex justify-between gap-2"><strong>Hari {item.sequence}/{summary.totalDays}</strong><span>{day?.workDate??item.expectedDate??"Tanggal belum diketahui"}</span></div><p className={"mt-1 "+(!day||day.status==="on_hold"?"text-amber-300":closed||day.status==="verified"?"text-emerald-300":"text-sky-300")}>{label}</p>{day?<><p className="mt-1">TOTAL {formatMoney(day.grossMinor)} · RATE {day.rateMinor===undefined?"—":formatMoney(day.rateMinor)}</p><p className="text-zinc-400">Karyawan: {assignments.map(w=>w.employeeName+" ("+w.team+")").join(", ")||"Belum ditugaskan"}</p>{day.sourceRow?<p className="text-zinc-500">Baris Sheet: {day.sourceRow}</p>:null}</>:<p className="mt-1 text-zinc-500">Belum ada data pekerjaan, RATE, atau pembagian karyawan untuk hari ini.</p>}</div>;
      })}</div>
      <Link href="/admin/payroll/mutations" className="inline-block rounded-lg bg-zinc-800 px-3 py-2 text-sm font-semibold">Periksa / kelola melalui Mutasi →</Link>
     </div>:null}
    </article>;
   })}{!activePackages.length?<p className="py-3 text-sm text-zinc-500">Tidak ada paket harian pada tanggal ini.</p>:null}</div>
  </section>
  <section className="cp-card p-4"><div className="flex flex-wrap items-center gap-3"><h2 className="mr-auto text-lg font-semibold">Pekerjaan tanggal {date}</h2><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari kode, game, pembeli, karyawan" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/><select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"><option value="all">Semua status</option><option value="open">Belum selesai</option><option value="done">Selesai</option><option value="problem">Bermasalah</option></select></div>
   <div className="mt-4 space-y-2">{visible.map(row=>{
     const missing=row.assignments.length===0;
     const invalid=row.day?getDailyPayrollValidationError(row.order,row.day):undefined;
     const unknown=row.assignments.filter(w=>!employees.some(e=>e.code===w.employeeCode));
     const open=expanded===row.id;
     const days=row.order.scheduleTotalDays??row.order.dailyWork?.length??0;
     const completeDays=row.order.dailyWork?.filter(d=>d.status==="verified"||d.payrollClosedAt||d.payrollPeriodId).length??0;
     return <article key={row.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <button className="flex w-full flex-wrap items-center justify-between gap-3 text-left" aria-expanded={open} onClick={()=>setExpanded(open?null:row.id)}>
       <div><div className="font-semibold">{row.order.externalReference} {row.day?<span className="ml-2 text-sm text-yellow-300">Hari {row.day.sequence}/{days}</span>:null}</div><div className="mt-1 text-sm text-zinc-400">{row.order.gameName??row.order.game} · {row.order.orderName??row.order.service} · {row.order.source}</div></div>
       <div className="text-right"><p className="font-semibold">{formatMoney(row.grossMinor)}</p><p className={"text-sm "+statusClass(row)}>{mutationRowStatusText(row)} {open?"⌃":"⌄"}</p></div>
      </button>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-300"><span>Karyawan: <strong>{row.assignments.length?row.assignments.map(x=>x.employeeName+" ("+x.team+")").join(", "):"Belum ditugaskan"}</strong></span>{row.day?<span>Progres paket: {completeDays}/{days} hari selesai</span>:null}<span>Pembeli: {row.order.buyerName??"—"}</span></div>
      {missing||unknown.length||invalid?<p className="mt-2 text-sm text-red-300">Perlu dicek: {missing?"Belum ada karyawan. ":""}{unknown.length?"Karyawan tidak ditemukan pada daftar aktif. ":""}{invalid??""}</p>:null}
      {open?<div className="mt-3 space-y-2 border-t border-zinc-800 pt-3 text-sm"><p className="text-zinc-400">Kode {row.order.externalReference} · {row.day?"Tanggal kerja "+row.day.workDate:"Tanggal pesanan "+rowDate(row)} · {row.order.orderType??"boosting"} · {row.order.team??"Tanpa divisi"}</p><p>Jumlah {row.quantity.toLocaleString("id-ID")} · RATE {row.day?.rateMinor===undefined&&row.order.rateMinor===undefined?"—":formatMoney(row.day?.rateMinor??row.order.rateMinor??0)} · TOTAL {formatMoney(row.grossMinor)}</p>{row.assignments.map(w=><p key={w.id}>{w.employeeCode} · {w.employeeName} · {w.team} · Jumlah {w.quantity}</p>)}{row.order.task?<p className="whitespace-pre-wrap text-zinc-400">TASK: {row.order.task}</p>:null}<Link href="/admin/payroll/mutations" className="inline-block rounded-lg bg-emerald-500 px-3 py-2 font-semibold text-black">Kelola dan verifikasi di Mutasi →</Link></div>:null}
     </article>;
    })}{!visible.length?<p className="py-8 text-center text-sm text-zinc-400">Tidak ada baris pekerjaan pada tanggal dan filter ini. Pilih tanggal lain atau lihat Mutasi lengkap.</p>:null}</div>
  </section>
  <p className="text-sm text-zinc-500">Halaman ini hanya ringkasan. Perubahan status, pembagian per hari, RATE Sheet, kunci pesanan, dan aturan Gaji/Closing tetap menggunakan mekanisme Mutasi yang sudah berjalan.</p>
 </div>;
}

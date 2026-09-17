"use client";
import { useEffect, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { PageHeader } from "@/features/payroll/components/page-header";
import { auditSections, type AuditChange, type AuditRecord } from "@/features/payroll/lib/audit-model";
import { formatDateTimeID } from "@/features/payroll/lib/date";
const endpoint="/api/admin/payroll/workspace/history";
type Page={entries:AuditRecord[];nextCursor:number|null};
type Detail={changes:AuditChange[];total:number;nextOffset:number|null};
const buttonClass="rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50";
function RevisionDetails({revision}:{revision:number}) {
  const [offset,setOffset]=useState(0),[data,setData]=useState<Detail|null>(null),[error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError("");
    authenticatedFetchJson<Detail>(endpoint+"?revision="+revision+"&offset="+offset,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[revision,offset]);
  if(error)return <p role="alert" className="mt-4 text-red-300">{error}</p>;
  if(!data)return <p role="status" className="mt-4 text-zinc-400">Memuat detail…</p>;
  return <div className="mt-5 space-y-3">
    {data.changes.map((change,index)=><div key={offset+"-"+index} className="rounded-xl border border-zinc-800 bg-black/20 p-4">
      <div className="text-xs text-zinc-400">{change.section} · {change.record}</div><div className="mt-1 font-semibold">{change.field}</div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{[["Sebelum",change.before],["Sesudah",change.after]].map(([label,value])=><div key={label}><div className="mb-1 text-xs text-zinc-400">{label}</div><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-900 p-3 text-xs">{value}</pre></div>)}</div>
    </div>)}
    {!data.total&&<p className="text-sm text-zinc-400">Tidak ada perubahan field untuk ditampilkan.</p>}
    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400"><span>{data.total?offset+1+"–"+Math.min(offset+30,data.total)+" dari "+data.total+" perubahan":"0 perubahan"}</span>
      {offset>0&&<button className={buttonClass} onClick={()=>setOffset(Math.max(0,offset-30))}>Detail sebelumnya</button>}
      {data.nextOffset!==null&&<button className={buttonClass} onClick={()=>setOffset(data.nextOffset!)}>Detail berikutnya</button>}
    </div>
  </div>;
}
export default function HistoryPage() {
  const [cursors,setCursors]=useState<(number|null)[]>([null]),[refresh,setRefresh]=useState(0),[data,setData]=useState<Page|null>(null),[expanded,setExpanded]=useState<number|null>(null),[error,setError]=useState("");
  const before=cursors.at(-1);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setExpanded(null);setError("");
    authenticatedFetchJson<Page>(endpoint+(before?"?before="+before:""),{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[before,refresh]);
  return <>
    <PageHeader title="History Perubahan" description="Setiap penyimpanan berhasil mencatat akun pengubah, waktu server, serta data sebelum dan sesudah perubahan."/>
    <section className="cp-card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Audit aktivitas payroll</h2><p className="mt-1 text-sm text-zinc-400">Pesanan, karyawan, stok, kasbon, gaji, dan tutup buku. Riwayat ini tidak dapat diedit.</p></div><button className={buttonClass} onClick={()=>{setCursors([null]);setRefresh(x=>x+1);}}>Muat ulang</button></div></section>
    {error&&<p role="alert" className="mt-5 text-red-300">{error}</p>}{!data&&!error&&<p role="status" className="mt-5 text-zinc-400">Memuat history…</p>}
    <section className="mt-5 space-y-3">{data?.entries.map(entry=><article key={entry.revision} className="cp-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs text-zinc-400">Revisi {entry.revision} · {formatDateTimeID(entry.created_at)}</div><h2 className="mt-2 font-semibold">{entry.actor_name||"Akun "+(entry.actor_id||"lama")}</h2><p className="mt-1 break-all text-xs text-zinc-400">{entry.actor_email&&entry.actor_email+" · "}ID: {entry.actor_id||"Tidak tersedia pada riwayat lama"}</p><p className="mt-3 text-sm text-yellow-300">{entry.action==="close"?"Tutup buku":"Menyimpan perubahan"}</p><p className="mt-1 text-sm text-zinc-400">{entry.changed_keys?.map(key=>auditSections[key]||key).join(" · ")||"Riwayat sebelumnya"}</p></div><button className={buttonClass} aria-expanded={expanded===entry.revision} onClick={()=>setExpanded(expanded===entry.revision?null:entry.revision)}>{expanded===entry.revision?"Tutup detail":"Lihat perubahan"}</button></div>
      {expanded===entry.revision&&<RevisionDetails revision={entry.revision}/>}
    </article>)}{data&&!data.entries.length&&<div className="cp-card p-6 text-sm text-zinc-400">Belum ada perubahan tersimpan.</div>}</section>
    <div className="mt-5 flex items-center gap-3">{cursors.length>1&&<button className={buttonClass} onClick={()=>setCursors(rows=>rows.slice(0,-1))}>Lebih baru</button>}{data?.nextCursor!==null&&data?.nextCursor!==undefined&&<button className={buttonClass} onClick={()=>setCursors(rows=>[...rows,data.nextCursor])}>Lebih lama</button>}</div>
  </>;
}

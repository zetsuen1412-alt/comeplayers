"use client";
import { useEffect,useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { PageHeader } from "@/features/payroll/components/page-header";
import { usePayrollActor } from "@/features/payroll/lib/workspace-store";
import { formatDateTimeID } from "@/features/payroll/lib/date";
type Account={id:string;username:string|null;full_name:string|null;email:string|null;role:string|null};
type Member={user_id:string;active:boolean;updated_at:string;profile:Account|null};
type AccessEvent={id:number;actor_name:string;target_name:string;after_active:boolean;created_at:string};
type AccessData={members:Member[];events:AccessEvent[]};
const endpoint="/api/admin/payroll/access";
const label=(account:Account|null)=>account?.username||account?.full_name||account?.email||"Akun tidak tersedia";
const buttonClass="rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50";
export default function PayrollAccessPage() {
  const actor=usePayrollActor();
  const [data,setData]=useState<AccessData|null>(null),[query,setQuery]=useState(""),[results,setResults]=useState<Account[]>([]),[searched,setSearched]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[version,setVersion]=useState(0);
  const [directLink,setDirectLink]=useState("https://www.comeplayers.com/admin/payroll");
  useEffect(()=>{setDirectLink(window.location.origin+"/admin/payroll");},[]);
  useEffect(()=>{
    if(!actor?.isAdmin)return;
    const controller=new AbortController();setError("");
    authenticatedFetchJson<AccessData>(endpoint,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[actor?.isAdmin,version]);
  useEffect(()=>{
    setResults([]);setSearched(false);setLoading(false);
    if(!actor?.isAdmin||query.trim().length<3)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setLoading(true);
      authenticatedFetchJson<{users:Account[]}>(endpoint+"?q="+encodeURIComponent(query.trim()),{signal:controller.signal})
        .then(result=>{if(!controller.signal.aborted){setResults(result.users);setSearched(true);}})
        .catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },350);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[actor?.isAdmin,query]);
  async function changeAccess(account:Account,active:boolean) {
    if(busy)return;setBusy(true);setError("");setNotice("");
    try {
      await authenticatedFetchJson(endpoint,{method:"POST",body:JSON.stringify({userId:account.id,active})});
      setData(await authenticatedFetchJson<AccessData>(endpoint));
      setNotice((active?"Akses payroll diberikan kepada ":"Akses payroll dicabut dari ")+label(account)+".");
    }catch(e){setError(e instanceof Error?e.message:"Izin belum dapat disimpan. Muat ulang untuk memeriksa status.");}
    finally{setBusy(false);}
  }
  if(!actor?.isAdmin)return <p role="alert">Hanya admin yang dapat mengelola akses.</p>;
  return <>
    <PageHeader title="Akses Payroll" description="Pilih akun yang boleh membuka ruang operasional. Perubahan izin dicatat bersama nama admin."/>
    <section className="cp-card p-5 sm:p-6"><h2 className="font-semibold">Tautan khusus</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Bagikan tautan ini kepada akun yang sudah diberi izin. Mereka harus login dengan akun tersebut. Tombol masuk payroll hanya ditampilkan di menu admin.</p>
      <div className="mt-4 flex flex-wrap gap-3"><input readOnly aria-label="Tautan payroll" value={directLink} className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm"/><button className={buttonClass} onClick={async()=>{try{await navigator.clipboard.writeText(directLink);setNotice("Tautan berhasil disalin.");}catch{setNotice("Pilih dan salin tautan dari kolom di samping.");}}}>Salin tautan</button></div>
    </section>
    <section className="cp-card mt-5 p-5 sm:p-6"><h2 className="font-semibold">Berikan akses ke akun</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Izin ini mencakup membaca dan mengubah data payroll, gaji, pesanan operasional, stok, dan tutup buku. Peran akun di marketplace tetap sama.</p>
      <label className="mt-4 block text-sm">Cari username atau email<input value={query} onChange={e=>{setQuery(e.target.value);setError("");}} maxLength={150} placeholder="Minimal 3 karakter" className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3"/></label>
      {loading&&<p role="status" className="mt-3 text-sm text-zinc-400">Mencari akun…</p>}{searched&&!results.length&&<p className="mt-3 text-sm text-zinc-400">Akun tidak ditemukan.</p>}
      <div className="mt-4 space-y-3">{results.map(account=>{
        const inherited=account.role?.trim().toLowerCase()==="admin",active=inherited||data?.members.some(member=>member.user_id===account.id&&member.active);
        return <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 p-4"><div><h3 className="font-semibold">{label(account)}</h3><p className="break-all text-xs text-zinc-400">{account.email} · {account.id}</p></div>{active?<span className="text-sm text-emerald-300">{inherited?"Admin · akses bawaan":"Akses aktif"}</span>:<button disabled={busy||!data} className={buttonClass} onClick={()=>void changeAccess(account,true)}>Berikan akses payroll</button>}</div>;
      })}</div><p className="mt-3 text-xs text-zinc-500">Maksimal 10 hasil. Persempit pencarian untuk memilih akun yang tepat.</p>
    </section>
    {error&&<p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}{notice&&<p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
    <section className="cp-card mt-5 p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Akun dengan izin khusus</h2><button disabled={busy} className={buttonClass} onClick={()=>setVersion(x=>x+1)}>Muat ulang</button></div><p className="mt-2 text-xs text-zinc-400">200 izin yang terakhir diperbarui. Admin memiliki akses bawaan.</p>
      <div className="mt-4 space-y-3">{data?.members.map(member=><div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 p-4"><div><h3 className="font-semibold">{label(member.profile)}</h3><p className="break-all text-xs text-zinc-400">{member.profile?.email} · {member.user_id}</p><p className="mt-1 text-xs text-zinc-400">{member.active?"Aktif":"Dicabut"} · {formatDateTimeID(member.updated_at)}</p></div>{member.profile&&<button disabled={busy} className={buttonClass} onClick={()=>void changeAccess(member.profile!,!member.active)}>{member.active?"Cabut akses":"Aktifkan kembali"}</button>}</div>)}</div>
      {data&&!data.members.length&&<p className="mt-4 text-sm text-zinc-400">Belum ada akun tambahan yang diberi izin.</p>}{!data&&!error&&<p role="status" className="mt-4 text-sm text-zinc-400">Memuat izin…</p>}
    </section>
    <section className="cp-card mt-5 p-5 sm:p-6"><h2 className="font-semibold">History izin · 30 aktivitas terakhir</h2><div className="mt-4 divide-y divide-zinc-800">{data?.events.map(event=><div key={event.id} className="py-3 text-sm"><strong>{event.actor_name}</strong> {event.after_active?"memberikan akses kepada":"mencabut akses dari"} <strong>{event.target_name}</strong><div className="mt-1 text-xs text-zinc-400">{formatDateTimeID(event.created_at)}</div></div>)}</div>{data&&!data.events.length&&<p className="text-sm text-zinc-400">Belum ada perubahan izin.</p>}</section>
  </>;
}

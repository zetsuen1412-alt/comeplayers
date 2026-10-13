"use client";

import { adminText } from "@/lib/adminLocale";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { clearPayroll, exportUnsavedPayroll, loadPayroll, payrollStatus, subscribePayroll } from '../lib/workspace-store';
import { AdminShell } from './admin-shell';
import { useLiveRefresh } from '@/lib/live/use-live-refresh';
import { useLiveConnection } from '@/lib/live/use-live-connection';

export function WorkspaceGate({children}:{children:React.ReactNode}) {
  const [status,setStatus]=useState(payrollStatus);
  const pathname=usePathname();
  const connection=useLiveConnection();
  useLiveRefresh(loadPayroll, {topics:'payroll,account',enabled:!status.error||!status.pending});
  useEffect(()=>{
    clearPayroll();
    const unsubscribe=subscribePayroll(()=>setStatus(payrollStatus()));
    void loadPayroll().catch(()=>{});
    let userId:string|undefined;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      const changed=userId!==undefined && userId!==session?.user.id;
      userId=session?.user.id;
      if(event==='SIGNED_OUT'||changed){clearPayroll();void loadPayroll().catch(()=>{});}
    });
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(payrollStatus().pending){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    return ()=>{unsubscribe();subscription.unsubscribe();window.removeEventListener('beforeunload',beforeUnload);clearPayroll();};
  },[]);
  return <div className="evocp-payroll" lang="id">
    <div role="status" className="flex flex-wrap items-center justify-end gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-zinc-400">
      <span title={status.checkedAt?`Data terakhir diperiksa: ${new Date(status.checkedAt).toLocaleTimeString('id-ID')}`:undefined} className={connection==='live'?'text-emerald-400':'text-amber-300'}>{connection==='live'?'● Live':connection==='offline'?'Koneksi terputus':'Menghubungkan live…'}</span>
      {status.error ? <><span className="text-red-300">{adminText(status.error)} {status.pending?'Perubahan terakhir belum terkonfirmasi tersimpan.':''}</span>{status.pending&&<button onClick={exportUnsavedPayroll}>Unduh perubahan lokal</button>}<button onClick={()=>{if(!status.pending||confirm('Muat ulang data server? Unduh perubahan lokal dahulu agar perubahan yang belum tersimpan tidak hilang.')){clearPayroll();void loadPayroll().catch(()=>{});}}}>Muat ulang</button><Link href="/marketplace">Buka halaman masuk</Link></> : <span>{!status.ready?"Memeriksa akses penggajian…":status.pending?'Menyimpan…':`Tersimpan · revisi ${status.revision}`}</span>}
    </div>
    {status.ready && !status.actor?.isAdmin && (pathname.startsWith('/admin/payroll/access')||pathname.startsWith('/admin/payroll/legacy')||pathname.startsWith('/admin/payroll/telegram')||pathname.startsWith('/admin/payroll/boost-monitor')) ? <p role="alert" className="p-6 text-red-300">Halaman ini hanya tersedia untuk admin. <Link href="/admin/payroll">Kembali ke penggajian</Link></p> : status.ready && <fieldset disabled={!!status.error || status.busy} className="m-0 min-w-0 border-0 p-0">{pathname.startsWith('/admin/payroll/legacy')?children:<AdminShell>{children}</AdminShell>}</fieldset>}
  </div>;
}

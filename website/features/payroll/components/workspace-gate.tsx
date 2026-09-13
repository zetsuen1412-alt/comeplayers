"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { clearPayroll, exportUnsavedPayroll, loadPayroll, payrollStatus, subscribePayroll } from '../lib/workspace-store';
import { AdminShell } from './admin-shell';

export function WorkspaceGate({children}:{children:React.ReactNode}) {
  const [status,setStatus]=useState(payrollStatus);
  const pathname=usePathname();
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
    const interval=setInterval(()=>{if(document.visibilityState==='visible'&&!payrollStatus().error)void loadPayroll().catch(()=>{});},15000);
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(payrollStatus().pending){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    return ()=>{unsubscribe();subscription.unsubscribe();clearInterval(interval);window.removeEventListener('beforeunload',beforeUnload);clearPayroll();};
  },[]);
  return <div className="evocp-payroll">
    <div role="status" className="flex flex-wrap items-center justify-end gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-zinc-400">
      {status.error ? <><span className="text-red-300">{status.error} {status.pending?'Perubahan terakhir belum terkonfirmasi tersimpan.':''}</span>{status.pending&&<button onClick={exportUnsavedPayroll}>Unduh perubahan lokal</button>}<button onClick={()=>{if(!status.pending||confirm('Muat ulang data server? Unduh perubahan lokal dahulu agar perubahan yang belum tersimpan tidak hilang.')){clearPayroll();void loadPayroll().catch(()=>{});}}}>Muat ulang</button><Link href="/marketplace">Buka halaman masuk</Link></> : <span>{!status.ready?'Memeriksa akses admin…':status.pending?'Menyimpan…':`Tersimpan · revisi ${status.revision}`}</span>}
    </div>
    {status.ready && <fieldset disabled={!!status.error || status.busy} className="m-0 min-w-0 border-0 p-0">{pathname.startsWith('/admin/payroll/legacy')?children:<AdminShell>{children}</AdminShell>}</fieldset>}
  </div>;
}

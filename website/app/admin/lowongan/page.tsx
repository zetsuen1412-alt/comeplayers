'use client';
/* eslint-disable @next/next/no-img-element -- private banner is loaded through authenticated API */
import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch, authenticatedFetchJson } from '@/lib/authenticatedFetch';
import { EMPTY_CONFIG, type Config, type RunState } from '@/lib/loker/model';
import './lowongan.css';

type Log = { id:string; kind:string; status:string; target:string; note:string; external_ref?:string; created_at:string };
type Snapshot = { config:Config; state:RunState; revision:number; generation:string; jobs:Log[]; connection:{ enabled:boolean } };
type BridgeStatus = { installed?:boolean; version?:string; attached?:boolean; busy?:boolean; interrupted?:{ id:string; lease:string }; error?:string };
type Task = { id:string; lease:string; kind:string; target:string };
type ScanItem = { url:string; preview:string; group:string };

const API='/api/admin/lowongan';
const labels:Record<string,string>={
  draft:'Draf',running:'Aktif',paused:'Dijeda',stopped:'Dihentikan',
  queued:'Antrean',leased:'Menyiapkan',sending:'Mengirim',sent:'Terkirim',
  pending:'Menunggu admin grup',skipped:'Dilewati',failed:'Gagal',
  uncertain:'Perlu diperiksa',cancelled:'Dibatalkan',
  group_post:'Posting foto ke grup',group_scan:'Scan grup',group_comment:'Komentar foto'
};

async function command<T>(data:Record<string,unknown>):Promise<T>{
  return authenticatedFetchJson<T>(API,{method:'POST',body:JSON.stringify(data)});
}

export default function LowonganPage(){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [bannerId,setBannerId]=useState('');
  const [groupInput,setGroupInput]=useState('');
  const [publishGroups,setPublishGroups]=useState(false);
  const [authorized,setAuthorized]=useState(false);
  const [dirty,setDirty]=useState(false);
  const dirtyRef=useRef(false);
  const revisionRef=useRef(0);
  const first=useRef(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [working,setWorking]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [bridgeStatus,setBridgeStatus]=useState<BridgeStatus>({});
  const [bannerUrl,setBannerUrl]=useState('');
  const [scanned,setScanned]=useState<ScanItem[]>([]);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const requests=useRef(new Map<string,(value:Record<string,unknown>)=>void>());
  const active=useRef<Task|null>(null);
  const pumping=useRef(false);
  const mounted=useRef(true);

  const bridge=useCallback((name:string,data?:unknown,timeout=8000)=>new Promise<Record<string,unknown>>((resolve,reject)=>{
    const requestId=crypto.randomUUID();
    const timer=setTimeout(()=>{requests.current.delete(requestId);reject(new Error('Ekstensi tidak merespons.'));},timeout);
    requests.current.set(requestId,result=>{clearTimeout(timer);result?.error?reject(new Error(String(result.error))):resolve(result);});
    window.postMessage({source:'cp-loker-ui',kind:'command',requestId,command:name,data},location.origin);
  }),[]);

  const refresh=useCallback(async(force=false)=>{
    const data=await authenticatedFetchJson<Snapshot>(API);
    if(!mounted.current)return;
    setSnapshot(data);
    if(first.current||force||!dirtyRef.current){
      setBannerId(data.config.bannerId||'');
      setGroupInput((data.config.groups||[]).join('\n'));
      setPublishGroups(Boolean(data.config.publishGroups));
      setAuthorized(Boolean(data.config.groupsAuthorized));
      revisionRef.current=data.revision;
      dirtyRef.current=false;setDirty(false);first.current=false;
    }
  },[]);

  useEffect(()=>{
    mounted.current=true;
    const receive=(event:MessageEvent)=>{
      if(event.source!==window||event.origin!==location.origin||event.data?.source!=='cp-loker-extension')return;
      const m=event.data;
      if(m.kind==='result'){
        const callback=requests.current.get(m.requestId);
        if(callback){requests.current.delete(m.requestId);callback(m.result||{});}
      }
      if(m.kind==='preflight'){
        const task=active.current;
        const op=task&&task.id===m.id&&task.lease===m.lease
          ?command<{allowed:boolean}>({action:'preflight',id:m.id,lease:m.lease})
          :Promise.resolve({allowed:false});
        op.catch(()=>({allowed:false})).then(r=>window.postMessage({source:'cp-loker-ui',kind:'preflight-result',requestId:m.requestId,allowed:r.allowed},location.origin));
      }
    };
    window.addEventListener('message',receive);
    void refresh().catch(e=>setError(e.message));
    const poll=setInterval(()=>void refresh().catch(()=>undefined),10000);
    return()=>{mounted.current=false;clearInterval(poll);window.removeEventListener('message',receive);window.postMessage({source:'cp-loker-ui',kind:'command',requestId:crypto.randomUUID(),command:'stop'},location.origin);};
  },[refresh]);

  useEffect(()=>{
    let disposed=false,objectUrl='';
    if(!bannerId){setBannerUrl('');return;}
    void authenticatedFetch(`${API}/banner?id=${encodeURIComponent(bannerId)}`)
      .then(r=>r.blob()).then(blob=>{if(!disposed){objectUrl=URL.createObjectURL(blob);setBannerUrl(objectUrl);}})
      .catch(()=>setBannerUrl(''));
    return()=>{disposed=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[bannerId]);

  useEffect(()=>{
    async function pump(){
      if(pumping.current||scanning)return;
      pumping.current=true;
      try{
        const status=await bridge('ping') as BridgeStatus;
        if(mounted.current)setBridgeStatus(status);
        if(status.interrupted){
          await command({action:'result',...status.interrupted,status:'uncertain',note:'Browser/ekstensi terputus. Periksa Facebook sebelum melanjutkan.'});
          await refresh();return;
        }
        if(snapshot?.state!=='running'||!status.attached||status.busy)return;
        const {job}=await command<{job:Task|null}>({action:'next'});
        if(!job)return;
        active.current=job;
        let result:Record<string,unknown>;
        try{result=await bridge('run',job,160000);}
        catch(e){result={status:'uncertain',note:e instanceof Error?e.message:'Browser terputus.'};}
        await command({action:'result',...result,id:job.id,lease:job.lease});
        await refresh();
      }catch(e){
        if(active.current)setError(e instanceof Error?e.message:'Tugas Facebook perlu diperiksa.');
        else if(mounted.current)setBridgeStatus({installed:false});
      }finally{active.current=null;pumping.current=false;}
    }
    void pump();
    const timer=setInterval(()=>void pump(),5000);
    return()=>clearInterval(timer);
  },[bridge,refresh,scanning,snapshot?.state]);

  function changed(){dirtyRef.current=true;setDirty(true);setNotice('');}
  function groups(){return groupInput.split('\n').map(s=>s.trim()).filter(Boolean);}

  async function upload(file?:File){
    if(!file)return;
    setWorking(true);setError('');setNotice('');
    try{
      if(file.size>5*1024*1024)throw new Error('Foto maksimal 5 MB.');
      const response=await authenticatedFetch(`${API}/banner`,{method:'POST',headers:{'Content-Type':file.type},body:file});
      const data=await response.json() as {id:string};
      setBannerId(data.id);changed();
    }catch(e){setError(e instanceof Error?e.message:'Foto gagal diunggah.');}
    finally{setWorking(false);}
  }

  function config():Config{
    return {
      ...EMPTY_CONFIG,
      title:'Lowongan kerja EVOGAMING',
      bannerId,
      groups:groups(),
      publishGroups,
      commentGroups:true,
      manualReview:true,
      groupsAuthorized:authorized,
      intervalMinutes:60,
      dailyLimit:50,
    };
  }

  function validateBasics(){
    if(!bannerId)throw new Error('Pilih foto lowongan terlebih dahulu.');
    if(!groups().length)throw new Error('Masukkan sedikitnya satu link grup Facebook.');
    if(!authorized)throw new Error('Centang konfirmasi bahwa grup mengizinkan lowongan.');
    if(!bridgeStatus.attached)throw new Error('Hubungkan tab Facebook dari ekstensi terlebih dahulu.');
  }

  async function stopRunning(){
    if(snapshot?.state!=='running')return snapshot?.revision??revisionRef.current;
    void bridge('stop').catch(()=>undefined);
    const stopped=await command<{revision:number}>({action:'stop',expectedRevision:snapshot.revision});
    revisionRef.current=stopped.revision;
    await refresh(true);
    return stopped.revision;
  }

  async function scanAll(){
    setError('');setNotice('');
    try{validateBasics();}catch(e){setError(e instanceof Error?e.message:'Pengaturan belum lengkap.');return;}
    setScanning(true);setWorking(true);
    try{
      await stopRunning();
      const targetGroups=groups();
      const found=new Map<string,ScanItem>();
      const failures:string[]=[];
      setScanned([]);setSelected(new Set());
      for(let index=0;index<targetGroups.length;index++){
        const group=targetGroups[index];
        setNotice(`Memindai grup ${index+1}/${targetGroups.length}… hasil yang sudah ditemukan akan langsung disimpan di layar.`);
        try{
          const result=await bridge('scan',{groups:[group]},90000) as {items?:ScanItem[]};
          for(const item of Array.isArray(result.items)?result.items:[]){
            if(item?.url) found.set(item.url,item);
          }
          const items=[...found.values()];
          setScanned(items);
          setSelected(new Set(items.map(item=>item.url)));
        }catch(e){
          failures.push(`Grup ${index+1}: ${e instanceof Error?e.message:'gagal dipindai'}`);
          if(e instanceof Error && /Ekstensi tidak merespons|Extension context invalidated|Receiving end does not exist/i.test(e.message)) throw e;
        }
      }
      const items=[...found.values()];
      setScanned(items);
      setSelected(new Set(items.map(item=>item.url)));
      setNotice(`${items.length} postingan/status ditemukan dan otomatis ditandai semua.${failures.length?` ${failures.length} grup gagal dipindai.`:''} Periksa daftar lalu tekan KIRIM KOMENTAR.`);
      if(failures.length) setError(failures.join(' · '));
    }catch(e){
      setError(e instanceof Error?`${e.message} Muat ulang halaman Admin dan ekstensi, lalu hubungkan kembali tab Facebook.`:'Scan Facebook gagal.');
    }
    finally{setScanning(false);setWorking(false);}
  }

  async function ensureCampaignRunning(){
    let expected=await stopRunning();
    const saved=await command<{revision:number}>({action:'save',expectedRevision:expected,config:config()});
    revisionRef.current=saved.revision;
    const started=await command<{revision:number}>({action:'start',expectedRevision:saved.revision});
    revisionRef.current=started.revision;
    dirtyRef.current=false;setDirty(false);
    await refresh(true);
  }

  async function sendSelected(){
    setError('');setNotice('');
    const urls=[...selected];
    if(!urls.length){setError('Belum ada postingan yang ditandai.');return;}
    try{validateBasics();}catch(e){setError(e instanceof Error?e.message:'Pengaturan belum lengkap.');return;}
    setWorking(true);
    try{
      await ensureCampaignRunning();
      let accepted=0;
      for(let i=0;i<urls.length;i+=400){
        const result=await command<{accepted:number}>({action:'queue_selected',posts:urls.slice(i,i+400)});
        accepted+=result.accepted;
      }
      setNotice(`${accepted} postingan ditambahkan ke antrean komentar. Biarkan tab Admin dan Facebook tetap terbuka sampai selesai, atau tekan STOP.`);
    }catch(e){setError(e instanceof Error?e.message:'Komentar gagal diantrikan.');}
    finally{setWorking(false);}
  }

  async function stop(){
    if(!snapshot)return;
    setWorking(true);setError('');setNotice('');
    try{
      void bridge('stop').catch(()=>undefined);
      const stopped=await command<{revision:number}>({action:'stop',expectedRevision:snapshot.revision});
      revisionRef.current=stopped.revision;
      await refresh(true);
      setNotice('STOP aktif. Pengiriman berikutnya dihentikan.');
    }catch(e){setError(e instanceof Error?e.message:'STOP gagal.');}
    finally{setWorking(false);}
  }

  function toggle(url:string){
    setSelected(prev=>{const next=new Set(prev);next.has(url)?next.delete(url):next.add(url);return next;});
  }

  return <section className="lkr-root" lang="id">
    <header className="lkr-header">
      <div><span className="lkr-eyebrow">COMEPLAYERS · REVIEW KOMENTAR FACEBOOK</span><h1>Lowongan Facebook</h1><p>Foto → grup → scan → tandai semua → kirim komentar.</p></div>
      <span className={`lkr-state ${snapshot?.state||'draft'}`}>{snapshot?labels[snapshot.state]:'Memuat…'}</span>
    </header>

    {error&&<div className="lkr-alert error" role="alert">{error}</div>}
    {notice&&<div className="lkr-alert" role="status">{notice}</div>}

    <div className="lkr-health">
      <span className={snapshot?.connection.enabled?'ready':''}>Server: {snapshot?.connection.enabled?'aktif':'nonaktif'}</span>
      <span className={bridgeStatus.attached?'ready':''}>Facebook: {bridgeStatus.attached?'terhubung':'belum terhubung'}{bridgeStatus.version?` · ekstensi v${bridgeStatus.version}`:''}</span>
      <span>{scanning?'Sedang scan…':dirty?'Ada perubahan':'Siap'}</span>
    </div>

    <div className="lkr-grid"><div>
      <fieldset className="lkr-card" disabled={working}>
        <legend>1. Foto lowongan</legend>
        {bannerUrl?<img src={bannerUrl} alt="Foto lowongan aktif" style={{display:'block',width:'100%',maxWidth:520,maxHeight:650,objectFit:'contain',margin:'0 auto 18px',borderRadius:10,background:'#eef2f6'}}/>:<div className="lkr-empty-banner">Belum ada foto lowongan</div>}
        <label className="lkr-field">Pilih/ganti foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label>
      </fieldset>

      <fieldset className="lkr-card" disabled={working}>
        <legend>2. Grup Facebook</legend>
        <label className="lkr-field">Link grup — satu per baris<textarea rows={7} value={groupInput} placeholder={"https://www.facebook.com/groups/123...\nhttps://www.facebook.com/groups/456..."} onChange={e=>{setGroupInput(e.target.value);changed();setScanned([]);setSelected(new Set());}}/></label>
        <label className="lkr-toggle"><input type="checkbox" checked={publishGroups} onChange={e=>{setPublishGroups(e.target.checked);changed();}}/><span><strong>Juga posting foto sebagai status di setiap grup</strong><small>Opsional. Komentar tetap berdasarkan daftar yang kamu tandai setelah scan.</small></span></label>
        <label className="lkr-toggle"><input type="checkbox" checked={authorized} onChange={e=>{setAuthorized(e.target.checked);changed();}}/><span><strong>Grup yang saya masukkan mengizinkan lowongan</strong><small>Pastikan aturan grup memperbolehkan promosi/rekrutmen.</small></span></label>
        <button className="primary" disabled={working||!snapshot} onClick={()=>void scanAll()}>{scanning?'MEMINDAI…':'SCAN SEMUA POSTINGAN'}</button>
      </fieldset>

      {scanned.length>0&&<div className="lkr-card">
        <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
          <div><h2 style={{marginBottom:4}}>3. Postingan ditemukan</h2><p style={{margin:0}}>{selected.size} dari {scanned.length} ditandai.</p></div>
          <div className="lkr-buttons"><button onClick={()=>setSelected(new Set(scanned.map(x=>x.url)))}>Tandai Semua</button><button onClick={()=>setSelected(new Set())}>Batalkan Semua</button></div>
        </div>
        <div style={{maxHeight:520,overflow:'auto',marginTop:14,borderTop:'1px solid #dbe3e9'}}>
          {scanned.map((item,index)=><label key={item.url} className="lkr-toggle" style={{margin:0}}>
            <input type="checkbox" checked={selected.has(item.url)} onChange={()=>toggle(item.url)}/>
            <span><strong>Postingan {index+1}</strong><small>{item.preview||'Postingan tanpa teks'}</small><small>{item.url}</small></span>
          </label>)}
        </div>
        <div className="lkr-buttons" style={{marginTop:18}}>
          <button className="primary" style={{minWidth:220,minHeight:48}} disabled={working||selected.size===0} onClick={()=>void sendSelected()}>KIRIM KOMENTAR ({selected.size})</button>
          <button className="danger" style={{minWidth:140,minHeight:48}} disabled={working||!snapshot} onClick={()=>void stop()}>STOP</button>
        </div>
        <p className="lkr-help">Scan hanya menampilkan postingan yang ditemukan pada sesi scan. Tidak ada komentar yang dikirim sampai kamu menekan KIRIM KOMENTAR.</p>
      </div>}

      <details className="lkr-card">
        <summary style={{cursor:'pointer',fontWeight:700}}>Riwayat pengiriman ({snapshot?.jobs.length||0})</summary>
        <div className="lkr-table-scroll" style={{marginTop:16}}>
          {!snapshot?.jobs.length?<p>Belum ada pengiriman.</p>:<table><thead><tr><th>Aktivitas</th><th>Status</th><th>Tujuan / catatan</th></tr></thead><tbody>{snapshot.jobs.map(j=><tr key={j.id}><td><strong>{labels[j.kind]||j.kind}</strong><small>{new Date(j.created_at).toLocaleString('id-ID')}</small></td><td><span className={`lkr-result ${j.status}`}>{labels[j.status]||j.status}</span></td><td><small>{j.target}</small>{j.note||'Menunggu.'}{j.external_ref?.startsWith('https://www.facebook.com/groups/')&&<a href={j.external_ref} target="_blank" rel="noreferrer">Buka Facebook</a>}</td></tr>)}</tbody></table>}
        </div>
      </details>
    </div>

    <aside className="lkr-card lkr-preview">
      <span className="lkr-eyebrow">ALUR SEDERHANA</span><h2>4 langkah</h2>
      <p><strong>1.</strong> Pilih banner.</p><p><strong>2.</strong> Tempel link grup.</p><p><strong>3.</strong> Scan lalu Tandai Semua.</p><p><strong>4.</strong> Tekan KIRIM KOMENTAR.</p>
      <div className="lkr-direct"><strong>{bridgeStatus.attached?'✓ Facebook terhubung':'Facebook belum terhubung'}</strong><p>STOP dapat digunakan kapan saja untuk menghentikan antrean berikutnya.</p></div>
    </aside></div>
  </section>;
}

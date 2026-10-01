'use client';
/* eslint-disable @next/next/no-img-element -- private banner is loaded through authenticated API */
import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch, authenticatedFetchJson } from '@/lib/authenticatedFetch';
import { EMPTY_CONFIG, type Config, type RunState } from '@/lib/loker/model';
import './lowongan.css';

type Log = { id: string; kind: string; status: string; target: string; note: string; external_ref?: string; created_at: string };
type Snapshot = { config: Config; state: RunState; revision: number; generation: string; jobs: Log[]; connection: { enabled: boolean } };
type BridgeStatus = { installed?: boolean; attached?: boolean; busy?: boolean; interrupted?: { id: string; lease: string }; error?: string };
type Task = { id: string; lease: string; kind: string; target: string };

const API = '/api/admin/lowongan';
const labels: Record<string,string> = {
  draft:'Draf', running:'Aktif', paused:'Dijeda', stopped:'Dihentikan',
  queued:'Antrean', leased:'Menyiapkan', sending:'Mengirim', sent:'Terkirim',
  pending:'Menunggu admin grup', skipped:'Dilewati', failed:'Gagal',
  uncertain:'Perlu diperiksa', cancelled:'Dibatalkan',
  group_post:'Posting foto ke grup', group_scan:'Cari posting pencari kerja', group_comment:'Komentar foto'
};

async function command<T>(data: Record<string, unknown>): Promise<T> {
  return authenticatedFetchJson<T>(API, { method: 'POST', body: JSON.stringify(data) });
}

export default function LowonganPage() {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [bannerId,setBannerId]=useState('');
  const [groupInput,setGroupInput]=useState('');
  const [publishGroups,setPublishGroups]=useState(true);
  const [commentGroups,setCommentGroups]=useState(true);
  const [authorized,setAuthorized]=useState(false);
  const [dirty,setDirty]=useState(false);
  const dirtyRef=useRef(false);
  const revisionRef=useRef(0);
  const first=useRef(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [working,setWorking]=useState(false);
  const [bridgeStatus,setBridgeStatus]=useState<BridgeStatus>({});
  const [bannerUrl,setBannerUrl]=useState('');
  const requests=useRef(new Map<string,(value:Record<string,unknown>)=>void>());
  const active=useRef<Task|null>(null);
  const pumping=useRef(false);
  const mounted=useRef(true);

  const bridge=useCallback((name:string,data?:unknown,timeout=3500)=>new Promise<Record<string,unknown>>((resolve,reject)=>{
    const requestId=crypto.randomUUID();
    const timer=setTimeout(()=>{requests.current.delete(requestId);reject(new Error('Ekstensi tidak merespons.'));},timeout);
    requests.current.set(requestId,result=>{clearTimeout(timer); if(result?.error) reject(new Error(String(result.error))); else resolve(result);});
    window.postMessage({source:'cp-loker-ui',kind:'command',requestId,command:name,data},location.origin);
  }),[]);

  const refresh=useCallback(async(force=false)=>{
    const data=await authenticatedFetchJson<Snapshot>(API);
    if(!mounted.current)return;
    setSnapshot(data);
    if(first.current || force || !dirtyRef.current){
      setBannerId(data.config.bannerId || '');
      setGroupInput((data.config.groups || []).join('\n'));
      setPublishGroups(data.config.publishGroups !== false);
      setCommentGroups(data.config.commentGroups !== false);
      setAuthorized(Boolean(data.config.groupsAuthorized));
      revisionRef.current=data.revision;
      dirtyRef.current=false;
      setDirty(false);
      first.current=false;
    }
  },[]);

  useEffect(()=>{
    mounted.current=true;
    const receive=(event:MessageEvent)=>{
      if(event.source!==window || event.origin!==location.origin || event.data?.source!=='cp-loker-extension')return;
      const m=event.data;
      if(m.kind==='result'){
        const callback=requests.current.get(m.requestId);
        if(callback){requests.current.delete(m.requestId);callback(m.result||{});}
      }
      if(m.kind==='preflight'){
        const task=active.current;
        const op=task && task.id===m.id && task.lease===m.lease
          ? command<{allowed:boolean}>({action:'preflight',id:m.id,lease:m.lease})
          : Promise.resolve({allowed:false});
        op.catch(()=>({allowed:false})).then(r=>window.postMessage({source:'cp-loker-ui',kind:'preflight-result',requestId:m.requestId,allowed:r.allowed},location.origin));
      }
    };
    window.addEventListener('message',receive);
    void refresh().catch(e=>setError(e.message));
    const poll=setInterval(()=>void refresh().catch(()=>undefined),10000);
    return()=>{mounted.current=false;clearInterval(poll);window.removeEventListener('message',receive);window.postMessage({source:'cp-loker-ui',kind:'command',requestId:crypto.randomUUID(),command:'stop'},location.origin);};
  },[refresh]);

  useEffect(()=>{
    let disposed=false;
    let objectUrl='';
    if(!bannerId){setBannerUrl('');return;}
    void authenticatedFetch(`${API}/banner?id=${encodeURIComponent(bannerId)}`)
      .then(r=>r.blob())
      .then(blob=>{if(!disposed){objectUrl=URL.createObjectURL(blob);setBannerUrl(objectUrl);}})
      .catch(()=>setBannerUrl(''));
    return()=>{disposed=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[bannerId]);

  useEffect(()=>{
    async function pump(){
      if(pumping.current)return;
      pumping.current=true;
      try{
        const status=await bridge('ping') as BridgeStatus;
        if(mounted.current)setBridgeStatus(status);
        if(status.interrupted){
          await command({action:'result',...status.interrupted,status:'uncertain',note:'Browser/ekstensi terputus. Periksa Facebook sebelum melanjutkan.'});
          await refresh();
          return;
        }
        if(snapshot?.state!=='running' || !status.attached || status.busy)return;
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
    const timer=setInterval(()=>void pump(),6000);
    return()=>clearInterval(timer);
  },[bridge,refresh,snapshot?.state]);

  function changed(){dirtyRef.current=true;setDirty(true);setNotice('');}

  async function upload(file?:File){
    if(!file)return;
    setWorking(true);setError('');setNotice('');
    try{
      if(file.size>2*1024*1024)throw new Error('Foto maksimal 2 MB. Gunakan JPG/WebP atau kompres foto terlebih dahulu.');
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
      groups:groupInput.split('\n').map(s=>s.trim()).filter(Boolean),
      publishGroups,
      commentGroups,
      groupsAuthorized:authorized,
      intervalMinutes:60,
      dailyLimit:20,
    };
  }

  async function start(){
    setError('');setNotice('');
    const groups=groupInput.split('\n').map(s=>s.trim()).filter(Boolean);
    if(!bannerId){setError('Pilih foto lowongan terlebih dahulu.');return;}
    if(!groups.length){setError('Masukkan sedikitnya satu link grup Facebook.');return;}
    if(!publishGroups && !commentGroups){setError('Aktifkan posting foto atau komentar foto.');return;}
    if(!authorized){setError('Centang konfirmasi aturan grup sebelum START.');return;}
    if(!bridgeStatus.attached){setError('Hubungkan tab grup Facebook dari ekstensi terlebih dahulu.');return;}
    setWorking(true);
    try{
      const saved=await command<{revision:number}>({action:'save',expectedRevision:revisionRef.current,config:config()});
      revisionRef.current=saved.revision;
      await command({action:'start',expectedRevision:saved.revision});
      dirtyRef.current=false;setDirty(false);
      await refresh(true);
      setNotice('Aktif. Biarkan tab ComePlayers dan tab Facebook tetap terbuka. Sistem berpindah grup otomatis.');
    }catch(e){setError(e instanceof Error?e.message:'START gagal.');}
    finally{setWorking(false);}
  }

  async function stop(){
    if(!snapshot)return;
    setWorking(true);setError('');setNotice('');
    void bridge('stop').catch(()=>undefined);
    try{
      await command({action:'stop',expectedRevision:snapshot.revision});
      await refresh(true);
      setNotice('STOP aktif. Tugas berikutnya tidak akan dikirim.');
    }catch(e){setError(e instanceof Error?e.message:'STOP gagal.');}
    finally{setWorking(false);}
  }

  const running=snapshot?.state==='running';

  return <section className="lkr-root" lang="id">
    <header className="lkr-header">
      <div>
        <span className="lkr-eyebrow">COMEPLAYERS · AUTO LOKER FACEBOOK</span>
        <h1>Lowongan Facebook</h1>
        <p>Pilih foto → masukkan grup → START. Tidak perlu isi teks lowongan.</p>
      </div>
      <span className={`lkr-state ${snapshot?.state||'draft'}`}>{snapshot?labels[snapshot.state]:'Memuat…'}</span>
    </header>

    {error&&<div className="lkr-alert error" role="alert">{error}</div>}
    {notice&&<div className="lkr-alert" role="status">{notice}</div>}

    <div className="lkr-health">
      <span className={snapshot?.connection.enabled?'ready':''}>Server: {snapshot?.connection.enabled?'aktif':'nonaktif'}</span>
      <span className={bridgeStatus.attached?'ready':''}>Facebook: {bridgeStatus.attached?'terhubung':'belum terhubung'}</span>
      <span>{dirty?'Ada perubahan belum dijalankan':'Siap'}</span>
    </div>

    <div className="lkr-grid">
      <div>
        <fieldset className="lkr-card" disabled={running||working}>
          <legend>1. Foto lowongan</legend>
          {bannerUrl
            ? <img src={bannerUrl} alt="Foto lowongan aktif" style={{display:'block',width:'100%',maxWidth:520,maxHeight:650,objectFit:'contain',margin:'0 auto 18px',borderRadius:10,background:'#eef2f6'}}/>
            : <div className="lkr-empty-banner">Belum ada foto lowongan</div>}
          <label className="lkr-field">
            Pilih/ganti foto
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0])}/>
          </label>
          <p className="lkr-help">Yang dikirim ke Facebook hanya gambar ini. Maksimal 2 MB.</p>
        </fieldset>

        <fieldset className="lkr-card" disabled={running||working}>
          <legend>2. Grup Facebook</legend>
          <label className="lkr-field">
            Link grup — satu per baris
            <textarea rows={8} value={groupInput} placeholder={"https://www.facebook.com/groups/123...\nhttps://www.facebook.com/groups/456..."} onChange={e=>{setGroupInput(e.target.value);changed();}}/>
          </label>
          <label className="lkr-toggle">
            <input type="checkbox" checked={publishGroups} onChange={e=>{setPublishGroups(e.target.checked);changed();}}/>
            <span><strong>Posting foto ke setiap grup</strong><small>Foto diposting satu kali per grup untuk kampanye ini.</small></span>
          </label>
          <label className="lkr-toggle">
            <input type="checkbox" checked={commentGroups} onChange={e=>{setCommentGroups(e.target.checked);changed();}}/>
            <span><strong>Komentari posting pencari kerja dengan foto</strong><small>Otomatis menanggapi posting yang terdeteksi sedang mencari kerja/menanyakan loker, bukan semua postingan acak.</small></span>
          </label>
          <label className="lkr-toggle">
            <input type="checkbox" checked={authorized} onChange={e=>{setAuthorized(e.target.checked);changed();}}/>
            <span><strong>Grup yang saya masukkan mengizinkan lowongan</strong><small>Sistem berhenti bila Facebook menampilkan pembatasan atau pemeriksaan keamanan.</small></span>
          </label>
        </fieldset>

        <div className="lkr-card">
          <div className="lkr-buttons" style={{justifyContent:'flex-start'}}>
            <button className="primary" style={{minWidth:180,minHeight:48}} disabled={working||running||!snapshot} onClick={()=>void start()}>START</button>
            <button className="danger" style={{minWidth:180,minHeight:48}} disabled={working||!snapshot} onClick={()=>void stop()}>STOP</button>
          </div>
          <p className="lkr-help">Saat START, biarkan tab Admin ComePlayers dan satu tab Facebook yang terhubung tetap terbuka. Sistem akan membuka grup berikutnya sendiri.</p>
        </div>

        <details className="lkr-card">
          <summary style={{cursor:'pointer',fontWeight:700}}>Riwayat pengiriman ({snapshot?.jobs.length||0})</summary>
          <div className="lkr-table-scroll" style={{marginTop:16}}>
            {!snapshot?.jobs.length?<p>Belum ada pengiriman.</p>:<table>
              <thead><tr><th>Aktivitas</th><th>Status</th><th>Tujuan / catatan</th></tr></thead>
              <tbody>{snapshot.jobs.map(j=><tr key={j.id}>
                <td><strong>{labels[j.kind]||j.kind}</strong><small>{new Date(j.created_at).toLocaleString('id-ID')}</small></td>
                <td><span className={`lkr-result ${j.status}`}>{labels[j.status]||j.status}</span></td>
                <td><small>{j.target}</small>{j.note||'Menunggu.'}{j.external_ref?.startsWith('https://www.facebook.com/groups/')&&<a href={j.external_ref} target="_blank" rel="noreferrer">Buka Facebook</a>}</td>
              </tr>)}</tbody>
            </table>}
          </div>
        </details>
      </div>

      <aside className="lkr-card lkr-preview">
        <span className="lkr-eyebrow">CARA PAKAI</span>
        <h2>Hanya 3 langkah</h2>
        <p><strong>1.</strong> Pastikan foto lowongan sudah benar.</p>
        <p><strong>2.</strong> Tempel daftar link grup Facebook.</p>
        <p><strong>3.</strong> Hubungkan tab Facebook dari ekstensi lalu tekan START.</p>
        <div className="lkr-direct">
          <strong>{bridgeStatus.attached?'✓ Tab Facebook sudah terhubung':'Tab Facebook belum terhubung'}</strong>
          <p>Posting dan komentar dilakukan melalui tab Facebook yang sudah login.</p>
        </div>
      </aside>
    </div>
  </section>;
}

'use client';
/* eslint-disable @next/next/no-img-element -- private banner requires authenticated fetch */
import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch, authenticatedFetchJson } from '@/lib/authenticatedFetch';
import { EMPTY_CONFIG, publicationText, type Config, type RunState } from '@/lib/loker/model';
import './lowongan.css';
type Log = { id: string; kind: string; status: string; target: string; note: string; external_ref?: string; created_at: string };
type Snapshot = { config: Config; state: RunState; revision: number; generation: string; jobs: Log[]; connection: { enabled: boolean; pageConfigured: boolean; webhookConfigured: boolean } };
type BridgeStatus = { installed?: boolean; attached?: boolean; busy?: boolean; interrupted?: { id: string; lease: string }; error?: string };
type Task = { id: string; lease: string; kind: string; target: string };
const API = '/api/admin/lowongan';
const labels: Record<string,string> = { draft: 'Draf', running: 'Aktif', paused: 'Dijeda', stopped: 'Dihentikan', queued: 'Antrean', leased: 'Menyiapkan', sending: 'Mengirim', sent: 'Terkonfirmasi', pending: 'Menunggu admin grup', skipped: 'Dilewati', failed: 'Gagal', uncertain: 'Perlu diperiksa', cancelled: 'Dibatalkan', page_post: 'Posting Page', group_post: 'Posting grup', group_scan: 'Periksa pencari kerja', group_comment: 'Komentar grup', page_comment: 'Balasan komentar Page', messenger: 'Balasan Messenger Page' };
async function command<T>(data: Record<string, unknown>): Promise<T> { return authenticatedFetchJson<T>(API, { method: 'POST', body: JSON.stringify(data) }); }
export default function LowonganPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [form, setForm] = useState<Config>({ ...EMPTY_CONFIG, groups: [], faqs: [] });
  const [groupInput, setGroupInput] = useState('');
  const [dirty, setDirty] = useState(false); const dirtyRef = useRef(false);
  const formRevision = useRef(0); const first = useRef(true);
  const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [working, setWorking] = useState(false);
  const [tab, setTab] = useState('materi'); const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({});
  const [question, setQuestion] = useState('Bagaimana cara daftar lowongan?'); const [answer, setAnswer] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const requests = useRef(new Map<string, (value: Record<string, unknown>) => void>());
  const active = useRef<Task | null>(null); const pumping = useRef(false); const mounted = useRef(true);
  const bridge = useCallback((name: string, data?: unknown, timeout = 3500) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const requestId = crypto.randomUUID(); const timer = setTimeout(() => { requests.current.delete(requestId); reject(new Error('Ekstensi tidak merespons. Tidak ada pengiriman ulang otomatis.')); }, timeout);
    requests.current.set(requestId, result => { clearTimeout(timer); if (result?.error) reject(new Error(String(result.error))); else resolve(result); });
    window.postMessage({ source: 'cp-loker-ui', kind: 'command', requestId, command: name, data }, location.origin);
  }), []);
  const refresh = useCallback(async (replace = false) => {
    const data = await authenticatedFetchJson<Snapshot>(API); if (!mounted.current) return;
    setSnapshot(data);
    if (first.current || replace || !dirtyRef.current) {
      setForm(data.config); setGroupInput(data.config.groups.join('\n')); formRevision.current = data.revision;
      first.current = false; dirtyRef.current = false; setDirty(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'cp-loker-extension') return;
      const m = event.data;
      if (m.kind === 'result') { const callback = requests.current.get(m.requestId); if (callback) { requests.current.delete(m.requestId); callback(m.result || {}); } }
      if (m.kind === 'preflight') {
        const task = active.current;
        const operation = task && task.id === m.id && task.lease === m.lease ? command<{allowed: boolean}>({ action: 'preflight', id: m.id, lease: m.lease }) : Promise.resolve({ allowed: false });
        operation.catch(() => ({ allowed: false })).then(r => window.postMessage({ source: 'cp-loker-ui', kind: 'preflight-result', requestId: m.requestId, allowed: r.allowed }, location.origin));
      }
    };
    window.addEventListener('message',receive);
    void refresh().catch(e => setError(e.message));
    const poll = setInterval(() => { void refresh().catch(e => setError(e.message)); },10000);
    return () => { mounted.current = false; clearInterval(poll); window.removeEventListener('message',receive); window.postMessage({ source: 'cp-loker-ui', kind: 'command', requestId: crypto.randomUUID(), command: 'stop' }, location.origin); };
  },[refresh]);
  useEffect(() => {
    let disposed = false; let objectUrl = '';
    if (!form.bannerId) { setBannerUrl(''); return; }
    void authenticatedFetch(`${API}/banner?id=${encodeURIComponent(form.bannerId)}`).then(r => r.blob()).then(blob => { if (!disposed) { objectUrl = URL.createObjectURL(blob); setBannerUrl(objectUrl); } }).catch(() => setBannerUrl(''));
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  },[form.bannerId]);
  useEffect(() => {
    async function pump() {
      if (pumping.current) return; pumping.current = true;
      try {
        const status = await bridge('ping') as BridgeStatus; if (mounted.current) setBridgeStatus(status);
        if (status.interrupted) {
          await command({ action: 'result', ...status.interrupted, status: 'uncertain', note: 'Browser/ekstensi terputus. Periksa Facebook sebelum melanjutkan.' });
          await refresh(); return;
        }
        if (snapshot?.state !== 'running' || !status.attached || status.busy || !(snapshot.config.publishGroups || snapshot.config.commentGroups)) return;
        const { job } = await command<{ job: Task | null }>({ action: 'next' }); if (!job) return;
        active.current = job;
        let result: Record<string, unknown>;
        try { result = await bridge('run',job,160_000); }
        catch (e) { result = { status: 'uncertain', note: e instanceof Error ? e.message : 'Browser terputus.' }; }
        await command({ action: 'result', ...result, id: job.id, lease: job.lease });
        await refresh();
      } catch (e) {
        if (active.current) setError(e instanceof Error ? e.message : 'Tugas browser perlu diperiksa.');
        else if (mounted.current) setBridgeStatus({ installed: false });
      } finally { active.current = null; pumping.current = false; }
    }
    void pump(); const timer = setInterval(() => void pump(),6000); return () => clearInterval(timer);
  },[bridge,refresh,snapshot?.state,snapshot?.config.publishGroups,snapshot?.config.commentGroups]);
  useEffect(() => {
    if (snapshot?.state !== 'running') return;
    const timer = setInterval(() => { void command({ action: 'tick' }).catch(() => undefined); },30000);
    return () => clearInterval(timer);
  },[snapshot?.state]);
  function edit<K extends keyof Config>(key: K, value: Config[K]) { setForm(previous => ({ ...previous, [key]: value })); dirtyRef.current = true; setDirty(true); }
  async function action(name: 'save' | 'start' | 'pause' | 'stop') {
    setError(''); setNotice(''); setWorking(true);
    try {
      if (name === 'pause' || name === 'stop') void bridge('stop').catch(() => undefined);
      if (name === 'start' && dirty) throw new Error('Simpan perubahan terlebih dahulu.');
      if (name === 'start' && (form.publishGroups || form.commentGroups) && !bridgeStatus.attached) throw new Error('Hubungkan tab grup Facebook melalui ekstensi terlebih dahulu.');
      await command({ action: name, expectedRevision: name === 'save' ? formRevision.current : snapshot?.revision, ...(name === 'save' ? { config: { ...form, groups: groupInput.split('\n').map(s => s.trim()).filter(Boolean) } } : {}) });
      await refresh(name === 'save');
      setNotice(name === 'save' ? 'Materi disimpan. Belum ada pengiriman sebelum START.' : name === 'start' ? 'Antrean diaktifkan. Lihat status terverifikasi pada Riwayat.' : 'Pengiriman berikutnya dihentikan. Permintaan yang sudah dikirim ke Facebook dapat tetap selesai.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Perintah gagal.'); }
    finally { setWorking(false); }
  }
  async function upload(file?: File) {
    if (!file) return; setWorking(true); setError('');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Banner maksimal 2 MB.');
      const response = await authenticatedFetch(`${API}/banner`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      const data = await response.json() as { id: string }; edit('bannerId',data.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Banner gagal diunggah.'); } finally { setWorking(false); }
  }
  const frozen = snapshot?.state === 'running' || working;
  let preview = ''; try { preview = publicationText(form); } catch { preview = form.text || 'Pratinjau materi lowongan akan muncul di sini.'; }
  const input = (key: 'title' | 'text' | 'comment' | 'whatsapp' | 'fallback', title: string, multi = false, placeholder = '') => <label className="lkr-field">{title}{multi ? <textarea value={form[key]} rows={key === 'text' ? 8 : 3} maxLength={key === 'text' ? 4000 : 800} placeholder={placeholder} onChange={e => edit(key,e.target.value)} /> : <input value={form[key]} maxLength={160} placeholder={placeholder} onChange={e => edit(key,e.target.value)} />}</label>;
  const toggle = (key: 'publishPage' | 'publishGroups' | 'commentGroups' | 'replyComments' | 'replyMessenger' | 'groupsAuthorized', title: string, detail: string) => <label className="lkr-toggle"><input type="checkbox" checked={form[key]} onChange={e => edit(key,e.target.checked)} /><span><strong>{title}</strong><small>{detail}</small></span></label>;
  return <section className="lkr-root" lang="id">
    <header className="lkr-header"><div><span className="lkr-eyebrow">COMEPLAYERS · PUBLIKASI & BALASAN</span><h1>Lowongan Facebook</h1><p>Atur materi sekali. Arahkan peminat langsung ke WhatsApp admin.</p></div><span className={`lkr-state ${snapshot?.state || 'draft'}`}>{snapshot ? labels[snapshot.state] : 'Memuat…'}</span></header>
    {error && <div className="lkr-alert error" role="alert">{error} <button onClick={() => void refresh(true).catch(e => setError(e.message))}>Muat ulang data</button></div>}
    {notice && <div className="lkr-alert" role="status">{notice}</div>}
    <div className="lkr-toolbar"><div><strong>{form.title || 'Lowongan baru'}</strong><small>{dirty ? 'Ada perubahan yang belum disimpan' : 'Tanpa data pelamar, karyawan, atau payroll'}</small></div><div className="lkr-buttons"><button disabled={frozen || !snapshot} onClick={() => void action('save')}>Simpan</button><button className="primary" disabled={working || !snapshot || dirty || snapshot.state === 'running'} onClick={() => void action('start')}>START</button><button disabled={working || snapshot?.state !== 'running'} onClick={() => void action('pause')}>JEDA</button><button className="danger" disabled={!snapshot} onClick={() => void action('stop')}>STOP</button></div></div>
    <div className="lkr-health"><span className={snapshot?.connection.enabled ? 'ready' : ''}>Server: {snapshot?.connection.enabled ? 'diizinkan' : 'pengiriman nonaktif'}</span><span className={bridgeStatus.attached ? 'ready' : ''}>Browser grup: {bridgeStatus.attached ? 'terhubung' : 'belum terhubung'}</span><span className={snapshot?.connection.pageConfigured ? 'ready' : ''}>Facebook Page: {snapshot?.connection.pageConfigured ? 'konfigurasi tersedia' : 'belum dikonfigurasi'}</span></div>
    <nav className="lkr-tabs" aria-label="Pengaturan lowongan">{[['materi','Materi lowongan'],['tujuan','Tujuan Facebook'],['balasan','Balasan otomatis'],['riwayat','Riwayat & koneksi']].map(([id,label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {!snapshot ? <div className="lkr-card"><h2>Memuat modul lowongan</h2><p>Pengaturan disimpan di database khusus admin. Jika belum tersedia, jalankan migrasi modul setelah ditinjau.</p></div> : <div className="lkr-grid"><div>
      {tab === 'materi' && <fieldset className="lkr-card" disabled={frozen}><legend>01 / Materi & WhatsApp</legend>{input('title','Judul lowongan',false,'Contoh: Lowongan Game House EVO Gaming')}{input('whatsapp','Nomor WhatsApp admin',false,'08… atau +62…')}{input('text','Teks lowongan',true,'Isi lokasi, syarat, fasilitas, dan sistem kerja yang telah disetujui.')}<label className="lkr-field">Banner (PNG, JPG, WebP · maksimal 2 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void upload(e.target.files?.[0])} /></label>{form.bannerId && <button onClick={() => edit('bannerId','')}>Lepaskan banner</button>}<p className="lkr-help">Nomor dan tautan WhatsApp ditambahkan otomatis. Tidak ada formulir lamaran di ComePlayers. Menyimpan pengaturan yang berubah membuat versi kampanye baru; START dapat mempublikasikan materi kembali.</p></fieldset>}
      {tab === 'tujuan' && <fieldset className="lkr-card" disabled={frozen}><legend>02 / Tujuan & aktivitas</legend>{toggle('publishPage','Posting ke Facebook Page','Menggunakan Page milikmu yang dikonfigurasi pada server.')}{toggle('publishGroups','Posting ke daftar grup','Satu publikasi per grup untuk materi kampanye ini; tidak diulang hanya karena START ditekan lagi.')}{toggle('commentGroups','Komentari postingan pencari kerja','Memeriksa postingan relevan secara lokal, bukan membalas semua postingan grup.')}
        <label className="lkr-field">Daftar grup — satu tautan per baris<textarea rows={6} value={groupInput} onChange={e => { setGroupInput(e.target.value); dirtyRef.current = true; setDirty(true); }} placeholder="https://www.facebook.com/groups/…/" /></label>
        {toggle('groupsAuthorized','Saya telah memeriksa izin dan aturan setiap grup','Izin admin grup tidak sama dengan persetujuan Facebook terhadap otomatisasi browser. Hentikan jika ada pembatasan.')}{input('comment','Teks komentar singkat',true,'Tanggapan yang relevan untuk orang yang sedang mencari pekerjaan.')}
        <div className="lkr-two"><label className="lkr-field">Jeda pemeriksaan grup (menit)<input type="number" min={30} max={1440} value={form.intervalMinutes} onChange={e => edit('intervalMinutes',Number(e.target.value))} /></label><label className="lkr-field">Batas tindakan terkirim per hari (UTC)<input type="number" min={1} max={50} value={form.dailyLimit} onChange={e => edit('dailyLimit',Number(e.target.value))} /></label></div><p className="lkr-help">Batas berlaku bersama untuk posting dan balasan. Bukan jaminan akun bebas pembatasan. Tab admin dan browser Facebook harus tetap terbuka untuk tugas grup.</p></fieldset>}
      {tab === 'balasan' && <><fieldset className="lkr-card" disabled={frozen}><legend>03 / Balasan dari informasi resmi lowongan</legend>{toggle('replyComments','Balas komentar pada lowongan Page','Hanya komentar di postingan lowongan yang dibuat oleh modul ini.')}{toggle('replyMessenger','Balas Messenger Facebook Page','Untuk pesan masuk terkait lowongan. Tidak mengakses Messenger akun pribadi.')}{input('fallback','Jawaban umum',true,'Jawaban untuk pertanyaan yang belum mempunyai FAQ. Tautan WhatsApp ditambahkan otomatis.')}
        {form.faqs.map((faq,index) => <div className="lkr-faq" key={index}><label className="lkr-field">Kata kunci (pisahkan dengan koma)<input value={faq.keywords.join(', ')} onChange={e => edit('faqs',form.faqs.map((f,i) => i === index ? { ...f, keywords: e.target.value.split(',').map(s => s.trim()) } : f))} /></label><label className="lkr-field">Jawaban yang disetujui<textarea maxLength={600} value={faq.answer} onChange={e => edit('faqs',form.faqs.map((f,i) => i === index ? { ...f, answer: e.target.value } : f))} /></label><button onClick={() => edit('faqs',form.faqs.filter((_,i) => i !== index))}>Hapus jawaban</button></div>)}
        <button disabled={form.faqs.length >= 20} onClick={() => edit('faqs',[...form.faqs,{ keywords: ['lokasi'], answer: '' }])}>+ Tambah jawaban FAQ</button><p className="lkr-help">Balasan berbasis aturan, tanpa biaya model AI. Bot mengaku sebagai asisten otomatis, tidak mengarang gaji atau menerima pelamar. Pesan STOP dihormati; balasan manual admin menghentikan bot untuk percakapan itu.</p></fieldset>
        <div className="lkr-card"><h2>Coba jawaban — tidak mengirim ke Facebook</h2><label className="lkr-field">Contoh pertanyaan<input value={question} onChange={e => setQuestion(e.target.value)} /></label><button onClick={() => { setError(''); void command<{text: string | null}>({ action: 'preview', config: { ...form, groups: groupInput.split('\n').filter(Boolean) }, question }).then(r => setAnswer(r.text || 'Tidak dibalas: permintaan berhenti.')).catch(e => setError(e.message)); }}>Uji balasan</button>{answer && <pre className="lkr-preview-text">{answer}</pre>}</div></>}
      {tab === 'riwayat' && <><div className="lkr-card"><h2>Koneksi & pemasangan</h2><p><strong>Grup:</strong> pasang ekstensi dari folder <code>tools/comeplayers-loker-extension</code>, buka tab grup Facebook yang sudah login, lalu tekan <strong>Hubungkan tab Facebook ini</strong> pada ikon ekstensi.</p><p><strong>Page:</strong> konfigurasi token dan webhook dilakukan di environment server, bukan kolom chat atau browser. Callback: <code>/api/webhooks/loker-facebook</code>.</p><button onClick={() => { void command<{notice:string;name:string}>({ action: 'test_page' }).then(r => setNotice(`${r.name}: ${r.notice}`)).catch(e => setError(e.message)); }}>Uji identitas Facebook Page</button><p className="lkr-help">Grup menggunakan antarmuka browser yang dapat berubah. Tidak ada bypass CAPTCHA, pembatasan, atau klaim tidak terdeteksi. Hasil yang tidak pasti menjeda kampanye.</p></div>
        <div className="lkr-card"><h2>Riwayat terakhir <small>maksimal 60 tugas</small></h2>{!snapshot.jobs.length ? <p>Belum ada pengiriman. Data contoh tidak dimasukkan.</p> : <div className="lkr-table-scroll"><table><thead><tr><th>Aktivitas & tujuan</th><th>Status</th><th>Catatan</th></tr></thead><tbody>{snapshot.jobs.map(j => <tr key={j.id}><td><strong>{labels[j.kind] || j.kind}</strong><small>{j.target}</small><small>{new Date(j.created_at).toLocaleString('id-ID')}</small></td><td><span className={`lkr-result ${j.status}`}>{labels[j.status] || j.status}</span></td><td>{j.note || 'Menunggu giliran.'}{j.external_ref?.startsWith('https://www.facebook.com/groups/') && <a href={j.external_ref} target="_blank" rel="noreferrer">Buka bukti Facebook</a>}</td></tr>)}</tbody></table></div>}</div></>}
    </div><aside className="lkr-card lkr-preview"><span className="lkr-eyebrow">PRATINJAU MATERI</span><h2>{form.title || 'Lowongan kamu'}</h2>{bannerUrl ? <img src={bannerUrl} alt="Banner lowongan yang dipilih" /> : <div className="lkr-empty-banner">Banner lowongan<br/><small>Belum dipilih</small></div>}<pre className="lkr-preview-text">{preview}</pre><div className="lkr-direct"><strong>Langsung ke WhatsApp admin</strong><p>Facebook → WhatsApp.<br/>Tanpa formulir atau data karyawan.</p></div></aside></div>}
  </section>;
}

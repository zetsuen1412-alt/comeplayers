'use client';
import { useLiveRefresh } from '@/lib/live/use-live-refresh';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetchJson } from '@/lib/authenticatedFetch';
import { flushPayroll, loadPayroll } from '@/features/payroll/lib/workspace-store';
import { getMutasiFhTitles, mutasiFhManifest, type MutasiFhSourceRow } from '@/features/payroll/lib/mutasi-fh-import';

type Result = { status: string; revision?: number; isAdmin?: boolean; summary?: Record<string, unknown>; rows?: MutasiFhSourceRow[]; total?: number };
const endpoint = '/api/admin/payroll/imports';
const number = (value: unknown) => Number(value ?? 0).toLocaleString('id-ID');
const text = (value: unknown) => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const kindLabel: Record<string, string> = { imported: 'Pesanan', review: 'Perlu diperiksa', tip: 'Tips', incomplete: 'Belum lengkap', summary: 'Rekap / CLOSING', template: 'Template', header: 'Judul kolom' };

export default function PayrollImportsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [onlyReview, setOnlyReview] = useState(true);
  const [consent, setConsent] = useState(false);
  const [checkedFile, setCheckedFile] = useState<File | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const data = await authenticatedFetchJson<Result>(`${endpoint}?page=${page}&review=${onlyReview}`);
    if (version === requestVersion.current) setResult(data);
    return data;
  }, [page, onlyReview]);

  useEffect(() => {
    let active = true;
    void refresh().catch(e => { if (active) setError(e instanceof Error ? e.message : 'Gagal memuat arsip.'); });
    return () => { active = false; requestVersion.current++; };
  }, [refresh]);
  useLiveRefresh(async () => { await refresh(); }, { topics: 'payroll', enabled: !busy });

  const applied = result?.status === 'applied' || result?.status === 'already_applied';
  const shown = applied ? result : preview;
  const summary = shown?.summary;

  async function check() {
    if (!file || busy) return;
    setBusy(true); setError(''); setPreview(null); setCheckedFile(null); setConsent(false);
    try {
      await flushPayroll();
      const data = await authenticatedFetchJson<Result>(`${endpoint}?mode=preview`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      if (data.status === 'already_applied') { await refresh(); await loadPayroll(); }
      else { setPreview(data); setCheckedFile(file); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Pemeriksaan gagal.'); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!file || checkedFile !== file || !preview || !consent || busy) return;
    setBusy(true); setError('');
    try {
      await flushPayroll();
      const receipt = await authenticatedFetchJson<Result>(`${endpoint}?mode=apply&revision=${preview.revision}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      setResult(receipt); setPreview(null); setCheckedFile(null);
      await refresh(); await loadPayroll();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Respons impor belum diterima.';
      setPreview(null); setCheckedFile(null); setConsent(false);
      try { const latest = await refresh(); if (latest.status !== 'applied') setError(`${message} Periksa paket lagi sebelum mencoba ulang.`); else await loadPayroll(); }
      catch { setError(`${message} Muat ulang halaman untuk memeriksa hasil. Paket yang sama tidak akan menggandakan data.`); }
    } finally { setBusy(false); }
  }

  return <div className="space-y-6 pb-10">
    <header>
      <h1 className="text-3xl font-bold">Impor MUTASI FH</h1>
      <p className="mt-2 text-slate-400">Pemetaan aktif: GATE → Sumber, NAMA BUYER → Nama pembeli, NAMA ORDER → Nama pesanan, BOOSTER → Karyawan. STATUS hanya dibaca sebagai rincian karyawan/jumlah ketika BOOSTER hitam.</p>
      <div className="mt-4 flex flex-wrap gap-4"><Link href="/admin/payroll/orders" className="text-yellow-300 underline">Tambah Pesanan</Link><Link href="/admin/payroll/mutations" className="text-yellow-300 underline">Lihat Mutasi</Link><Link href="/admin/payroll/products" className="text-yellow-300 underline">Produk / Game</Link></div>
    </header>

    {error && <div role="alert" className="rounded-xl border border-red-500/50 bg-red-950/30 p-4 text-red-200">{error}</div>}

    {applied ? <div role="status" className="rounded-xl border border-emerald-500/50 bg-emerald-950/30 p-5 text-emerald-200"><strong>Impor MUTASI FH terbaru sudah tersimpan.</strong> Pesanan tersedia di Pesanan/Mutasi. Data historis tidak otomatis menjalankan pembayaran gaji, Closing, atau perubahan stok.</div> : <section className="space-y-4 rounded-xl border border-white/15 bg-white/5 p-5">
      <h2 className="text-xl font-semibold">1. Pilih paket arsip V2</h2>
      <p className="text-sm text-slate-300">Paket <strong>{mutasiFhManifest.fileName}</strong> dipertahankan khusus untuk arsip impor lama. Pemetaan tampilan produksi saat ini tetap mengikuti NAMA ORDER sebagai Nama pesanan.</p>
      <label className="block text-sm">Paket MUTASI FH<input type="file" accept=".cpimport" disabled={busy || result?.isAdmin === false} className="mt-2 block w-full text-sm" onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setCheckedFile(null); setConsent(false); setError(''); }} /></label>
      <button type="button" disabled={!file || busy || result?.isAdmin === false} onClick={check} className="rounded-lg bg-yellow-400 px-5 py-3 font-semibold text-black disabled:opacity-40">{busy ? 'Sedang diproses…' : 'Periksa Paket'}</button>
      {preview && <div className="space-y-4 border-t border-white/15 pt-4">
        <h2 className="text-xl font-semibold">2. Impor paket arsip</h2>
        <p className="text-sm text-slate-300">Data yang sudah ada tidak ditimpa. Karyawan yang belum cocok tidak ditebak. Pesanan historis belum masuk perhitungan gaji; verifikasi hanya setelah memastikan belum pernah dibayar.</p>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} /><span>Saya memahami bahwa {number(preview.summary?.ordersNeedReview)} pesanan perlu diperiksa, dan {number(preview.summary?.rowsNotInOrders)} baris tips/data tidak lengkap disimpan di arsip, bukan dijadikan pesanan normal.</span></label>
        <button type="button" disabled={!consent || busy || checkedFile !== file} onClick={apply} className="rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-40">Impor {number(preview.summary?.ordersImported)} Pesanan + Arsip</button>
      </div>}
    </section>}

    {summary && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[['Pesanan', summary.ordersImported], ['Pesanan perlu diperiksa', summary.ordersNeedReview], ['Baris BOOSTER hitam', summary.blackBoosterRows], ['Total pesanan (Rp)', summary.totalImportedMinor]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/15 p-4"><p className="text-sm text-slate-400">{String(label)}</p><p className="mt-2 text-2xl font-semibold">{number(value)}</p></div>)}
    </section>}

    <section className="space-y-3 rounded-xl border border-white/15 p-5 text-sm leading-6 text-slate-300">
      <h2 className="text-xl font-semibold text-white">Aturan pembacaan</h2>
      <p><strong>GATE → Sumber. NAMA BUYER → Nama pembeli. NAMA ORDER → Nama pesanan. BOOSTER → Karyawan.</strong> STATUS biasa tidak mengganti Nama pesanan. Dengan aturan ini judul order di website selalu mengikuti kolom NAMA ORDER, kecuali baris sumber memang tidak lengkap dan ditandai untuk pemeriksaan.</p>
      <p><strong>BOOSTER hitam → STATUS berisi rincian karyawan dan jumlah.</strong> Nama pesanan tetap memakai NAMA ORDER. Contoh X2137 tetap satu order: PERMANA 2M + FARDAN 5M + FERDI 4M + DIO 3M + DANDA 2M = 16M. Nilainya tetap 16 × Rp33.352 = Rp533.632.</p>
      <p>JUMLAH menjadi jumlah pesanan. Bila angka di belakang nama karyawan tersedia, angka tersebut menjadi pembagian jumlah karyawan dan dicocokkan terhadap JUMLAH. Nama karyawan yang tidak dapat dipastikan tidak dibuat secara fiktif dan barisnya tetap ditandai perlu diperiksa.</p>
    </section>

    {shown?.rows && <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{applied ? 'Arsip sumber' : 'Pratinjau baris yang perlu diperiksa'}</h2>{applied && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyReview} disabled={busy} onChange={e => { setPage(0); setOnlyReview(e.target.checked); }} />Hanya yang perlu diperiksa</label>}</div>
      <div className="overflow-x-auto rounded-xl border border-white/15"><table className="w-full min-w-[1150px] text-left text-sm"><thead className="bg-white/10"><tr>{['Baris XLSX', 'Kode / Jenis', 'Nama pesanan di website', 'BOOSTER', 'STATUS asli', 'Jumlah / Rate / Total', 'Pemeriksaan'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>
        {shown.rows.map(row => { const titles = getMutasiFhTitles(row); return <tr key={row.row} className="border-t border-white/10 align-top"><td className="p-3">{row.row}</td><td className="p-3"><strong>{text(row.importReference ?? row.values.B)}</strong><div className="mt-1 text-xs text-slate-400">{kindLabel[row.kind] ?? row.kind}</div></td><td className="max-w-xs whitespace-pre-wrap p-3"><strong>{titles.orderName || '—'}</strong></td><td className="p-3">{titles.usesWorkerList ? 'Sel hitam → baca STATUS' : text(row.values.F)}</td><td className="max-w-xs whitespace-pre-wrap p-3">{text(row.values.H)}</td><td className="p-3">{text(row.values.K)} / {text(row.values.L)} / {text(row.values.M)}</td><td className="max-w-sm whitespace-pre-wrap p-3 text-amber-200">{row.issues?.join('\n') || '—'}</td></tr>; })}
      </tbody></table></div>
      {applied && <div className="flex items-center justify-between gap-3 text-sm"><button type="button" disabled={page === 0 || busy} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-white/20 px-4 py-2 disabled:opacity-40">Sebelumnya</button><span>Halaman {page + 1} · {number(shown.total)} baris</span><button type="button" disabled={(page + 1) * 30 >= (shown.total ?? 0) || busy} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-white/20 px-4 py-2 disabled:opacity-40">Berikutnya</button></div>}
    </section>}
  </div>;
}

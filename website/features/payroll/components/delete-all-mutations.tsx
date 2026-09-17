'use client';

import { useEffect, useRef, useState } from 'react';
import { authenticatedFetch, authenticatedFetchJson } from '@/lib/authenticatedFetch';
import { flushPayroll, loadPayroll, resetPayrollMutations, usePayrollActor } from '@/features/payroll/lib/workspace-store';
import { mutationResetConfirmation, type MutationResetPreview, type MutationResetReceipt } from '@/features/payroll/lib/mutation-reset';
import { formatMoney } from '@/features/payroll/lib/money';
import { formatDateTimeID } from '@/features/payroll/lib/date';

type Preview = MutationResetPreview & { receipts: MutationResetReceipt[] };
const endpoint = '/api/admin/payroll/mutations/reset';
const count = (value: number) => value.toLocaleString('id-ID');

export function DeleteAllMutations() {
  const actor = usePayrollActor();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState<{ id: string; removed: number } | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (open && actor?.isAdmin) element?.showModal();
    else element?.close();
    return () => element?.close();
  }, [open, actor?.isAdmin]);

  async function inspect() {
    setBusy(true); setError(''); setPreview(null); setConfirmation(''); setAcknowledged(false);
    setRequestId(crypto.randomUUID());
    try {
      await flushPayroll();
      setPreview(await authenticatedFetchJson<Preview>(endpoint));
    } catch (e) { setError(e instanceof Error ? e.message : 'Ringkasan belum dapat dimuat.'); }
    finally { setBusy(false); }
  }
  // A separate download uses the authenticated API, never a public backup URL.
  async function downloadBackup(id: string) {
    setBusy(true); setError('');
    try {
      const response = await authenticatedFetch(`${endpoint}?backup=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Cadangan belum dapat diunduh.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `ComePlayers-cadangan-mutasi-${id}.json.gz`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal mengunduh cadangan.'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (busy || !preview?.canReset || !acknowledged || confirmation !== mutationResetConfirmation) return;
    setBusy(true); setError('');
    const selectedId = requestId;
    try {
      const result = await resetPayrollMutations({ expectedRevision: preview.revision, expectedCount: preview.count, requestId: selectedId, confirmation });
      setCompleted({ id: result.receiptId, removed: result.removedCount });
      setPreview(null); setConfirmation(''); setAcknowledged(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Hasil penghapusan belum terkonfirmasi.';
      setPreview(null); setConfirmation(''); setAcknowledged(false);
      try {
        const latest = await authenticatedFetchJson<Preview>(endpoint);
        const receipt = latest.receipts.find(item => item.id === selectedId);
        await loadPayroll();
        if (receipt) setCompleted({ id: receipt.id, removed: receipt.removed_count });
        else setError(`${message} Periksa ulang ringkasan sebelum mengonfirmasi lagi.`);
      } catch { setError(`${message} Muat ulang halaman untuk memeriksa hasil. Jangan mengulangi penghapusan sebelum jumlah terbaru terlihat.`); }
    } finally { setBusy(false); }
  }
  if (!actor?.isAdmin) return null;
  return <section className="mb-5">
    <div className="flex flex-wrap items-center justify-end gap-3">
      {completed && <p role="status" className="text-sm text-emerald-300">{count(completed.removed)} mutasi dihapus. Cadangan tersimpan.</p>}
      {completed && <button type="button" disabled={busy} onClick={() => void downloadBackup(completed.id)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm disabled:opacity-40">Unduh cadangan</button>}
      <button type="button" disabled={busy} onClick={() => { setOpen(true); setCompleted(null); void inspect(); }} className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-40">Hapus Semua Mutasi</button>
    </div>
    {!open && error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    <dialog ref={dialog} aria-labelledby="mutation-reset-title" aria-describedby="mutation-reset-scope" onCancel={event => { if (busy) event.preventDefault(); else setOpen(false); }} className="m-auto max-h-[90dvh] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 text-white shadow-2xl backdrop:bg-black/80 sm:p-7">
      <h2 id="mutation-reset-title" className="text-2xl font-semibold">Hapus semua mutasi?</h2>
      <p id="mutation-reset-scope" className="mt-3 text-sm leading-6 text-zinc-300"><strong>Semua periode dan semua sumber</strong>, bukan hanya hasil filter yang terlihat. Pesanan dihapus dari data aktif Mutasi dan Penjualan; perhitungan gaji yang belum ditutup buku ikut diperbarui.</p>
      <p className="mt-3 text-sm leading-6 text-zinc-400">Karyawan, Produk/Permainan, Kasbon, stok, pengaturan gaji, arsip Tutup Buku, serta riwayat perubahan tetap dipertahankan. Cadangan lengkap dibuat otomatis di server sebelum penghapusan. Ini bukan penghapusan permanen cadangan dan arsip.</p>
      {busy && <p role="status" className="mt-4 text-yellow-200">Sedang memproses… Jangan tutup halaman.</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {completed ? <div role="status" className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <strong>{count(completed.removed)} mutasi berhasil dihapus.</strong>
        <p className="mt-2 text-sm">Cadangan dan jejak audit tersimpan. Paket MUTASI FH yang sudah dikosongkan dapat diimpor ulang melalui halaman Impor.</p>
        <button type="button" disabled={busy} onClick={() => void downloadBackup(completed.id)} className="mt-3 rounded-lg border border-emerald-500/40 px-4 py-2 text-sm disabled:opacity-40">Unduh cadangan</button>
      </div> : preview ? <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white/5 p-4"><p className="text-sm text-zinc-400">Pesanan yang akan dihapus</p><p className="mt-1 text-2xl font-semibold">{count(preview.count)}</p></div><div className="rounded-xl bg-white/5 p-4"><p className="text-sm text-zinc-400">Total nilai pesanan</p><p className="mt-1 text-2xl font-semibold">{formatMoney(preview.totalMinor)}</p></div></div>
        {preview.payrollReadyCount > 0 && <p className="mt-3 text-sm text-amber-200">{count(preview.payrollReadyCount)} pesanan sedang menunggu gaji. Nilainya akan keluar dari perhitungan gaji berikutnya.</p>}
        {preview.blockers.map(message => <p role="status" key={message} className="mt-3 text-sm text-amber-200">{message}</p>)}
        {preview.canReset && <div className="mt-5 space-y-4">
          <label className="block text-sm" htmlFor="mutation-reset-confirmation">Ketik <strong>{mutationResetConfirmation}</strong> untuk melanjutkan</label>
          <input id="mutation-reset-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy} className="w-full rounded-xl border border-zinc-600 bg-black px-3 py-3 text-sm outline-none focus:border-red-400" />
          <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={busy} className="mt-1" /><span>Saya memahami bahwa seluruh {count(preview.count)} pesanan aktif akan dihapus, bukan hanya data pada filter saat ini.</span></label>
        </div>}
        {!!preview.receipts.length && <details className="mt-5 border-t border-zinc-800 pt-4 text-sm"><summary className="cursor-pointer">Cadangan penghapusan sebelumnya</summary>{preview.receipts.map(receipt => <div key={receipt.id} className="mt-3 flex flex-wrap items-center justify-between gap-2"><span>{count(receipt.removed_count)} mutasi · {formatDateTimeID(receipt.created_at)}</span><button type="button" disabled={busy} onClick={() => void downloadBackup(receipt.id)} className="rounded-lg border border-zinc-700 px-3 py-2 disabled:opacity-40">Unduh cadangan</button></div>)}</details>}
      </> : !busy && <button type="button" onClick={() => void inspect()} className="mt-4 rounded-lg border border-zinc-600 px-4 py-2 text-sm">Periksa ulang ringkasan</button>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" autoFocus disabled={busy} onClick={() => setOpen(false)} className="rounded-xl border border-zinc-600 px-5 py-3 text-sm disabled:opacity-40">{completed ? 'Tutup' : 'Batal'}</button>
        {!completed && <button type="button" disabled={busy || !preview?.canReset || !acknowledged || confirmation !== mutationResetConfirmation} onClick={() => void apply()} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">Hapus {preview ? count(preview.count) : 'Semua'} Mutasi</button>}
      </div>
    </dialog>
  </section>;
}

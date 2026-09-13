"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useDemoMutationHistory } from "@/lib/demo-mutation-history-store";
import { formatDateTimeID } from "@/lib/date";

export default function HistoryPage() {
  const { entries } = useDemoMutationHistory();
  const [search, setSearch] = useState("");
  const [onlyFinished, setOnlyFinished] = useState(false);

  useEffect(() => {
    const order = new URLSearchParams(window.location.search).get("order");
    if (order) setSearch(order);
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => (!onlyFinished || entry.wasCompleted) && (!q || entry.orderReference.toLowerCase().includes(q) || entry.reason?.toLowerCase().includes(q)));
  }, [entries, onlyFinished, search]);

  const finishedEdits = entries.filter((entry) => entry.wasCompleted).length;
  const afterClosing = entries.filter((entry) => entry.wasPayrollClosed).length;

  return (
    <>
      <PageHeader title="History Perubahan" description="Catatan setiap edit dari menu Mutasi. Edit setelah order selesai atau setelah Closing diberi tanda khusus." />

      <section className="cp-card p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><div className="text-sm text-zinc-500">Total perubahan</div><div className="mt-1 text-3xl font-semibold">{entries.length}</div></div>
          <div><div className="text-sm text-zinc-500">Edit setelah selesai</div><div className="mt-1 text-3xl font-semibold text-amber-300">{finishedEdits}</div></div>
          <div><div className="text-sm text-zinc-500">Edit setelah Closing</div><div className="mt-1 text-3xl font-semibold text-red-300">{afterClosing}</div></div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-zinc-800 pt-5 sm:grid-cols-[1fr_auto_auto]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode order / alasan..." className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3" />
          <button onClick={() => setOnlyFinished((v) => !v)} className={`rounded-xl px-4 py-3 text-sm font-semibold ${onlyFinished ? "bg-amber-400 text-black" : "bg-zinc-800"}`}>{onlyFinished ? "✓ Hanya setelah selesai" : "Tampilkan edit setelah selesai"}</button>
          <Link href="/admin/mutations" className="rounded-xl bg-yellow-400 px-4 py-3 text-center text-sm font-bold text-black">← Kembali ke Mutasi</Link>
        </div>
      </section>

      <section className="mt-5 space-y-3">
        {rows.map((entry) => (
          <div key={entry.id} className={`rounded-2xl border p-5 ${entry.wasPayrollClosed ? "border-red-500/30 bg-red-500/10" : entry.wasCompleted ? "border-amber-500/30 bg-amber-500/10" : "border-zinc-800 bg-zinc-950/40"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2"><Link href={`/admin/orders/${entry.orderReference}`} className="text-lg font-bold hover:text-yellow-300">{entry.orderReference}</Link>{entry.wasPayrollClosed ? <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">EDIT SETELAH CLOSING</span> : entry.wasCompleted ? <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-black">EDIT SETELAH SELESAI</span> : <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">EDIT MUTASI</span>}</div>
                <div className="mt-1 text-sm text-zinc-500">{formatDateTimeID(entry.editedAt)} · {entry.editedBy}</div>
              </div>
              <div className="text-sm text-zinc-400">{entry.changes.length} perubahan</div>
            </div>
            {entry.reason ? <div className="mt-3 rounded-xl bg-black/30 p-3 text-sm"><span className="text-zinc-500">Alasan:</span> {entry.reason}</div> : null}
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {entry.changes.map((change, index) => <div key={`${change.field}-${index}`} className="rounded-xl border border-zinc-800/80 bg-black/25 p-3"><div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{change.label}</div><div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm"><span className="break-words text-red-200 line-through decoration-red-400/60">{change.before}</span><span className="text-zinc-600">→</span><strong className="break-words text-emerald-300">{change.after}</strong></div></div>)}
            </div>
            {entry.wasPayrollClosed ? <div className="mt-4 text-xs leading-5 text-red-200">Perubahan ini terjadi setelah Closing. History disimpan, tetapi payroll periode lama tidak dihitung ulang otomatis.</div> : null}
          </div>
        ))}
        {!rows.length ? <div className="cp-card p-6 text-sm text-zinc-500">Belum ada history perubahan yang sesuai filter.</div> : null}
      </section>
    </>
  );
}

"use client";
import { FormEvent, useMemo, useState } from "react";
import { useDemoProductGames } from "@/features/payroll/lib/demo-product-store";
import { useBoostingCatalog } from "@/features/payroll/lib/boosting-catalog-store";
import { flushPayroll } from "@/features/payroll/lib/workspace-store";
import { formatMoney } from "@/features/payroll/lib/money";

export default function BoostingCatalogPage() {
 const {games} = useDemoProductGames();
 const {plans,upsert} = useBoostingCatalog();
 const [gameId,setGameId] = useState("");
 const [name,setName] = useState("");
 const [rate,setRate] = useState("");
 const [editing,setEditing] = useState<string|null>(null);
 const [busy,setBusy] = useState(false);
 const [message,setMessage] = useState("");
 const [query,setQuery] = useState("");
 const filtered = useMemo(()=>plans.filter(p=>[p.name,games.find(g=>g.id===p.gameId)?.name??""].join(" ").toLowerCase().includes(query.toLowerCase())),[plans,games,query]);
 const input = "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-white";
 async function submit(e:FormEvent) {
  e.preventDefault();setMessage("");
  if(!/^\d+$/.test(rate)) {setMessage("Harga harus angka rupiah bulat, boleh 0.");return;}
  setBusy(true);
  try {upsert({id:editing??undefined,gameId,name,rateMinor:Number(rate),active:true});await flushPayroll();setName("");setRate("");setEditing(null);setMessage("Paket dan harga tersimpan. Harga lama pada pesanan tidak berubah.");}
  catch(err){setMessage(err instanceof Error?err.message:"Gagal menyimpan katalog.");}
  finally{setBusy(false);}
 }
 async function toggle(id:string) {
  const plan=plans.find(x=>x.id===id);if(!plan)return;
  setBusy(true);try {upsert({...plan,active:!plan.active});await flushPayroll();setMessage("Status paket diperbarui.");}catch(e){setMessage(e instanceof Error?e.message:"Gagal menyimpan.");}finally{setBusy(false);}
 }
 return <div className="space-y-5">
  <div><h1 className="text-2xl font-semibold">Daftar Boosting & Harga</h1><p className="mt-1 text-sm text-zinc-400">Masukkan daftar paket satu kali. Ketika admin membuat pesanan manual, memilih paket akan mengisi nama dan harga otomatis. Harga Sheet dan mutasi lama tidak ditimpa.</p></div>
  <form onSubmit={submit} className="cp-card grid gap-4 p-5 md:grid-cols-2">
   <h2 className="text-lg font-semibold md:col-span-2">{editing?"Ubah Paket":"Tambah Paket Boosting"}</h2>
   <label className="text-sm">Permainan<select required value={gameId} onChange={e=>setGameId(e.target.value)} className={input}><option value="">Pilih permainan</option>{games.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
   <label className="text-sm">Nama paket boosting<input required maxLength={180} value={name} onChange={e=>setName(e.target.value)} placeholder="Contoh: Level 1–60 / Paket 7 Hari" className={input}/></label>
   <label className="text-sm">Harga default (Rp)<input required type="number" step="1" min="0" value={rate} onChange={e=>setRate(e.target.value)} className={input}/></label>
   <div className="flex items-end gap-2"><button disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2.5 font-semibold text-black disabled:opacity-50">{busy?"Menyimpan...":"Simpan paket"}</button>{editing?<button type="button" onClick={()=>{setEditing(null);setName("");setRate("");}} className="rounded-lg bg-zinc-800 px-4 py-2.5">Batal</button>:null}</div>
  </form>
  {message?<p role="status" className="text-sm text-yellow-300">{message}</p>:null}
  <section className="cp-card p-5"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">Paket terdaftar ({plans.length})</h2><input aria-label="Cari paket" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari game atau paket" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/></div>
   <div className="mt-4 space-y-2">{filtered.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 p-3"><div><p className="font-semibold">{p.name} {!p.active?<span className="text-xs text-zinc-500">(Nonaktif)</span>:null}</p><p className="text-sm text-zinc-400">{games.find(g=>g.id===p.gameId)?.name??"Game sudah tidak aktif"} · <strong className="text-emerald-300">{formatMoney(p.rateMinor)}</strong></p></div><div className="flex gap-2"><button disabled={busy} onClick={()=>{setEditing(p.id);setName(p.name);setRate(String(p.rateMinor));setGameId(p.gameId);window.scrollTo({top:0,behavior:"smooth"});}} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm">Edit</button><button disabled={busy} onClick={()=>void toggle(p.id)} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm">{p.active?"Nonaktifkan":"Aktifkan"}</button></div></div>)}{!filtered.length?<p className="text-sm text-zinc-500">Belum ada paket pada pencarian ini.</p>:null}</div>
  </section>
 </div>;
}

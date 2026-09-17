"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
import { useCallback, useEffect, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { useCurrency } from "@/components/CurrencyProvider";

type Payment = { id: string; user_id: string; provider: string; status: string; amount_idr: number | string; charge_currency: string; charge_amount: number | string; provider_order_id: string | null; provider_capture_id: string | null; created_at: string; review_reason: string | null };
export default function AdminWalletPayments() {
  const { formatIdrPrice } = useCurrency();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("all");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { const data = await authenticatedFetchJson<{ payments: Payment[] }>("/api/admin/wallet-payments"); setPayments(data.payments); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat pembayaran."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="rounded-2xl border border-white/10 bg-slate-950 p-6 my-6"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-xl font-bold">Pembayaran otomatis CPWallet</h2><p className="text-sm text-slate-400 mt-2">Isi saldo yang dikonfirmasi penyedia dikreditkan secara otomatis. Tinjau pembayaran yang ditandai menggunakan referensi penyedia yang tersimpan.</p></div><button className="rounded-lg border border-white/20 px-4 py-2 text-sm" onClick={() => void load()} disabled={busy}>Muat Ulang</button></div><label className="block my-4 text-sm">Status pembayaran <select className="ml-3 rounded-lg bg-slate-800 p-2" value={status} onChange={event => setStatus(event.target.value)}>{["all","starting","pending","credited","review"].map(value => <option key={value} value={value}>{adminLabel(value)}</option>)}</select></label>{error && <p role="alert" className="text-red-300">{adminText(error)}</p>}<div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="text-slate-400"><tr>{["Referensi / akun", "Tagihan penyedia", "Penambahan saldo dompet", "Status", "Referensi penyedia"].map(label => <th key={label} className="py-3 pr-5">{label}</th>)}</tr></thead><tbody>{payments.filter(p => status === "all" || p.status === status).map(p => <tr className="border-t border-white/10" key={p.id}><td className="py-4 pr-5"><div className="font-mono text-xs">{p.id}</div><div className="text-xs text-slate-400 mt-1">Akun: {p.user_id}</div><div className="text-xs text-slate-400 mt-1">{new Date(p.created_at).toLocaleString("id-ID")}</div></td><td className="pr-5">{p.provider.toUpperCase()}<br />{p.charge_currency} {Number(p.charge_amount).toLocaleString("id-ID")}</td><td className="pr-5">{formatIdrPrice(p.amount_idr)}</td><td className="pr-5"><strong className={p.status === "review" ? "text-red-300" : "text-cyan-200"}>{adminLabel(p.status)}</strong>{p.review_reason && <p className="text-xs mt-1">{adminText(p.review_reason)}</p>}</td><td className="font-mono text-xs">{p.provider_order_id || "Belum diterbitkan"}<br />{p.provider_capture_id || ""}</td></tr>)}</tbody></table>{!payments.length && <p className="text-slate-400 py-8">{busy ? "Memuat pembayaran…" : "Belum ada pembayaran otomatis CPWallet."}</p>}</div></section>;
}

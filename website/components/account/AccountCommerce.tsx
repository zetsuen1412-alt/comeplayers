"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FaWallet, FaBox, FaTruck, FaCheckCircle, FaClock } from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { useCurrency } from "@/components/CurrencyProvider";
type Overview = { wallet: { balance: number | string; pending_balance: number | string }; counts: Record<string, number>; recentOrders: Array<{ id: number; product_title: string; product: string; total_amount: number | string; total_price: number | string; status: string; bucket: string }> };
const stages = [{ key: "awaiting", title: "To pay", icon: FaClock }, { key: "processing", title: "Processing", icon: FaBox }, { key: "delivered", title: "Delivered", icon: FaTruck }, { key: "completed", title: "Completed", icon: FaCheckCircle }];
export default function AccountCommerce() {
  const { formatIdrPrice, formatIdrAmount } = useCurrency();
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setBusy(true); try { setData(await authenticatedFetchJson<Overview>("/api/account/commerce")); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load your balance and orders."); } finally { setBusy(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <section aria-label="Wallet and order overview" className="mb-8 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-emerald-400/25 bg-emerald-950/40 p-6">
      <div><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-300"><FaWallet /> CPWallet</span><p className="mt-3 text-3xl font-bold text-white">{data ? formatIdrPrice(Number(data.wallet.balance)) : "—"}</p><p className="mt-2 text-xs text-slate-400">{data ? formatIdrAmount(Number(data.wallet.balance)) + " recorded balance. " : ""}Approved refunds return to CPWallet.</p></div>
      <div className="flex flex-wrap gap-3"><Link href="/wallet/topup" className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-black">Top up</Link><Link href="/wallet" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold">Balance activity</Link></div>
    </div>
    <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-5">
      <div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">My orders</h2><Link href="/orders" className="text-sm text-yellow-300">View all →</Link></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{stages.map(stage => <Link key={stage.key} href="/orders" className="rounded-xl border border-white/10 p-4 hover:border-yellow-400/50"><stage.icon className="mb-3 text-slate-400" /><p className="text-2xl font-bold">{data?.counts[stage.key] ?? "—"}</p><p className="mt-1 text-sm text-slate-400">{stage.title}</p></Link>)}</div>
      {data?.recentOrders.length ? <div className="mt-5 divide-y divide-white/10">{data.recentOrders.map(order => <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{order.product_title || order.product || "Marketplace order"}</p><p className="mt-1 text-xs text-slate-400">#{order.id} · {stages.find(stage => stage.key === order.bucket)?.title || order.status}</p></div><span className="shrink-0 text-sm font-semibold text-yellow-300">{formatIdrPrice(Number(order.total_amount) || Number(order.total_price) || 0)}</span></Link>)}</div> : data ? <p className="mt-5 text-sm text-slate-400">Your first order will appear here.</p> : null}
    </div>
    {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}<button type="button" disabled={busy} onClick={() => void load()} className="text-xs text-slate-400 hover:text-white disabled:opacity-50">{busy ? "Refreshing…" : "Refresh balance and orders"}</button>
  </section>;
}

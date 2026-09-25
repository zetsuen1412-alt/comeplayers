"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FaArrowDown, FaArrowUp, FaPlus, FaSyncAlt, FaWallet } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { walletTransactionLabel } from "@/lib/cpWallet";
import WalletCurrencySelect from "./WalletCurrencySelect";

type Transaction = { id: number; order_id: number | null; type: string; amount: number | string; balance_before: number | string; balance_after: number | string; status: string; description: string; created_at: string };
type Overview = { wallet: { balance: number | string; pending_balance: number | string; total_earned: number | string; total_spent: number | string; total_withdrawn: number | string; status: string }; transactions: Transaction[]; nextCursor: number | null };

export default function WalletDashboard() {
  const { currency, locale, formatIdrPrice, formatIdrAmount, rateSource, rateUpdatedAt } = useCurrency();
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const load = useCallback(async (cursor?: number) => {
    setBusy(true); setError("");
    try {
      const next = await authenticatedFetchJson<Overview>(`/api/wallet/overview${cursor ? `?before=${cursor}` : ""}`);
      setData(previous => cursor && previous ? { ...next, transactions: [...previous.transactions, ...next.transactions.filter(tx => !previous.transactions.some(old => old.id === tx.id))] } : next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load CPWallet."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(async () => { await load(); }, { topics: 'account' });
  const transactions = (data?.transactions || []).filter(tx => filter === "all" || (filter === "refunds" ? ["order_refund", "refund"].includes(tx.type) : filter === "topups" ? ["deposit", "topup"].includes(tx.type) : ["purchase", "buyer_order_payment"].includes(tx.type)));
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <main className="cpw">
    <div className="cpw-header"><div><span className="cpw-kicker">Your ComePlayers balance</span><h1>CPWallet</h1><p className="cpw-subtle">Top up once. Shop with your balance. Keep approved refunds ready for your next purchase.</p></div><WalletCurrencySelect /></div>
    {error && <div role="alert" className="cpw-alert">{error} <Link href="/login">Sign in</Link> or <button className="cpw-secondary" onClick={() => void load()} disabled={busy}>Try again</button></div>}
    {busy && !data ? <div role="status" className="cpw-loading">Loading your CPWallet…</div> : data ? <>
      {data.wallet.status !== "active" && <div role="status" className="cpw-alert">Your CPWallet is frozen. Purchases and new top-ups are paused. Your recorded balance is preserved; contact support for a review.</div>}
      <div className="cpw-grid"><section>
        <div className="cpw-card cpw-balance"><div className="cpw-balance-label"><span><FaWallet /> Available balance</span><span className="cpw-pill" data-status={data.wallet.status}>{data.wallet.status}</span></div>
          <div className="cpw-amount">{formatIdrPrice(data.wallet.balance)}</div>
          <div className="cpw-info">{currency === "IDR" ? "Ready to spend in the marketplace" : `Estimated in ${currency} · Recorded balance ${formatIdrAmount(data.wallet.balance)} (IDR)`}</div>
          <div className="cpw-actions"><Link className="cpw-button" href="/wallet/topup"><FaPlus /> Add funds</Link><Link className="cpw-secondary" href="/">Shop marketplace</Link></div>
        </div>
        <div className="cpw-stats"><div className="cpw-stat"><span>Pending earnings</span><strong>{formatIdrPrice(data.wallet.pending_balance)}</strong></div><div className="cpw-stat"><span>Total earned</span><strong>{formatIdrPrice(data.wallet.total_earned)}</strong></div><div className="cpw-stat"><span>Total spent</span><strong>{formatIdrPrice(data.wallet.total_spent)}</strong></div></div>
        {currency !== "IDR" && <p className="cpw-live">Display rates: {rateSource === "live" ? `latest available${rateUpdatedAt ? ` · ${rateUpdatedAt}` : ""}` : "backup estimate"}. Changing currency does not exchange or change your recorded balance.</p>}
      </section><aside className="cpw-card"><h2>A simpler way to pay</h2><ol className="cpw-list"><li>Add funds with PayPal or an available DOKU payment method.</li><li>Select CPWallet at checkout to pay from your available balance.</li><li>View every credit and debit in your activity below.</li></ol><p className="cpw-refund-note"><strong>Refunds return here.</strong><br />Approved product refunds are credited to CPWallet after review, regardless of the original payment method.</p><p className="cpw-info">Pending seller earnings become spendable after order completion. Existing withdrawal rules still apply.</p><Link className="cpw-secondary" href="/seller/payouts">Manage withdrawals</Link></aside></div>
      <section className="cpw-card cpw-activity"><div className="cpw-section-head"><h2>Wallet activity</h2><button className="cpw-secondary" aria-label="Refresh wallet activity" onClick={() => void load()} disabled={busy}><FaSyncAlt /> Refresh</button></div>
        <div className="cpw-tabs" aria-label="Filter wallet activity">{[["all", "All activity"], ["topups", "Top-ups"], ["purchases", "Purchases"], ["refunds", "Refunds"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        {transactions.length ? <ul className="cpw-transactions">{transactions.map(tx => {
          const delta = Number(tx.balance_after) - Number(tx.balance_before);
          const completed = tx.status === "completed";
          return <li className="cpw-transaction" key={tx.id}><span className="cpw-transaction-icon" aria-hidden="true">{delta < 0 ? <FaArrowUp /> : <FaArrowDown />}</span><div className="cpw-transaction-main"><strong>{walletTransactionLabel(tx.type)}</strong><p>{tx.description}</p><p>{date(tx.created_at)} · Reference #{tx.id}{tx.order_id ? <> · <Link href={`/orders/${tx.order_id}`}>Order #{tx.order_id}</Link></> : null}</p><span className="cpw-pill" data-status={tx.status}>{tx.status}</span></div><div className="cpw-transaction-amount">{completed ? `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatIdrPrice(Math.abs(delta))}` : formatIdrPrice(Math.abs(Number(tx.amount)))}<small>{completed ? `Balance ${formatIdrPrice(tx.balance_after)}` : "No completed balance change"}</small></div></li>;
        })}</ul> : <div className="cpw-empty">No {filter === "all" ? "wallet activity" : filter} to show yet.<br />Your top-ups, purchases, and refunds will appear here.</div>}
        {data.nextCursor && <div className="cpw-actions"><button className="cpw-secondary" disabled={busy} onClick={() => void load(data.nextCursor!)}>{busy ? "Loading…" : "Load older activity"}</button></div>}
      </section>
    </> : null}
  </main>;
}

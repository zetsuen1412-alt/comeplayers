"use client";

import Link from "next/link";
import { FaArrowRight, FaBoxOpen, FaCheckCircle, FaClock, FaDownload, FaLifeRing, FaShoppingBag, FaSyncAlt, FaUsers, FaWallet } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";

export type AdminOverview = {
  profile: { username?: string | null; email?: string | null };
  snapshotAt: string;
  ledgerCurrency: "IDR";
  metrics: { users: number; products: number; orders: number; completedOrders: number; paidOrders: number; pendingSellerApplications: number; activeDisputes: number; pendingWithdrawals: number; supportQueue: number; grossVolume: number; feeRevenue: number; walletBalance: number; walletCount: number; topupsForReview: number; manualTopupsPending: number };
  recentOrders: Array<{ id: number; product_title?: string | null; product?: string | null; total_amount?: string | number | null; total_price?: string | number | null; status?: string | null; payment_status?: string | null; created_at?: string | null }>;
};

export function adminStatus(value?: string | null) {
  const status = String(value || "pending").toLowerCase();
  const tone = ["paid", "completed", "released", "success"].includes(status) ? "success" : ["refunded", "failed", "cancelled", "expired", "disputed"].includes(status) ? "muted" : "pending";
  return { label: status.replaceAll("_", " "), tone };
}

export default function AdminOverview({ overview, refreshing, refresh }: { overview: AdminOverview; refreshing: boolean; refresh: () => Promise<void>; error?: string }) {
  const { currency, locale, formatIdrPrice } = useCurrency();
  const m = overview.metrics;
  const count = (value: number) => Number(value).toLocaleString(locale);
  const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
  const queues = [
    { label: "Disputes to resolve", count: m.activeDisputes, href: "/admin/disputes", detail: "Review buyer and seller evidence" },
    { label: "Withdrawals to review", count: m.pendingWithdrawals, href: "/admin/withdrawals", detail: "Verify requests before payout" },
    { label: "CPWallet payment reviews", count: m.topupsForReview + m.manualTopupsPending, href: "/admin/wallet-topups", detail: "Flagged payments and manual requests" },
    { label: "Seller applications", count: m.pendingSellerApplications, href: "/admin/seller-applications", detail: "Verify new marketplace sellers" },
    { label: "Support tickets", count: m.supportQueue, href: "/admin/support", detail: "Help customers waiting for a response" },
  ];
  const attention = queues.reduce((sum, item) => sum + item.count, 0);
  function exportSnapshot() {
    const rows = [["Metric", "Value", "Currency / unit"], ["Completed sales", m.grossVolume, "IDR"], ["Completed order fees", m.feeRevenue, "IDR"], ["CPWallet balances", m.walletBalance, "IDR"], ["All orders", m.orders, "orders"], ["Completed orders", m.completedOrders, "orders"], ["Customers and users", m.users, "accounts"], ["Products", m.products, "products"], ["Snapshot UTC", overview.snapshotAt, "UTC"]];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `comeplayers-overview-${overview.snapshotAt.slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <main>
    <div className="adm-page-heading"><div><span className="adm-eyebrow">BUSINESS OVERVIEW</span><h1>Your marketplace, at a glance.</h1><p>Orders, balances and the work that needs your attention.</p></div><div className="adm-actions"><button className="adm-button secondary" onClick={() => void refresh()} disabled={refreshing}><FaSyncAlt className={refreshing ? "adm-spinning" : ""} />{refreshing ? "Refreshing…" : "Refresh"}</button><button className="adm-button" onClick={exportSnapshot}><FaDownload /> Export snapshot</button></div></div>
    <div className="adm-snapshot-note"><span><FaClock /> Updated {date(overview.snapshotAt)}</span><span>All-time totals · Display: {currency}{currency !== "IDR" ? " · Converted from IDR" : ""}</span></div>
    <section className="adm-financial-grid" aria-label="Financial overview">
      <article className="adm-metric"><span>Completed sales</span><strong>{formatIdrPrice(m.grossVolume)}</strong><small>{count(m.completedOrders)} completed, paid orders</small><Link href="/admin/finance">View finances <FaArrowRight /></Link></article>
      <article className="adm-metric"><span>Marketplace fees</span><strong>{formatIdrPrice(m.feeRevenue)}</strong><small>Fees from completed orders</small><Link href="/admin/finance">View breakdown <FaArrowRight /></Link></article>
      <article className="adm-metric adm-wallet-metric"><span><FaWallet /> CPWallet balances</span><strong>{formatIdrPrice(m.walletBalance)}</strong><small>Customer funds across {count(m.walletCount)} wallets</small><Link href="/admin/wallet">Manage CPWallet <FaArrowRight /></Link></article>
    </section>
    <section className="adm-counts" aria-label="Marketplace totals">{[
      { label: "Total orders", value: m.orders, icon: FaShoppingBag, href: "/admin/orders" },
      { label: "Paid orders in progress", value: m.paidOrders, icon: FaClock, href: "/admin/orders" },
      { label: "Customers & users", value: m.users, icon: FaUsers, href: "/admin/users" },
      { label: "Products", value: m.products, icon: FaBoxOpen, href: "/admin/products" },
    ].map(item => <Link key={item.label} href={item.href}><item.icon /><div><strong>{count(item.value)}</strong><span>{item.label}</span></div><FaArrowRight /></Link>)}</section>
    <div className="adm-overview-grid"><section className="adm-panel adm-orders"><div className="adm-panel-heading"><div><h2>Recent orders</h2><p>The latest activity across your marketplace.</p></div><Link href="/admin/orders">All orders <FaArrowRight /></Link></div><div className="adm-table-scroll"><table><caption className="adm-sr">Latest marketplace orders. Amounts shown in {currency}.</caption><thead><tr><th>Order / product</th><th>Status</th><th>Date</th><th className="adm-number">Amount</th></tr></thead><tbody>{overview.recentOrders.map(order => {
      const status = adminStatus(order.status || order.payment_status);
      return <tr key={order.id}><td><Link href={`/orders/${order.id}`}><strong>#{order.id}</strong><span title={order.product_title || order.product || ""}>{order.product_title || order.product || "Marketplace order"}</span></Link></td><td><span className={`adm-status ${status.tone}`}>{status.label}</span></td><td className="adm-date">{date(order.created_at)}</td><td className="adm-number">{formatIdrPrice(Number(order.total_amount) || Number(order.total_price) || 0)}</td></tr>;
    })}</tbody></table>{overview.recentOrders.length === 0 && <div className="adm-empty"><FaShoppingBag /><h3>No orders yet</h3><p>New marketplace orders will appear here.</p></div>}</div><div className="adm-panel-foot">Unpaid, expired and refunded orders are excluded from completed sales.</div></section>
    <section className="adm-panel adm-attention"><div className="adm-panel-heading"><div><h2>Needs attention</h2><p>Keep daily operations moving.</p></div><span className="adm-count-badge">{attention}</span></div>{attention === 0 && <div className="adm-clear-queue"><FaCheckCircle /><span>No items waiting in these queues.</span></div>}<div className="adm-queue">{queues.map(item => <Link key={item.href} href={item.href}><div><strong>{item.label}</strong><small>{item.detail}</small></div><span className={item.count > 0 ? "has-items" : ""}>{count(item.count)}</span><FaArrowRight /></Link>)}</div></section></div>
    <section className="adm-workspace-links" aria-label="Quick access"><Link href="/admin/products"><FaBoxOpen /><div><strong>Manage catalog</strong><span>Products, availability and pricing</span></div><FaArrowRight /></Link><Link href="/admin/wallet-topups"><FaWallet /><div><strong>CPWallet payments</strong><span>Confirmed top-ups and payment reviews</span></div><FaArrowRight /></Link><Link href="/admin/support"><FaLifeRing /><div><strong>Customer support</strong><span>Tickets, questions and resolutions</span></div><FaArrowRight /></Link></section>
    <p className="adm-footnote">Financial records use IDR. {currency !== "IDR" && "Converted amounts follow your display preference and exchange rate. "}CPWallet balances are customer funds, separate from marketplace revenue.</p>
  </main>;
}

"use client";

import { adminLabel } from "@/lib/adminLocale";
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
  return { label: adminLabel(status), tone };
}

export default function AdminOverview({ overview, refreshing, refresh }: { overview: AdminOverview; refreshing: boolean; refresh: () => Promise<void>; error?: string }) {
  const { currency, formatIdrPrice } = useCurrency();
  const m = overview.metrics;
  const count = (value: number) => Number(value).toLocaleString("id-ID");
  const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("id-ID", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
  const queues = [
    { label: "Sengketa yang perlu diselesaikan", count: m.activeDisputes, href: "/admin/disputes", detail: "Tinjau bukti pembeli dan penjual" },
    { label: "Penarikan yang perlu ditinjau", count: m.pendingWithdrawals, href: "/admin/withdrawals", detail: "Verifikasi permintaan sebelum pencairan" },
    { label: "Peninjauan pembayaran CPWallet", count: m.topupsForReview + m.manualTopupsPending, href: "/admin/wallet-topups", detail: "Pembayaran ditandai dan permintaan manual" },
    { label: "Pengajuan penjual", count: m.pendingSellerApplications, href: "/admin/seller-applications", detail: "Verifikasi penjual marketplace baru" },
    { label: "Tiket bantuan", count: m.supportQueue, href: "/admin/support", detail: "Bantu pelanggan yang menunggu tanggapan" },
  ];
  const attention = queues.reduce((sum, item) => sum + item.count, 0);
  function exportSnapshot() {
    const rows = [["Indikator", "Nilai", "Mata uang / satuan"], ["Penjualan selesai", m.grossVolume, "IDR"], ["Biaya pesanan selesai", m.feeRevenue, "IDR"], ["Saldo CPWallet", m.walletBalance, "IDR"], ["Semua pesanan", m.orders, "pesanan"], ["Pesanan selesai", m.completedOrders, "pesanan"], ["Pelanggan dan pengguna", m.users, "akun"], ["Produk", m.products, "produk"], ["Waktu ringkasan UTC", overview.snapshotAt, "UTC"]];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `comeplayers-overview-${overview.snapshotAt.slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <main>
    <div className="adm-page-heading"><div><span className="adm-eyebrow">RINGKASAN USAHA</span><h1>Ringkasan marketplace Anda.</h1><p>Pesanan, saldo, dan pekerjaan yang memerlukan perhatian Anda.</p></div><div className="adm-actions"><button className="adm-button secondary" onClick={() => void refresh()} disabled={refreshing}><FaSyncAlt className={refreshing ? "adm-spinning" : ""} />{refreshing ? "Memperbarui…" : "Muat Ulang"}</button><button className="adm-button" onClick={exportSnapshot}><FaDownload /> Ekspor ringkasan</button></div></div>
    <div className="adm-snapshot-note"><span><FaClock /> Diperbarui {date(overview.snapshotAt)}</span><span>Total keseluruhan · Tampilan: {currency}{currency !== "IDR" ? " · Dikonversi dari IDR" : ""}</span></div>
    <section className="adm-financial-grid" aria-label={"Ringkasan keuangan"}>
      <article className="adm-metric"><span>Penjualan selesai</span><strong>{formatIdrPrice(m.grossVolume)}</strong><small>{count(m.completedOrders)} pesanan selesai dan dibayar</small><Link href="/admin/finance">Lihat keuangan <FaArrowRight /></Link></article>
      <article className="adm-metric"><span>Biaya marketplace</span><strong>{formatIdrPrice(m.feeRevenue)}</strong><small>Biaya dari pesanan selesai</small><Link href="/admin/finance">Lihat perincian <FaArrowRight /></Link></article>
      <article className="adm-metric adm-wallet-metric"><span><FaWallet /> Saldo CPWallet</span><strong>{formatIdrPrice(m.walletBalance)}</strong><small>Dana pelanggan pada {count(m.walletCount)} dompet</small><Link href="/admin/wallet">Kelola CPWallet <FaArrowRight /></Link></article>
    </section>
    <section className="adm-counts" aria-label={"Total marketplace"}>{[
      { label: "Total pesanan", value: m.orders, icon: FaShoppingBag, href: "/admin/orders" },
      { label: "Pesanan dibayar sedang diproses", value: m.paidOrders, icon: FaClock, href: "/admin/orders" },
      { label: "Pelanggan & pengguna", value: m.users, icon: FaUsers, href: "/admin/users" },
      { label: "Produk", value: m.products, icon: FaBoxOpen, href: "/admin/products" },
    ].map(item => <Link key={item.label} href={item.href}><item.icon /><div><strong>{count(item.value)}</strong><span>{item.label}</span></div><FaArrowRight /></Link>)}</section>
    <div className="adm-overview-grid"><section className="adm-panel adm-orders"><div className="adm-panel-heading"><div><h2>Pesanan terbaru</h2><p>Aktivitas terbaru di marketplace Anda.</p></div><Link href="/admin/orders">Semua pesanan <FaArrowRight /></Link></div><div className="adm-table-scroll"><table><caption className="adm-sr">Pesanan marketplace terbaru. Nominal ditampilkan dalam {currency}.</caption><thead><tr><th>Pesanan / produk</th><th>Status</th><th>Tanggal</th><th className="adm-number">Jumlah</th></tr></thead><tbody>{overview.recentOrders.map(order => {
      const status = adminStatus(order.status || order.payment_status);
      return <tr key={order.id}><td><Link href={`/orders/${order.id}`}><strong>#{order.id}</strong><span title={order.product_title || order.product || ""}>{order.product_title || order.product || "Pesanan marketplace"}</span></Link></td><td><span className={`adm-status ${status.tone}`}>{status.label}</span></td><td className="adm-date">{date(order.created_at)}</td><td className="adm-number">{formatIdrPrice(Number(order.total_amount) || Number(order.total_price) || 0)}</td></tr>;
    })}</tbody></table>{overview.recentOrders.length === 0 && <div className="adm-empty"><FaShoppingBag /><h3>Belum ada pesanan</h3><p>Pesanan marketplace baru akan muncul di sini.</p></div>}</div><div className="adm-panel-foot">Pesanan belum dibayar, kedaluwarsa, dan dikembalikan dananya tidak termasuk penjualan selesai.</div></section>
    <section className="adm-panel adm-attention"><div className="adm-panel-heading"><div><h2>Perlu perhatian</h2><p>Pastikan operasional harian berjalan lancar.</p></div><span className="adm-count-badge">{attention}</span></div>{attention === 0 && <div className="adm-clear-queue"><FaCheckCircle /><span>Tidak ada hal yang menunggu dalam antrean ini.</span></div>}<div className="adm-queue">{queues.map(item => <Link key={item.href} href={item.href}><div><strong>{item.label}</strong><small>{item.detail}</small></div><span className={item.count > 0 ? "has-items" : ""}>{count(item.count)}</span><FaArrowRight /></Link>)}</div></section></div>
    <section className="adm-workspace-links" aria-label={"Akses cepat"}><Link href="/admin/products"><FaBoxOpen /><div><strong>Kelola katalog</strong><span>Produk, ketersediaan, dan harga</span></div><FaArrowRight /></Link><Link href="/admin/wallet-topups"><FaWallet /><div><strong>Pembayaran CPWallet</strong><span>Isi saldo terkonfirmasi dan peninjauan pembayaran</span></div><FaArrowRight /></Link><Link href="/admin/support"><FaLifeRing /><div><strong>Bantuan pelanggan</strong><span>Tiket, pertanyaan, dan penyelesaian</span></div><FaArrowRight /></Link></section>
    <p className="adm-footnote">Catatan keuangan menggunakan IDR. {currency !== "IDR" && "Nominal konversi mengikuti pilihan tampilan dan kurs Anda. "}Saldo CPWallet merupakan dana pelanggan, terpisah dari pendapatan marketplace.</p>
  </main>;
}

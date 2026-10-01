import { FaChartLine, FaShoppingBag, FaCube, FaUsers, FaStore, FaGamepad, FaTags, FaTicketAlt, FaWallet, FaMoneyBillWave, FaBalanceScale, FaCalculator, FaLifeRing, FaBullhorn, FaShieldAlt, FaClipboardList, FaCog, FaCommentDots, FaBell, FaBolt, FaLayerGroup } from "react-icons/fa";

export const adminNavigation = [
  { label: "Ruang kerja", items: [
    { href: "/admin", label: "Ringkasan", icon: FaChartLine },
    { href: "/admin/orders", label: "Pesanan", icon: FaShoppingBag },
    { href: "/admin/products", label: "Produk", icon: FaCube },
    { href: "/admin/users", label: "Pelanggan & pengguna", icon: FaUsers },
    { href: "/admin/seller-applications", label: "Pengajuan penjual", icon: FaStore },
  ] },
  { label: "Keuangan", items: [
    { href: "/admin/wallet", label: "Saldo CPWallet", icon: FaWallet },
    { href: "/admin/wallet-topups", label: "Pembayaran CPWallet", icon: FaMoneyBillWave },
    { href: "/admin/withdrawals", label: "Penarikan Dana", icon: FaMoneyBillWave },
    { href: "/admin/finance", label: "Ringkasan keuangan", icon: FaChartLine },
    { href: "/admin/reconciliation", label: "Rekonsiliasi", icon: FaBalanceScale },
    { href: "/admin/payroll", label: "Penggajian & operasional", icon: FaCalculator },
  ] },
  { label: "Katalog & pertumbuhan", items: [
    { href: "/admin/games", label: "Gim", icon: FaGamepad },
    { href: "/admin/categories", label: "Kategori", icon: FaTags },
    { href: "/admin/category-mapping", label: "Pemetaan kategori", icon: FaLayerGroup },
    { href: "/admin/coupons", label: "Kupon", icon: FaTicketAlt },
    { href: "/admin/coupon-analytics", label: "Analisis kupon", icon: FaChartLine },
    { href: "/admin/flash-sales", label: "Promo kilat", icon: FaBolt },
    { href: "/admin/announcements", label: "Pengumuman", icon: FaBullhorn },
    { href: "/admin/lowongan", label: "Lowongan Facebook", icon: FaBullhorn },
  ] },
  { label: "Bantuan & kendali", items: [
    { href: "/admin/support", label: "Tiket bantuan", icon: FaLifeRing },
    { href: "/admin/disputes", label: "Sengketa & pengembalian dana", icon: FaBalanceScale },
    { href: "/admin/notifications", label: "Pemberitahuan", icon: FaBell },
    { href: "/admin/chat-moderation", label: "Moderasi percakapan", icon: FaCommentDots },
    { href: "/admin/operations", label: "Kendali platform", icon: FaCog },
    { href: "/admin/risk", label: "Kepercayaan & risiko", icon: FaShieldAlt },
    { href: "/admin/compliance", label: "Kepatuhan", icon: FaShieldAlt },
    { href: "/admin/audit-logs", label: "Log audit", icon: FaClipboardList },
  ] },
];

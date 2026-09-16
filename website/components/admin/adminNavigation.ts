import { FaChartLine, FaShoppingBag, FaCube, FaUsers, FaStore, FaGamepad, FaTags, FaTicketAlt, FaWallet, FaMoneyBillWave, FaBalanceScale, FaCalculator, FaLifeRing, FaBullhorn, FaShieldAlt, FaClipboardList, FaCog, FaCommentDots, FaBell, FaBolt, FaLayerGroup } from "react-icons/fa";

export const adminNavigation = [
  { label: "Workspace", items: [
    { href: "/admin", label: "Overview", icon: FaChartLine },
    { href: "/admin/orders", label: "Orders", icon: FaShoppingBag },
    { href: "/admin/products", label: "Products", icon: FaCube },
    { href: "/admin/users", label: "Customers & users", icon: FaUsers },
    { href: "/admin/seller-applications", label: "Seller applications", icon: FaStore },
  ] },
  { label: "Finance", items: [
    { href: "/admin/wallet", label: "CPWallet balances", icon: FaWallet },
    { href: "/admin/wallet-topups", label: "CPWallet payments", icon: FaMoneyBillWave },
    { href: "/admin/withdrawals", label: "Withdrawals", icon: FaMoneyBillWave },
    { href: "/admin/finance", label: "Financial overview", icon: FaChartLine },
    { href: "/admin/reconciliation", label: "Reconciliation", icon: FaBalanceScale },
    { href: "/admin/payroll", label: "Payroll & operations", icon: FaCalculator },
  ] },
  { label: "Catalog & growth", items: [
    { href: "/admin/games", label: "Games", icon: FaGamepad },
    { href: "/admin/categories", label: "Categories", icon: FaTags },
    { href: "/admin/category-mapping", label: "Category mapping", icon: FaLayerGroup },
    { href: "/admin/coupons", label: "Coupons", icon: FaTicketAlt },
    { href: "/admin/coupon-analytics", label: "Coupon analytics", icon: FaChartLine },
    { href: "/admin/flash-sales", label: "Flash sales", icon: FaBolt },
    { href: "/admin/announcements", label: "Announcements", icon: FaBullhorn },
  ] },
  { label: "Support & controls", items: [
    { href: "/admin/support", label: "Support tickets", icon: FaLifeRing },
    { href: "/admin/disputes", label: "Disputes & refunds", icon: FaBalanceScale },
    { href: "/admin/notifications", label: "Notifications", icon: FaBell },
    { href: "/admin/chat-moderation", label: "Chat moderation", icon: FaCommentDots },
    { href: "/admin/operations", label: "Platform controls", icon: FaCog },
    { href: "/admin/risk", label: "Trust & risk", icon: FaShieldAlt },
    { href: "/admin/compliance", label: "Compliance", icon: FaShieldAlt },
    { href: "/admin/audit-logs", label: "Audit log", icon: FaClipboardList },
  ] },
];

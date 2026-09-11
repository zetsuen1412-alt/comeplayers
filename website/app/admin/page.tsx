"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { IconType } from "react-icons";
import {
  FaAngleDown,
  FaArrowRight,
  FaBalanceScale,
  FaBars,
  FaBell,
  FaBoxOpen,
  FaBullhorn,
  FaCalculator,
  FaChartLine,
  FaCheckCircle,
  FaClipboardList,
  FaCommentDots,
  FaCube,
  FaDollarSign,
  FaExclamationTriangle,
  FaGamepad,
  FaGlobeAmericas,
  FaHome,
  FaLifeRing,
  FaMoneyBillWave,
  FaReceipt,
  FaRocket,
  FaSearch,
  FaShieldAlt,
  FaShoppingBag,
  FaStore,
  FaTags,
  FaTicketAlt,
  FaTimes,
  FaUserCheck,
  FaUsers,
  FaWallet,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type Overview = {
  profile: {
    email?: string | null;
    username?: string | null;
  };
  metrics: {
    users: number;
    products: number;
    orders: number;
    pendingSellerApplications: number;
    activeDisputes: number;
    pendingWithdrawals: number;
    supportQueue: number;
    grossVolume: number;
    feeRevenue: number;
  };
  recentOrders: Array<{
    id: number;
    product_title?: string | null;
    product?: string | null;
    total_amount?: number | string | null;
    total_price?: number | string | null;
    status?: string | null;
    payment_status?: string | null;
    created_at?: string | null;
  }>;
};

type NavItem = {
  href: string;
  label: string;
  icon: IconType;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navigation: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: FaHome }],
  },
  {
    label: "Marketplace",
    items: [
      { href: "/admin/users", label: "Users", icon: FaUsers },
      { href: "/admin/products", label: "Products", icon: FaCube },
      { href: "/admin/orders", label: "Orders", icon: FaShoppingBag },
      { href: "/admin/disputes", label: "Disputes", icon: FaExclamationTriangle },
      { href: "/admin/withdrawals", label: "Withdrawals", icon: FaMoneyBillWave },
      { href: "/admin/wallet-topups", label: "Wallet Top Ups", icon: FaWallet },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/admin/games", label: "Games", icon: FaGamepad },
      { href: "/admin/categories", label: "Categories", icon: FaTags },
      { href: "/admin/coupons", label: "Coupons", icon: FaTicketAlt },
      { href: "/admin/announcements", label: "Announcements", icon: FaBullhorn },
      { href: "/admin/support", label: "Support Tickets", icon: FaLifeRing },
      { href: "/admin/seller-applications", label: "Sellers", icon: FaStore },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/finance", label: "Finance Overview", icon: FaChartLine },
      { href: "/admin/payroll", label: "Payroll", icon: FaCalculator },
      { href: "/admin/reconciliation", label: "Reconciliation", icon: FaBalanceScale },
      { href: "/admin/audit-logs", label: "Reports & Logs", icon: FaClipboardList },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/operations", label: "Operations", icon: FaRocket },
      { href: "/admin/risk", label: "Trust & Risk", icon: FaShieldAlt },
      { href: "/admin/compliance", label: "Compliance", icon: FaUserCheck },
      { href: "/admin/chat-moderation", label: "Chat Moderation", icon: FaCommentDots },
    ],
  },
];

const quickActions: Array<NavItem & { accent: string }> = [
  { href: "/admin/games", label: "Add Game", icon: FaGamepad, accent: "text-violet-400" },
  { href: "/admin/products", label: "Add Product", icon: FaCube, accent: "text-yellow-300" },
  { href: "/admin/orders", label: "View Orders", icon: FaShoppingBag, accent: "text-cyan-300" },
  { href: "/admin/coupons", label: "New Coupon", icon: FaTicketAlt, accent: "text-fuchsia-400" },
  { href: "/admin/announcements", label: "Announcement", icon: FaBullhorn, accent: "text-purple-400" },
];

function prettyStatus(value?: string | null) {
  return String(value || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function orderAmount(order: Overview["recentOrders"][number]) {
  return order.total_amount ?? order.total_price ?? 0;
}

function statusStyle(status?: string | null) {
  const normalized = String(status || "pending").toLowerCase();

  if (["completed", "paid", "success", "released"].some((word) => normalized.includes(word))) {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }
  if (["failed", "cancelled", "refunded", "disputed"].some((word) => normalized.includes(word))) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  }
  return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
}

export default function AdminDashboardPage() {
  const { country, currency, formatPrice } = useCurrency();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    async function loadOverview() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (sessionError || !accessToken) {
          throw new Error("Please login with an administrator account.");
        }

        const response = await fetch("/api/admin/overview", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error || "Failed to load admin dashboard.");
        }

        setOverview(json);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load admin dashboard."
        );
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, []);

  const adminName = useMemo(() => {
    const rawName = overview?.profile.username || overview?.profile.email || "Alexia Admin";
    return rawName.includes("@") ? rawName.split("@")[0] : rawName;
  }, [overview]);

  if (loading) {
    return <AdminLoading />;
  }

  if (!overview) {
    return <AdminError error={error} />;
  }

  const metrics = overview.metrics;
  const metricCards = [
    { label: "Total Users", value: metrics.users.toLocaleString("en-US"), icon: FaUsers, accent: "cyan" },
    { label: "Total Products", value: metrics.products.toLocaleString("en-US"), icon: FaCube, accent: "violet" },
    { label: "Total Orders", value: metrics.orders.toLocaleString("en-US"), icon: FaShoppingBag, accent: "emerald" },
    { label: "Gross Volume", value: formatPrice(metrics.grossVolume), icon: FaDollarSign, accent: "yellow" },
    { label: "Fee Revenue", value: formatPrice(metrics.feeRevenue), icon: FaReceipt, accent: "emerald" },
    { label: "Seller Applications", value: String(metrics.pendingSellerApplications), icon: FaUserCheck, accent: "blue" },
    { label: "Active Disputes", value: String(metrics.activeDisputes), icon: FaShieldAlt, accent: "indigo" },
    { label: "Support Queue", value: String(metrics.supportQueue), icon: FaLifeRing, accent: "cyan" },
  ] as const;

  const activityTotal = Math.max(metrics.users + metrics.products + metrics.orders, 1);
  const userShare = (metrics.users / activityTotal) * 100;
  const productShare = (metrics.products / activityTotal) * 100;
  const orderShare = 100 - userShare - productShare;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050812] text-white selection:bg-yellow-300 selection:text-black">
      <div
        className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition lg:hidden ${
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <AdminSidebar
        open={sidebarOpen}
        adminName={adminName}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="min-h-screen lg:pl-[238px]">
        <AdminTopbar
          country={country}
          currency={currency}
          adminName={adminName}
          onMenu={() => setSidebarOpen(true)}
        />

        <main className="px-4 pb-8 pt-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.28em] text-slate-500">
                  Home <span className="mx-2 text-slate-700">/</span> Dashboard
                </p>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Admin <span className="text-yellow-300">Dashboard</span>
                </h1>
              </div>
              <div className="flex gap-3">
                <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-[#0a101d] px-4 text-sm font-bold text-slate-200 transition hover:border-yellow-300/40">
                  Current snapshot <FaAngleDown className="text-xs text-slate-500" />
                </button>
                <Link
                  href="/admin/finance"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-yellow-300 px-4 text-sm font-black text-black shadow-[0_0_24px_rgba(250,204,21,.22)] transition hover:bg-yellow-200"
                >
                  <FaChartLine /> View Report
                </Link>
              </div>
            </div>

            <section className="grid gap-4 xl:grid-cols-[1.3fr_.85fr]">
              <div className="relative min-h-[160px] overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#07101f] shadow-[0_16px_50px_rgba(0,0,0,.3)]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(34,211,238,.18),transparent_34%),radial-gradient(circle_at_20%_100%,rgba(59,130,246,.16),transparent_38%),linear-gradient(110deg,#07101f_20%,#09162c_100%)]" />
                <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(34,211,238,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.12)_1px,transparent_1px)] [background-size:32px_32px]" />
                <div className="relative z-10 max-w-[62%] p-6 sm:p-8">
                  <p className="text-2xl font-black sm:text-3xl">
                    Welcome back, <span className="text-yellow-300">{adminName}!</span>
                  </p>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">
                    Here&apos;s what&apos;s happening with ComePlayers operations today.
                  </p>
                  <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)]" />
                    All systems operational
                  </div>
                </div>
                <Image
                  src="/home-v11/alexia-stacked.webp"
                  alt="Alexia ComePlayers administrator"
                  width={652}
                  height={1000}
                  priority
                  className="pointer-events-none absolute -bottom-24 right-2 z-10 h-[270px] w-auto object-contain drop-shadow-[0_16px_28px_rgba(0,0,0,.55)] sm:-bottom-32 sm:right-10 sm:h-[360px]"
                />
              </div>

              <div className="rounded-2xl border border-yellow-300/20 bg-[#0a0e17] p-5 shadow-[0_16px_50px_rgba(0,0,0,.24)]">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-black">
                    <span className="text-yellow-300">$</span> Quick Actions
                  </h2>
                  <FaRocket className="text-cyan-300" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-5">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Link
                        href={action.href}
                        key={action.href}
                        className="group flex min-h-[82px] flex-col items-center justify-center rounded-xl border border-white/10 bg-[#080d17] px-2 text-center transition hover:-translate-y-0.5 hover:border-yellow-300/40 hover:bg-yellow-300/[0.04]"
                      >
                        <Icon className={`text-xl ${action.accent} transition group-hover:scale-110`} />
                        <span className="mt-2 text-[11px] font-bold text-slate-300">{action.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metricCards.map((metric, index) => (
                <MetricCard key={metric.label} {...metric} index={index} />
              ))}
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.9fr_.75fr]">
              <RevenueSnapshot
                gross={metrics.grossVolume}
                fee={metrics.feeRevenue}
                formatPrice={formatPrice}
              />

              <div className="rounded-2xl border border-white/10 bg-[#090e18] p-5 shadow-[0_14px_42px_rgba(0,0,0,.22)]">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-black">Recent Orders</h2>
                  <Link href="/admin/orders" className="text-xs font-bold text-cyan-300 hover:text-cyan-200">
                    View all
                  </Link>
                </div>
                <div className="mt-4 space-y-2">
                  {overview.recentOrders.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
                      No orders yet.
                    </div>
                  ) : (
                    overview.recentOrders.slice(0, 5).map((order) => {
                      const effectiveStatus = order.payment_status || order.status;
                      return (
                        <Link
                          key={order.id}
                          href={`/orders/${order.id}`}
                          className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-xl border border-transparent px-2 py-2.5 transition hover:border-white/10 hover:bg-white/[0.025]"
                        >
                          <span className="grid h-9 w-9 place-items-center rounded-lg border border-violet-400/20 bg-violet-400/10 text-xs font-black text-violet-300">
                            #{String(order.id).slice(-2)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-slate-200">
                              {order.product_title || order.product || `Order #${order.id}`}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-slate-500">{formatDate(order.created_at)}</span>
                          </span>
                          <span className="text-right">
                            <span className="block text-xs font-black text-white">{formatPrice(orderAmount(order))}</span>
                            <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black ${statusStyle(effectiveStatus)}`}>
                              {prettyStatus(effectiveStatus)}
                            </span>
                          </span>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>

              <ActivityMix
                users={metrics.users}
                products={metrics.products}
                orders={metrics.orders}
                userShare={userShare}
                productShare={productShare}
                orderShare={orderShare}
              />
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_.7fr]">
              <div className="rounded-2xl border border-white/10 bg-[#090e18] p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-black">System Overview</h2>
                  <Link href="/admin/operations" className="text-xs font-bold text-cyan-300">View details</Link>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    ["Database", "Connected", FaBoxOpen],
                    ["Authentication", "Active", FaShieldAlt],
                    ["Admin API", "Operational", FaRocket],
                    ["Orders", `${metrics.orders} indexed`, FaShoppingBag],
                    ["Support", `${metrics.supportQueue} queued`, FaLifeRing],
                  ].map(([label, value, icon]) => {
                    const Icon = icon as IconType;
                    return (
                      <div key={String(label)} className="rounded-xl border border-white/[0.08] bg-[#070b13] p-3">
                        <Icon className="text-emerald-300" />
                        <p className="mt-2 text-xs font-bold text-slate-200">{String(label)}</p>
                        <p className="mt-1 text-[10px] text-emerald-300">{String(value)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#090e18] p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-black">Admin Session</h2>
                  <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">Live</span>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-yellow-300/30 bg-yellow-300/10">
                    <Image src="/home-v11/alexia-stacked.webp" alt="Alexia" width={652} height={1000} className="h-full w-full object-cover object-top" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-black">{adminName}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{overview.profile.email || "Administrator"}</p>
                  </div>
                </div>
                <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                  <FaGlobeAmericas className="text-cyan-300" /> {country} · {currency}
                </p>
              </div>
            </section>

            <footer className="mt-7 flex flex-col gap-2 border-t border-white/[0.08] py-5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p>© 2026 ComePlayers. All rights reserved.</p>
              <p>Operations Center v3.0</p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}

function AdminSidebar({
  open,
  adminName,
  onClose,
}: {
  open: boolean;
  adminName: string;
  onClose: () => void;
}) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-[238px] flex-col border-r border-white/10 bg-[#070b13] transition-transform duration-300 lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-[74px] items-center justify-between border-b border-white/[0.08] px-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-10 w-11 place-items-center rounded-xl bg-gradient-to-br from-white to-yellow-300 text-lg font-black italic text-black shadow-[0_0_22px_rgba(250,204,21,.16)]">CP</span>
          <span>
            <span className="block text-base font-black italic leading-none">Come<span className="text-yellow-300">Players</span></span>
            <span className="mt-1 block text-[8px] font-bold uppercase tracking-[0.23em] text-slate-500">Powered by EvoGaming</span>
          </span>
        </Link>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 lg:hidden" aria-label="Close navigation">
          <FaTimes />
        </button>
      </div>

      <div className="border-b border-white/[0.08] p-4">
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-500/10 to-transparent p-2">
          <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-yellow-300/30 bg-yellow-300/10">
            <Image src="/home-v11/alexia-stacked.webp" alt="Alexia administrator" width={652} height={1000} className="h-full w-full object-cover object-top" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{adminName}</p>
            <p className="mt-0.5 text-[10px] font-bold text-cyan-300">Super Administrator</p>
            <p className="mt-1 flex items-center gap-1.5 text-[9px] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Online
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin] [scrollbar-color:#1e293b_transparent]">
        {navigation.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                      active
                        ? "border border-yellow-300/30 bg-gradient-to-r from-yellow-300/20 to-yellow-300/[0.04] text-yellow-300 shadow-[inset_3px_0_0_#facc15]"
                        : "text-slate-400 hover:bg-white/[0.035] hover:text-white"
                    }`}
                  >
                    <Icon className={active ? "text-yellow-300" : "text-slate-500 transition group-hover:text-cyan-300"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3">
        <div className="rounded-xl border border-white/10 bg-[#090e18] p-3">
          <p className="flex items-center gap-2 text-[10px] font-black text-slate-300">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">●</span>
            System Status
          </p>
          <p className="mt-1 pl-7 text-[9px] text-emerald-300">All systems operational</p>
        </div>
      </div>
    </aside>
  );
}

function AdminTopbar({
  country,
  currency,
  adminName,
  onMenu,
}: {
  country: string;
  currency: string;
  adminName: string;
  onMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[74px] items-center gap-3 border-b border-white/10 bg-[#050812]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <button onClick={onMenu} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 lg:hidden" aria-label="Open navigation">
        <FaBars />
      </button>
      <div className="relative hidden max-w-xl flex-1 md:block">
        <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-500" />
        <input
          type="search"
          placeholder="Search games, products, users..."
          className="h-11 w-full rounded-xl border border-white/10 bg-[#080d17] pl-11 pr-16 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/40"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] text-slate-500">Ctrl /</span>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <button className="hidden h-10 items-center gap-2 rounded-xl border border-white/10 bg-[#0a101d] px-3 text-xs font-bold text-slate-200 sm:flex">
          <span className="text-base">🌐</span> {country} {currency} <FaAngleDown className="text-[9px] text-slate-500" />
        </button>
        <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[#0a101d] text-slate-300 transition hover:border-yellow-300/30 hover:text-yellow-300" aria-label="Notifications">
          <FaBell />
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-yellow-300 px-1 text-[9px] font-black text-black">3</span>
        </button>
        <Link href="/cpcommunity" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[#0a101d] text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-300" aria-label="Messages">
          <FaCommentDots />
        </Link>
        <div className="hidden items-center gap-3 border-l border-white/10 pl-3 sm:flex">
          <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-yellow-300/30 bg-yellow-300/10">
            <Image src="/home-v11/alexia-stacked.webp" alt="Admin profile" width={652} height={1000} className="h-full w-full object-cover object-top" />
          </div>
          <div className="hidden xl:block">
            <p className="max-w-32 truncate text-xs font-black">{adminName}</p>
            <p className="mt-0.5 text-[9px] text-slate-500">Super Admin</p>
          </div>
          <FaAngleDown className="hidden text-[10px] text-slate-500 xl:block" />
        </div>
      </div>
    </header>
  );
}

const metricAccent = {
  cyan: {
    border: "border-cyan-400/20",
    text: "text-cyan-300",
    bg: "bg-cyan-400/10",
    line: "text-cyan-400",
  },
  violet: {
    border: "border-violet-400/20",
    text: "text-violet-300",
    bg: "bg-violet-400/10",
    line: "text-violet-400",
  },
  emerald: {
    border: "border-emerald-400/20",
    text: "text-emerald-300",
    bg: "bg-emerald-400/10",
    line: "text-emerald-400",
  },
  yellow: {
    border: "border-yellow-300/20",
    text: "text-yellow-300",
    bg: "bg-yellow-300/10",
    line: "text-yellow-300",
  },
  blue: {
    border: "border-blue-400/20",
    text: "text-blue-300",
    bg: "bg-blue-400/10",
    line: "text-blue-400",
  },
  indigo: {
    border: "border-indigo-400/20",
    text: "text-indigo-300",
    bg: "bg-indigo-400/10",
    line: "text-indigo-400",
  },
} as const;

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
  index,
}: {
  label: string;
  value: string;
  icon: IconType;
  accent: keyof typeof metricAccent;
  index: number;
}) {
  const style = metricAccent[accent];
  const paths = [
    "M2 35 L12 31 L21 34 L31 20 L42 24 L52 12 L64 17 L76 7 L88 13 L98 5",
    "M2 34 L13 25 L24 29 L35 13 L47 17 L58 26 L69 19 L80 7 L91 11 L98 5",
    "M2 37 L12 31 L23 24 L35 27 L46 13 L57 18 L68 7 L79 12 L90 4 L98 8",
    "M2 24 L13 29 L24 19 L35 30 L46 15 L57 21 L68 9 L79 16 L90 5 L98 10",
  ];

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${style.border} bg-[#090e18] p-5 shadow-[0_12px_36px_rgba(0,0,0,.18)]`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${style.bg} ${style.text}`}><Icon /></span>
        <p className="text-xs font-bold text-slate-400">{label}</p>
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight text-white">{value}</p>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
        <FaCheckCircle className="text-emerald-300" /> Live total from operations API
      </p>
      <svg viewBox="0 0 100 42" className={`absolute bottom-4 right-4 h-10 w-24 opacity-90 ${style.line}`} aria-hidden="true">
        <path d={paths[index % paths.length]} fill="none" stroke="currentColor" strokeWidth="2" />
        <path d={`${paths[index % paths.length]} L98 42 L2 42 Z`} fill="currentColor" opacity="0.07" />
      </svg>
    </div>
  );
}

function RevenueSnapshot({
  gross,
  fee,
  formatPrice,
}: {
  gross: number;
  fee: number;
  formatPrice: (value: number | string | null | undefined) => string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#090e18] p-5 shadow-[0_14px_42px_rgba(0,0,0,.22)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black">Revenue Overview</h2>
          <p className="mt-1 text-[10px] text-slate-500">Current operational snapshot</p>
        </div>
        <span className="rounded-lg border border-white/10 bg-white/[0.025] px-3 py-1.5 text-[10px] font-bold text-slate-400">Live</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-yellow-300/[0.05] p-3">
          <p className="text-[10px] text-slate-500">Gross Volume</p>
          <p className="mt-1 text-lg font-black text-yellow-300">{formatPrice(gross)}</p>
        </div>
        <div className="rounded-xl bg-cyan-300/[0.05] p-3">
          <p className="text-[10px] text-slate-500">Fee Revenue</p>
          <p className="mt-1 text-lg font-black text-cyan-300">{formatPrice(fee)}</p>
        </div>
      </div>
      <div className="relative mt-4 h-[190px] overflow-hidden rounded-xl border border-white/[0.06] bg-[#070b13] px-4 py-3">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.08)_1px,transparent_1px)] [background-size:100%_40px,70px_100%]" />
        <svg viewBox="0 0 600 180" preserveAspectRatio="none" className="relative h-full w-full" aria-label="Decorative revenue snapshot chart">
          <defs>
            <linearGradient id="grossFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#facc15" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="feeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 160 C75 154 90 132 145 130 S220 72 280 79 S350 98 410 84 S505 48 600 42 L600 180 L0 180 Z" fill="url(#grossFill)" />
          <path d="M0 160 C75 154 90 132 145 130 S220 72 280 79 S350 98 410 84 S505 48 600 42" fill="none" stroke="#facc15" strokeWidth="3" />
          <path d="M0 168 C100 166 150 164 210 160 S310 151 370 149 S480 135 600 131 L600 180 L0 180 Z" fill="url(#feeFill)" />
          <path d="M0 168 C100 166 150 164 210 160 S310 151 370 149 S480 135 600 131" fill="none" stroke="#22d3ee" strokeWidth="2.5" />
        </svg>
        <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[9px] text-slate-600">
          <span>Users</span><span>Products</span><span>Orders</span><span>Revenue</span>
        </div>
      </div>
    </div>
  );
}

function ActivityMix({
  users,
  products,
  orders,
  userShare,
  productShare,
  orderShare,
}: {
  users: number;
  products: number;
  orders: number;
  userShare: number;
  productShare: number;
  orderShare: number;
}) {
  const gradient = `conic-gradient(#facc15 0 ${userShare}%, #8b5cf6 ${userShare}% ${userShare + productShare}%, #22d3ee ${userShare + productShare}% 100%)`;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#090e18] p-5 shadow-[0_14px_42px_rgba(0,0,0,.22)]">
      <h2 className="font-black">Activity Mix</h2>
      <p className="mt-1 text-[10px] text-slate-500">Live platform totals</p>
      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
        <div className="relative h-32 w-32 shrink-0 rounded-full" style={{ background: gradient }}>
          <div className="absolute inset-[18px] grid place-items-center rounded-full bg-[#090e18] text-center">
            <span>
              <span className="block text-2xl font-black">{users + products + orders}</span>
              <span className="text-[9px] uppercase tracking-wider text-slate-500">Total</span>
            </span>
          </div>
        </div>
        <div className="w-full space-y-3 text-xs">
          {[
            ["Users", users, userShare, "bg-yellow-300"],
            ["Products", products, productShare, "bg-violet-500"],
            ["Orders", orders, orderShare, "bg-cyan-400"],
          ].map(([label, count, share, dot]) => (
            <div key={String(label)} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-slate-400"><span className={`h-2.5 w-2.5 rounded ${dot}`} />{String(label)}</span>
              <span className="font-black text-white">{Number(count).toLocaleString("en-US")} <span className="text-[9px] text-slate-600">({Number(share).toFixed(0)}%)</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#050812] px-6 text-white">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 animate-pulse place-items-center rounded-2xl border border-yellow-300/30 bg-yellow-300/10 text-xl font-black text-yellow-300">CP</div>
        <p className="mt-5 text-sm font-bold tracking-wide text-slate-300">Loading Operations Center...</p>
        <div className="mx-auto mt-4 h-1 w-44 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-yellow-300 to-cyan-300" />
        </div>
      </div>
    </main>
  );
}

function AdminError({ error }: { error: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#050812] px-6 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-rose-400/20 bg-[#090e18] p-8 text-center shadow-2xl">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-400/10 text-rose-300"><FaExclamationTriangle /></span>
        <h1 className="mt-5 text-3xl font-black">Admin Dashboard Unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-rose-200/80">{error}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/" className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-black text-slate-200">Back Home</Link>
          <Link href="/cpcommunity" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-yellow-300 px-5 text-sm font-black text-black">Login <FaArrowRight /></Link>
        </div>
      </div>
    </main>
  );
}

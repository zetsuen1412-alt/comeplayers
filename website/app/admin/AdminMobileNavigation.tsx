"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import {
  FaBalanceScale,
  FaBars,
  FaBullhorn,
  FaCalculator,
  FaChartLine,
  FaClipboardList,
  FaCommentDots,
  FaCube,
  FaGamepad,
  FaHome,
  FaLifeRing,
  FaMoneyBillWave,
  FaRocket,
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

type AdminLink = {
  href: string;
  label: string;
  icon: IconType;
};

const adminLinks: AdminLink[] = [
  { href: "/admin", label: "Dashboard", icon: FaHome },
  { href: "/admin/users", label: "Users", icon: FaUsers },
  { href: "/admin/products", label: "Products", icon: FaCube },
  { href: "/admin/orders", label: "Orders", icon: FaShoppingBag },
  { href: "/admin/disputes", label: "Disputes", icon: FaBalanceScale },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: FaMoneyBillWave },
  { href: "/admin/wallet", label: "Wallet", icon: FaWallet },
  { href: "/admin/games", label: "Games", icon: FaGamepad },
  { href: "/admin/categories", label: "Categories", icon: FaTags },
  { href: "/admin/coupons", label: "Coupons", icon: FaTicketAlt },
  { href: "/admin/announcements", label: "Announcements", icon: FaBullhorn },
  { href: "/admin/support", label: "Support", icon: FaLifeRing },
  { href: "/admin/seller-applications", label: "Sellers", icon: FaStore },
  { href: "/admin/finance", label: "Finance", icon: FaChartLine },
  { href: "/admin/payroll", label: "Payroll", icon: FaCalculator },
  { href: "/admin/reconciliation", label: "Reconciliation", icon: FaClipboardList },
  { href: "/admin/operations", label: "Operations", icon: FaRocket },
  { href: "/admin/risk", label: "Trust & Risk", icon: FaShieldAlt },
  { href: "/admin/compliance", label: "Compliance", icon: FaUserCheck },
  { href: "/admin/chat-moderation", label: "Chat Moderation", icon: FaCommentDots },
];

export default function AdminMobileNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const currentLabel =
    adminLinks.find((item) => pathname === item.href)?.label || "Admin";

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (pathname === "/admin" || pathname.startsWith("/admin/payroll")) return null;

  return (
    <>
      <header className="sticky top-0 z-[80] flex min-h-16 items-center justify-between gap-3 border-b border-white/10 bg-[#050812]/95 px-4 text-white shadow-[0_12px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl lg:hidden">
        <Link href="/admin" className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-yellow-300/35 bg-yellow-300/10 font-black text-yellow-300">
            CP
          </span>
          <span className="min-w-0">
            <small className="block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
              Admin Center
            </small>
            <strong className="block truncate text-sm text-white">{currentLabel}</strong>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200"
          aria-label="Open admin menu"
          aria-expanded={open}
          aria-controls="cp-admin-mobile-menu"
        >
          <FaBars />
        </button>
      </header>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close admin menu"
          />
          <aside
            id="cp-admin-mobile-menu"
            className="fixed inset-x-0 bottom-0 z-[100] flex max-h-[88svh] flex-col overflow-hidden rounded-t-[28px] border border-cyan-300/25 bg-[linear-gradient(180deg,#0b1220,#050812)] text-white shadow-[0_-28px_90px_rgba(0,0,0,0.76)] lg:hidden"
            aria-label="Admin navigation"
          >
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-white/20" aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-white/10 px-5 pb-4 pt-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
                  ComePlayers Operations
                </p>
                <h2 className="mt-1 text-xl font-black">Admin Menu</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300"
                aria-label="Close admin menu"
              >
                <FaTimes />
              </button>
            </div>

            <nav
              className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(20px,env(safe-area-inset-bottom))]"
              aria-label="Admin pages"
            >
              {adminLinks.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-bold ${
                      active
                        ? "border-yellow-300/50 bg-yellow-300/15 text-yellow-200"
                        : "border-white/10 bg-white/[0.035] text-slate-300"
                    }`}
                  >
                    <Icon className="shrink-0 text-cyan-300" />
                    <span className="min-w-0 leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </>
      ) : null}
    </>
  );
}

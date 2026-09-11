"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconType } from "react-icons";
import {
  FaCheckCircle,
  FaChevronRight,
  FaFileInvoiceDollar,
  FaLink,
  FaShieldAlt,
  FaShoppingBag,
  FaTrashAlt,
  FaUser,
} from "react-icons/fa";
import type { ReactNode } from "react";

type AccountShellProps = {
  children: ReactNode;
};

type MenuItem = {
  href: string;
  label: string;
  description: string;
  icon: IconType;
};

const menuItems: MenuItem[] = [
  {
    href: "/account",
    label: "Account",
    description: "Profile and contact information",
    icon: FaUser,
  },
  {
    href: "/account/connects",
    label: "Social Connect",
    description: "Connected login providers",
    icon: FaLink,
  },
  {
    href: "/account/security",
    label: "Privacy & Security",
    description: "MFA, PIN, devices, and privacy",
    icon: FaShieldAlt,
  },
  {
    href: "/account/billing",
    label: "Billing & Invoice",
    description: "Billing profile and tax records",
    icon: FaFileInvoiceDollar,
  },
  {
    href: "/account/privacy",
    label: "Data & Deletion",
    description: "Export or remove account data",
    icon: FaTrashAlt,
  },
  {
    href: "/account/verification",
    label: "Verification",
    description: "Email, phone, and identity status",
    icon: FaCheckCircle,
  },
];

export default function AccountShell({ children }: AccountShellProps) {
  const pathname = usePathname();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070b] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_4%,rgba(250,204,21,0.08),transparent_28%),radial-gradient(circle_at_90%_42%,rgba(245,158,11,0.055),transparent_25%)]"
      />

      <header className="relative border-b border-amber-400/20 bg-black/55">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-400/70">
              ComePlayers Member Center
            </p>
            <Link
              href="/account"
              className="mt-1 inline-block text-2xl font-black tracking-tight text-amber-300 transition hover:text-yellow-300"
            >
              ComePlayers
            </Link>
          </div>

          <Link
            href="/games"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-400/55 bg-amber-400/10 px-5 text-sm font-black text-amber-300 transition hover:bg-amber-300 hover:text-black"
          >
            <FaShoppingBag aria-hidden="true" />
            Shop now
          </Link>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-[1500px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[310px_minmax(0,1fr)] lg:px-8 lg:py-10">
        <aside className="h-fit rounded-2xl border border-amber-400/25 bg-gradient-to-b from-[#111319] to-[#090b0f] p-3 shadow-[0_20px_80px_rgba(0,0,0,0.35)] lg:sticky lg:top-24">
          <div className="mb-3 border-b border-amber-400/15 px-3 pb-4 pt-2">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-400">
              Account Center
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Manage your profile, security, billing, and verification.
            </p>
          </div>

          <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1" aria-label="Account settings">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex min-h-[68px] items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    isActive
                      ? "border-yellow-300/80 bg-gradient-to-r from-yellow-400/25 to-amber-500/10 text-yellow-300 shadow-[0_0_24px_rgba(250,204,21,0.11)]"
                      : "border-white/10 bg-white/[0.025] text-slate-300 hover:border-amber-400/35 hover:bg-amber-400/[0.055] hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                      isActive
                        ? "border-yellow-300/45 bg-yellow-300/15 text-yellow-300"
                        : "border-white/10 bg-black/35 text-slate-400 group-hover:border-amber-400/30 group-hover:text-amber-300"
                    }`}
                  >
                    <Icon aria-hidden="true" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black">{item.label}</span>
                    <span className="mt-0.5 hidden truncate text-[11px] text-slate-500 xl:block">
                      {item.description}
                    </span>
                  </span>

                  <FaChevronRight
                    aria-hidden="true"
                    className={`shrink-0 text-xs transition ${
                      isActive ? "text-yellow-300" : "text-slate-600 group-hover:text-amber-300"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-amber-400/25 bg-gradient-to-b from-[#101218] to-[#080a0e] shadow-[0_24px_100px_rgba(0,0,0,0.45)]">
          {children}
        </section>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FaArrowRight,
  FaBullhorn,
  FaCircleCheck,
  FaCoins,
  FaFileContract,
  FaHandshakeAngle,
  FaListCheck,
  FaMagnifyingGlass,
  FaRotateLeft,
  FaShieldHalved,
  FaStore,
} from "react-icons/fa6";

export type LegalCard = {
  slug: string;
  title: string;
  eyebrow: string;
  updatedAt: string;
  summary: string;
  status: string;
};

type Props = { items: LegalCard[] };

type LegalGroup = {
  id: string;
  label: string;
  title: string;
  description: string;
  slugs: string[];
};

const groups: LegalGroup[] = [
  {
    id: "platform",
    label: "Platform",
    title: "Platform & account",
    description:
      "The main agreements that govern every ComePlayers account and explain how personal information is handled.",
    slugs: ["terms-of-service", "privacy-policy"],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    title: "Trading & protection",
    description:
      "Rules for listings, delivery, cancellations, refunds, disputes, and protection during a transaction.",
    slugs: [
      "product-offering-policy",
      "refund-cancellation-policy",
      "playerguard-protection",
    ],
  },
  {
    id: "seller",
    label: "Sellers",
    title: "Seller & payment operations",
    description:
      "Operational standards for sellers, marketplace fees, wallet balances, withdrawals, and payout review.",
    slugs: ["seller-rules", "payment-fee-schedule"],
  },
  {
    id: "promotion",
    label: "Promotion",
    title: "Advertising & promotions",
    description:
      "Standards for sponsored placements, promoted listings, marketing claims, and campaigns.",
    slugs: ["advertising-policy"],
  },
];

const iconBySlug = {
  "terms-of-service": FaFileContract,
  "privacy-policy": FaShieldHalved,
  "product-offering-policy": FaListCheck,
  "refund-cancellation-policy": FaRotateLeft,
  "playerguard-protection": FaHandshakeAngle,
  "seller-rules": FaStore,
  "payment-fee-schedule": FaCoins,
  "advertising-policy": FaBullhorn,
} as const;

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export default function LegalCenterClient({ items }: Props) {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");

  const visibleGroups = useMemo(() => {
    const keyword = normalize(query);

    return groups
      .filter((group) => activeGroup === "all" || group.id === activeGroup)
      .map((group) => ({
        ...group,
        items: group.slugs
          .map((slug) => items.find((item) => item.slug === slug))
          .filter((item): item is LegalCard => Boolean(item))
          .filter((item) => {
            if (!keyword) return true;
            return normalize(
              `${item.title} ${item.eyebrow} ${item.summary}`,
            ).includes(keyword);
          }),
      }))
      .filter((group) => group.items.length > 0);
  }, [activeGroup, items, query]);

  const resultCount = visibleGroups.reduce(
    (total, group) => total + group.items.length,
    0,
  );

  return (
    <>
      <section className="relative overflow-hidden bg-[#0b0c0f] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(250,204,21,0.18),transparent_26%),radial-gradient(circle_at_12%_100%,rgba(255,255,255,0.07),transparent_30%)]" />
        <div className="absolute -right-24 top-4 h-80 w-80 rotate-12 border border-yellow-300/15" />
        <div className="absolute -right-8 top-16 h-80 w-80 rotate-12 border border-yellow-300/10" />

        <div className="relative mx-auto max-w-7xl px-4 pb-28 pt-10 sm:px-6 lg:px-8 lg:pb-32 lg:pt-14">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-sm font-semibold text-white/55"
          >
            <Link href="/" className="transition hover:text-yellow-300">
              ComePlayers
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-white">Legal</span>
          </nav>

          <div className="mt-14 max-w-3xl">
            <p className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.24em] text-yellow-300">
              <span className="h-px w-8 bg-yellow-300" />
              Trust & transparency
            </p>
            <h1 className="mt-5 text-5xl font-black tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Legal
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/65 sm:text-lg">
              Find the agreements, marketplace rules, payment standards, and
              protection policies that apply when you use ComePlayers.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#f4f4f2] text-[#161616]">
        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="relative -top-12 rounded-2xl border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(15,15,15,0.12)] sm:p-5">
            <label className="flex min-h-14 items-center gap-4 rounded-xl border border-black/10 bg-[#f8f8f6] px-4 transition focus-within:border-yellow-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-yellow-300/15 sm:px-5">
              <FaMagnifyingGlass className="h-4 w-4 shrink-0 text-black/45" />
              <span className="sr-only">Search legal policies</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search policies, refunds, seller rules, privacy..."
                className="min-w-0 flex-1 bg-transparent py-4 text-sm font-semibold text-black outline-none placeholder:text-black/35 sm:text-base"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-black/50 transition hover:bg-black/5 hover:text-black"
                >
                  Clear
                </button>
              ) : null}
            </label>
          </div>

          <div className="-mt-2 grid gap-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14">
            <aside className="h-fit lg:sticky lg:top-28">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-black/35">
                Legal categories
              </p>
              <nav className="mt-5 grid gap-1" aria-label="Legal categories">
                <button
                  type="button"
                  onClick={() => setActiveGroup("all")}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-extrabold transition ${
                    activeGroup === "all"
                      ? "bg-[#171717] text-white"
                      : "text-black/60 hover:bg-black/5 hover:text-black"
                  }`}
                >
                  All policies
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      activeGroup === "all"
                        ? "bg-yellow-300 text-black"
                        : "bg-black/5 text-black/45"
                    }`}
                  >
                    {items.length}
                  </span>
                </button>

                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveGroup(group.id)}
                    className={`flex items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-extrabold transition ${
                      activeGroup === group.id
                        ? "bg-[#171717] text-white"
                        : "text-black/60 hover:bg-black/5 hover:text-black"
                    }`}
                  >
                    {group.label}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        activeGroup === group.id
                          ? "bg-yellow-300 text-black"
                          : "bg-black/5 text-black/45"
                      }`}
                    >
                      {group.slugs.length}
                    </span>
                  </button>
                ))}
              </nav>

              <div className="mt-8 border-t border-black/10 pt-7">
                <div className="flex gap-3">
                  <FaCircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
                  <div>
                    <p className="text-sm font-black">Current policies</p>
                    <p className="mt-1 text-xs leading-5 text-black/50">
                      Each page shows its latest review date and policy status.
                    </p>
                  </div>
                </div>
              </div>
            </aside>

            <div>
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-700">
                    ComePlayers policy hub
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
                    Documents & policies
                  </h2>
                </div>
                <p className="text-sm font-bold text-black/45">
                  {resultCount} {resultCount === 1 ? "document" : "documents"}
                </p>
              </div>

              {visibleGroups.length > 0 ? (
                <div className="space-y-14 pt-9">
                  {visibleGroups.map((group) => (
                    <section key={group.id} id={group.id}>
                      <div className="max-w-3xl">
                        <h3 className="text-2xl font-black tracking-[-0.02em]">
                          {group.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-black/50 sm:text-base">
                          {group.description}
                        </p>
                      </div>

                      <div className="mt-6 grid gap-4 xl:grid-cols-2">
                        {group.items.map((item) => {
                          const Icon =
                            iconBySlug[item.slug as keyof typeof iconBySlug] ||
                            FaFileContract;

                          return (
                            <Link
                              key={item.slug}
                              href={`/legal/${item.slug}`}
                              className="group flex min-h-64 flex-col rounded-2xl border border-black/10 bg-white p-6 shadow-[0_8px_30px_rgba(10,10,10,0.04)] transition duration-200 hover:-translate-y-1 hover:border-yellow-500 hover:shadow-[0_18px_45px_rgba(10,10,10,0.10)] sm:p-7"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-300 text-black shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
                                  <Icon className="h-5 w-5" />
                                </span>
                                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                                  {item.status}
                                </span>
                              </div>

                              <p className="mt-7 text-[11px] font-black uppercase tracking-[0.18em] text-black/38">
                                {item.eyebrow}
                              </p>
                              <h4 className="mt-2 text-xl font-black leading-tight tracking-[-0.02em] transition group-hover:text-yellow-700 sm:text-2xl">
                                {item.title}
                              </h4>
                              <p className="mt-3 line-clamp-3 text-sm leading-6 text-black/52">
                                {item.summary}
                              </p>

                              <div className="mt-auto flex items-center justify-between gap-4 border-t border-black/8 pt-5">
                                <span className="text-xs font-bold text-black/38">
                                  Updated {item.updatedAt}
                                </span>
                                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-black transition group-hover:text-yellow-700">
                                  Read policy
                                  <FaArrowRight className="h-3 w-3 transition group-hover:translate-x-1" />
                                </span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="mt-8 rounded-2xl border border-dashed border-black/15 bg-white px-6 py-16 text-center">
                  <FaMagnifyingGlass className="mx-auto h-7 w-7 text-black/25" />
                  <h3 className="mt-5 text-xl font-black">No policy found</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/50">
                    Try another keyword or clear the current category filter.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setActiveGroup("all");
                    }}
                    className="mt-6 rounded-lg bg-[#171717] px-5 py-3 text-sm font-black text-white transition hover:bg-yellow-300 hover:text-black"
                  >
                    Show all policies
                  </button>
                </div>
              )}

              <section className="mt-16 overflow-hidden rounded-2xl bg-[#171717] text-white">
                <div className="grid gap-7 px-7 py-8 sm:px-9 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-300">
                      Need clarification?
                    </p>
                    <h3 className="mt-3 text-2xl font-black tracking-[-0.02em]">
                      Get help from ComePlayers Support
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
                      For order, payment, payout, verification, or policy
                      questions, open a support case and keep all evidence
                      inside ComePlayers.
                    </p>
                  </div>
                  <Link
                    href="/support"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-yellow-300 px-6 text-sm font-black text-black transition hover:bg-yellow-200"
                  >
                    Open Support Center
                    <FaArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

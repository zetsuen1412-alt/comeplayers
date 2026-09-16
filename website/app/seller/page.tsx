"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  FaBolt,
  FaBoxOpen,
  FaChartLine,
  FaCheckCircle,
  FaClock,
  FaClipboardList,
  FaGem,
  FaMedal,
  FaMoneyBillWave,
  FaPlus,
  FaRocket,
  FaShieldAlt,
  FaSignal,
  FaStar,
  FaStore,
  FaUserFriends,
  FaUsers,
  FaWallet,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import {
  effectivePresence,
  formatDeliveryEta,
  serviceLevelDescription,
  serviceLevelLabel,
} from "@/lib/sellerServiceLevel";
import { supabase } from "@/lib/supabase";

type Overview = {
  profile: {
    seller_name?: string | null;
    username?: string | null;
    email?: string | null;
    seller_rating?: number | string | null;
    seller_review_count?: number | string | null;
    seller_presence_mode?: string | null;
    seller_last_seen_at?: string | null;
    seller_delivery_sla_minutes?: number | null;
    seller_avg_delivery_minutes?: number | string | null;
    seller_on_time_rate?: number | string | null;
    seller_total_deliveries?: number | null;
    seller_late_deliveries?: number | null;
    seller_service_level?: string | null;
  };
  wallet: {
    balance?: number | string | null;
    pending_balance?: number | string | null;
  };
  metrics: {
    products: number;
    activeProducts: number;
    orders: number;
    paidOrders: number;
    awaitingDelivery: number;
    completedOrders: number;
    lateOrders: number;
    followers: number;
    lifetimeEarnings: number;
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
    delivery_due_at?: string | null;
    delivery_sla_status?: string | null;
    delivered_at?: string | null;
  }>;
};

function prettyStatus(value?: string | null) {
  return String(value || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function SellerDashboardPage() {
  const { formatIdrPrice: formatPrice } = useCurrency();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sellerStatus, setSellerStatus] = useState("");

  useEffect(() => {
    async function loadOverview() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (sessionError || !accessToken) {
          throw new Error("Please login to open your seller dashboard.");
        }

        const response = await fetch("/api/seller/overview", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const json = await response.json();

        if (!response.ok) {
          setSellerStatus(json.sellerStatus || "");
          throw new Error(json.error || "Seller dashboard is unavailable.");
        }

        setOverview(json);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load seller dashboard."
        );
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, []);

  useEffect(() => {
    if (!overview) return;

    const presence = effectivePresence(
      overview.profile.seller_presence_mode,
      overview.profile.seller_last_seen_at
    );

    if (presence === "offline") return;

    const heartbeat = async () => {
      try {
        await authenticatedFetchJson("/api/seller/service-level", {
          method: "POST",
          body: JSON.stringify({ action: "heartbeat" }),
        });
      } catch {
        // Presence falls back to offline automatically when heartbeats stop.
      }
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [overview]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050505] px-4 py-24 text-center text-white">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#ffcc00]/25 border-t-[#ffcc00]" />
        <p className="mt-5 font-bold text-[#d8d8d8]">Loading seller dashboard...</p>
      </main>
    );
  }

  if (!overview) {
    const href =
      sellerStatus === "pending" || sellerStatus === "rejected"
        ? "/seller/verification"
        : "/seller/apply";

    return (
      <main className="min-h-screen bg-[#050505] px-4 py-24 text-center text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-[#ffcc00]/30 bg-[#0d0d0d] p-8 shadow-[0_0_60px_rgba(255,204,0,.08)]">
          <h1 className="text-4xl font-black">Seller Access Required</h1>
          <p className="mx-auto mt-4 max-w-xl text-[#aeb4bf]">{error}</p>
          <Link
            href={href}
            className="mt-8 inline-flex rounded-xl bg-gradient-to-r from-[#ffe04b] to-[#ffb800] px-6 py-4 font-black text-black shadow-[0_12px_34px_rgba(255,190,0,.2)] transition hover:brightness-110"
          >
            Open Seller Verification
          </Link>
        </div>
      </main>
    );
  }

  const name =
    overview.profile.seller_name ||
    overview.profile.username ||
    overview.profile.email ||
    "Seller";
  const presence = effectivePresence(
    overview.profile.seller_presence_mode,
    overview.profile.seller_last_seen_at
  );
  const serviceLevel = serviceLevelLabel(overview.profile.seller_service_level);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <section className="relative overflow-hidden border-b border-[#ffcc00]/35">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,196,0,.12),transparent_34%),radial-gradient(circle_at_82%_45%,rgba(255,196,0,.08),transparent_35%),linear-gradient(115deg,#080808_0%,#050505_48%,#0d0900_100%)]" />
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,204,0,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,204,0,.08)_1px,transparent_1px)] [background-size:42px_42px] [mask-image:linear-gradient(to_right,black,transparent_70%)]" />
        <div
          className="pointer-events-none absolute -right-16 top-1/2 hidden h-[520px] w-[620px] -translate-y-1/2 bg-contain bg-center bg-no-repeat opacity-[0.11] grayscale sepia lg:block"
          style={{ backgroundImage: "url('/brand/comeplayers-cp-v6.png')" }}
        />
        <div className="absolute right-0 top-0 hidden h-full w-[46%] bg-[linear-gradient(135deg,transparent_18%,rgba(255,204,0,.08)_18.3%,transparent_18.7%,transparent_56%,rgba(255,204,0,.07)_56.3%,transparent_56.7%)] lg:block" />

        <div className="relative mx-auto flex max-w-7xl flex-col justify-between gap-10 px-4 py-12 sm:px-6 lg:min-h-[310px] lg:flex-row lg:items-center lg:px-8 lg:py-14">
          <div className="relative z-10">
            <div className="flex flex-wrap gap-3">
              <StatusBadge tone="approved" icon={<FaCheckCircle />}>
                Approved Seller
              </StatusBadge>
              <StatusBadge tone={presence}>
                {presence}
              </StatusBadge>
              <StatusBadge tone="service" icon={<FaStar />}>
                {serviceLevel} Service
              </StatusBadge>
            </div>

            <h1 className="mt-7 break-words text-5xl font-black tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
              {name}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-[#b8bec9] sm:text-lg">
              Manage listings, paid orders, deliveries, followers, and earnings.
            </p>
          </div>

          <div className="relative z-10 flex lg:min-w-[290px] lg:justify-end">
            <Link
              href="/seller/products/new"
              className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-[#ffe56a] bg-gradient-to-r from-[#ffd52b] via-[#ffc400] to-[#f3a900] px-7 py-4 text-lg font-black text-black shadow-[0_0_0_1px_rgba(255,204,0,.22),0_16px_45px_rgba(255,183,0,.2)] transition hover:-translate-y-0.5 hover:brightness-110 sm:w-auto"
            >
              <FaPlus /> Create Product
            </Link>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<FaBoxOpen />} label="Active Listings" value={String(overview.metrics.activeProducts)} />
          <Metric icon={<FaClipboardList />} label="Paid Orders" value={String(overview.metrics.paidOrders)} />
          <Metric icon={<FaStore />} label="Awaiting Delivery" value={String(overview.metrics.awaitingDelivery)} attention={overview.metrics.awaitingDelivery > 0} />
          <Metric icon={<FaClock />} label="Late Orders" value={String(overview.metrics.lateOrders)} attention={overview.metrics.lateOrders > 0} />
          <Metric icon={<FaMoneyBillWave />} label="Lifetime Earnings" value={formatPrice(overview.metrics.lifetimeEarnings)} />
          <Metric icon={<FaWallet />} label="Available Wallet" value={formatPrice(overview.wallet.balance)} />
          <Metric icon={<FaSignal />} label="On-Time Rate" value={`${Number(overview.profile.seller_on_time_rate || 100).toFixed(1)}%`} />
          <Metric icon={<FaBolt />} label="Average Delivery" value={formatDeliveryEta(overview.profile.seller_avg_delivery_minutes)} />
          <Metric icon={<FaUsers />} label="Followers" value={String(overview.metrics.followers)} />
          <Metric icon={<FaStar />} label="Rating" value={Number(overview.profile.seller_rating || 0).toFixed(1)} />
          <Metric icon={<FaChartLine />} label="Completed Orders" value={String(overview.metrics.completedOrders)} />
          <Metric icon={<FaMedal />} label="Service Level" value={serviceLevel} />
        </div>

        <div className="mt-9 grid gap-6 xl:grid-cols-[1fr_350px]">
          <section className="rounded-3xl border border-[#ffcc00]/25 bg-[linear-gradient(145deg,rgba(255,255,255,.045),rgba(0,0,0,.65))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ffcc00]">
                  Order Activity
                </p>
                <h2 className="mt-2 text-2xl font-black">Recent Orders</h2>
              </div>
              <Link
                href="/seller/orders"
                className="rounded-lg border border-[#ffcc00]/35 px-4 py-2 text-sm font-black text-[#ffcc00] transition hover:border-[#ffcc00] hover:bg-[#ffcc00]/10"
              >
                View all →
              </Link>
            </div>

            <div className="mt-6 space-y-3">
              {overview.recentOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#ffcc00]/20 bg-black/35 p-8 text-center">
                  <FaBoxOpen className="mx-auto text-3xl text-[#ffcc00]/60" />
                  <p className="mt-3 font-bold text-[#b9bec7]">No orders yet.</p>
                </div>
              ) : (
                overview.recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/35 p-4 transition hover:border-[#ffcc00]/65 hover:bg-[#ffcc00]/[0.035]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-black">
                        #{order.id} · {order.product_title || order.product || "Product"}
                      </p>
                      <p className="mt-1 text-xs text-[#7f8794]">
                        {prettyStatus(order.payment_status || order.status)}
                      </p>
                    </div>
                    <p className="shrink-0 font-black text-[#ffcc00]">
                      {formatPrice(order.total_amount || order.total_price)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </section>

          <aside className="rounded-3xl border border-[#ffcc00]/25 bg-[linear-gradient(145deg,rgba(255,255,255,.045),rgba(0,0,0,.65))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ffcc00]">
              Seller Control
            </p>
            <h2 className="mt-2 text-2xl font-black">Seller Tools</h2>

            <div className="mt-5 rounded-2xl border border-[#ffcc00]/30 bg-[#ffcc00]/[0.055] p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffcc00]">
                {serviceLevel} Service
              </p>
              <p className="mt-2 text-sm leading-6 text-[#c1c5cd]">
                {serviceLevelDescription(overview.profile.seller_service_level)}
              </p>
              <p className="mt-3 text-xs font-bold text-[#e7e7e7]">
                Promise: {formatDeliveryEta(overview.profile.seller_delivery_sla_minutes)}
              </p>
            </div>

            <div className="mt-5 grid gap-2.5">
              <Tool href="/seller/products" label="Manage Products" />
              <Tool href="/seller/products/import" label="Spreadsheet Center" />
              <Tool href="/seller/storefront" label="Storefront Studio" />
              <Tool href="/seller/orders" label="Manage Orders" />
              <Tool href="/seller/service-level" label="Service Level & SLA" />
              <Tool href="/seller/analytics" label="Analytics" />
              <Tool href="/seller/reviews" label="Verified Reviews" />
              <Tool href="/seller/followers" label="Followers" />
              <Tool href="/wallet" label="Wallet" />
              <Tool href="/seller/payouts" label="Payout Center" />
              <Tool href="/seller/tax-profile" label="Tax Residency" />
              <Tool href="/seller/tax-statements" label="Tax Statements" />
              <Tool href="/seller/verification" label="Verification Status" />
            </div>
          </aside>
        </div>
      </section>

      <section className="border-y border-[#ffcc00]/25 bg-[linear-gradient(90deg,#070707,#0b0b0b,#070707)]">
        <div className="mx-auto grid max-w-7xl gap-px px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          <TrustItem icon={<FaShieldAlt />} title="Secure & Trusted" description="Your security is our priority" />
          <TrustItem icon={<FaGem />} title="Premium Marketplace" description="Top quality services & sellers" />
          <TrustItem icon={<FaRocket />} title="Fast & Reliable" description="Quick delivery you can count on" />
          <TrustItem icon={<FaUserFriends />} title="Grow With Us" description="Build your brand with ComePlayers" />
        </div>
      </section>
    </main>
  );
}

function StatusBadge({
  children,
  icon,
  tone,
}: {
  children: ReactNode;
  icon?: ReactNode;
  tone: "approved" | "online" | "away" | "offline" | "service";
}) {
  const styles = {
    approved: "border-emerald-400/55 bg-emerald-400/10 text-emerald-300",
    online: "border-emerald-400/55 bg-emerald-400/10 text-emerald-300",
    away: "border-amber-400/55 bg-amber-400/10 text-amber-300",
    offline: "border-white/25 bg-white/[0.04] text-[#d2d5da]",
    service: "border-[#ffcc00]/55 bg-[#ffcc00]/[0.07] text-[#ffcc00]",
  } as const;

  return (
    <p className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black capitalize ${styles[tone]}`}>
      {icon || <span className="h-2.5 w-2.5 rounded-full border border-current" />}
      {children}
    </p>
  );
}

function Metric({
  icon,
  label,
  value,
  attention = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <article
      className={`group min-h-[150px] rounded-3xl border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] transition duration-200 hover:-translate-y-0.5 ${
        attention
          ? "border-amber-400/50 bg-[linear-gradient(145deg,rgba(245,158,11,.10),rgba(0,0,0,.62))] hover:border-amber-300"
          : "border-[#ffcc00]/28 bg-[linear-gradient(145deg,rgba(255,255,255,.045),rgba(0,0,0,.67))] hover:border-[#ffcc00]/65"
      }`}
    >
      <div className={`text-xl ${attention ? "text-amber-300" : "text-[#ffcc00]"}`}>
        {icon}
      </div>
      <p className="mt-5 text-sm text-[#a8aeb8]">{label}</p>
      <p className="mt-2 break-words text-3xl font-black tracking-[-0.03em] text-white">
        {value}
      </p>
    </article>
  );
}

function Tool({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-black text-[#e7e7e7] transition hover:border-[#ffcc00]/60 hover:bg-[#ffcc00]/[0.055] hover:text-[#ffcc00]"
    >
      <span>{label}</span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

function TrustItem({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4 border-white/10 px-3 py-7 sm:odd:border-r lg:border-r lg:last:border-r-0">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#ffcc00]/45 text-xl text-[#ffcc00]">
        {icon}
      </div>
      <div>
        <p className="font-black text-white">{title}</p>
        <p className="mt-1 text-sm text-[#858b96]">{description}</p>
      </div>
    </div>
  );
}

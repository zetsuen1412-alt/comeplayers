"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaArrowLeft,
  FaBalanceScale,
  FaClock,
  FaExclamationTriangle,
  FaFolderOpen,
  FaShieldAlt,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { useCurrency } from "@/components/CurrencyProvider";

type OrderSummary = {
  id: number;
  product?: string | null;
  product_title?: string | null;
  seller_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
  escrow_status?: string | null;
  total_amount?: string | number | null;
  total_price?: string | number | null;
  created_at?: string | null;
};

type Dispute = {
  id: number;
  order_id: number;
  reason: string;
  description?: string | null;
  category?: string | null;
  requested_resolution?: string | null;
  priority?: string | null;
  status: string;
  admin_note?: string | null;
  response_due_at?: string | null;
  last_activity_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
  orders?: OrderSummary | null;
};

type OrderDetailResponse = {
  order: OrderSummary;
  role: "buyer" | "seller";
};

const CATEGORY_OPTIONS = [
  ["item_not_received", "Item not received"],
  ["invalid_credentials", "Credentials or key do not work"],
  ["item_not_as_described", "Item not as described"],
  ["unauthorized_recovery", "Seller recovered the account"],
  ["payment_issue", "Payment issue"],
  ["seller_issue", "Seller conduct issue"],
  ["buyer_issue", "Buyer conduct issue"],
  ["other", "Other"],
] as const;

const RESOLUTION_OPTIONS = [
  ["refund", "Refund"],
  ["replacement", "Replacement or corrected delivery"],
  ["complete_order", "Complete the order"],
  ["other", "Other resolution"],
] as const;

function pretty(value?: string | null) {
  return String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function amountOf(order?: OrderSummary | null) {
  return Number(order?.total_amount || order?.total_price || 0);
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (["buyer_win", "seller_win", "closed"].includes(normalized)) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (normalized === "investigating") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200";
  }
  if (normalized.startsWith("awaiting")) {
    return "border-purple-400/30 bg-purple-400/10 text-purple-200";
  }
  return "border-orange-400/30 bg-orange-400/10 text-orange-200";
}

export default function ResolutionCenterPage() {
  const router = useRouter();
  const { formatPrice } = useCurrency();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [orderRole, setOrderRole] = useState<"buyer" | "seller" | null>(null);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("item_not_received");
  const [requestedResolution, setRequestedResolution] = useState("refund");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const activeCount = useMemo(
    () =>
      disputes.filter(
        (item) => !["buyer_win", "seller_win", "closed"].includes(item.status)
      ).length,
    [disputes]
  );

  async function loadDisputes() {
    const response = await authenticatedFetchJson<{
      disputes: Dispute[];
      isAdmin: boolean;
    }>("/api/disputes");
    setDisputes(response.disputes || []);
    setIsAdmin(Boolean(response.isAdmin));
  }

  async function loadOrder(nextOrderId: number) {
    const response = await authenticatedFetchJson<OrderDetailResponse>(
      `/api/orders/${nextOrderId}`
    );
    setOrder(response.order);
    setOrderRole(response.role);
  }

  useEffect(() => {
    async function initialize() {
      setLoading(true);
      setError("");

      try {
        const queryOrderId = Number(
          new URLSearchParams(window.location.search).get("orderId") || 0
        );

        await loadDisputes();

        if (Number.isInteger(queryOrderId) && queryOrderId > 0) {
          setOrderId(queryOrderId);
          await loadOrder(queryOrderId);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load the resolution center."
        );
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, []);

  async function openDispute() {
    if (!orderId) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await authenticatedFetchJson<{
        dispute: Dispute;
        existing: boolean;
      }>("/api/disputes", {
        method: "POST",
        body: JSON.stringify({
          orderId,
          reason,
          description,
          category,
          requestedResolution,
        }),
      });

      router.push(`/resolution-center/${response.dispute.id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to open the dispute."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading resolution center...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] px-5 py-10 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/my-orders"
            className="inline-flex items-center gap-2 text-sm font-black text-cyan-300 hover:text-cyan-200"
          >
            <FaArrowLeft /> Back to Orders
          </Link>

          {isAdmin ? (
            <Link
              href="/admin/disputes"
              className="rounded-full border border-orange-400/40 px-5 py-2 text-sm font-black text-orange-200 hover:bg-orange-400 hover:text-black"
            >
              Admin Disputes
            </Link>
          ) : null}
        </div>

        <section className="mt-6 overflow-hidden rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.15),transparent_35%),rgba(255,255,255,.03)] p-7 md:p-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-200">
                <FaBalanceScale /> Buyer & Seller Protection
              </p>
              <h1 className="mt-5 text-4xl font-black md:text-6xl">Resolution Center</h1>
              <p className="mt-4 max-w-3xl leading-7 text-slate-300">
                Keep all dispute conversations, evidence, status changes, and admin decisions in one protected case file.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total Cases" value={String(disputes.length)} />
              <Stat label="Active Cases" value={String(activeCount)} />
            </div>
          </div>
        </section>

        {error ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">
            <FaExclamationTriangle className="mt-1 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {orderId && order ? (
          <section className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                Order under review
              </p>
              <h2 className="mt-3 text-2xl font-black">
                {order.product_title || order.product || `Order #${order.id}`}
              </h2>
              <div className="mt-5 space-y-3 text-sm">
                <Info label="Order" value={`#${order.id}`} />
                <Info label="Your Role" value={pretty(orderRole)} />
                <Info label="Seller" value={order.seller_name || "Seller"} />
                <Info label="Order Status" value={pretty(order.status)} />
                <Info label="Escrow" value={pretty(order.escrow_status)} />
                <Info label="Value" value={formatPrice(amountOf(order))} />
              </div>
              <p className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-xs leading-5 text-yellow-100">
                Opening a dispute pauses normal escrow completion until the case is resolved.
              </p>
            </div>

            <div className="rounded-3xl border border-orange-400/20 bg-orange-400/10 p-6 md:p-8">
              <h2 className="text-3xl font-black">Open a Dispute</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Be specific and factual. You can upload screenshots, PDF documents, or text evidence after the case is created.
              </p>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-black">
                  Category
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="rounded-2xl border border-white/10 bg-[#020617] px-4 py-3 text-white outline-none focus:border-orange-400"
                  >
                    {CATEGORY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-black">
                  Requested Resolution
                  <select
                    value={requestedResolution}
                    onChange={(event) => setRequestedResolution(event.target.value)}
                    className="rounded-2xl border border-white/10 bg-[#020617] px-4 py-3 text-white outline-none focus:border-orange-400"
                  >
                    {RESOLUTION_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-5 grid gap-2 text-sm font-black">
                Short Reason
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={160}
                  placeholder="Example: Delivered account credentials do not work"
                  className="rounded-2xl border border-white/10 bg-[#020617] px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-orange-400"
                />
              </label>

              <label className="mt-5 grid gap-2 text-sm font-black">
                Full Description
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={5000}
                  rows={8}
                  placeholder="Explain what happened, when it happened, what you already tried, and the outcome you expect."
                  className="resize-none rounded-2xl border border-white/10 bg-[#020617] px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-orange-400"
                />
                <span className="text-right text-xs font-normal text-slate-500">
                  {description.length}/5000
                </span>
              </label>

              <button
                onClick={openDispute}
                disabled={submitting || reason.trim().length < 5 || description.trim().length < 20}
                className="mt-6 w-full rounded-2xl bg-orange-400 px-6 py-4 font-black text-black transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Opening Case..." : "Open Dispute & Pause Escrow"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black">Your Cases</h2>
              <p className="mt-2 text-sm text-slate-400">
                Open a new case from the relevant order detail page.
              </p>
            </div>
            <Link
              href="/my-orders"
              className="rounded-full border border-cyan-400/40 px-5 py-3 text-sm font-black text-cyan-200 hover:bg-cyan-400 hover:text-black"
            >
              Browse My Orders
            </Link>
          </div>

          {disputes.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-12 text-center">
              <FaFolderOpen className="mx-auto text-5xl text-slate-600" />
              <h3 className="mt-5 text-2xl font-black">No dispute cases yet</h3>
              <p className="mt-2 text-slate-400">
                Your marketplace is protected by escrow. Only open a case when an order cannot be resolved directly.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {disputes.map((dispute) => (
                <Link
                  key={dispute.id}
                  href={`/resolution-center/${dispute.id}`}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:border-cyan-400/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-cyan-300">
                        Case #{dispute.id} · Order #{dispute.order_id}
                      </p>
                      <h3 className="mt-2 text-xl font-black">{dispute.reason}</h3>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(dispute.status)}`}>
                      {pretty(dispute.status)}
                    </span>
                  </div>

                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-300">
                    {dispute.description || "No description."}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                    <Info label="Product" value={dispute.orders?.product_title || dispute.orders?.product || "Product"} />
                    <Info label="Value" value={formatPrice(amountOf(dispute.orders))} />
                    <Info label="Category" value={pretty(dispute.category)} />
                    <Info label="Last Activity" value={formatDate(dispute.last_activity_at || dispute.created_at)} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          <ProtectionCard
            icon={<FaShieldAlt />}
            title="Escrow remains protected"
            text="A disputed order cannot be normally released while the case is active."
          />
          <ProtectionCard
            icon={<FaClock />}
            title="Document every response"
            text="Messages and status changes are timestamped in the case timeline."
          />
          <ProtectionCard
            icon={<FaBalanceScale />}
            title="Evidence-based decision"
            text="Admin can review both parties before refunding or releasing escrow."
          />
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-32 rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-black text-cyan-200">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 break-words font-black text-slate-100">{value}</p>
    </div>
  );
}

function ProtectionCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
      <div className="text-2xl text-emerald-300">{icon}</div>
      <h3 className="mt-4 text-xl font-black text-emerald-100">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
  seller_name?: string | null;
};

type Order = {
  id: number;
  buyer_id: string | null;
  buyer: string | null;
  seller_id: string | null;
  product_id: number | null;
  product: string | null;
  price: string | number | null;
  quantity: number | null;
  total_price: string | number | null;
  category_id: number | null;
  category_name: string | null;
  game_master_id: number | null;
  game_name: string | null;
  status: string | null;
  payment_proof: string | null;
  payment_image: string | null;
  created_at: string;
};

type Dispute = {
  id: number;
  order_id: number;
  buyer_id: string | null;
  seller_id: string | null;
  opened_by: string | null;
  reason: string;
  description: string | null;
  status: string;
  admin_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  orders: Order | null;
};

const disputeStatusFilters = [
  "all",
  "open",
  "investigating",
  "buyer_win",
  "seller_win",
  "closed",
];

function normalizeOrderStatus(status: string | null) {
  if (status === "pending") return "Pending Payment";
  if (status === "pending_payment") return "Pending Payment";
  if (status === "Menunggu Pembayaran") return "Pending Payment";
  if (status === "Menunggu Cek Pembayaran") return "Payment Verification";
  if (status === "Diproses") return "Processing";
  if (status === "Selesai") return "Completed";
  if (status === "Dibatalkan") return "Cancelled";
  return status || "Pending Payment";
}


function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function getDisputeStatusClass(status: string) {
  if (status === "buyer_win") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  if (status === "seller_win") {
    return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  }

  if (status === "investigating") {
    return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  }

  if (status === "closed") {
    return "border-gray-400/20 bg-gray-400/10 text-gray-300";
  }

  return "border-orange-400/20 bg-orange-400/10 text-orange-300";
}

function getOrderStatusClass(status: string | null) {
  const normalizedStatus = normalizeOrderStatus(status);

  if (normalizedStatus === "Completed") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  if (normalizedStatus === "Processing") {
    return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  }

  if (normalizedStatus === "Refunded") {
    return "border-purple-400/20 bg-purple-400/10 text-purple-300";
  }

  if (normalizedStatus === "Cancelled") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  if (normalizedStatus === "Disputed") {
    return "border-orange-400/20 bg-orange-400/10 text-orange-300";
  }

  return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
}

function readableDisputeStatus(status: string) {
  if (status === "buyer_win") return "Buyer Wins";
  if (status === "seller_win") return "Seller Wins";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function AdminDisputesV2Page() {
  const { formatPrice } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [disputes, setDisputes] = useState<Dispute[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");
  const [updatingDisputeId, setUpdatingDisputeId] = useState<number | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredDisputes = useMemo(() => {
    const query = search.trim().toLowerCase();

    return disputes.filter((dispute) => {
      const order = dispute.orders;
      const matchesStatus = activeStatus === "all" || dispute.status === activeStatus;

      const matchesSearch =
        !query ||
        String(dispute.id).includes(query) ||
        String(dispute.order_id).includes(query) ||
        dispute.reason.toLowerCase().includes(query) ||
        (dispute.description || "").toLowerCase().includes(query) ||
        (dispute.buyer_id || "").toLowerCase().includes(query) ||
        (dispute.seller_id || "").toLowerCase().includes(query) ||
        (order?.product || "").toLowerCase().includes(query) ||
        (order?.buyer || "").toLowerCase().includes(query) ||
        (order?.category_name || "").toLowerCase().includes(query) ||
        (order?.game_name || "").toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [disputes, activeStatus, search]);

  const openCount = disputes.filter((item) => item.status === "open").length;
  const investigatingCount = disputes.filter(
    (item) => item.status === "investigating"
  ).length;
  const buyerWinCount = disputes.filter((item) => item.status === "buyer_win").length;
  const sellerWinCount = disputes.filter((item) => item.status === "seller_win").length;

  const disputedValue = disputes.reduce((sum, dispute) => {
    const order = dispute.orders;
    return sum + Number(order?.total_price || order?.price || 0);
  }, 0);

  async function loadDisputes() {
    const { data, error } = await supabase
      .from("disputes")
      .select(
        `
        *,
        orders:order_id (*)
      `
      )
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setDisputes((data || []) as unknown as Dispute[]);
  }

  useEffect(() => {
    async function initializePage() {
      setLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError) {
        alert(userError.message);
        setLoading(false);
        return;
      }

      if (!userData.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(userData.user);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,username,role")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError) {
        alert(profileError.message);
        setLoading(false);
        return;
      }

      setAdminProfile(profileData || null);

      if (profileData?.role?.trim().toLowerCase() === "admin") {
        await loadDisputes();
      }

      setLoading(false);
    }

    initializePage();
  }, []);

  async function updateDisputeStatus(
    dispute: Dispute,
    newStatus: "investigating" | "buyer_win" | "seller_win" | "closed"
  ) {
    if (!user || !isAdmin) return;

    const note =
      adminNotes[dispute.id]?.trim() ||
      (newStatus === "investigating"
        ? "Admin is investigating this dispute."
        : `Dispute resolved as ${readableDisputeStatus(newStatus)}.`);

    if (newStatus === "buyer_win") {
      if (!confirm("Resolve this dispute as BUYER WINS and refund the buyer?")) return;
    } else if (newStatus === "seller_win") {
      if (!confirm("Resolve as SELLER WINS? Escrow is released only when delivery is complete.")) return;
    } else if (newStatus === "closed") {
      if (!confirm("Close this dispute without changing the financial result?")) return;
    } else if (!confirm("Mark this dispute as investigating?")) {
      return;
    }

    let manualReference: string | undefined;
    if (newStatus === "buyer_win") {
      const paymentMethod = String(dispute.orders?.payment_proof || "").toLowerCase();
      if (!paymentMethod.includes("paypal") && !paymentMethod.includes("wallet")) {
        manualReference =
          prompt("Enter the bank/QRIS/manual refund reference if required:")?.trim() ||
          undefined;
      }
    }

    try {
      setUpdatingDisputeId(dispute.id);
      await authenticatedFetchJson("/api/admin/disputes", {
        method: "PATCH",
        body: JSON.stringify({
          disputeId: dispute.id,
          action: newStatus,
          note,
          manualReference,
        }),
      });

      await loadDisputes();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update dispute.");
    } finally {
      setUpdatingDisputeId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading dispute center...
        </p>
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Access Denied</h1>

          <p className="mt-4 text-gray-300">
            Only admin accounts can access dispute center.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,211,238,.14),transparent_34%)]" />

        <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-sm font-black text-orange-300">
              Admin Dispute Center V3
            </p>

            <h1 className="text-5xl font-black md:text-7xl">Disputes</h1>

            <p className="mt-5 max-w-2xl text-gray-300">
              Review dispute reports, investigate buyer and seller claims, and resolve marketplace cases from the dedicated disputes table.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/orders"
              className="inline-flex h-12 items-center justify-center rounded-full border border-orange-400 px-6 font-bold text-orange-300 transition hover:bg-orange-400 hover:text-black"
            >
              All Orders
            </Link>

            <Link
              href="/admin"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Admin Home
            </Link>
          </div>
        </div>
      </section>

      <section className="px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-orange-400/20 bg-orange-400/10 p-5">
            <p className="text-sm text-orange-200">Open</p>
            <p className="mt-2 text-4xl font-black text-orange-300">{openCount}</p>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <p className="text-sm text-yellow-200">Investigating</p>
            <p className="mt-2 text-4xl font-black text-yellow-300">{investigatingCount}</p>
          </div>

          <div className="rounded-3xl border border-green-400/20 bg-green-400/10 p-5">
            <p className="text-sm text-green-200">Buyer Wins</p>
            <p className="mt-2 text-4xl font-black text-green-300">{buyerWinCount}</p>
          </div>

          <div className="rounded-3xl border border-blue-400/20 bg-blue-400/10 p-5">
            <p className="text-sm text-blue-200">Seller Wins</p>
            <p className="mt-2 text-4xl font-black text-blue-300">{sellerWinCount}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Disputed Value</p>
            <p className="mt-2 text-2xl font-black text-purple-300">
              {formatPrice(disputedValue)}
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by dispute ID, order ID, buyer, seller, product, reason, category, or game..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-orange-400"
          />

          <div className="flex flex-wrap gap-3">
            {disputeStatusFilters.map((status) => (
              <button
                key={status}
                onClick={() => setActiveStatus(status)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  activeStatus === status
                    ? "bg-orange-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-orange-400 hover:text-white"
                }`}
              >
                {status === "all" ? "All" : readableDisputeStatus(status)}
              </button>
            ))}
          </div>
        </div>

        {filteredDisputes.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center">
            <h2 className="text-3xl font-black">No disputes found.</h2>

            <p className="mt-3 text-gray-400">
              Dispute reports will appear here when buyer or seller opens a dispute.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredDisputes.map((dispute) => {
              const order = dispute.orders;
              const totalPrice = Number(order?.total_price || order?.price || 0);
              const orderStatus = normalizeOrderStatus(order?.status || null);
              const currentNote = adminNotes[dispute.id] ?? dispute.admin_note ?? "";
              const isFinal = ["buyer_win", "seller_win", "closed"].includes(dispute.status);

              return (
                <div
                  key={dispute.id}
                  className="rounded-3xl border border-orange-400/20 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
                >
                  <div className="grid gap-6 xl:grid-cols-[1fr_330px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black">
                          Dispute #{dispute.id}
                        </h2>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getDisputeStatusClass(
                            dispute.status
                          )}`}
                        >
                          {readableDisputeStatus(dispute.status)}
                        </span>

                        {order && (
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${getOrderStatusClass(
                              order.status
                            )}`}
                          >
                            Order: {orderStatus}
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-3xl font-black text-yellow-300">
                        {formatPrice(totalPrice)}
                      </p>

                      <div className="mt-5 rounded-2xl border border-orange-400/20 bg-orange-400/10 p-5">
                        <p className="text-sm font-black text-orange-300">Reason</p>
                        <h3 className="mt-2 text-xl font-black text-white">
                          {dispute.reason}
                        </h3>
                        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-300">
                          {dispute.description || "No description provided."}
                        </p>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Order ID</p>
                          <p className="mt-1 font-bold">#{dispute.order_id}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Product</p>
                          <p className="mt-1 font-bold">
                            {order?.product || "Unknown Product"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Buyer</p>
                          <p className="mt-1 break-words font-bold">
                            {order?.buyer || dispute.buyer_id || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Seller ID</p>
                          <p className="mt-1 break-words font-bold">
                            {dispute.seller_id || order?.seller_id || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Category</p>
                          <p className="mt-1 font-bold">{order?.category_name || "-"}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Game</p>
                          <p className="mt-1 font-bold">{order?.game_name || "-"}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Opened At</p>
                          <p className="mt-1 font-bold">{formatDate(dispute.created_at)}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Resolved At</p>
                          <p className="mt-1 font-bold">{formatDate(dispute.resolved_at)}</p>
                        </div>
                      </div>

                      {order?.payment_proof && (
                        <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                          <p className="text-sm font-black text-cyan-300">
                            Payment Details
                          </p>

                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-300">
                            {order.payment_proof}
                          </p>
                        </div>
                      )}

                      {order?.payment_image && (
                        <div className="mt-5">
                          <p className="mb-3 font-bold text-orange-300">
                            Payment Proof Image
                          </p>

                          <a
                            href={order.payment_image}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block"
                          >
                            <img
                              src={order.payment_image}
                              alt="Payment Proof"
                              className="h-40 w-72 rounded-xl border border-orange-400/20 object-cover transition hover:scale-105"
                            />
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <label className="text-sm font-bold text-gray-400">
                        Admin Note
                      </label>

                      <textarea
                        value={currentNote}
                        onChange={(event) =>
                          setAdminNotes((current) => ({
                            ...current,
                            [dispute.id]: event.target.value,
                          }))
                        }
                        placeholder="Write admin decision note..."
                        rows={6}
                        disabled={updatingDisputeId === dispute.id || isFinal}
                        className="w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-orange-400 disabled:opacity-60"
                      />

                      <button
                        onClick={() => updateDisputeStatus(dispute, "investigating")}
                        disabled={updatingDisputeId === dispute.id || isFinal}
                        className="rounded-2xl bg-yellow-400 px-5 py-3 font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Mark Investigating
                      </button>

                      <button
                        onClick={() => updateDisputeStatus(dispute, "buyer_win")}
                        disabled={updatingDisputeId === dispute.id || isFinal}
                        className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Buyer Wins / Refund
                      </button>

                      <button
                        onClick={() => updateDisputeStatus(dispute, "seller_win")}
                        disabled={updatingDisputeId === dispute.id || isFinal}
                        className="rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Seller Wins / Complete
                      </button>

                      <button
                        onClick={() => updateDisputeStatus(dispute, "closed")}
                        disabled={updatingDisputeId === dispute.id || isFinal}
                        className="rounded-2xl bg-gray-500 px-5 py-3 font-black text-white hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Close Only
                      </button>

                      <Link
                        href={`/resolution-center/${dispute.id}`}
                        className="rounded-2xl bg-orange-400 px-5 py-3 text-center font-black text-black transition hover:bg-orange-300"
                      >
                        Open Full Case File
                      </Link>

                      <Link
                        href={`/orders/${dispute.order_id}`}
                        className="rounded-2xl border border-orange-400/40 px-5 py-3 text-center font-black text-orange-300 transition hover:bg-orange-400 hover:text-black"
                      >
                        View Order Detail
                      </Link>

                      {order?.product_id && (
                        <Link
                          href={`/product/${order.product_id}`}
                          className="rounded-2xl border border-cyan-400/40 px-5 py-3 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
                        >
                          View Product
                        </Link>
                      )}

                      {dispute.seller_id && (
                        <Link
                          href={`/seller-profile/${dispute.seller_id}`}
                          className="rounded-2xl border border-white/10 px-5 py-3 text-center font-black text-gray-300 transition hover:bg-white hover:text-black"
                        >
                          View Seller
                        </Link>
                      )}

                      {updatingDisputeId === dispute.id && (
                        <p className="text-center text-sm text-gray-400">
                          Updating dispute...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

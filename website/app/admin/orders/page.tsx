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

const orderStatuses = [
  "all",
  "Pending Payment",
  "Payment Verification",
  "Processing",
  "Completed",
  "Cancelled",
  "Refund Pending",
  "Refunded",
  "Disputed",
];

const statusOptions = [
  "Pending Payment",
  "Payment Verification",
  "Processing",
  "Completed",
  "Cancelled",
  "Refund Pending",
  "Refunded",
  "Disputed",
];

function normalizeStatus(status: string | null) {
  if (status === "pending") return "Pending Payment";
  if (status === "pending_payment") return "Pending Payment";
  if (status === "Menunggu Pembayaran") return "Pending Payment";
  if (status === "Menunggu Cek Pembayaran") return "Payment Verification";
  if (status === "Diproses") return "Processing";
  if (status === "Selesai") return "Completed";
  if (status === "Dibatalkan") return "Cancelled";
  if (status === "refund_pending") return "Refund Pending";
  return status || "Pending Payment";
}

function getStatusClass(status: string | null) {
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === "Completed") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  if (normalizedStatus === "Processing") {
    return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  }

  if (normalizedStatus === "Cancelled") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  if (normalizedStatus === "Refund Pending") {
    return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  }

  if (normalizedStatus === "Refunded") {
    return "border-purple-400/20 bg-purple-400/10 text-purple-300";
  }

  if (normalizedStatus === "Disputed") {
    return "border-orange-400/20 bg-orange-400/10 text-orange-300";
  }

  if (normalizedStatus === "Payment Verification") {
    return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  }

  return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
}


export default function AdminOrderManagementV1Page() {
  const { formatPrice } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return orders.filter((order) => {
      const normalizedStatus = normalizeStatus(order.status);

      const matchesStatus =
        activeStatus === "all" || normalizedStatus === activeStatus;

      const matchesSearch =
        !query ||
        (order.product || "").toLowerCase().includes(query) ||
        (order.buyer || "").toLowerCase().includes(query) ||
        (order.buyer_id || "").toLowerCase().includes(query) ||
        (order.seller_id || "").toLowerCase().includes(query) ||
        (order.category_name || "").toLowerCase().includes(query) ||
        (order.game_name || "").toLowerCase().includes(query) ||
        String(order.id).includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [orders, activeStatus, search]);

  const totalRevenue = useMemo(() => {
    return orders
      .filter((order) => normalizeStatus(order.status) === "Completed")
      .reduce(
        (sum, order) => sum + Number(order.total_price || order.price || 0),
        0
      );
  }, [orders]);

  const verificationCount = orders.filter(
    (order) => normalizeStatus(order.status) === "Payment Verification"
  ).length;

  const processingCount = orders.filter(
    (order) => normalizeStatus(order.status) === "Processing"
  ).length;

  const completedCount = orders.filter(
    (order) => normalizeStatus(order.status) === "Completed"
  ).length;

  const disputeCount = orders.filter(
    (order) => normalizeStatus(order.status) === "Disputed"
  ).length;

  async function loadOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setOrders(data || []);
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
        await loadOrders();
      }

      setLoading(false);
    }

    initializePage();
  }, []);

  async function updateOrderStatus(
    orderId: number,
    action: "status" | "confirm_payment" | "complete" | "refund",
    status?: string
  ) {
    if (!isAdmin) return;

    let note = "";
    let manualReference: string | undefined;

    if (action === "refund") {
      note = prompt("Refund reason:")?.trim() || "";
      if (!note) return;
      manualReference =
        prompt("Bank/QRIS/manual refund reference (leave blank for PayPal or wallet):")?.trim() ||
        undefined;
    } else if (status === "cancelled" || status === "disputed") {
      note = prompt(`Admin note for ${status}:`)?.trim() || "";
      if (!note) return;
    }

    try {
      setUpdatingOrderId(orderId);
      await authenticatedFetchJson("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({ orderId, action, status, note, manualReference }),
      });
      await loadOrders();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update order.");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function confirmPayment(orderId: number) {
    await updateOrderStatus(orderId, "confirm_payment");
  }

  async function markCompleted(orderId: number) {
    if (!confirm("Complete this delivered order and release escrow to the seller?")) return;
    await updateOrderStatus(orderId, "complete");
  }

  async function cancelOrder(orderId: number) {
    if (!confirm("Cancel this unpaid order?")) return;
    await updateOrderStatus(orderId, "status", "cancelled");
  }

  async function refundOrder(orderId: number) {
    if (!confirm("Refund this order? This can trigger a real PayPal refund.")) return;
    await updateOrderStatus(orderId, "refund");
  }

  async function disputeOrder(orderId: number) {
    if (!confirm("Mark this order as disputed?")) return;
    await updateOrderStatus(orderId, "status", "disputed");
  }

  async function handleStatusSelect(orderId: number, selectedStatus: string) {
    const normalized = selectedStatus.trim().toLowerCase();

    if (normalized === "processing") return confirmPayment(orderId);
    if (normalized === "completed") return markCompleted(orderId);
    if (normalized === "cancelled") return cancelOrder(orderId);
    if (normalized === "refunded") return refundOrder(orderId);
    if (normalized === "disputed") return disputeOrder(orderId);

    alert("Use the payment workflow to change this order to a payment state.");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading admin orders...
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-3xl font-black text-cyan-300">
            Login Required
          </h1>

          <p className="mt-4 text-gray-400">
            Please login first to access admin orders.
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

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Access Denied</h1>

          <p className="mt-4 text-gray-300">
            Only administrator accounts can access order management.
          </p>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-left text-sm text-gray-300">
            <p>Current user: {user.email}</p>
            <p>Detected role: {adminProfile?.role || "No profile found"}</p>
          </div>

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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_34%)]" />

        <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Admin Dashboard
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Order Management
            </h1>

            <p className="mt-5 max-w-2xl text-gray-300">
              Verify payments, monitor order status, handle disputes, and manage
              marketplace transactions.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 px-6 font-bold text-gray-300 transition hover:bg-white hover:text-black"
            >
              Admin Home
            </Link>

            <Link
              href="/admin/seller-applications"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Seller Applications
            </Link>
          </div>
        </div>
      </section>

      <section className="px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Orders</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {orders.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Verification</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {verificationCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Processing</p>
            <p className="mt-2 text-3xl font-black text-blue-300">
              {processingCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Completed</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {completedCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Revenue</p>
            <p className="mt-2 text-2xl font-black text-green-300">
              {formatPrice(totalRevenue)}
            </p>
          </div>
        </div>

        {disputeCount > 0 && (
          <div className="mb-8 rounded-3xl border border-orange-400/20 bg-orange-400/10 p-5">
            <p className="font-black text-orange-300">
              ⚠ {disputeCount} disputed order(s) need admin attention.
            </p>
          </div>
        )}

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by order ID, buyer, seller, product, category, or game..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="flex flex-wrap gap-3">
            {orderStatuses.map((status) => (
              <button
                key={status}
                onClick={() => setActiveStatus(status)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  activeStatus === status
                    ? "bg-cyan-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-cyan-400 hover:text-white"
                }`}
              >
                {status === "all" ? "All" : status}
              </button>
            ))}
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center">
            <h2 className="text-3xl font-black">No orders found.</h2>

            <p className="mt-3 text-gray-400">
              Orders will appear here after buyers complete checkout.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredOrders.map((order) => {
              const normalizedStatus = normalizeStatus(order.status);
              const totalPrice = Number(order.total_price || order.price || 0);

              return (
                <div
                  key={order.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
                >
                  <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black">
                          {order.product || "Unknown Product"}
                        </h2>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(
                            order.status
                          )}`}
                        >
                          {normalizedStatus}
                        </span>
                      </div>

                      <p className="mt-3 text-3xl font-black text-cyan-300">
                        {formatPrice(totalPrice)}
                      </p>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Order ID</p>
                          <p className="mt-1 font-bold">#{order.id}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Buyer</p>
                          <p className="mt-1 break-words font-bold">
                            {order.buyer || order.buyer_id || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Seller ID</p>
                          <p className="mt-1 break-words font-bold">
                            {order.seller_id || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Product ID</p>
                          <p className="mt-1 font-bold">
                            {order.product_id || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Category</p>
                          <p className="mt-1 font-bold">
                            {order.category_name || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Game</p>
                          <p className="mt-1 font-bold">
                            {order.game_name || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Quantity</p>
                          <p className="mt-1 font-bold">
                            {order.quantity || 1}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Created</p>
                          <p className="mt-1 font-bold">
                            {order.created_at
                              ? new Date(order.created_at).toLocaleString()
                              : "-"}
                          </p>
                        </div>
                      </div>

                      {order.payment_proof && (
                        <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                          <p className="text-sm font-black text-cyan-300">
                            Payment Details
                          </p>

                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-300">
                            {order.payment_proof}
                          </p>
                        </div>
                      )}

                      {order.payment_image && (
                        <div className="mt-5">
                          <p className="mb-3 font-bold text-cyan-300">
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
                              className="h-40 w-72 rounded-xl border border-white/10 object-cover transition hover:scale-105"
                            />
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <label className="text-sm font-bold text-gray-400">
                        Admin Status Control
                      </label>

                      <select
                        value={normalizedStatus}
                        onChange={(event) =>
                          handleStatusSelect(order.id, event.target.value)
                        }
                        disabled={updatingOrderId === order.id}
                        className="rounded-2xl border border-white/10 bg-black px-4 py-3 font-bold text-white outline-none focus:border-cyan-400 disabled:opacity-60"
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => confirmPayment(order.id)}
                        disabled={updatingOrderId === order.id}
                        className="rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-400 disabled:opacity-60"
                      >
                        Confirm Payment
                      </button>

                      <button
                        onClick={() => markCompleted(order.id)}
                        disabled={updatingOrderId === order.id}
                        className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white hover:bg-green-400 disabled:opacity-60"
                      >
                        Mark Completed
                      </button>

                      <button
                        onClick={() => cancelOrder(order.id)}
                        disabled={updatingOrderId === order.id}
                        className="rounded-2xl bg-red-500 px-5 py-3 font-black text-white hover:bg-red-400 disabled:opacity-60"
                      >
                        Cancel Order
                      </button>

                      <button
                        onClick={() => refundOrder(order.id)}
                        disabled={updatingOrderId === order.id}
                        className="rounded-2xl bg-purple-500 px-5 py-3 font-black text-white hover:bg-purple-400 disabled:opacity-60"
                      >
                        Mark Refunded
                      </button>

                      <button
                        onClick={() => disputeOrder(order.id)}
                        disabled={updatingOrderId === order.id}
                        className="rounded-2xl bg-orange-500 px-5 py-3 font-black text-white hover:bg-orange-400 disabled:opacity-60"
                      >
                        Mark Disputed
                      </button>

                      <Link
                        href={`/order/${order.id}`}
                        className="rounded-2xl border border-cyan-400/40 px-5 py-3 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
                      >
                        View Order Detail
                      </Link>

                      {order.product_id && (
                        <Link
                          href={`/product/${order.product_id}`}
                          className="rounded-2xl border border-white/10 px-5 py-3 text-center font-black text-gray-300 transition hover:bg-white hover:text-black"
                        >
                          View Product
                        </Link>
                      )}

                      {updatingOrderId === order.id && (
                        <p className="text-center text-sm text-gray-400">
                          Updating order...
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
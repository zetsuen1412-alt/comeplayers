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
  seller_name: string | null;
  avatar_url: string | null;
};

type Wallet = {
  id: number;
  user_id: string;
  balance: string | number;
  pending_balance: string | number;
  total_earned: string | number;
  total_spent: string | number;
  total_withdrawn: string | number;
  status: string;
};

type WalletTopup = {
  id: number;
  user_id: string;
  wallet_id: number;
  amount: string | number;
  payment_method: string;
  sender_name: string | null;
  sender_account: string | null;
  payment_note: string | null;
  payment_image: string | null;
  status: string;
  admin_note: string | null;
  processed_at: string | null;
  created_at: string;
  profiles: Profile | null;
  wallets: Wallet | null;
};

const statusFilters = ["all", "pending", "approved", "rejected", "cancelled"];

function formatPrice(value: string | number | null) {
  const price = Number(value || 0);
  if (!Number.isFinite(price)) return "Rp 0";
  return `Rp ${price.toLocaleString("id-ID")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function getStatusClass(status: string) {
  if (status === "approved") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  if (status === "pending") {
    return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  }

  if (status === "rejected" || status === "cancelled") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  return "border-white/10 bg-white/[0.04] text-gray-300";
}

function getDisplayName(profile: Profile | null, fallback: string) {
  return profile?.seller_name || profile?.username || profile?.email || fallback;
}

export default function AdminWalletTopUpManagementV1Page() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [topups, setTopups] = useState<WalletTopup[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredTopups = useMemo(() => {
    const query = search.trim().toLowerCase();

    return topups.filter((item) => {
      const profile = item.profiles;

      const matchesStatus =
        activeStatus === "all" || item.status === activeStatus;

      const matchesSearch =
        !query ||
        String(item.id).includes(query) ||
        item.user_id.toLowerCase().includes(query) ||
        item.payment_method.toLowerCase().includes(query) ||
        (item.sender_name || "").toLowerCase().includes(query) ||
        (item.sender_account || "").toLowerCase().includes(query) ||
        (item.payment_note || "").toLowerCase().includes(query) ||
        (profile?.email || "").toLowerCase().includes(query) ||
        (profile?.username || "").toLowerCase().includes(query) ||
        (profile?.seller_name || "").toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [topups, activeStatus, search]);

  const pendingTopups = topups.filter((item) => item.status === "pending");
  const approvedTopups = topups.filter((item) => item.status === "approved");
  const rejectedTopups = topups.filter((item) => item.status === "rejected");

  const pendingAmount = pendingTopups.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const approvedAmount = approvedTopups.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  async function loadTopups() {
    const { data, error } = await supabase
      .from("wallet_topups")
      .select(
        `
        *,
        profiles:user_id (
          id,
          email,
          username,
          role,
          seller_name,
          avatar_url
        ),
        wallets:wallet_id (
          id,
          user_id,
          balance,
          pending_balance,
          total_earned,
          total_spent,
          total_withdrawn,
          status
        )
      `
      )
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setTopups((data || []) as unknown as WalletTopup[]);
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
        .select("id,email,username,role,seller_name,avatar_url")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError) {
        alert(profileError.message);
        setLoading(false);
        return;
      }

      setAdminProfile(profileData || null);

      if (profileData?.role?.trim().toLowerCase() === "admin") {
        await loadTopups();
      }

      setLoading(false);
    }

    initializePage();
  }, []);

  async function approveTopup(item: WalletTopup) {
    if (item.status !== "pending") {
      alert("Only pending top up can be approved.");
      return;
    }

    if (!confirm(`Approve top up ${formatPrice(item.amount)}?`)) return;

    setUpdatingId(item.id);

    try {
      await authenticatedFetchJson("/api/admin/wallet-topups", {
        method: "PATCH",
        body: JSON.stringify({
          topupId: item.id,
          action: "approve",
          note: adminNotes[item.id]?.trim() || "Wallet top up approved by admin.",
        }),
      });

      await loadTopups();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to approve wallet top-up.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function rejectTopup(item: WalletTopup) {
    if (item.status !== "pending") {
      alert("Only pending top up can be rejected.");
      return;
    }

    const note = adminNotes[item.id]?.trim();

    if (!note) {
      alert("Admin note is required when rejecting top up.");
      return;
    }

    if (!confirm(`Reject top up ${formatPrice(item.amount)}?`)) return;

    setUpdatingId(item.id);

    try {
      await authenticatedFetchJson("/api/admin/wallet-topups", {
        method: "PATCH",
        body: JSON.stringify({ topupId: item.id, action: "reject", note }),
      });

      await loadTopups();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to reject wallet top-up.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading wallet top ups...
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
            Only admin accounts can manage wallet top ups.
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
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,197,94,.16),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-green-400/30 bg-green-400/10 px-4 py-2 text-sm font-black text-green-300">
              Admin Wallet Top Up
            </p>

            <h1 className="text-5xl font-black md:text-7xl">Top Up Requests</h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Review wallet top up payment proofs, approve balance deposits, or
              reject invalid requests.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/wallet"
              className="inline-flex h-12 items-center justify-center rounded-full border border-green-400 px-6 font-bold text-green-300 transition hover:bg-green-400 hover:text-black"
            >
              Wallet Dashboard
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

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Requests</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {topups.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Pending</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {pendingTopups.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Approved</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {approvedTopups.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Rejected</p>
            <p className="mt-2 text-3xl font-black text-red-300">
              {rejectedTopups.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Pending Amount</p>
            <p className="mt-2 text-2xl font-black text-green-300">
              {formatPrice(pendingAmount)}
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-3xl border border-green-400/20 bg-green-400/10 p-6">
          <p className="text-sm text-gray-300">Approved Top Up Amount</p>
          <p className="mt-2 text-3xl font-black text-green-300">
            {formatPrice(approvedAmount)}
          </p>
        </div>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search top ups by user, email, sender name, account, payment method, note, or ID..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="flex flex-wrap gap-3">
            {statusFilters.map((item) => (
              <button
                key={item}
                onClick={() => setActiveStatus(item)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  activeStatus === item
                    ? "bg-cyan-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-cyan-400 hover:text-white"
                }`}
              >
                {item === "all" ? "All" : item}
              </button>
            ))}
          </div>
        </div>

        {filteredTopups.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">No top up requests found.</h2>

            <p className="mt-3 text-gray-400">
              Wallet top up requests will appear here after users submit payment
              proof.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredTopups.map((item) => {
              const displayName = getDisplayName(item.profiles, item.user_id);

              return (
                <div
                  key={item.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
                >
                  <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black">
                          Top Up #{item.id}
                        </h2>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(
                            item.status
                          )}`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <p className="mt-4 text-4xl font-black text-green-300">
                        {formatPrice(item.amount)}
                      </p>

                      <div className="mt-6 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">User</p>
                          <p className="mt-1 font-black">{displayName}</p>
                          <p className="mt-1 break-words text-sm text-gray-400">
                            {item.profiles?.email || item.user_id}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">
                            Payment Method
                          </p>
                          <p className="mt-1 font-black">
                            {item.payment_method}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Sender Name</p>
                          <p className="mt-1 font-black">
                            {item.sender_name || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">
                            Sender Account
                          </p>
                          <p className="mt-1 break-words font-black">
                            {item.sender_account || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Created At</p>
                          <p className="mt-1 font-black">
                            {formatDate(item.created_at)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Processed At</p>
                          <p className="mt-1 font-black">
                            {formatDate(item.processed_at)}
                          </p>
                        </div>
                      </div>

                      {item.payment_note && (
                        <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                          <p className="text-sm font-black text-cyan-300">
                            User Payment Note
                          </p>
                          <p className="mt-2 text-sm leading-6 text-gray-300">
                            {item.payment_note}
                          </p>
                        </div>
                      )}

                      {item.payment_image && (
                        <div className="mt-5">
                          <p className="mb-3 font-bold text-cyan-300">
                            Payment Proof
                          </p>

                          <a
                            href={item.payment_image}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block"
                          >
                            <img
                              src={item.payment_image}
                              alt="Top up payment proof"
                              className="h-48 w-80 rounded-xl border border-white/10 object-cover transition hover:scale-105"
                            />
                          </a>
                        </div>
                      )}

                      {item.admin_note && (
                        <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                          <p className="text-sm font-black text-yellow-300">
                            Admin Note
                          </p>
                          <p className="mt-2 text-sm leading-6 text-gray-300">
                            {item.admin_note}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <label className="text-sm font-bold text-gray-400">
                        Admin Note
                      </label>

                      <textarea
                        value={adminNotes[item.id] || ""}
                        onChange={(event) =>
                          setAdminNotes((previous) => ({
                            ...previous,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="Write admin note..."
                        rows={5}
                        disabled={item.status !== "pending"}
                        className="w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400 disabled:opacity-60"
                      />

                      <button
                        onClick={() => approveTopup(item)}
                        disabled={updatingId === item.id || item.status !== "pending"}
                        className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white hover:bg-green-400 disabled:opacity-60"
                      >
                        Approve Top Up
                      </button>

                      <button
                        onClick={() => rejectTopup(item)}
                        disabled={updatingId === item.id || item.status !== "pending"}
                        className="rounded-2xl bg-red-500 px-5 py-3 font-black text-white hover:bg-red-400 disabled:opacity-60"
                      >
                        Reject Top Up
                      </button>

                      <Link
                        href={`/seller-profile/${item.user_id}`}
                        className="rounded-2xl border border-cyan-400 px-5 py-3 text-center font-black text-cyan-300 hover:bg-cyan-400 hover:text-black"
                      >
                        View User Profile
                      </Link>

                      {updatingId === item.id && (
                        <p className="text-center text-sm text-gray-400">
                          Updating top up...
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
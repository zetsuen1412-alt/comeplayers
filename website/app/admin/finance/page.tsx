"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
};

type Wallet = {
  id: number;
  user_id: string;
  balance: string | number | null;
  pending_balance: string | number | null;
  total_earned: string | number | null;
  total_spent: string | number | null;
  total_withdrawn: string | number | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type WalletTransaction = {
  id: number;
  wallet_id: number | null;
  user_id: string | null;
  type: string | null;
  amount: string | number | null;
  balance_before: string | number | null;
  balance_after: string | number | null;
  order_id: number | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
};

type WithdrawalRequest = {
  id?: number;
  user_id?: string | null;
  wallet_id?: number | null;
  amount?: string | number | null;
  method?: string | null;
  payment_method?: string | null;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  status?: string | null;
  admin_note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Order = {
  id: number;
  buyer_id: string | null;
  seller_id: string | null;
  product: string | null;
  price: string | number | null;
  total_price: string | number | null;
  status: string | null;
  escrow_status: string | null;
  escrow_released_at: string | null;
  completed_at: string | null;
  created_at: string | null;
};

type Dispute = {
  id: number;
  order_id: number | null;
  buyer_id: string | null;
  seller_id: string | null;
  status: string | null;
  created_at: string | null;
};

type Stats = {
  totalWalletBalance: number;
  totalPendingBalance: number;
  totalEarned: number;
  totalSpent: number;
  totalWithdrawn: number;
  totalEscrowReleased: number;
  pendingEscrow: number;
  pendingWithdrawals: number;
  openDisputes: number;
  walletCount: number;
  transactionCount: number;
};


function normalizeStatus(status: string | null | undefined) {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "completed") return "Completed";
  if (status === "Selesai") return "Completed";
  return status || "-";
}

function isCompletedOrder(status: string | null) {
  return status === "Completed" || status === "Selesai" || status === "completed";
}

function getWithdrawalMethod(row: WithdrawalRequest) {
  return row.method || row.payment_method || row.bank_name || "Withdrawal";
}

function getDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

export default function AdminFinanceDashboardPage() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);

  const [search, setSearch] = useState("");

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const stats = useMemo<Stats>(() => {
    const totalWalletBalance = wallets.reduce(
      (sum, wallet) => sum + Number(wallet.balance || 0),
      0
    );

    const totalPendingBalance = wallets.reduce(
      (sum, wallet) => sum + Number(wallet.pending_balance || 0),
      0
    );

    const totalEarned = wallets.reduce(
      (sum, wallet) => sum + Number(wallet.total_earned || 0),
      0
    );

    const totalSpent = wallets.reduce(
      (sum, wallet) => sum + Number(wallet.total_spent || 0),
      0
    );

    const totalWithdrawn = wallets.reduce(
      (sum, wallet) => sum + Number(wallet.total_withdrawn || 0),
      0
    );

    const totalEscrowReleased = orders
      .filter((order) => order.escrow_status === "released")
      .reduce(
        (sum, order) => sum + Number(order.total_price || order.price || 0),
        0
      );

    const pendingEscrow = orders
      .filter(
        (order) =>
          isCompletedOrder(order.status) &&
          order.escrow_status !== "released" &&
          !order.escrow_released_at
      )
      .reduce(
        (sum, order) => sum + Number(order.total_price || order.price || 0),
        0
      );

    const pendingWithdrawals = withdrawals
      .filter((row) => (row.status || "pending").toLowerCase() === "pending")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const openDisputes = disputes.filter((row) =>
      ["open", "investigating"].includes((row.status || "").toLowerCase())
    ).length;

    return {
      totalWalletBalance,
      totalPendingBalance,
      totalEarned,
      totalSpent,
      totalWithdrawn,
      totalEscrowReleased,
      pendingEscrow,
      pendingWithdrawals,
      openDisputes,
      walletCount: wallets.length,
      transactionCount: transactions.length,
    };
  }, [wallets, transactions, withdrawals, orders, disputes]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      if (!query) return true;

      return (
        String(transaction.id).includes(query) ||
        String(transaction.order_id || "").includes(query) ||
        String(transaction.user_id || "").toLowerCase().includes(query) ||
        (transaction.type || "").toLowerCase().includes(query) ||
        (transaction.status || "").toLowerCase().includes(query) ||
        (transaction.description || "").toLowerCase().includes(query)
      );
    });
  }, [transactions, search]);

  async function loadFinanceData() {
    const [
      walletsResult,
      transactionsResult,
      withdrawalsResult,
      ordersResult,
      disputesResult,
    ] = await Promise.all([
      supabase.from("wallets").select("*").order("id", { ascending: false }),
      supabase
        .from("wallet_transactions")
        .select("*")
        .order("id", { ascending: false })
        .limit(50),
      supabase
        .from("withdrawal_requests")
        .select("*")
        .order("id", { ascending: false })
        .limit(50),
      supabase
        .from("orders")
        .select(
          "id,buyer_id,seller_id,product,price,total_price,status,escrow_status,escrow_released_at,completed_at,created_at"
        )
        .order("id", { ascending: false }),
      supabase
        .from("disputes")
        .select("id,order_id,buyer_id,seller_id,status,created_at")
        .order("id", { ascending: false }),
    ]);

    if (walletsResult.error) alert(walletsResult.error.message);
    if (transactionsResult.error) alert(transactionsResult.error.message);
    if (withdrawalsResult.error) alert(withdrawalsResult.error.message);
    if (ordersResult.error) alert(ordersResult.error.message);
    if (disputesResult.error) alert(disputesResult.error.message);

    setWallets((walletsResult.data || []) as Wallet[]);
    setTransactions((transactionsResult.data || []) as WalletTransaction[]);
    setWithdrawals((withdrawalsResult.data || []) as WithdrawalRequest[]);
    setOrders((ordersResult.data || []) as Order[]);
    setDisputes((disputesResult.data || []) as Dispute[]);
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
        await loadFinanceData();
      }

      setLoading(false);
    }

    initializePage();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading finance dashboard...
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
            Only admin accounts can access finance dashboard.
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,211,238,.16),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-green-400/30 bg-green-400/10 px-4 py-2 text-sm font-black text-green-300">
              Admin Finance
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Finance Dashboard
            </h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Monitor wallets, escrow releases, withdrawals, disputes, and recent
              marketplace financial activity.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadFinanceData}
              className="inline-flex h-12 items-center justify-center rounded-full bg-green-400 px-6 font-black text-black transition hover:bg-green-300"
            >
              Refresh
            </button>

            <Link
              href="/admin"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Admin Home
            </Link>

            <Link
              href="/admin/withdrawals"
              className="inline-flex h-12 items-center justify-center rounded-full border border-yellow-400 px-6 font-bold text-yellow-300 transition hover:bg-yellow-400 hover:text-black"
            >
              Withdrawals
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-6">
            <p className="text-sm text-gray-300">Total Wallet Balance</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {formatPrice(stats.totalWalletBalance)}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              {stats.walletCount} wallets
            </p>
          </div>

          <div className="rounded-3xl border border-green-400/20 bg-green-400/10 p-6">
            <p className="text-sm text-gray-300">Escrow Released</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {formatPrice(stats.totalEscrowReleased)}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Released completed orders
            </p>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-6">
            <p className="text-sm text-gray-300">Pending Escrow</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {formatPrice(stats.pendingEscrow)}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Completed but unreleased
            </p>
          </div>

          <div className="rounded-3xl border border-purple-400/20 bg-purple-400/10 p-6">
            <p className="text-sm text-gray-300">Pending Withdrawals</p>
            <p className="mt-2 text-3xl font-black text-purple-300">
              {formatPrice(stats.pendingWithdrawals)}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Waiting admin approval
            </p>
          </div>
        </div>

        <div className="mb-10 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Earned</p>
            <p className="mt-2 text-2xl font-black text-green-300">
              {formatPrice(stats.totalEarned)}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Spent</p>
            <p className="mt-2 text-2xl font-black text-red-300">
              {formatPrice(stats.totalSpent)}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Withdrawn</p>
            <p className="mt-2 text-2xl font-black text-yellow-300">
              {formatPrice(stats.totalWithdrawn)}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Pending Balance</p>
            <p className="mt-2 text-2xl font-black text-cyan-300">
              {formatPrice(stats.totalPendingBalance)}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Open Disputes</p>
            <p className="mt-2 text-2xl font-black text-orange-300">
              {stats.openDisputes}
            </p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
            <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-3xl font-black">Recent Wallet Transactions</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Latest wallet ledger records.
                </p>
              </div>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search transaction, order, type, status..."
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-3 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400 lg:w-[360px]"
              />
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-8 text-center text-gray-400">
                No wallet transactions found.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-5"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <p className="text-sm font-black text-cyan-300">
                          #{transaction.id} · {transaction.type || "transaction"}
                        </p>

                        <p className="mt-2 text-sm leading-6 text-gray-300">
                          {transaction.description || "No description"}
                        </p>

                        <p className="mt-2 text-xs text-gray-500">
                          User: {transaction.user_id || "-"}
                        </p>

                        {transaction.order_id && (
                          <Link
                            href={`/order/${transaction.order_id}`}
                            className="mt-2 inline-flex text-sm font-bold text-yellow-300 hover:text-yellow-200"
                          >
                            Open Order #{transaction.order_id}
                          </Link>
                        )}
                      </div>

                      <div className="md:text-right">
                        <p className="text-2xl font-black text-green-300">
                          {formatPrice(transaction.amount)}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {normalizeStatus(transaction.status)}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {getDate(transaction.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-8">
            <section className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-7 shadow-2xl shadow-black/30">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-yellow-300">
                    Withdrawal Requests
                  </h2>

                  <p className="mt-2 text-sm text-gray-300">
                    Latest payout requests.
                  </p>
                </div>

                <Link
                  href="/admin/withdrawals"
                  className="rounded-full border border-yellow-400 px-4 py-2 text-sm font-black text-yellow-300 hover:bg-yellow-400 hover:text-black"
                >
                  Manage
                </Link>
              </div>

              {withdrawals.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-gray-400">
                  No withdrawal requests yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {withdrawals.slice(0, 8).map((withdrawal, index) => (
                    <div
                      key={withdrawal.id || index}
                      className="rounded-2xl border border-white/10 bg-black/30 p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-black text-yellow-300">
                            {formatPrice(withdrawal.amount)}
                          </p>

                          <p className="mt-1 text-sm text-gray-300">
                            {getWithdrawalMethod(withdrawal)}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {withdrawal.account_name ||
                              withdrawal.account_number ||
                              withdrawal.user_id ||
                              "-"}
                          </p>
                        </div>

                        <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs font-black text-gray-300">
                          {normalizeStatus(withdrawal.status)}
                        </span>
                      </div>

                      <p className="mt-3 text-xs text-gray-500">
                        {getDate(withdrawal.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-7 shadow-2xl shadow-black/30">
              <h2 className="text-2xl font-black text-cyan-300">
                Finance Quick Links
              </h2>

              <div className="mt-5 grid gap-3">
                <Link
                  href="/admin/reconciliation"
                  className="rounded-2xl border border-violet-400 px-5 py-3 text-center font-black text-violet-300 transition hover:bg-violet-400 hover:text-black"
                >
                  Financial Reconciliation
                </Link>

                <Link
                  href="/admin/withdrawals"
                  className="rounded-2xl border border-yellow-400 px-5 py-3 text-center font-black text-yellow-300 transition hover:bg-yellow-400 hover:text-black"
                >
                  Withdrawal Approval
                </Link>

                <Link
                  href="/admin/disputes"
                  className="rounded-2xl border border-orange-400 px-5 py-3 text-center font-black text-orange-300 transition hover:bg-orange-400 hover:text-black"
                >
                  Dispute Center
                </Link>

                <Link
                  href="/admin/orders"
                  className="rounded-2xl border border-cyan-400 px-5 py-3 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
                >
                  Order Management
                </Link>

                <Link
                  href="/wallet"
                  className="rounded-2xl border border-white/10 px-5 py-3 text-center font-black text-gray-300 transition hover:bg-white hover:text-black"
                >
                  My Wallet
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

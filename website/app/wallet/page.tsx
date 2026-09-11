"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaHistory,
  FaPlus,
  FaShieldAlt,
  FaWallet,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type WalletOverview = {
  wallet: {
    balance?: number | string | null;
    pending_balance?: number | string | null;
    total_earned?: number | string | null;
    total_spent?: number | string | null;
    total_withdrawn?: number | string | null;
    status?: string | null;
  };
  transactions: Array<{
    id: number;
    order_id?: number | null;
    type?: string | null;
    transaction_type?: string | null;
    amount?: number | string | null;
    balance_after?: number | string | null;
    status?: string | null;
    description?: string | null;
    created_at?: string | null;
  }>;
};

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function transactionLabel(type?: string | null) {
  return String(type || "transaction")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function WalletOverviewPage() {
  const { formatPrice } = useCurrency();
  const [data, setData] = useState<WalletOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadWallet() {
      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (sessionError || !accessToken) {
          throw new Error("Please login to open your wallet.");
        }

        const response = await fetch("/api/wallet/overview", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error || "Failed to load wallet.");
        }

        setData(json);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load wallet."
        );
      } finally {
        setLoading(false);
      }
    }

    loadWallet();
  }, []);

  const totals = useMemo(() => {
    const transactions = data?.transactions || [];
    const incoming = transactions
      .filter((transaction) => numberValue(transaction.amount) > 0)
      .reduce((sum, transaction) => sum + numberValue(transaction.amount), 0);
    const outgoing = transactions
      .filter((transaction) => numberValue(transaction.amount) < 0)
      .reduce((sum, transaction) => sum + Math.abs(numberValue(transaction.amount)), 0);

    return { incoming, outgoing };
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-24 text-center text-white">
        Loading wallet...
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-24 text-center text-white">
        <h1 className="text-4xl font-black">Wallet Unavailable</h1>
        <p className="mt-4 text-red-300">{error}</p>
      </main>
    );
  }

  const wallet = data.wallet;

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_38%)]">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-4 py-14 md:flex-row md:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              <FaWallet /> ComePlayers Wallet
            </p>
            <h1 className="mt-5 text-5xl font-black md:text-7xl">
              {formatPrice(wallet.balance)}
            </h1>
            <p className="mt-3 text-slate-300">Available marketplace balance</p>
          </div>
          <Link
            href="/wallet/topup"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 py-4 font-black text-black hover:bg-cyan-300"
          >
            <FaPlus /> Top Up Wallet
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Pending Balance" value={formatPrice(wallet.pending_balance)} />
          <Metric label="Total Earned" value={formatPrice(wallet.total_earned || totals.incoming)} />
          <Metric label="Total Spent" value={formatPrice(wallet.total_spent || totals.outgoing)} />
          <Metric label="Total Withdrawn" value={formatPrice(wallet.total_withdrawn)} />
        </div>

        <div className="mt-10 grid gap-8 xl:grid-cols-[1fr_340px]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="flex items-center gap-3 text-2xl font-black">
              <FaHistory className="text-cyan-300" /> Transaction History
            </h2>

            <div className="mt-6 space-y-3">
              {data.transactions.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-black/30 p-6 text-slate-400">
                  No wallet transactions yet.
                </p>
              ) : (
                data.transactions.map((transaction) => {
                  const amount = numberValue(transaction.amount);
                  const incoming = amount >= 0;
                  const Icon = incoming ? FaArrowDown : FaArrowUp;

                  return (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                          incoming
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-red-400/10 text-red-300"
                        }`}>
                          <Icon />
                        </div>
                        <div>
                          <p className="font-black">
                            {transactionLabel(
                              transaction.transaction_type || transaction.type
                            )}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {transaction.description || formatDate(transaction.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-black ${
                          incoming ? "text-emerald-300" : "text-red-300"
                        }`}>
                          {incoming ? "+" : "-"}
                          {formatPrice(Math.abs(amount))}
                        </p>
                        {transaction.order_id ? (
                          <Link
                            href={`/orders/${transaction.order_id}`}
                            className="mt-1 block text-xs text-cyan-300"
                          >
                            Order #{transaction.order_id}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
              <h2 className="flex items-center gap-2 text-xl font-black text-emerald-200">
                <FaShieldAlt /> Escrow Protected
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Seller earnings are released only after the buyer confirms delivery
                or the inspection window expires.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-black">Wallet Actions</h2>
              <div className="mt-5 grid gap-3">
                <Link
                  href="/wallet/topup"
                  className="rounded-xl bg-cyan-400 px-5 py-4 text-center font-black text-black"
                >
                  Add Balance
                </Link>
                <Link
                  href="/seller/payouts"
                  className="rounded-xl border border-white/10 bg-black/30 px-5 py-4 text-center font-black hover:border-cyan-400"
                >
                  Withdraw Earnings
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-cyan-300">{value}</p>
    </div>
  );
}

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
  seller_status: string | null;
  seller_name: string | null;
};

type Order = {
  id: number;
  product_id: number | null;
  product: string | null;
  price: string | number | null;
  total_price: string | number | null;
  status: string | null;
  escrow_status: string | null;
  escrow_released_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type Product = {
  id: number;
  title: string | null;
  price: string | number | null;
  status: string | null;
  stock: number | null;
};

type Review = {
  id: number;
  rating: number;
  review_text: string | null;
  created_at: string;
};

type MarketplaceEvent = {
  id: number;
  event_type: string;
  product_id: number | null;
  seller_id: string | null;
  order_id: number | null;
  game_slug: string | null;
  game_name: string | null;
  category_slug: string | null;
  category_name: string | null;
  created_at: string;
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
  id: number;
  user_id: string;
  wallet_id: number;
  amount: string | number;
  payout_method: string | null;
  payout_account_name: string | null;
  payout_account_number: string | null;
  payout_note: string | null;
  status: string | null;
  admin_note: string | null;
  processed_at: string | null;
  created_at: string;
};

function normalizeStatus(status: string | null) {
  if (status === "Selesai") return "Completed";
  if (status === "completed") return "Completed";
  if (status === "Diproses") return "Processing";
  if (status === "Menunggu Cek Pembayaran") return "Payment Verification";
  if (status === "Menunggu Pembayaran") return "Pending Payment";
  if (status === "pending") return "Pending Payment";
  if (status === "pending_payment") return "Pending Payment";
  return status || "Pending Payment";
}

function formatPrice(value: string | number | null | undefined) {
  const price = Number(value || 0);
  if (!Number.isFinite(price)) return "Rp 0";
  return `Rp ${price.toLocaleString("id-ID")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function getDayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function getDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function isCompletedOrder(status: string | null) {
  return normalizeStatus(status) === "Completed";
}

function renderStars(rating: number) {
  const safeRating = Math.max(0, Math.min(5, Math.round(rating)));
  return "★★★★★"
    .split("")
    .map((_, index) => (index < safeRating ? "★" : "☆"))
    .join("");
}

export default function SellerAnalyticsV2Page() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [marketplaceEvents, setMarketplaceEvents] = useState<MarketplaceEvent[]>([]);
  const [eventRangeDays, setEventRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const sellerDisplayName =
    profile?.seller_name || profile?.username || user?.email || "Seller";

  const completedOrders = useMemo(
    () => orders.filter((order) => isCompletedOrder(order.status)),
    [orders]
  );

  const processingOrders = useMemo(
    () => orders.filter((order) => normalizeStatus(order.status) === "Processing"),
    [orders]
  );

  const totalRevenue = useMemo(
    () =>
      completedOrders.reduce(
        (sum, order) => sum + Number(order.total_price || order.price || 0),
        0
      ),
    [completedOrders]
  );

  const escrowReleasedOrders = useMemo(
    () =>
      completedOrders.filter(
        (order) => order.escrow_status === "released" || order.escrow_released_at
      ),
    [completedOrders]
  );

  const escrowReleasedAmount = useMemo(
    () =>
      escrowReleasedOrders.reduce(
        (sum, order) => sum + Number(order.total_price || order.price || 0),
        0
      ),
    [escrowReleasedOrders]
  );

  const pendingEscrowAmount = useMemo(
    () =>
      completedOrders
        .filter(
          (order) =>
            order.escrow_status !== "released" && !order.escrow_released_at
        )
        .reduce(
          (sum, order) => sum + Number(order.total_price || order.price || 0),
          0
        ),
    [completedOrders]
  );

  const revenue7Days = useMemo(() => {
    const since = getDaysAgo(7).getTime();

    return walletTransactions
      .filter(
        (tx) =>
          tx.type === "sale_release" &&
          tx.created_at &&
          new Date(tx.created_at).getTime() >= since
      )
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [walletTransactions]);

  const revenue30Days = useMemo(() => {
    const since = getDaysAgo(30).getTime();

    return walletTransactions
      .filter(
        (tx) =>
          tx.type === "sale_release" &&
          tx.created_at &&
          new Date(tx.created_at).getTime() >= since
      )
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [walletTransactions]);

  const conversionRate = useMemo(() => {
    if (orders.length === 0) return 0;
    return Math.round((completedOrders.length / orders.length) * 100);
  }, [orders, completedOrders]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;

    const total = reviews.reduce((sum, review) => sum + Number(review.rating), 0);

    return Math.round((total / reviews.length) * 10) / 10;
  }, [reviews]);

  const monthlyRevenue = useMemo(() => {
    const map = new Map<string, number>();

    completedOrders.forEach((order) => {
      const monthKey = new Date(order.created_at).toLocaleDateString("id-ID", {
        month: "short",
        year: "numeric",
      });

      map.set(
        monthKey,
        (map.get(monthKey) || 0) + Number(order.total_price || order.price || 0)
      );
    });

    return Array.from(map.entries()).slice(-6);
  }, [completedOrders]);

  const maxMonthlyRevenue = Math.max(
    1,
    ...monthlyRevenue.map(([, revenue]) => revenue)
  );

  const topProducts = useMemo(() => {
    const productMap = new Map<
      string,
      { name: string; orders: number; revenue: number }
    >();

    completedOrders.forEach((order) => {
      const key = String(order.product_id || order.product || "unknown");
      const current = productMap.get(key) || {
        name: order.product || "Unknown Product",
        orders: 0,
        revenue: 0,
      };

      current.orders += 1;
      current.revenue += Number(order.total_price || order.price || 0);
      productMap.set(key, current);
    });

    return Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [completedOrders]);

  const dailyRevenue7Days = useMemo(() => {
    const days: { date: string; revenue: number }[] = [];

    for (let index = 6; index >= 0; index--) {
      const date = getDaysAgo(index);
      const key = date.toISOString().slice(0, 10);

      const revenue = walletTransactions
        .filter(
          (tx) =>
            tx.type === "sale_release" &&
            tx.created_at &&
            getDayKey(tx.created_at) === key
        )
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

      days.push({
        date: date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
        }),
        revenue,
      });
    }

    return days;
  }, [walletTransactions]);

  const maxDailyRevenue = Math.max(
    1,
    ...dailyRevenue7Days.map((day) => day.revenue)
  );

  const pendingWithdrawals = useMemo(() => {
    return withdrawals.filter((item) => item.status === "pending");
  }, [withdrawals]);

  const pendingWithdrawalAmount = useMemo(() => {
    return pendingWithdrawals.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );
  }, [pendingWithdrawals]);

  const latestOrders = useMemo(() => {
    return orders.slice(0, 6);
  }, [orders]);

  const productNameById = useMemo(() => {
    return new Map(
      products.map((product) => [Number(product.id), product.title || `Product #${product.id}`])
    );
  }, [products]);

  const filteredMarketplaceEvents = useMemo(() => {
    const since = getDaysAgo(eventRangeDays).getTime();

    return marketplaceEvents.filter((event) => {
      if (!event.created_at) return false;
      return new Date(event.created_at).getTime() >= since;
    });
  }, [marketplaceEvents, eventRangeDays]);

  const eventCounts = useMemo(() => {
    return filteredMarketplaceEvents.reduce<Record<string, number>>((acc, event) => {
      acc[event.event_type] = (acc[event.event_type] || 0) + 1;
      return acc;
    }, {});
  }, [filteredMarketplaceEvents]);

  const funnelOfferViews = eventCounts.offer_view || 0;
  const funnelProductViews = eventCounts.product_view || 0;
  const funnelCheckoutStarts = eventCounts.checkout_start || 0;
  const funnelPaymentSuccess = eventCounts.payment_success || 0;
  const funnelOrderComplete = eventCounts.order_complete || 0;

  const funnelConversionRate = useMemo(() => {
    if (funnelProductViews === 0) return 0;
    return Math.round((funnelOrderComplete / funnelProductViews) * 1000) / 10;
  }, [funnelProductViews, funnelOrderComplete]);

  const topConvertingProducts = useMemo(() => {
    const map = new Map<
      number,
      { productId: number; name: string; views: number; checkoutStarts: number; completed: number }
    >();

    filteredMarketplaceEvents.forEach((event) => {
      if (!event.product_id) return;

      const productId = Number(event.product_id);
      const current = map.get(productId) || {
        productId,
        name: productNameById.get(productId) || `Product #${productId}`,
        views: 0,
        checkoutStarts: 0,
        completed: 0,
      };

      if (event.event_type === "product_view") current.views += 1;
      if (event.event_type === "checkout_start") current.checkoutStarts += 1;
      if (event.event_type === "order_complete") current.completed += 1;

      map.set(productId, current);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        conversionRate:
          item.views > 0 ? Math.round((item.completed / item.views) * 1000) / 10 : 0,
      }))
      .sort((a, b) => {
        const completedDiff = b.completed - a.completed;
        if (completedDiff !== 0) return completedDiff;

        const checkoutDiff = b.checkoutStarts - a.checkoutStarts;
        if (checkoutDiff !== 0) return checkoutDiff;

        return b.views - a.views;
      })
      .slice(0, 8);
  }, [filteredMarketplaceEvents, productNameById]);

  async function loadSellerAnalytics(currentUser: User) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,username,seller_status,seller_name")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) {
      alert(profileError.message);
      return;
    }

    setProfile(profileData || null);

    if (!profileData || profileData.seller_status !== "approved") {
      return;
    }

    const [ordersResult, productsResult, reviewsResult, walletResult, eventsResult] =
      await Promise.all([
        supabase
          .from("orders")
          .select(
            "id,product_id,product,price,total_price,status,escrow_status,escrow_released_at,completed_at,created_at"
          )
          .eq("seller_id", currentUser.id)
          .order("id", { ascending: false }),
        supabase
          .from("products")
          .select("id,title,price,status,stock")
          .eq("seller_id", currentUser.id)
          .order("id", { ascending: false }),
        supabase
          .from("seller_reviews")
          .select("id,rating,review_text,created_at")
          .eq("seller_id", currentUser.id)
          .order("id", { ascending: false }),
        supabase
          .from("wallets")
          .select("*")
          .eq("user_id", currentUser.id)
          .maybeSingle(),
        supabase
          .from("marketplace_events")
          .select("id,event_type,product_id,seller_id,order_id,game_slug,game_name,category_slug,category_name,created_at")
          .eq("seller_id", currentUser.id)
          .gte("created_at", getDaysAgo(90).toISOString())
          .order("id", { ascending: false })
          .limit(1000),
      ]);

    if (ordersResult.error) {
      alert(ordersResult.error.message);
      return;
    }

    if (productsResult.error) {
      alert(productsResult.error.message);
      return;
    }

    if (reviewsResult.error) {
      alert(reviewsResult.error.message);
      return;
    }

    if (walletResult.error) {
      alert(walletResult.error.message);
      return;
    }

    if (eventsResult.error) {
      console.warn("Marketplace analytics events unavailable:", eventsResult.error.message);
      setMarketplaceEvents([]);
    } else {
      setMarketplaceEvents(eventsResult.data || []);
    }

    setOrders(ordersResult.data || []);
    setProducts(productsResult.data || []);
    setReviews(reviewsResult.data || []);
    setWallet(walletResult.data || null);

    if (walletResult.data?.id) {
      const [transactionsResult, withdrawalsResult] = await Promise.all([
        supabase
          .from("wallet_transactions")
          .select("*")
          .eq("wallet_id", walletResult.data.id)
          .order("id", { ascending: false })
          .limit(10),
        supabase
          .from("withdrawal_requests")
          .select("*")
          .eq("wallet_id", walletResult.data.id)
          .order("id", { ascending: false })
          .limit(10),
      ]);

      if (transactionsResult.error) {
        alert(transactionsResult.error.message);
        return;
      }

      if (withdrawalsResult.error) {
        alert(withdrawalsResult.error.message);
        return;
      }

      setWalletTransactions(transactionsResult.data || []);
      setWithdrawals(withdrawalsResult.data || []);
    } else {
      setWalletTransactions([]);
      setWithdrawals([]);
    }
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
      await loadSellerAnalytics(userData.user);
      setLoading(false);
    }

    initializePage();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading seller analytics...
        </p>
      </main>
    );
  }

  if (!user || profile?.seller_status !== "approved") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-lg rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-yellow-300">
            Seller Approval Required
          </h1>

          <p className="mt-4 text-gray-300">
            Only approved sellers can access analytics.
          </p>

          <Link
            href="/seller"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Back to Seller Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(250,204,21,.14),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Seller Analytics V2
            </p>

            <h1 className="text-5xl font-black md:text-7xl">Analytics</h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Track revenue, escrow, wallet balance, withdrawal activity,
              rating, top products, and sales performance for {sellerDisplayName}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => user && loadSellerAnalytics(user)}
              className="inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black transition hover:bg-cyan-300"
            >
              Refresh
            </button>

            <Link
              href="/wallet"
              className="inline-flex h-12 items-center justify-center rounded-full border border-green-400 px-6 font-bold text-green-300 transition hover:bg-green-400 hover:text-black"
            >
              Wallet
            </Link>

            <Link
              href="/seller/orders"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 px-6 font-bold text-gray-300 transition hover:bg-white hover:text-black"
            >
              Orders
            </Link>

            <Link
              href="/seller"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-green-400/20 bg-green-400/10 p-6">
            <p className="text-sm text-gray-300">Wallet Balance</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {formatPrice(wallet?.balance)}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Available to withdraw
            </p>
          </div>

          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-6">
            <p className="text-sm text-gray-300">Escrow Released</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {formatPrice(escrowReleasedAmount)}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              {escrowReleasedOrders.length} released orders
            </p>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-6">
            <p className="text-sm text-gray-300">Pending Escrow</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {formatPrice(pendingEscrowAmount)}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Completed but unreleased
            </p>
          </div>

          <div className="rounded-3xl border border-purple-400/20 bg-purple-400/10 p-6">
            <p className="text-sm text-gray-300">Pending Withdrawals</p>
            <p className="mt-2 text-3xl font-black text-purple-300">
              {formatPrice(pendingWithdrawalAmount)}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              {pendingWithdrawals.length} request(s)
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Total Revenue</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {formatPrice(totalRevenue)}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Revenue 7 Days</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {formatPrice(revenue7Days)}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Revenue 30 Days</p>
            <p className="mt-2 text-3xl font-black text-blue-300">
              {formatPrice(revenue30Days)}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Average Rating</p>
            <p className="mt-2 text-4xl font-black text-yellow-300">
              {averageRating || "0.0"}
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Total Orders</p>
            <p className="mt-2 text-4xl font-black text-cyan-300">
              {orders.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Completed Orders</p>
            <p className="mt-2 text-4xl font-black text-green-300">
              {completedOrders.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Processing Orders</p>
            <p className="mt-2 text-4xl font-black text-blue-300">
              {processingOrders.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Conversion Rate</p>
            <p className="mt-2 text-4xl font-black text-purple-300">
              {conversionRate}%
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-col justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-black text-cyan-300">Marketplace Funnel</h2>
            <p className="mt-1 text-sm text-gray-400">
              Showing buyer activity from the last {eventRangeDays} days.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setEventRangeDays(days)}
                className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                  eventRangeDays === days
                    ? "border-cyan-400 bg-cyan-400 text-black"
                    : "border-white/10 bg-black/30 text-gray-300 hover:border-cyan-400 hover:text-cyan-300"
                }`}
              >
                {days}D
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-6">
            <p className="text-sm text-gray-300">Offer Views</p>
            <p className="mt-2 text-4xl font-black text-cyan-300">
              {funnelOfferViews}
            </p>
            <p className="mt-2 text-xs text-gray-400">Last {eventRangeDays} days</p>
          </div>

          <div className="rounded-3xl border border-blue-400/20 bg-blue-400/10 p-6">
            <p className="text-sm text-gray-300">Product Views</p>
            <p className="mt-2 text-4xl font-black text-blue-300">
              {funnelProductViews}
            </p>
            <p className="mt-2 text-xs text-gray-400">Detail page visits</p>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-6">
            <p className="text-sm text-gray-300">Checkout Starts</p>
            <p className="mt-2 text-4xl font-black text-yellow-300">
              {funnelCheckoutStarts}
            </p>
            <p className="mt-2 text-xs text-gray-400">Buyer intent signal</p>
          </div>

          <div className="rounded-3xl border border-green-400/20 bg-green-400/10 p-6">
            <p className="text-sm text-gray-300">Payment Success</p>
            <p className="mt-2 text-4xl font-black text-green-300">
              {funnelPaymentSuccess}
            </p>
            <p className="mt-2 text-xs text-gray-400">Paid or submitted</p>
          </div>

          <div className="rounded-3xl border border-purple-400/20 bg-purple-400/10 p-6">
            <p className="text-sm text-gray-300">Funnel Conversion</p>
            <p className="mt-2 text-4xl font-black text-purple-300">
              {funnelConversionRate}%
            </p>
            <p className="mt-2 text-xs text-gray-400">Orders / views</p>
          </div>
        </div>

        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Active Products</p>
            <p className="mt-2 text-4xl font-black text-cyan-300">
              {products.filter((product) => product.status === "active").length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Total Reviews</p>
            <p className="mt-2 text-4xl font-black text-yellow-300">
              {reviews.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Lifetime Earnings</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {formatPrice(wallet?.total_earned)}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Total Withdrawn</p>
            <p className="mt-2 text-3xl font-black text-red-300">
              {formatPrice(wallet?.total_withdrawn)}
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-8 lg:grid-cols-[1fr_420px]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">Revenue Last 7 Days</h2>

            <div className="mt-8 flex h-72 items-end gap-4 rounded-2xl border border-white/10 bg-black/30 p-5">
              {dailyRevenue7Days.map((day) => {
                const height = Math.max(8, (day.revenue / maxDailyRevenue) * 100);

                return (
                  <div key={day.date} className="flex flex-1 flex-col items-center gap-3">
                    <div className="flex h-44 w-full items-end">
                      <div
                        className="w-full rounded-t-2xl bg-cyan-400"
                        style={{ height: `${height}%` }}
                      />
                    </div>

                    <p className="text-center text-xs text-gray-400">{day.date}</p>
                    <p className="text-center text-xs font-bold text-cyan-300">
                      {formatPrice(day.revenue)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black text-yellow-300">
              Recent Reviews
            </h2>

            {reviews.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-gray-400">
                No reviews yet.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {reviews.slice(0, 5).map((review) => (
                  <div
                    key={review.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-5"
                  >
                    <p className="text-xl text-yellow-300">
                      {renderStars(review.rating)}
                    </p>

                    <p className="mt-3 text-sm leading-6 text-gray-300">
                      {review.review_text || "No written review."}
                    </p>

                    <p className="mt-3 text-xs text-gray-500">
                      {formatDate(review.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>

        <div className="mb-8 grid gap-8 lg:grid-cols-[1fr_420px]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">Top Selling Products</h2>

            {topProducts.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-gray-400">
                No completed sales yet.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {topProducts.map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="rounded-2xl border border-white/10 bg-black/30 p-5"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                      <div>
                        <p className="text-sm font-black text-cyan-300">
                          #{index + 1}
                        </p>

                        <h3 className="mt-1 text-xl font-black">{item.name}</h3>

                        <p className="mt-1 text-sm text-gray-400">
                          {item.orders} completed orders
                        </p>
                      </div>

                      <p className="text-2xl font-black text-green-300">
                        {formatPrice(item.revenue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">Monthly Revenue</h2>

            {monthlyRevenue.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-gray-400">
                No monthly revenue yet.
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {monthlyRevenue.map(([month, revenue]) => {
                  const width = Math.max(8, (revenue / maxMonthlyRevenue) * 100);

                  return (
                    <div key={month}>
                      <div className="mb-2 flex justify-between gap-4">
                        <span className="font-bold text-gray-300">{month}</span>
                        <span className="font-black text-green-300">
                          {formatPrice(revenue)}
                        </span>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-black/50">
                        <div
                          className="h-full rounded-full bg-green-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
          <section className="rounded-3xl border border-green-400/20 bg-green-400/10 p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black text-green-300">
              Recent Wallet Transactions
            </h2>

            {walletTransactions.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-gray-400">
                No wallet transactions yet.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {walletTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-5"
                  >
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                      <div>
                        <p className="font-black text-green-300">
                          {transaction.type || "transaction"}
                        </p>
                        <p className="mt-1 text-sm text-gray-300">
                          {transaction.description || "No description."}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {formatDate(transaction.created_at)}
                        </p>
                      </div>

                      <div className="md:text-right">
                        <p className="text-2xl font-black text-cyan-300">
                          {formatPrice(transaction.amount)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Balance: {formatPrice(transaction.balance_after)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="rounded-3xl border border-purple-400/20 bg-purple-400/10 p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black text-purple-300">
              Withdrawal Requests
            </h2>

            {withdrawals.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-gray-400">
                No withdrawal requests yet.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {withdrawals.map((withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-black text-purple-300">
                          {formatPrice(withdrawal.amount)}
                        </p>
                        <p className="mt-1 text-sm text-gray-300">
                          {withdrawal.payout_method || "Payout"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {formatDate(withdrawal.created_at)}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${
                          withdrawal.status === "approved"
                            ? "border-green-400/20 bg-green-400/10 text-green-300"
                            : withdrawal.status === "rejected"
                            ? "border-red-400/20 bg-red-400/10 text-red-300"
                            : "border-yellow-400/20 bg-yellow-400/10 text-yellow-300"
                        }`}
                      >
                        {withdrawal.status || "pending"}
                      </span>
                    </div>

                    {withdrawal.admin_note && (
                      <p className="mt-3 text-sm text-gray-300">
                        Admin Note: {withdrawal.admin_note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>

        <section className="mt-8 rounded-3xl border border-cyan-400/20 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
          <h2 className="text-3xl font-black text-cyan-300">
            Top Converting Products
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Based on marketplace funnel events from the selected time range.
          </p>

          {topConvertingProducts.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-gray-400">
              No funnel data yet. Product views and checkout starts will appear after buyers browse your offers.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {topConvertingProducts.map((item, index) => (
                <div
                  key={item.productId}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5"
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div>
                      <p className="text-sm font-black text-cyan-300">
                        #{index + 1}
                      </p>
                      <h3 className="mt-1 text-xl font-black">{item.name}</h3>
                      <p className="mt-1 text-sm text-gray-400">
                        {item.views} views · {item.checkoutStarts} checkout starts · {item.completed} completed
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center text-sm md:min-w-[360px]">
                      <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 p-3">
                        <p className="font-black text-blue-300">{item.views}</p>
                        <p className="text-xs text-gray-400">Views</p>
                      </div>
                      <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                        <p className="font-black text-yellow-300">{item.checkoutStarts}</p>
                        <p className="text-xs text-gray-400">Checkout</p>
                      </div>
                      <div className="rounded-xl border border-purple-400/20 bg-purple-400/10 p-3">
                        <p className="font-black text-purple-300">{item.conversionRate}%</p>
                        <p className="text-xs text-gray-400">Conversion</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-8 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-7">
          <h2 className="text-2xl font-black text-cyan-300">
            Seller Finance Summary
          </h2>

          <p className="mt-3 text-sm leading-7 text-gray-300">
            Revenue is calculated from completed orders. Escrow released means
            completed order funds have been moved into your wallet. Pending
            escrow means completed order funds are waiting for auto-release or
            dispute checks. Wallet balance is the amount currently available for
            withdrawal.
          </p>
        </div>
      </section>
    </main>
  );
}

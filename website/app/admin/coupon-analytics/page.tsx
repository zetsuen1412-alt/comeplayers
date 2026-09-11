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

type Coupon = {
  id: number;
  code: string;
  name: string;
  discount_type: string;
  discount_value: string | number;
  minimum_order_amount: string | number;
  maximum_discount_amount: string | number | null;
  usage_limit: number | null;
  used_count: number;
  start_at: string | null;
  end_at: string | null;
  status: string;
  created_at: string;
};

type CouponUsage = {
  id: number;
  coupon_id: number;
  order_id: number | null;
  user_id: string;
  discount_amount: string | number;
  created_at: string;
  coupons: Coupon | null;
};


function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function isExpired(coupon: Coupon) {
  if (!coupon.end_at) return false;
  return new Date(coupon.end_at).getTime() < Date.now();
}

export default function AdminCouponAnalyticsV1Page() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [usages, setUsages] = useState<CouponUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const isAdmin = profile?.role?.trim().toLowerCase() === "admin";

  const totalDiscount = usages.reduce(
    (sum, usage) => sum + Number(usage.discount_amount || 0),
    0
  );

  const activeCoupons = coupons.filter(
    (coupon) => coupon.status === "active" && !isExpired(coupon)
  );

  const expiredCoupons = coupons.filter((coupon) => isExpired(coupon));

  const couponStats = useMemo(() => {
    const map = new Map<
      number,
      {
        coupon: Coupon;
        usageCount: number;
        discountGiven: number;
      }
    >();

    coupons.forEach((coupon) => {
      map.set(coupon.id, {
        coupon,
        usageCount: 0,
        discountGiven: 0,
      });
    });

    usages.forEach((usage) => {
      if (!usage.coupons) return;

      const current =
        map.get(usage.coupon_id) ||
        {
          coupon: usage.coupons,
          usageCount: 0,
          discountGiven: 0,
        };

      current.usageCount += 1;
      current.discountGiven += Number(usage.discount_amount || 0);

      map.set(usage.coupon_id, current);
    });

    return Array.from(map.values()).sort(
      (a, b) => b.discountGiven - a.discountGiven
    );
  }, [coupons, usages]);

  const mostUsedCoupon = [...couponStats].sort(
    (a, b) => b.usageCount - a.usageCount
  )[0];

  const filteredStats = useMemo(() => {
    const query = search.trim().toLowerCase();

    return couponStats.filter((item) => {
      return (
        !query ||
        item.coupon.code.toLowerCase().includes(query) ||
        item.coupon.name.toLowerCase().includes(query) ||
        String(item.coupon.id).includes(query)
      );
    });
  }, [couponStats, search]);

  async function loadData() {
    const [couponResult, usageResult] = await Promise.all([
      supabase.from("coupons").select("*").order("id", { ascending: false }),
      supabase
        .from("coupon_usages")
        .select(
          `
          id,
          coupon_id,
          order_id,
          user_id,
          discount_amount,
          created_at,
          coupons:coupon_id (
            id,
            code,
            name,
            discount_type,
            discount_value,
            minimum_order_amount,
            maximum_discount_amount,
            usage_limit,
            used_count,
            start_at,
            end_at,
            status,
            created_at
          )
        `
        )
        .order("id", { ascending: false }),
    ]);

    if (couponResult.error) {
      alert(couponResult.error.message);
      return;
    }

    if (usageResult.error) {
      alert(usageResult.error.message);
      return;
    }

    setCoupons(couponResult.data || []);
    setUsages((usageResult.data || []) as unknown as CouponUsage[]);
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

      setProfile(profileData || null);

      if (profileData?.role?.trim().toLowerCase() === "admin") {
        await loadData();
      }

      setLoading(false);
    }

    initializePage();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading coupon analytics...
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
            Only admin accounts can access coupon analytics.
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(250,204,21,.16),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-300">
              Admin Coupon Analytics
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Coupon Analytics
            </h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Track coupon usage, discount distribution, most used promos, and
              campaign performance.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/coupons"
              className="inline-flex h-12 items-center justify-center rounded-full border border-yellow-400 px-6 font-bold text-yellow-300 transition hover:bg-yellow-400 hover:text-black"
            >
              Coupon Manager
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
        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Total Coupons</p>
            <p className="mt-2 text-4xl font-black text-cyan-300">
              {coupons.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Active Coupons</p>
            <p className="mt-2 text-4xl font-black text-green-300">
              {activeCoupons.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Coupon Usage</p>
            <p className="mt-2 text-4xl font-black text-yellow-300">
              {usages.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-400">Discount Distributed</p>
            <p className="mt-2 text-3xl font-black text-purple-300">
              {formatPrice(totalDiscount)}
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-8 lg:grid-cols-[1fr_420px]">
          <section className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black text-yellow-300">
              Most Used Coupon
            </h2>

            {mostUsedCoupon ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6">
                <p className="text-4xl font-black text-yellow-300">
                  {mostUsedCoupon.coupon.code}
                </p>

                <p className="mt-2 text-xl font-black">
                  {mostUsedCoupon.coupon.name}
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-sm text-gray-400">Used</p>
                    <p className="mt-1 text-2xl font-black text-cyan-300">
                      {mostUsedCoupon.usageCount}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-sm text-gray-400">Discount Given</p>
                    <p className="mt-1 text-2xl font-black text-green-300">
                      {formatPrice(mostUsedCoupon.discountGiven)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-gray-300">No coupon usage yet.</p>
            )}
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">Quick Stats</h2>

            <div className="mt-6 space-y-4">
              <div className="flex justify-between rounded-2xl border border-white/10 bg-black/30 p-4">
                <span className="text-gray-400">Expired Coupons</span>
                <span className="font-black text-red-300">
                  {expiredCoupons.length}
                </span>
              </div>

              <div className="flex justify-between rounded-2xl border border-white/10 bg-black/30 p-4">
                <span className="text-gray-400">Average Discount</span>
                <span className="font-black text-cyan-300">
                  {formatPrice(usages.length ? totalDiscount / usages.length : 0)}
                </span>
              </div>

              <div className="flex justify-between rounded-2xl border border-white/10 bg-black/30 p-4">
                <span className="text-gray-400">Unused Coupons</span>
                <span className="font-black text-yellow-300">
                  {coupons.filter((coupon) => Number(coupon.used_count || 0) === 0).length}
                </span>
              </div>
            </div>
          </aside>
        </div>

        <div className="mb-8">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search coupon analytics by code, name, or coupon ID..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />
        </div>

        <section className="mb-10 rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
          <h2 className="text-3xl font-black">Coupon Performance</h2>

          {filteredStats.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-8 text-center text-gray-400">
              No coupon data found.
            </div>
          ) : (
            <div className="mt-6 grid gap-5">
              {filteredStats.map((item) => {
                const coupon = item.coupon;
                const usagePercent =
                  coupon.usage_limit && coupon.usage_limit > 0
                    ? Math.min((item.usageCount / coupon.usage_limit) * 100, 100)
                    : 0;

                return (
                  <div
                    key={coupon.id}
                    className="rounded-3xl border border-white/10 bg-black/30 p-6"
                  >
                    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-5 py-3 text-2xl font-black text-yellow-300">
                            {coupon.code}
                          </span>

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${
                              coupon.status === "active"
                                ? "border-green-400/20 bg-green-400/10 text-green-300"
                                : "border-red-400/20 bg-red-400/10 text-red-300"
                            }`}
                          >
                            {coupon.status}
                          </span>

                          {isExpired(coupon) && (
                            <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs font-black text-red-300">
                              expired
                            </span>
                          )}
                        </div>

                        <h3 className="mt-4 text-2xl font-black">
                          {coupon.name}
                        </h3>

                        <div className="mt-5 grid gap-4 md:grid-cols-3">
                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs text-gray-500">Used</p>
                            <p className="mt-1 text-2xl font-black text-cyan-300">
                              {item.usageCount}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs text-gray-500">
                              Discount Given
                            </p>
                            <p className="mt-1 text-2xl font-black text-green-300">
                              {formatPrice(item.discountGiven)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs text-gray-500">Limit</p>
                            <p className="mt-1 text-2xl font-black text-yellow-300">
                              {coupon.usage_limit || "∞"}
                            </p>
                          </div>
                        </div>

                        {coupon.usage_limit && (
                          <div className="mt-5">
                            <div className="mb-2 flex justify-between text-sm">
                              <span className="text-gray-400">Usage Progress</span>
                              <span className="font-black text-cyan-300">
                                {Math.round(usagePercent)}%
                              </span>
                            </div>

                            <div className="h-4 overflow-hidden rounded-full bg-black/60">
                              <div
                                className="h-full rounded-full bg-cyan-400"
                                style={{ width: `${usagePercent}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                        <p className="text-sm text-gray-400">Discount Type</p>
                        <p className="mt-1 text-xl font-black">
                          {coupon.discount_type === "percent"
                            ? `${coupon.discount_value}%`
                            : formatPrice(coupon.discount_value)}
                        </p>

                        <p className="mt-5 text-sm text-gray-400">Valid Until</p>
                        <p className="mt-1 font-bold">
                          {formatDate(coupon.end_at)}
                        </p>

                        <Link
                          href="/admin/coupons"
                          className="mt-6 block rounded-2xl border border-cyan-400 px-5 py-3 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
                        >
                          Manage Coupon
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
          <h2 className="text-3xl font-black">Recent Coupon Usage</h2>

          {usages.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-8 text-center text-gray-400">
              No coupon usage yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {usages.slice(0, 12).map((usage) => (
                <div
                  key={usage.id}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div>
                      <p className="text-xl font-black text-yellow-300">
                        {usage.coupons?.code || `Coupon #${usage.coupon_id}`}
                      </p>

                      <p className="mt-1 text-sm text-gray-400">
                        Order #{usage.order_id || "-"} · User {usage.user_id}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        {formatDate(usage.created_at)}
                      </p>
                    </div>

                    <p className="text-2xl font-black text-green-300">
                      {formatPrice(usage.discount_amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
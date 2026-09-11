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

type Coupon = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  discount_type: "fixed" | "percent";
  discount_value: string | number;
  minimum_order_amount: string | number;
  maximum_discount_amount: string | number | null;
  usage_limit: number | null;
  used_count: number;
  start_at: string | null;
  end_at: string | null;
  status: "active" | "inactive";
  created_at: string;
};

const statusOptions = ["active", "inactive"];
const discountTypeOptions = ["fixed", "percent"];


function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function getStatusClass(status: string) {
  if (status === "active") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  return "border-red-400/20 bg-red-400/10 text-red-300";
}

function normalizeCouponCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-_]/g, "");
}

export default function AdminCouponManagerV1Page() {
  const { formatPrice } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingCouponId, setUpdatingCouponId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [discountValue, setDiscountValue] = useState("");
  const [minimumOrderAmount, setMinimumOrderAmount] = useState("0");
  const [maximumDiscountAmount, setMaximumDiscountAmount] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const [editingId, setEditingId] = useState<number | null>(null);

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredCoupons = useMemo(() => {
    const query = search.trim().toLowerCase();

    return coupons.filter((coupon) => {
      const matchesStatus =
        activeStatus === "all" || coupon.status === activeStatus;

      const matchesSearch =
        !query ||
        coupon.code.toLowerCase().includes(query) ||
        coupon.name.toLowerCase().includes(query) ||
        (coupon.description || "").toLowerCase().includes(query) ||
        String(coupon.id).includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [coupons, search, activeStatus]);

  const activeCount = coupons.filter((coupon) => coupon.status === "active").length;
  const inactiveCount = coupons.filter(
    (coupon) => coupon.status === "inactive"
  ).length;
  const totalUsed = coupons.reduce(
    (sum, coupon) => sum + Number(coupon.used_count || 0),
    0
  );

  async function loadCoupons() {
    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setCoupons(data || []);
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
        await loadCoupons();
      }

      setLoading(false);
    }

    initializePage();
  }, []);

  function resetForm() {
    setCode("");
    setName("");
    setDescription("");
    setDiscountType("fixed");
    setDiscountValue("");
    setMinimumOrderAmount("0");
    setMaximumDiscountAmount("");
    setUsageLimit("");
    setStartAt("");
    setEndAt("");
    setStatus("active");
    setEditingId(null);
  }

  function startEdit(coupon: Coupon) {
    setEditingId(coupon.id);
    setCode(coupon.code || "");
    setName(coupon.name || "");
    setDescription(coupon.description || "");
    setDiscountType(coupon.discount_type || "fixed");
    setDiscountValue(String(coupon.discount_value || ""));
    setMinimumOrderAmount(String(coupon.minimum_order_amount || "0"));
    setMaximumDiscountAmount(
      coupon.maximum_discount_amount !== null
        ? String(coupon.maximum_discount_amount)
        : ""
    );
    setUsageLimit(coupon.usage_limit !== null ? String(coupon.usage_limit) : "");
    setStartAt(coupon.start_at ? coupon.start_at.slice(0, 16) : "");
    setEndAt(coupon.end_at ? coupon.end_at.slice(0, 16) : "");
    setStatus(coupon.status || "active");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildPayload() {
    return {
      code: normalizeCouponCode(code),
      name: name.trim(),
      description: description.trim() || null,
      discount_type: discountType,
      discount_value: Number(discountValue || 0),
      minimum_order_amount: Number(minimumOrderAmount || 0),
      maximum_discount_amount:
        maximumDiscountAmount.trim() === ""
          ? null
          : Number(maximumDiscountAmount || 0),
      usage_limit: usageLimit.trim() === "" ? null : Number(usageLimit || 0),
      start_at: startAt ? new Date(startAt).toISOString() : null,
      end_at: endAt ? new Date(endAt).toISOString() : null,
      status,
    };
  }

  async function saveCoupon(event: React.FormEvent) {
    event.preventDefault();

    const finalCode = normalizeCouponCode(code);
    if (!finalCode) return alert("Coupon code is required.");
    if (!name.trim()) return alert("Coupon name is required.");
    if (Number(discountValue || 0) <= 0) {
      return alert("Discount value must be greater than 0.");
    }
    if (discountType === "percent" && Number(discountValue) > 100) {
      return alert("Percent discount cannot be more than 100.");
    }
    if (usageLimit && Number(usageLimit) <= 0) {
      return alert("Usage limit must be empty or greater than 0.");
    }

    try {
      setSaving(true);
      const payload = buildPayload();

      await authenticatedFetchJson("/api/admin/coupons", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(
          editingId ? { couponId: editingId, ...payload } : payload
        ),
      });

      alert(editingId ? "Coupon updated successfully." : "Coupon created successfully.");
      await loadCoupons();
      resetForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save coupon.");
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(couponId: number, nextStatus: "active" | "inactive") {
    try {
      setUpdatingCouponId(couponId);
      await authenticatedFetchJson("/api/admin/coupons", {
        method: "PATCH",
        body: JSON.stringify({
          couponId,
          action: "status",
          status: nextStatus,
        }),
      });
      await loadCoupons();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update coupon.");
    } finally {
      setUpdatingCouponId(null);
    }
  }

  async function deleteCoupon(coupon: Coupon) {
    if (!confirm(`Delete coupon ${coupon.code}?`)) return;

    try {
      setUpdatingCouponId(coupon.id);
      await authenticatedFetchJson("/api/admin/coupons", {
        method: "DELETE",
        body: JSON.stringify({ couponId: coupon.id }),
      });
      await loadCoupons();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete coupon.");
    } finally {
      setUpdatingCouponId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading coupon manager...
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
            Only admin accounts can access coupon manager.
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
              Admin Coupon Manager
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Coupons & Promo
            </h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Create and manage marketplace voucher codes, fixed discounts,
              percent discounts, usage limits, and active periods.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <Link
            href="/admin"
            className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            Admin Home
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Coupons</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {coupons.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Active</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {activeCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Inactive</p>
            <p className="mt-2 text-3xl font-black text-red-300">
              {inactiveCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Used</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {totalUsed}
            </p>
          </div>
        </div>

        <form
          onSubmit={saveCoupon}
          className="mb-10 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-7 shadow-2xl shadow-black/30"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-black text-cyan-300">
                {editingId ? "Edit Coupon" : "Create Coupon"}
              </h2>

              <p className="mt-2 text-sm text-gray-300">
                Coupon codes are automatically normalized to uppercase.
              </p>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-white/10 px-5 py-2 font-bold text-gray-300 hover:bg-white hover:text-black"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Coupon Code
              </label>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="WELCOME10"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 font-black uppercase text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Coupon Name
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Welcome Promo"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Discount Type
              </label>
              <select
                value={discountType}
                onChange={(event) =>
                  setDiscountType(event.target.value as "fixed" | "percent")
                }
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
              >
                {discountTypeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Discount Value
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                placeholder={discountType === "fixed" ? "10000" : "10"}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Status
              </label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "active" | "inactive")
                }
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
              >
                {statusOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Minimum Order Amount
              </label>
              <input
                type="number"
                value={minimumOrderAmount}
                onChange={(event) => setMinimumOrderAmount(event.target.value)}
                placeholder="0"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Maximum Discount Amount
              </label>
              <input
                type="number"
                value={maximumDiscountAmount}
                onChange={(event) => setMaximumDiscountAmount(event.target.value)}
                placeholder="Optional"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Usage Limit
              </label>
              <input
                type="number"
                value={usageLimit}
                onChange={(event) => setUsageLimit(event.target.value)}
                placeholder="Optional"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Start At
              </label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                End At
              </label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-bold text-gray-300">
              Description
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe this coupon promo..."
              rows={4}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-7 w-full rounded-2xl bg-cyan-400 py-4 text-lg font-black text-black transition hover:bg-cyan-300 disabled:opacity-60"
          >
            {saving
              ? "Saving Coupon..."
              : editingId
              ? "Update Coupon"
              : "Create Coupon"}
          </button>
        </form>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search coupons by code, name, description, or ID..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="flex flex-wrap gap-3">
            {["all", "active", "inactive"].map((item) => (
              <button
                key={item}
                type="button"
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

        {filteredCoupons.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">No coupons found.</h2>

            <p className="mt-3 text-gray-400">
              Create your first marketplace promo code using the form above.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredCoupons.map((coupon) => {
              const isPercent = coupon.discount_type === "percent";
              const usageText =
                coupon.usage_limit === null
                  ? `${coupon.used_count} / Unlimited`
                  : `${coupon.used_count} / ${coupon.usage_limit}`;

              return (
                <div
                  key={coupon.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
                >
                  <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-5 py-3 text-2xl font-black text-yellow-300">
                          {coupon.code}
                        </span>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(
                            coupon.status
                          )}`}
                        >
                          {coupon.status}
                        </span>

                        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-black text-gray-300">
                          {coupon.discount_type}
                        </span>
                      </div>

                      <h2 className="mt-5 text-3xl font-black">
                        {coupon.name}
                      </h2>

                      <p className="mt-3 leading-7 text-gray-300">
                        {coupon.description || "No description."}
                      </p>

                      <div className="mt-6 grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Discount</p>
                          <p className="mt-1 text-xl font-black text-cyan-300">
                            {isPercent
                              ? `${coupon.discount_value}%`
                              : formatPrice(coupon.discount_value)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Minimum Order</p>
                          <p className="mt-1 font-black">
                            {formatPrice(coupon.minimum_order_amount)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Max Discount</p>
                          <p className="mt-1 font-black">
                            {coupon.maximum_discount_amount === null
                              ? "-"
                              : formatPrice(coupon.maximum_discount_amount)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Usage</p>
                          <p className="mt-1 font-black">{usageText}</p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Start</p>
                          <p className="mt-1 font-black">
                            {formatDate(coupon.start_at)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">End</p>
                          <p className="mt-1 font-black">
                            {formatDate(coupon.end_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => startEdit(coupon)}
                        disabled={updatingCouponId === coupon.id}
                        className="rounded-2xl bg-cyan-400 px-5 py-3 font-black text-black hover:bg-cyan-300 disabled:opacity-60"
                      >
                        Edit Coupon
                      </button>

                      <button
                        onClick={() => quickStatus(coupon.id, "active")}
                        disabled={updatingCouponId === coupon.id}
                        className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white hover:bg-green-400 disabled:opacity-60"
                      >
                        Set Active
                      </button>

                      <button
                        onClick={() => quickStatus(coupon.id, "inactive")}
                        disabled={updatingCouponId === coupon.id}
                        className="rounded-2xl bg-red-500 px-5 py-3 font-black text-white hover:bg-red-400 disabled:opacity-60"
                      >
                        Set Inactive
                      </button>

                      <button
                        onClick={() => deleteCoupon(coupon)}
                        disabled={updatingCouponId === coupon.id}
                        className="rounded-2xl border border-red-400/40 px-5 py-3 font-black text-red-300 hover:bg-red-500 hover:text-white disabled:opacity-60"
                      >
                        Delete Coupon
                      </button>

                      {updatingCouponId === coupon.id && (
                        <p className="text-center text-sm text-gray-400">
                          Updating coupon...
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
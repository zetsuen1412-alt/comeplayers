"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaComments,
  FaCreditCard,
  FaMinus,
  FaPlus,
  FaShoppingCart,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { trackMarketplaceEvent } from "@/lib/marketplace-events-client";
import { supabase } from "@/lib/supabase";

type Variant = {
  id: number;
  sku: string;
  name: string;
  attributes?: Record<string, unknown> | null;
  price: string | number;
  stock: number;
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
};

function numberPrice(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const directValue = Number(value.replace(/,/g, "").trim());
  if (Number.isFinite(directValue)) return directValue;

  const sanitizedValue = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(sanitizedValue) ? sanitizedValue : 0;
}

function normalizeCouponCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

function couponDiscount(coupon: Coupon | null, subtotal: number) {
  if (!coupon) return 0;

  let discount =
    coupon.discount_type === "percent"
      ? subtotal * (Number(coupon.discount_value || 0) / 100)
      : Number(coupon.discount_value || 0);

  if (coupon.discount_type === "percent" && coupon.maximum_discount_amount) {
    discount = Math.min(discount, Number(coupon.maximum_discount_amount));
  }

  return Math.max(0, Math.min(discount, subtotal));
}

export default function ProductVariantPurchase({
  productId,
  sellerId,
  basePrice,
  baseStock,
  variants,
  initialVariantId,
}: {
  productId: number;
  sellerId: string | null;
  basePrice: string | number;
  baseStock: number;
  variants: Variant[];
  initialVariantId?: number | null;
}) {
  const router = useRouter();
  const { formatPrice, currency } = useCurrency();
  const available = useMemo(
    () => variants.filter((variant) => Number(variant.stock || 0) > 0),
    [variants]
  );
  const initialVariant =
    variants.find(
      (variant) =>
        variant.id === initialVariantId && Number(variant.stock || 0) > 0
    ) || available[0] || variants[0] || null;

  const [selectedId, setSelectedId] = useState<number | null>(
    initialVariant?.id || null
  );
  const [quantity, setQuantity] = useState(1);
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [couponData, setCouponData] = useState<Coupon | null>(null);

  const selected = variants.find((variant) => variant.id === selectedId) || null;
  const price = selected?.price ?? basePrice;
  const stock = selected ? Number(selected.stock || 0) : baseStock;
  const subtotal = numberPrice(price) * quantity;
  const discountAmount = couponDiscount(couponData, subtotal);
  const total = Math.max(0, subtotal - discountAmount);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function resetCoupon(message = "") {
    setCouponData(null);
    setCouponCode("");
    setCouponError(message);
  }

  function selectVariant(variantId: number) {
    setSelectedId(variantId);
    setQuantity(1);
    setCheckoutError("");
    resetCoupon(couponData ? "Coupon removed after the order changed." : "");
  }

  function updateQuantity(nextQuantity: number) {
    const next = Math.max(1, Math.min(stock, nextQuantity));
    if (next === quantity) return;

    setQuantity(next);
    setCheckoutError("");
    resetCoupon(couponData ? "Coupon removed after the order changed." : "");
  }

  async function applyCoupon() {
    const code = normalizeCouponCode(couponCode);

    if (!code) {
      setCouponError("Enter coupon code.");
      return;
    }

    setCouponLoading(true);
    setCouponError("");

    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", code)
      .eq("status", "active")
      .maybeSingle();

    if (error || !data) {
      setCouponError("Coupon not found or inactive.");
      setCouponLoading(false);
      return;
    }

    const coupon = data as Coupon;
    const now = new Date();

    if (coupon.start_at && now < new Date(coupon.start_at)) {
      setCouponError("Coupon is not active yet.");
    } else if (coupon.end_at && now > new Date(coupon.end_at)) {
      setCouponError("Coupon has expired.");
    } else if (
      coupon.usage_limit !== null &&
      Number(coupon.used_count || 0) >= Number(coupon.usage_limit)
    ) {
      setCouponError("Coupon usage limit has been reached.");
    } else if (subtotal < Number(coupon.minimum_order_amount || 0)) {
      setCouponError(
        `Minimum purchase is ${formatPrice(coupon.minimum_order_amount)}.`
      );
    } else {
      setCouponData(coupon);
      setCouponCode(coupon.code);
    }

    setCouponLoading(false);
  }

  async function createOrder() {
    if (!userId) {
      setCheckoutError("Please log in before continuing to payment.");
      return;
    }

    if (stock <= 0 || quantity > stock) {
      setCheckoutError("This product does not have enough stock.");
      return;
    }

    setCreating(true);
    setCheckoutError("");

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (sessionError || !accessToken) {
        throw new Error("Please log in again before checkout.");
      }

      trackMarketplaceEvent({
        event_type: "checkout_start",
        user_id: userId,
        product_id: productId,
        seller_id: sellerId,
      });

      const response = await fetch("/api/checkout/create-order", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          variantId: selected?.id || null,
          quantity,
          paymentMethod: "doku",
          couponCode: couponData?.code || null,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.order?.id) {
        throw new Error(json.error || "Failed to create marketplace order.");
      }

      router.push(`/payment/${json.order.id}?method=doku`);
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Failed to create marketplace order."
      );
      setCreating(false);
    }
  }

  return (
    <div id="checkout" className="scroll-mt-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-200">
            Order Summary
          </p>
          <p className="mt-1.5 text-3xl font-black text-cyan-300">
            {formatPrice(total)}
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/20 bg-black/25 px-3 py-1.5 text-[10px] font-black text-cyan-200">
          {currency}
        </span>
      </div>

      {variants.length > 0 ? (
        <div className="mt-5">
          <label className="mb-2 block text-sm font-black text-slate-200">
            Choose Variant
          </label>
          <div className="grid gap-2">
            {variants.map((variant) => {
              const selectedVariant = variant.id === selectedId;
              const soldOut = Number(variant.stock || 0) <= 0;

              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={soldOut}
                  onClick={() => selectVariant(variant.id)}
                  className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    selectedVariant
                      ? "border-cyan-400 bg-cyan-400/15"
                      : "border-white/10 bg-black/25 hover:border-cyan-400/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black">{variant.name}</p>
                      <p className="mt-1 text-[11px] text-violet-300">
                        {variant.sku}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-black text-cyan-300">
                        {formatPrice(variant.price)}
                      </p>
                      <p
                        className={`mt-1 text-[11px] ${
                          soldOut ? "text-red-300" : "text-slate-400"
                        }`}
                      >
                        {soldOut ? "Sold out" : `${variant.stock} left`}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/25 p-3">
        <div>
          <p className="text-xs text-slate-400">Quantity</p>
          <p className="mt-0.5 text-xs text-slate-500">{stock} available</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateQuantity(quantity - 1)}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 disabled:opacity-35"
          >
            <FaMinus className="text-xs" />
          </button>
          <span className="flex h-9 min-w-10 items-center justify-center rounded-lg bg-cyan-400/10 px-2 font-black text-cyan-200">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => updateQuantity(quantity + 1)}
            disabled={quantity >= stock}
            aria-label="Increase quantity"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 disabled:opacity-35"
          >
            <FaPlus className="text-xs" />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2 border-y border-white/10 py-4 text-sm">
        <div className="flex justify-between gap-4 text-slate-300">
          <span>Item price</span>
          <span className="font-bold text-white">{formatPrice(price)}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-300">
          <span>Subtotal</span>
          <span className="font-bold text-white">{formatPrice(subtotal)}</span>
        </div>
        {discountAmount > 0 ? (
          <div className="flex justify-between gap-4 text-emerald-300">
            <span>Coupon</span>
            <span className="font-bold">-{formatPrice(discountAmount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 pt-1 text-base">
          <span className="font-black">Total</span>
          <span className="font-black text-cyan-300">{formatPrice(total)}</span>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor={`coupon-${productId}`} className="text-xs font-bold text-slate-300">
          Coupon Code
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id={`coupon-${productId}`}
            value={couponCode}
            onChange={(event) => {
              setCouponCode(event.target.value);
              setCouponError("");
            }}
            disabled={Boolean(couponData)}
            placeholder="WELCOME10"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-yellow-400 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => {
              if (couponData) resetCoupon();
              else void applyCoupon();
            }}
            disabled={couponLoading}
            className={`rounded-lg px-3 py-2.5 text-sm font-black disabled:opacity-60 ${
              couponData
                ? "border border-red-400/40 text-red-300"
                : "bg-yellow-400 text-black hover:bg-yellow-300"
            }`}
          >
            {couponData ? "Remove" : couponLoading ? "Checking..." : "Apply"}
          </button>
        </div>
        {couponError ? (
          <p className="mt-2 text-xs font-bold text-red-300">{couponError}</p>
        ) : null}
        {couponData ? (
          <p className="mt-2 text-xs font-bold text-emerald-300">
            {couponData.code} applied · {couponData.name}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-cyan-400/25 bg-black/25 p-3">
        <FaCreditCard className="shrink-0 text-cyan-300" />
        <div>
          <p className="text-sm font-black">DOKU Secure Payment</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Visa, Mastercard, QRIS, e-wallet, and bank transfer
          </p>
        </div>
      </div>

      {checkoutError ? (
        <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-xs font-bold text-red-200">
          {checkoutError}
        </p>
      ) : null}

      <div className="mt-4 space-y-2.5">
        <button
          type="button"
          onClick={() => {
            if (userId === null) {
              router.push("/");
              return;
            }
            void createOrder();
          }}
          disabled={stock <= 0 || creating || userId === undefined}
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-cyan-400 px-5 py-3.5 font-black text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          <FaShoppingCart />
          {stock <= 0
            ? "Out of Stock"
            : userId === undefined
              ? "Checking Account..."
              : userId === null
                ? "Login to Continue"
                : creating
                  ? "Creating Order..."
                  : "Continue to Payment"}
        </button>

        <Link
          href={`/chat?seller=${sellerId || ""}&product=${productId}`}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-black/30 px-5 py-3 font-black text-white transition hover:border-cyan-400"
        >
          <FaComments />
          Chat Seller
        </Link>
      </div>
    </div>
  );
}

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
import AuthModal from "@/components/auth/AuthModal";
import type { CheckoutQuote } from "@/lib/checkoutInput";
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

export default function ProductVariantPurchase({
  productId,
  sellerId,
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
  const { formatPrice, formatIdrAmount, formatIdrPrice, currency } = useCurrency();
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
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [quoteState, setQuoteState] = useState<{ key: string; quote: CheckoutQuote; quoteToken: string } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [showLogin, setShowLogin] = useState(false);

  const selected = variants.find((variant) => variant.id === selectedId) || null;
  const stock = selected ? Number(selected.stock || 0) : baseStock;
  const quoteKey = JSON.stringify({ productId, variantId: selected?.id || null, quantity, couponCode: appliedCoupon || null });
  const quote = quoteState?.key === quoteKey ? quoteState.quote : null;

  useEffect(() => {
    const controller = new AbortController();
    setQuoteLoading(true);
    setQuoteState(null);
    setQuoteError("");
    void fetch("/api/marketplace/quote", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: quoteKey, signal: controller.signal,
    }).then(async response => {
      const payload = await response.json();
      if (!response.ok || !payload.quote || !payload.quoteToken) throw new Error(payload.error || "Unable to load the order price.");
      if (!controller.signal.aborted) setQuoteState({ key: quoteKey, quote: payload.quote, quoteToken: payload.quoteToken });
    }).catch(error => {
      if (!controller.signal.aborted) setQuoteError(error instanceof Error ? error.message : "Unable to load the order price.");
    }).finally(() => {
      if (!controller.signal.aborted) setQuoteLoading(false);
    });
    return () => controller.abort();
  }, [quoteKey, quoteRevision]);

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

  function resetCoupon() {
    setAppliedCoupon("");
    setCouponCode("");
  }

  function selectVariant(variantId: number) {
    setSelectedId(variantId);
    setQuantity(1);
    setCheckoutError("");
  }

  function updateQuantity(nextQuantity: number) {
    setQuantity(Math.max(1, Math.min(100, stock, nextQuantity)));
    setCheckoutError("");
  }

  function applyCoupon() {
    setAppliedCoupon(couponCode.trim().toUpperCase());
    setQuoteRevision(value => value + 1);
  }

  async function createOrder() {
    if (!userId) {
      setCheckoutError("Please log in before continuing to payment.");
      return;
    }

    if (!quote || !quoteState || quoteLoading) return;

    if (stock <= 0 || quantity > stock || quantity > 100) {
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
          couponCode: appliedCoupon || null,
          quoteToken: quoteState.quoteToken,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.order?.id) {
        if (response.status === 400 || response.status === 409) setQuoteRevision(value => value + 1);
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
            {quote ? formatIdrAmount(quote.total) : "—"}
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/20 bg-black/25 px-3 py-1.5 text-[10px] font-black text-cyan-200">
          IDR
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
                  disabled={soldOut || creating}
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
            disabled={quantity <= 1 || creating}
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
            disabled={quantity >= Math.min(stock, 100) || creating}
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
          <span className="font-bold text-white">{quote ? formatIdrAmount(quote.unit_price) : "—"}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-300">
          <span>Subtotal</span>
          <span className="font-bold text-white">{quote ? formatIdrAmount(quote.subtotal) : "—"}</span>
        </div>
        {quote && quote.discount > 0 ? (
          <div className="flex justify-between gap-4 text-emerald-300">
            <span>Coupon</span>
            <span className="font-bold">-{formatIdrAmount(quote.discount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 text-slate-300"><span>Payment fee</span><span>{quote ? formatIdrAmount(quote.payment_fee) : "—"}</span></div>
        <div className="flex justify-between gap-4 pt-1 text-base">
          <span className="font-black">Total</span>
          <span className="font-black text-cyan-300">{quote ? formatIdrAmount(quote.total) : "—"}</span>
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
              setCheckoutError("");
            }}
            disabled={Boolean(appliedCoupon) || creating}
            placeholder="WELCOME10"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-yellow-400 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => {
              if (appliedCoupon) resetCoupon();
              else void applyCoupon();
            }}
            disabled={quoteLoading || creating}
            className={`rounded-lg px-3 py-2.5 text-sm font-black disabled:opacity-60 ${
              appliedCoupon
                ? "border border-red-400/40 text-red-300"
                : "bg-yellow-400 text-black hover:bg-yellow-300"
            }`}
          >
            {appliedCoupon ? "Remove" : quoteLoading ? "Checking..." : "Apply"}
          </button>
        </div>
        {appliedCoupon && quote ? <p className="mt-2 text-xs text-emerald-300">{appliedCoupon} applied</p> : null}
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

      {quote && currency !== "IDR" ? <p className="mt-3 text-xs text-slate-400">Approximately {formatIdrPrice(quote.total)}. Your order is billed in IDR; PayPal shows its USD conversion before approval.</p> : null}
      {quoteError ? <div className="mt-4 text-sm text-red-300" role="alert">{quoteError} <button type="button" className="underline" onClick={() => setQuoteRevision(value => value + 1)}>Refresh price</button></div> : null}
      {checkoutError ? (
        <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-xs font-bold text-red-200">
          {checkoutError}
        </p>
      ) : null}

      <AuthModal open={showLogin} initialMode="login" onClose={() => setShowLogin(false)} />
      <div className="mt-4 space-y-2.5">
        <button
          type="button"
          onClick={() => {
            if (userId === null) {
              setShowLogin(true);
              return;
            }
            void createOrder();
          }}
          disabled={stock <= 0 || creating || userId === undefined || !quote || quoteLoading}
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-cyan-400 px-5 py-3.5 font-black text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          <FaShoppingCart />
          {quoteLoading ? "Calculating price..." : stock <= 0
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

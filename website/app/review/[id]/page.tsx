"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/createNotification";

type Order = {
  id: number;
  buyer_id: string | null;
  buyer: string | null;
  seller_id: string | null;
  product_id: number | null;
  product: string | null;
  price: string | number | null;
  total_price: string | number | null;
  category_name: string | null;
  game_name: string | null;
  status: string | null;
  created_at: string;
};

type SellerProfile = {
  id: string;
  email: string | null;
  username: string | null;
  seller_name: string | null;
  avatar_url: string | null;
  seller_status: string | null;
};

type ExistingReview = {
  id: number;
  order_id: number;
  seller_id: string;
  buyer_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
};

function normalizeStatus(status: string | null) {
  if (status === "Selesai") return "Completed";
  if (status === "completed") return "Completed";
  return status || "Pending Payment";
}


export default function ReviewPageV1NotificationSeller() {
  const { formatPrice, currency } = useCurrency();
  const params = useParams();
  const orderId = String(params.id || "");

  const [user, setUser] = useState<User | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [existingReview, setExistingReview] = useState<ExistingReview | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");

  const normalizedStatus = useMemo(() => {
    return normalizeStatus(order?.status || null);
  }, [order]);

  const canReview = normalizedStatus === "Completed";

  useEffect(() => {
    if (orderId) {
      initializePage();
    }
  }, [orderId]);

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

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", Number(orderId))
      .maybeSingle();

    if (orderError) {
      alert(orderError.message);
      setLoading(false);
      return;
    }

    if (!orderData) {
      setOrder(null);
      setLoading(false);
      return;
    }

    const isBuyer =
      orderData.buyer_id === userData.user.id ||
      orderData.buyer === userData.user.email;

    if (!isBuyer) {
      alert("Only buyer can review this order.");
      window.location.href = "/my-orders";
      return;
    }

    setOrder(orderData);

    if (orderData.seller_id) {
      const { data: sellerData } = await supabase
        .from("profiles")
        .select("id,email,username,seller_name,avatar_url,seller_status")
        .eq("id", orderData.seller_id)
        .maybeSingle();

      setSeller(sellerData || null);
    }

    const { data: reviewData, error: reviewError } = await supabase
      .from("seller_reviews")
      .select("*")
      .eq("order_id", Number(orderId))
      .eq("buyer_id", userData.user.id)
      .maybeSingle();

    if (reviewError) {
      alert(reviewError.message);
      setLoading(false);
      return;
    }

    if (reviewData) {
      setExistingReview(reviewData);
      setRating(reviewData.rating);
      setReviewText(reviewData.review_text || "");
    }

    setLoading(false);
  }

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();

    if (!user) {
      alert("User not found. Please login again.");
      return;
    }

    if (!order) {
      alert("Order not found.");
      return;
    }

    if (!order.seller_id) {
      alert("Seller not found.");
      return;
    }

    if (!canReview) {
      alert("You can only review completed orders.");
      return;
    }

    if (rating < 1 || rating > 5) {
      alert("Rating must be between 1 and 5.");
      return;
    }

    if (reviewText.trim().length < 10) {
      alert("Review must contain at least 10 characters.");
      return;
    }

    setSubmitting(true);

    const payload = {
      order_id: order.id,
      product_id: order.product_id,
      seller_id: order.seller_id,
      buyer_id: user.id,
      rating,
      review_text: reviewText.trim() || null,
    };

    const { error } = await supabase.from("seller_reviews").upsert(payload, {
      onConflict: "order_id,buyer_id",
    });

    if (error) {
      alert(error.message);
      setSubmitting(false);
      return;
    }

    if (order.product_id) {
      const { error: productReviewError } = await supabase
        .from("product_reviews")
        .upsert(
          {
            order_id: order.id,
            product_id: order.product_id,
            seller_id: order.seller_id,
            buyer_id: user.id,
            rating,
            review_text: reviewText.trim() || null,
          },
          {
            onConflict: "order_id,buyer_id",
          }
        );

      if (productReviewError) {
        console.error("Product review sync error:", productReviewError.message);
      }
    }

    const { data: sellerReviewData, error: sellerSummaryError } = await supabase
      .from("seller_reviews")
      .select("rating")
      .eq("seller_id", order.seller_id);

    if (sellerSummaryError) {
      console.error("Seller rating summary load error:", sellerSummaryError.message);
    } else {
      const totalReviews = sellerReviewData?.length || 0;
      const averageRating =
        totalReviews === 0
          ? 0
          : sellerReviewData.reduce(
              (sum, item) => sum + Number(item.rating || 0),
              0
            ) / totalReviews;

      const { error: profileRatingError } = await supabase
        .from("profiles")
        .update({
          seller_rating: averageRating,
          seller_review_count: totalReviews,
        })
        .eq("id", order.seller_id);

      if (profileRatingError) {
        console.error("Seller rating summary update error:", profileRatingError.message);
      }
    }

    await createNotification({
      userId: order.seller_id,
      type: "review",
      title: existingReview ? "Review Updated" : "New Review Received",
      message: `${user.email || "A buyer"} rated your service ${rating}/5 stars for order #${
        order.id
      }${reviewText.trim() ? `: ${reviewText.trim()}` : "."}`,
      linkUrl: `/seller-profile/${order.seller_id}`,
    });

    alert("Review submitted successfully.");
    window.location.href = `/seller-profile/${order.seller_id}`;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading review...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-3xl font-black text-cyan-300">Login Required</h1>

          <p className="mt-4 text-gray-400">
            Please login first to leave a review.
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

  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Order Not Found</h1>

          <Link
            href="/my-orders"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            My Orders
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(250,204,21,.18),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-300">
              Seller Review
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Leave a Review
            </h1>

            <p className="mt-5 max-w-2xl text-gray-300">
              Share your experience after completing your order.
            </p>
          </div>

          <Link
            href={`/order/${order.id}`}
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            Back to Order
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-8 py-10 lg:grid-cols-[1fr_420px]">
        <form
          onSubmit={submitReview}
          className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30"
        >
          <h2 className="text-3xl font-black">Review Seller</h2>

          {!canReview && (
            <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
              <h3 className="font-black text-yellow-300">Review Locked</h3>

              <p className="mt-3 text-sm text-gray-300">
                You can only review orders with Completed status.
              </p>
            </div>
          )}

          {existingReview && (
            <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-5">
              <h3 className="font-black text-cyan-300">
                Existing Review Found
              </h3>

              <p className="mt-3 text-sm text-gray-300">
                You already reviewed this order. Submitting again will update
                your review.
              </p>
            </div>
          )}

          <div className="mt-7">
            <label className="mb-3 block text-sm font-bold text-gray-300">
              Rating
            </label>

            <div className="flex flex-wrap gap-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  disabled={!canReview}
                  className={`rounded-2xl border px-5 py-4 text-3xl transition disabled:opacity-60 ${
                    rating >= star
                      ? "border-yellow-400 bg-yellow-400/10 text-yellow-300"
                      : "border-white/10 bg-black/30 text-gray-600"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>

            <p className="mt-3 text-sm text-gray-400">
              Selected rating: {rating} / 5
            </p>
          </div>

          <div className="mt-7">
            <label className="mb-2 block text-sm font-bold text-gray-300">
              Review Text
            </label>

            <textarea
              value={reviewText}
              onChange={(event) => setReviewText(event.target.value)}
              disabled={!canReview}
              placeholder="Tell other buyers about this seller, delivery speed, communication, and product quality."
              rows={8}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400 disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !canReview}
            className="mt-8 w-full rounded-2xl bg-cyan-400 py-4 text-lg font-black text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Submitting Review..."
              : existingReview
              ? "Update Review"
              : "Submit Review"}
          </button>
        </form>

        <aside className="h-fit space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">Order Summary</h2>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-black text-cyan-300">
                Order #{order.id}
              </p>

              <h3 className="mt-2 text-2xl font-black">
                {order.product || "Unknown Product"}
              </h3>

              <p className="mt-2 text-sm text-gray-400">
                {order.category_name || "Marketplace"} /{" "}
                {order.game_name || "Game"}
              </p>

              <p className="mt-5 text-3xl font-black text-cyan-300">
                {formatPrice(order.total_price || order.price)}
              </p>

              <p className="mt-3 text-sm text-gray-400">
                Status: {normalizedStatus}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-7 shadow-2xl shadow-black/30">
            <h2 className="text-2xl font-black text-yellow-300">Seller</h2>

            <div className="mt-5 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-yellow-400/30 bg-black/30">
                {seller?.avatar_url ? (
                  <img
                    src={seller.avatar_url}
                    alt={seller.seller_name || seller.username || "Seller"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-black text-yellow-300">
                    {(seller?.seller_name ||
                      seller?.username ||
                      seller?.email ||
                      "S")
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                )}
              </div>

              <div>
                <p className="text-xl font-black">
                  {seller?.seller_name ||
                    seller?.username ||
                    seller?.email ||
                    "Seller"}
                </p>

                <p className="text-sm text-green-300">
                  {seller?.seller_status === "approved"
                    ? "Verified Seller"
                    : "Seller"}
                </p>
              </div>
            </div>

            {order.seller_id && (
              <Link
                href={`/seller-profile/${order.seller_id}`}
                className="mt-6 block rounded-2xl border border-yellow-400 px-5 py-3 text-center font-black text-yellow-300 transition hover:bg-yellow-400 hover:text-black"
              >
                View Seller Profile
              </Link>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
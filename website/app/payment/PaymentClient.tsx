"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

type Product = {
  id: number;
  title: string;
  image_url: string | null;
  seller_name: string | null;
};

type GameMaster = {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
};


function normalizeStatus(status: string | null) {
  if (status === "pending") return "Pending Payment";
  if (status === "pending_payment") return "Pending Payment";
  if (status === "Menunggu Pembayaran") return "Pending Payment";
  if (status === "Menunggu Cek Pembayaran") return "Payment Verification";
  if (status === "Diproses") return "Processing";
  if (status === "Selesai") return "Completed";
  if (status === "Dibatalkan") return "Cancelled";
  return status || "Pending Payment";
}

function getStatusClass(status: string | null) {
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === "Payment Verification") {
    return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  }

  if (normalizedStatus === "Processing") {
    return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  }

  if (normalizedStatus === "Completed") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  if (normalizedStatus === "Cancelled") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
}

function createSafeFileName(fileName: string) {
  const extension = fileName.split(".").pop() || "jpg";

  const baseName = fileName
    .replace(`.${extension}`, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${baseName || "payment-proof"}.${extension}`;
}

export default function PaymentUploadV3NotificationPage() {
  const { formatIdrPrice: formatPrice, currency } = useCurrency();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [order, setOrder] = useState<Order | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [gameMaster, setGameMaster] = useState<GameMaster | null>(null);

  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [senderName, setSenderName] = useState("");
  const [senderAccount, setSenderAccount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState("");
  const [uploadedProofUrl, setUploadedProofUrl] = useState("");

  const normalizedStatus = useMemo(() => {
    return normalizeStatus(order?.status || null);
  }, [order]);

  const totalAmount = useMemo(() => {
    return Number(order?.total_price || order?.price || 0);
  }, [order]);

  const displayImage = useMemo(() => {
    return product?.image_url || gameMaster?.image_url || null;
  }, [product, gameMaster]);

  useEffect(() => {
    initializePage();
  }, [orderId]);
  useLiveRefresh(async () => { await initializePage(true); }, {topics:'account'});

  useEffect(() => {
    return () => {
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
    };
  }, [proofPreviewUrl]);

  async function initializePage(background = false) {
    if (!background) setLoading(true);

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

    if (!orderId) {
      setOrder(null);
      setLoading(false);
      return;
    }

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

    if (
      orderData.buyer_id &&
      orderData.buyer_id !== userData.user.id &&
      orderData.buyer !== userData.user.email
    ) {
      alert("You are not allowed to access this payment page.");
      window.location.href = "/my-orders";
      return;
    }

    setOrder(orderData);
    if (!background) setPaymentAmount(String(orderData.total_price || orderData.price || ""));

    if (orderData.payment_image && !background) {
      setUploadedProofUrl(orderData.payment_image);
    }

    if (orderData.product_id) {
      const { data: productData } = await supabase
        .from("products")
        .select("id,title,image_url,seller_name")
        .eq("id", orderData.product_id)
        .maybeSingle();

      setProduct(productData || null);
    }

    if (orderData.game_master_id) {
      const { data: gameData } = await supabase
        .from("game_master")
        .select("id,name,slug,image_url")
        .eq("id", orderData.game_master_id)
        .maybeSingle();

      setGameMaster(gameData || null);
    }

    setLoading(false);
  }

  function handleProofFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setProofFile(null);
      setProofPreviewUrl("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Payment proof image must be less than 5MB.");
      event.target.value = "";
      return;
    }

    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
    }

    setProofFile(file);
    setProofPreviewUrl(URL.createObjectURL(file));
  }

  async function uploadPaymentProof(
    file: File,
    currentUser: User,
    currentOrder: Order
  ) {
    const safeFileName = createSafeFileName(file.name);

    const filePath = `${currentUser.id}/order-${
      currentOrder.id
    }/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicUrlData } = supabase.storage
      .from("payment-proofs")
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }

  async function submitPaymentProof(event: React.FormEvent) {
    event.preventDefault();

    if (!user) {
      alert("User not found. Please login again.");
      return;
    }

    if (!order) {
      alert("Order not found.");
      return;
    }

    if (!paymentMethod.trim()) {
      alert("Please select payment method.");
      return;
    }

    if (!senderName.trim()) {
      alert("Please enter sender name.");
      return;
    }

    if (!paymentAmount.trim()) {
      alert("Please enter payment amount.");
      return;
    }

    if (!proofFile && !uploadedProofUrl) {
      alert("Please upload payment proof image.");
      return;
    }

    try {
      setSubmitting(true);

      let finalPaymentImageUrl = uploadedProofUrl;

      if (proofFile) {
        finalPaymentImageUrl = await uploadPaymentProof(proofFile, user, order);
      }

      const paymentProofText = [
        `Payment Method: ${paymentMethod}`,
        `Sender Name: ${senderName.trim()}`,
        `Sender Account: ${senderAccount.trim() || "-"}`,
        `Payment Amount: ${paymentAmount.trim()}`,
        `Buyer Note: ${paymentNote.trim() || "-"}`,
      ].join("\n");

      const { error } = await supabase
        .from("orders")
        .update({
          status: "Payment Verification",
          payment_proof: paymentProofText,
          payment_image: finalPaymentImageUrl,
        })
        .eq("id", order.id);

      if (error) {
        alert(`Payment Update Error: ${error.message}`);
        setSubmitting(false);
        return;
      }

      await createNotification({
        userId: order.seller_id,
        type: "payment",
        title: "Payment Proof Submitted",
        message: `${user.email || "Buyer"} uploaded payment proof for order #${
          order.id
        } (${order.product || "Product"}). Please verify the payment.`,
        linkUrl: `/order/${order.id}`,
      });

      alert(
        "Payment proof uploaded successfully. Waiting for seller/admin verification."
      );

      window.location.href = "/my-orders";
    } catch (error) {
      console.error("Payment upload error:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to upload payment proof."
      );
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading payment...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-3xl font-black text-cyan-300">Login Required</h1>

          <p className="mt-4 text-gray-400">
            Please login first to continue payment.
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
        <div className="max-w-lg rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Order Not Found</h1>

          <p className="mt-4 text-gray-300">
            Payment page requires a valid order ID.
          </p>

          <Link
            href="/my-orders"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Open My Orders
          </Link>
        </div>
      </main>
    );
  }

  const canSubmitPayment =
    normalizedStatus === "Pending Payment" ||
    normalizedStatus === "Payment Verification";

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Payment Upload V3
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Upload Payment Proof
            </h1>

            <p className="mt-5 max-w-2xl text-gray-300">
              Upload your payment screenshot directly to ComePlayers secure
              payment proof storage.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <span
                className={`rounded-full border px-4 py-2 text-sm font-black ${getStatusClass(
                  order.status
                )}`}
              >
                {normalizedStatus}
              </span>

              <span className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm font-bold text-gray-300">
                Order #{order.id}
              </span>
            </div>
          </div>

          <Link
            href="/my-orders"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            My Orders
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-8 py-10 lg:grid-cols-[1fr_420px]">
        <form
          onSubmit={submitPaymentProof}
          className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30"
        >
          <h2 className="text-3xl font-black">Payment Confirmation</h2>

          {!canSubmitPayment && (
            <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
              <h3 className="font-black text-yellow-300">Payment Locked</h3>

              <p className="mt-3 text-sm text-gray-300">
                This order is already in {normalizedStatus} status. Payment
                proof can no longer be edited from this page.
              </p>
            </div>
          )}

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Payment Method
              </label>

              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                disabled={!canSubmitPayment}
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400 disabled:opacity-60"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="DANA">DANA</option>
                <option value="OVO">OVO</option>
                <option value="GoPay">GoPay</option>
                <option value="ShopeePay">ShopeePay</option>
                <option value="Crypto">Crypto</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Payment Amount
              </label>

              <input
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                disabled={!canSubmitPayment}
                placeholder="Example: 50000"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Sender Name
              </label>

              <input
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
                disabled={!canSubmitPayment}
                placeholder="Name on bank/e-wallet account"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Sender Account / Wallet ID
              </label>

              <input
                value={senderAccount}
                onChange={(event) => setSenderAccount(event.target.value)}
                disabled={!canSubmitPayment}
                placeholder="Account number, phone, wallet ID"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-bold text-gray-300">
              Upload Payment Proof Image
            </label>

            <input
              type="file"
              accept="image/*"
              onChange={handleProofFileChange}
              disabled={!canSubmitPayment}
              className="block w-full cursor-pointer rounded-2xl border border-white/10 bg-black px-5 py-4 text-sm text-gray-300 outline-none file:mr-4 file:rounded-full file:border-0 file:bg-cyan-400 file:px-5 file:py-2 file:font-black file:text-black hover:file:bg-cyan-300 disabled:opacity-60"
            />

            <p className="mt-2 text-xs text-gray-500">
              Supported: JPG, PNG, WEBP. Max 5MB.
            </p>
          </div>

          {(proofPreviewUrl || uploadedProofUrl) && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-cyan-400/20 bg-black/30">
              <div className="flex max-h-[420px] items-center justify-center bg-black">
                <img
                  src={proofPreviewUrl || uploadedProofUrl}
                  alt="Payment proof preview"
                  className="max-h-[420px] w-full object-contain"
                />
              </div>

              <div className="p-4">
                <p className="text-sm font-bold text-cyan-300">
                  Payment proof preview
                </p>
              </div>
            </div>
          )}

          <div className="mt-5">
            <label className="mb-2 block text-sm font-bold text-gray-300">
              Payment Note
            </label>

            <textarea
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
              disabled={!canSubmitPayment}
              placeholder="Write transaction time, bank name, reference number, or additional notes."
              rows={6}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400 disabled:opacity-60"
            />
          </div>

          <div className="mt-7 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <h3 className="font-black text-yellow-300">Important Notice</h3>

            <p className="mt-3 text-sm leading-6 text-gray-300">
              Only submit payment proof after sending the exact amount. False
              payment proof may result in account restriction.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || !canSubmitPayment}
            className="mt-8 w-full rounded-2xl bg-cyan-400 py-4 text-lg font-black text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Uploading Payment..." : "Upload Payment Proof"}
          </button>
        </form>

        <aside className="h-fit space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">Order Summary</h2>

            <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-black/30">
              <div className="flex h-48 items-center justify-center bg-black">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt={order.product || "Order product"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-6xl">🎮</span>
                )}
              </div>

              <div className="p-5">
                <p className="text-xs font-black text-cyan-300">
                  {order.category_name || "Marketplace"} /{" "}
                  {order.game_name || gameMaster?.name || "Game"}
                </p>

                <h3 className="mt-2 text-2xl font-black">
                  {order.product || product?.title || "Unknown Product"}
                </h3>

                <p className="mt-2 text-sm text-gray-400">
                  Quantity: {order.quantity || 1}
                </p>

                <p className="mt-5 text-4xl font-black text-cyan-300">
                  {formatPrice(totalAmount)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-7">
            <h2 className="text-2xl font-black">Payment Destination</h2>

            <div className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-black/30 p-5">
              <div>
                <p className="text-sm text-gray-400">Bank</p>
                <p className="mt-1 text-xl font-black">BCA</p>
              </div>

              <div>
                <p className="text-sm text-gray-400">Account Number</p>
                <p className="mt-1 text-xl font-black text-cyan-300">
                  1234567890
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-400">Account Name</p>
                <p className="mt-1 font-black">ComePlayers Official</p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-gray-300">
              Replace this payment destination later with your real payment
              account or Midtrans integration.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}

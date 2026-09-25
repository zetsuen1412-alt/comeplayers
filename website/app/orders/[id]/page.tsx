"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaComments,
  FaClock,
  FaCopy,
  FaCreditCard,
  FaExclamationTriangle,
  FaImage,
  FaKey,
  FaPaperPlane,
  FaTrash,
  FaUpload,
  FaVideo,
  FaShieldAlt,
  FaWallet,
} from "react-icons/fa";
import { orderTotalIdr, storedMoney } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import {
  deliverySlaState,
  formatDeliveryEta,
  formatRemainingDuration,
  serviceLevelLabel,
} from "@/lib/sellerServiceLevel";
import { supabase } from "@/lib/supabase";

type DeliveryAttachment = {
  kind: "screenshot" | "video";
  fileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  url?: string | null;
  draft?: boolean;
};

type Order = {
  id: number;
  created_at?: string | null;
  product?: string | null;
  buyer?: string | null;
  price?: string | number | null;
  status?: string | null;
  payment_proof?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  product_id?: number | null;
  variant_id?: number | null;
  variant_name?: string | null;
  variant_sku?: string | null;
  buyer_id?: string | null;
  seller_id?: string | null;
  quantity?: number | null;
  total_amount?: string | number | null;
  total_price?: string | number | null;
  product_title?: string | null;
  seller_name?: string | null;
  buyer_name?: string | null;
  buyer_username?: string | null;
  game_name?: string | null;
  category?: string | null;
  escrow_status?: string | null;
  delivery_message?: string | null;
  delivery_credentials?: string | null;
  delivery_attachments?: DeliveryAttachment[];
  delivered_at?: string | null;
  completed_at?: string | null;
  paid_at?: string | null;
  seller_gross_amount?: string | number | null;
  marketplace_fee_amount?: string | number | null;
  seller_sales_tax_rate_percent?: string | number | null;
  seller_sales_tax_amount?: string | number | null;
  seller_earning_amount?: string | number | null;
  seller_payout_status?: string | null;
  delivery_sla_minutes?: number | null;
  delivery_due_at?: string | null;
  delivery_late_at?: string | null;
  delivery_sla_status?: string | null;
  seller_service_level_snapshot?: string | null;
};

type Product = {
  id: number;
  title?: string | null;
  image_url?: string | null;
  price?: string | number | null;
  seller?: string | null;
  seller_name?: string | null;
  game_name?: string | null;
  category?: string | null;
};

type DisputeSummary = {
  id: number;
  status: string;
  reason?: string | null;
  category?: string | null;
  requested_resolution?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
};

type UserRole = "buyer" | "seller" | null;

const numberPrice = storedMoney;

function normalizeStatus(value?: string | null) {
  return String(value || "pending").trim().toLowerCase();
}

function prettyStatus(value?: string | null) {
  return String(value || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusStyle(value?: string | null) {
  const status = normalizeStatus(value);

  if (status.includes("complete") || status.includes("released")) {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  }

  if (status.includes("delivered")) {
    return "border-purple-400/40 bg-purple-400/10 text-purple-300";
  }

  if (status.includes("paid") || status.includes("holding")) {
    return "border-cyan-400/40 bg-cyan-400/10 text-cyan-300";
  }

  if (status.includes("pending") || status.includes("waiting")) {
    return "border-yellow-400/40 bg-yellow-400/10 text-yellow-300";
  }

  if (status.includes("cancel") || status.includes("dispute")) {
    return "border-red-400/40 bg-red-400/10 text-red-300";
  }

  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFileSize(value: number) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function proofMimeType(file: File) {
  const current = String(file.type || "").trim().toLowerCase();
  if (current) return current;
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".mkv")) return "video/x-matroska";
  return current;
}

function fallbackImage(title: string) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    title || "ComePlayers Order"
  )}`;
}

function isPaid(order: Order | null) {
  if (!order) return false;
  const status = normalizeStatus(order.status);
  const paymentStatus = normalizeStatus(order.payment_status);

  return (
    paymentStatus === "paid" ||
    ["paid", "delivered", "completed"].includes(status)
  );
}

function isDelivered(order: Order | null) {
  if (!order) return false;
  return ["delivered", "completed"].includes(normalizeStatus(order.status));
}

function isCompleted(order: Order | null) {
  if (!order) return false;
  return (
    normalizeStatus(order.status) === "completed" ||
    normalizeStatus(order.escrow_status) === "released"
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = Number(params?.id || 0);
  const { formatIdrPrice: formatPrice, currency } = useCurrency();

  const [role, setRole] = useState<UserRole>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [dispute, setDispute] = useState<DisputeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [deliveryCredentials, setDeliveryCredentials] = useState("");
  const [deliveryAttachments, setDeliveryAttachments] = useState<DeliveryAttachment[]>([]);
  const [uploadingProofCount, setUploadingProofCount] = useState(0);
  const [deletingProofPath, setDeletingProofPath] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const productTitle =
    order?.product_title || order?.product || product?.title || "Product";
  const sellerName =
    order?.seller_name || product?.seller_name || product?.seller || "Seller";
  const buyerDisplay = order?.buyer_name
    ? order.buyer_username
      ? `${order.buyer_name} (@${String(order.buyer_username).replace(/^@/, "")})`
      : order.buyer_name
    : order?.buyer_username
      ? `@${String(order.buyer_username).replace(/^@/, "")}`
      : order?.buyer || "Customer";
  const gameName = order?.game_name || product?.game_name || "Game";
  const category = order?.category || product?.category || "Game Product";
  const imageUrl = product?.image_url || fallbackImage(productTitle);
  const quantity = Number(order?.quantity || 1);
  const total = useMemo(
    () =>
      orderTotalIdr(order),
    [order, product]
  );

  const paid = isPaid(order);
  const delivered = isDelivered(order);
  const completed = isCompleted(order);
  const disputeStatus = normalizeStatus(dispute?.status);
  const activeDispute =
    Boolean(dispute) &&
    !["buyer_win", "seller_win", "closed"].includes(disputeStatus);
  const disputed =
    normalizeStatus(order?.status) === "disputed" ||
    normalizeStatus(order?.escrow_status) === "disputed" ||
    activeDispute;
  const sla = deliverySlaState({
    dueAt: order?.delivery_due_at,
    deliveredAt: order?.delivered_at,
    storedStatus: order?.delivery_sla_status,
    now,
  });
  const screenshotProofCount = deliveryAttachments.filter(
    (attachment) => attachment.kind === "screenshot"
  ).length;
  const videoProofCount = deliveryAttachments.filter(
    (attachment) => attachment.kind === "video"
  ).length;
  const proofReady = screenshotProofCount > 0 && videoProofCount > 0;
  const submittedDeliveryAttachments = order?.delivery_attachments || [];

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !data.session?.access_token) {
      throw new Error("Please login again before continuing.");
    }

    return data.session.access_token;
  }

  async function loadOrder(background = false) {
    if (!background) setLoading(true);
    setError("");

    try {
      if (!Number.isFinite(orderId) || orderId <= 0) {
        throw new Error("Invalid order ID.");
      }

      const accessToken = await getAccessToken();
      const response = await fetch(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to load order.");
      }

      const nextOrder = json.order as Order;
      setOrder(nextOrder);
      setProduct((json.product || null) as Product | null);
      setDispute((json.dispute || null) as DisputeSummary | null);
      setRole((json.role || null) as UserRole);
      if (!background) {
      setDeliveryMessage(nextOrder.delivery_message || "");
      setDeliveryCredentials(nextOrder.delivery_credentials || "");
      setDeliveryAttachments(
        (nextOrder.delivery_attachments || []).map((attachment) => ({
          ...attachment,
          draft: false,
        }))
      );
      }
    } catch (loadError) {
      if (!background) {
      setOrder(null);
      setProduct(null);
      setDispute(null);
      setRole(null);
      setDeliveryAttachments([]);
      }
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load order."
      );
    } finally {
      setLoading(false);
    }
  }

  useLiveRefresh(async () => { await loadOrder(true); }, {topics:'account,admin'});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function uploadDeliveryProof(
    kind: "screenshot" | "video",
    files: File[]
  ) {
    if (!order || files.length === 0) return;

    setError("");
    setNotice("");
    let accessToken = "";
    try {
      accessToken = await getAccessToken();
    } catch (tokenError) {
      setError(tokenError instanceof Error ? tokenError.message : "Please login again.");
      return;
    }

    setUploadingProofCount((current) => current + files.length);
    const failures: string[] = [];

    for (const file of files) {
      try {
        const mimeType = proofMimeType(file);
        const prepareResponse = await fetch("/api/orders/delivery-attachments", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderId: order.id,
            kind,
            fileName: file.name,
            mimeType,
            sizeBytes: file.size,
          }),
        });
        const prepared = await prepareResponse.json();
        if (!prepareResponse.ok) {
          throw new Error(prepared.error || `Could not prepare ${file.name}.`);
        }

        const uploadResponse = await fetch(prepared.upload.url, {
          method: prepared.upload.method || "PUT",
          headers: prepared.upload.headers || { "Content-Type": mimeType },
          body: file,
        });
        if (!uploadResponse.ok) {
          throw new Error(`Upload failed for ${file.name}.`);
        }

        setDeliveryAttachments((current) => [
          ...current,
          { ...(prepared.attachment as DeliveryAttachment), draft: true },
        ]);
      } catch (uploadError) {
        failures.push(
          uploadError instanceof Error
            ? `${file.name}: ${uploadError.message}`
            : `${file.name}: upload failed.`
        );
      } finally {
        setUploadingProofCount((current) => Math.max(0, current - 1));
      }
    }

    if (failures.length > 0) {
      setError(failures.join(" "));
    } else {
      setNotice(
        `${files.length} ${kind === "screenshot" ? "screenshot" : "video"}${files.length === 1 ? "" : "s"} uploaded.`
      );
    }
  }

  async function removeDraftProof(attachment: DeliveryAttachment) {
    if (!order || !attachment.draft || deletingProofPath) return;

    setDeletingProofPath(attachment.storagePath);
    setError("");
    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/orders/delivery-attachments", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: order.id,
          storagePath: attachment.storagePath,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not remove delivery proof.");
      setDeliveryAttachments((current) =>
        current.filter((item) => item.storagePath !== attachment.storagePath)
      );
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "Could not remove delivery proof."
      );
    } finally {
      setDeletingProofPath("");
    }
  }

  async function deliverOrder() {
    if (!order) return;

    if (!proofReady) {
      setError("At least one screenshot and one video are required before delivery.");
      return;
    }
    if (uploadingProofCount > 0) {
      setError("Wait for all screenshot and video uploads to finish before delivery.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/orders/deliver", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: order.id,
          deliveryMessage,
          deliveryCredentials,
          attachments: deliveryAttachments.map((attachment) => ({
            kind: attachment.kind,
            fileName: attachment.fileName,
            storagePath: attachment.storagePath,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          })),
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to deliver order.");
      }

      setNotice("Delivery details were sent to the buyer.");
      await loadOrder();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to deliver order."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function completeOrder() {
    if (!order) return;

    const confirmed = window.confirm(
      "Confirm that you received the product and release escrow payment to the seller?"
    );

    if (!confirmed) return;

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/orders/complete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId: order.id }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to complete order.");
      }

      setNotice("Order completed and seller payout released.");
      await loadOrder();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to complete order."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyDelivery() {
    if (!order?.delivery_credentials) return;

    await navigator.clipboard.writeText(order.delivery_credentials);
    setNotice("Delivery details copied.");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-20 text-center text-white">
        Loading order detail...
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-20 text-center text-white">
        <h1 className="text-4xl font-black">Order Unavailable</h1>
        <p className="mt-4 text-red-300">{error || "Order not found."}</p>
        <Link
          href="/my-orders"
          className="mt-8 inline-flex rounded-xl bg-cyan-400 px-6 py-4 font-black text-black"
        >
          My Orders
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-white/10 bg-[#070b14]">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <Link
            href={role === "seller" ? "/seller/orders" : "/my-orders"}
            className="inline-flex items-center gap-2 text-sm font-black text-cyan-300"
          >
            <FaArrowLeft />
            {role === "seller" ? "Back to Seller Orders" : "Back to My Orders"}
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black md:text-4xl">Order #{order.id}</h1>
            {role === "seller" ? (
              <div className="inline-flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
                <span className="shrink-0 text-slate-400">Customer</span>
                <span className="truncate font-black text-white">{buyerDisplay}</span>
              </div>
            ) : null}
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-black ${statusStyle(
                order.status
              )}`}
            >
              {prettyStatus(order.status)}
            </span>
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-black ${statusStyle(
                order.escrow_status
              )}`}
            >
              Escrow: {prettyStatus(order.escrow_status)}
            </span>
            {order.delivery_due_at ? (
              <span
                className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                  sla.late
                    ? "border-red-400/40 bg-red-400/10 text-red-300"
                    : sla.completed
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                      : "border-yellow-400/40 bg-yellow-400/10 text-yellow-300"
                }`}
              >
                {sla.completed
                  ? sla.late
                    ? "Delivered Late"
                    : "Delivered On Time"
                  : sla.late
                    ? `${formatRemainingDuration(sla.remainingMs)} late`
                    : `${formatRemainingDuration(sla.remainingMs)} left`}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="grid gap-5 md:grid-cols-[210px_1fr]">
              <div
                className="h-44 rounded-xl border border-white/10 bg-cover bg-center md:h-full md:min-h-44"
                style={{ backgroundImage: `url(${imageUrl})` }}
              />

              <div>
                <p className="inline-flex rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-200">
                  {category}
                </p>
                <h2 className="mt-3 text-2xl font-black">{productTitle}</h2>
                <p className="mt-1 text-sm text-slate-400">{gameName}</p>
                <p className="mt-3 text-3xl font-black text-cyan-300">
                  {formatPrice(total)}
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <InfoBox label="Seller" value={sellerName} />
                  {role === "seller" ? (
                    <InfoBox label="Customer" value={buyerDisplay} />
                  ) : null}
                  <InfoBox label="Quantity" value={String(quantity)} />
                  {order?.variant_name ? (
                    <InfoBox
                      label="Variant / SKU"
                      value={`${order.variant_name}${order.variant_sku ? ` · ${order.variant_sku}` : ""}`}
                    />
                  ) : null}
                  <InfoBox
                    label="Payment"
                    value={prettyStatus(order.payment_status)}
                  />
                  <InfoBox label="Currency" value={currency} />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <h2 className="text-lg font-black">Order Timeline</h2>
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <TimelineStep
                active
                title="1. Created"
                text={formatDate(order.created_at)}
                icon={<FaClock />}
              />
              <TimelineStep
                active={paid}
                title="2. Paid"
                text={
                  order.paid_at
                    ? formatDate(order.paid_at)
                    : prettyStatus(order.payment_status)
                }
                icon={<FaCreditCard />}
              />
              <TimelineStep
                active={delivered}
                title="3. Delivered"
                text={
                  order.delivered_at
                    ? formatDate(order.delivered_at)
                    : "Waiting seller"
                }
                icon={<FaPaperPlane />}
              />
              <TimelineStep
                active={completed}
                title="4. Completed"
                text={
                  order.completed_at
                    ? formatDate(order.completed_at)
                    : "Waiting buyer"
                }
                icon={<FaCheckCircle />}
              />
            </div>
          </div>

          {paid && order.delivery_due_at ? (
            <div
              className={`rounded-3xl border p-6 ${
                sla.late
                  ? "border-red-400/30 bg-red-400/10"
                  : sla.completed
                    ? "border-emerald-400/30 bg-emerald-400/10"
                    : "border-yellow-400/30 bg-yellow-400/10"
              }`}
            >
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] opacity-80">
                    Delivery Service Level Agreement
                  </p>
                  <h2 className="mt-2 text-3xl font-black">
                    {sla.completed
                      ? sla.late
                        ? "Delivered after the deadline"
                        : "Delivered within the promise"
                      : sla.late
                        ? "Delivery deadline missed"
                        : "Seller delivery countdown"}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-200">
                    Due {formatDate(order.delivery_due_at)} · Promise {formatDeliveryEta(order.delivery_sla_minutes)} · {serviceLevelLabel(order.seller_service_level_snapshot)} seller snapshot
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 px-6 py-5 text-center">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
                    {sla.completed ? "Result" : sla.late ? "Delay" : "Time Remaining"}
                  </p>
                  <p className="mt-2 text-3xl font-black">
                    {sla.completed
                      ? sla.late
                        ? "Late"
                        : "On Time"
                      : formatRemainingDuration(sla.remainingMs)}
                  </p>
                </div>
              </div>
              {sla.late && !sla.completed ? (
                <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                  The payment remains protected in escrow. The seller should deliver immediately; the buyer may contact support if the delay continues.
                </p>
              ) : null}
            </div>
          ) : null}

          {dispute ? (
            <div className={`rounded-3xl border p-6 ${
              activeDispute
                ? "border-orange-400/30 bg-orange-400/10"
                : "border-emerald-400/30 bg-emerald-400/10"
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className={`text-sm font-black ${activeDispute ? "text-orange-200" : "text-emerald-200"}`}>
                    Resolution Center Case #{dispute.id}
                  </p>
                  <h2 className="mt-2 text-2xl font-black">
                    {dispute.reason || "Order dispute"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-300">
                    Status: {prettyStatus(dispute.status)}. {activeDispute
                      ? "Normal escrow completion is paused while this case is active."
                      : "This case has been resolved."}
                  </p>
                </div>
                <Link
                  href={`/resolution-center/${dispute.id}`}
                  className="rounded-2xl border border-orange-400/40 px-5 py-3 text-center font-black text-orange-200 hover:bg-orange-400 hover:text-black"
                >
                  Open Case
                </Link>
              </div>
            </div>
          ) : null}

          {delivered ? (
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-3 text-2xl font-black text-emerald-200">
                  <FaKey /> Delivery Details
                </h2>

                {order.delivery_credentials ? (
                  <button
                    onClick={copyDelivery}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 px-4 py-2 text-sm font-black text-emerald-200"
                  >
                    <FaCopy /> Copy
                  </button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="text-sm text-slate-400">Seller Message</p>
                  <p className="mt-2 whitespace-pre-line text-slate-100">
                    {order.delivery_message || "No message provided."}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="text-sm text-slate-400">
                    Account / Key / Delivery Info
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-slate-100">
                    {order.delivery_credentials ||
                      "No delivery credentials provided."}
                  </pre>
                </div>

                <div className="rounded-2xl border border-cyan-400/20 bg-black/30 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-cyan-200">Completion Proof</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Seller-submitted screenshots and videos are part of this delivery record.
                      </p>
                    </div>
                    <div className="flex gap-2 text-xs font-black">
                      <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-cyan-200">
                        {submittedDeliveryAttachments.filter((item) => item.kind === "screenshot").length} screenshots
                      </span>
                      <span className="rounded-full bg-purple-400/10 px-3 py-1 text-purple-200">
                        {submittedDeliveryAttachments.filter((item) => item.kind === "video").length} videos
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {submittedDeliveryAttachments.map((attachment) =>
                      attachment.kind === "screenshot" ? (
                        <a
                          key={attachment.storagePath}
                          href={attachment.url || undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="group overflow-hidden rounded-2xl border border-white/10 bg-[#050816]"
                        >
                          {attachment.url ? (
                            <div
                              className="h-44 bg-cover bg-center transition group-hover:scale-[1.02]"
                              style={{ backgroundImage: `url(${attachment.url})` }}
                            />
                          ) : (
                            <div className="flex h-44 items-center justify-center text-slate-500">
                              Preview unavailable
                            </div>
                          )}
                          <div className="p-3">
                            <p className="truncate text-sm font-black text-slate-200">{attachment.fileName}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatFileSize(attachment.sizeBytes)}</p>
                          </div>
                        </a>
                      ) : (
                        <div
                          key={attachment.storagePath}
                          className="overflow-hidden rounded-2xl border border-white/10 bg-[#050816]"
                        >
                          {attachment.url ? (
                            <video
                              controls
                              preload="metadata"
                              src={attachment.url}
                              className="h-44 w-full bg-black object-contain"
                            />
                          ) : (
                            <div className="flex h-44 items-center justify-center text-slate-500">
                              Video unavailable
                            </div>
                          )}
                          <div className="p-3">
                            <p className="truncate text-sm font-black text-slate-200">{attachment.fileName}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatFileSize(attachment.sizeBytes)}</p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {role === "seller" && paid && !completed && !disputed ? (
            <div className="rounded-3xl border border-purple-400/20 bg-purple-400/10 p-6">
              <h2 className="text-2xl font-black text-purple-200">
                {delivered ? "Update Delivery" : "Deliver Product"}
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                Add the required screenshot and video proof. Delivery notes and credentials are optional.
              </p>

              <div className="mt-5 grid gap-4">
                <textarea
                  value={deliveryMessage}
                  onChange={(event) => setDeliveryMessage(event.target.value)}
                  rows={4}
                  placeholder="Optional delivery note. Example: Please change the password immediately after login."
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-slate-500 focus:border-purple-400"
                />

                <textarea
                  value={deliveryCredentials}
                  onChange={(event) =>
                    setDeliveryCredentials(event.target.value)
                  }
                  rows={7}
                  placeholder={"Optional account / delivery details:\nUsername:\nPassword:\nEmail:\nRecovery code:\nExtra notes:"}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-5 py-4 font-mono text-sm text-white outline-none placeholder:text-slate-500 focus:border-purple-400"
                />

                <div className="rounded-2xl border border-purple-300/20 bg-black/25 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="flex items-center gap-2 font-black text-purple-100">
                        <FaUpload /> Completion Proof <span className="text-red-300">Required</span>
                      </h3>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        Add at least 1 screenshot and 1 video. There is no limit on how many screenshots or videos you can attach.
                        Each screenshot can be up to 25 MB and each video up to 2 GB.
                      </p>
                    </div>
                    <div className="flex gap-2 text-xs font-black">
                      <span className={`rounded-full px-3 py-1 ${screenshotProofCount > 0 ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"}`}>
                        {screenshotProofCount} screenshots
                      </span>
                      <span className={`rounded-full px-3 py-1 ${videoProofCount > 0 ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"}`}>
                        {videoProofCount} videos
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-cyan-400/40 px-4 py-3 font-black text-cyan-200 transition hover:bg-cyan-400 hover:text-black">
                      <FaImage /> Add Screenshots
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.currentTarget.files || []);
                          event.currentTarget.value = "";
                          void uploadDeliveryProof("screenshot", files);
                        }}
                      />
                    </label>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-purple-400/40 px-4 py-3 font-black text-purple-200 transition hover:bg-purple-400 hover:text-black">
                      <FaVideo /> Add Videos
                      <input
                        type="file"
                        multiple
                        accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mkv"
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.currentTarget.files || []);
                          event.currentTarget.value = "";
                          void uploadDeliveryProof("video", files);
                        }}
                      />
                    </label>
                  </div>

                  {uploadingProofCount > 0 ? (
                    <p className="mt-3 text-sm font-black text-yellow-200">
                      Uploading {uploadingProofCount} proof file{uploadingProofCount === 1 ? "" : "s"}...
                    </p>
                  ) : null}

                  {deliveryAttachments.length > 0 ? (
                    <div className="mt-4 grid gap-2">
                      {deliveryAttachments.map((attachment) => (
                        <div
                          key={attachment.storagePath}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                        >
                          <span className={attachment.kind === "screenshot" ? "text-cyan-300" : "text-purple-300"}>
                            {attachment.kind === "screenshot" ? <FaImage /> : <FaVideo />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-slate-200">{attachment.fileName}</p>
                            <p className="text-xs text-slate-500">
                              {formatFileSize(attachment.sizeBytes)} · {attachment.draft ? "Ready to submit" : "Submitted proof"}
                            </p>
                          </div>
                          {attachment.draft ? (
                            <button
                              type="button"
                              onClick={() => void removeDraftProof(attachment)}
                              disabled={deletingProofPath === attachment.storagePath}
                              className="rounded-lg border border-red-400/30 p-2 text-red-300 hover:bg-red-400 hover:text-black disabled:opacity-50"
                              title="Remove upload"
                            >
                              <FaTrash />
                            </button>
                          ) : attachment.url ? (
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-slate-300 hover:border-cyan-400 hover:text-cyan-200"
                            >
                              Open
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {!proofReady ? (
                    <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-black text-red-200">
                      Delivery is locked until at least one screenshot and one video are uploaded.
                    </p>
                  ) : (
                    <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-black text-emerald-200">
                      Required screenshot and video proof are ready. You can add more files without a count limit.
                    </p>
                  )}
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-bold text-red-200">
                    <div className="flex items-start gap-2">
                      <FaExclamationTriangle className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  </div>
                ) : null}

                {notice ? (
                  <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-200">
                    {notice}
                  </div>
                ) : null}

                <button
                  onClick={deliverOrder}
                  disabled={submitting || uploadingProofCount > 0 || !proofReady}
                  className="rounded-2xl bg-purple-400 px-6 py-4 font-black text-black transition hover:bg-purple-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting
                    ? "Saving Delivery..."
                    : delivered
                      ? "Update Delivery Details"
                      : "Deliver Product"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] p-5">
            <h2 className="text-lg font-black">Order Summary</h2>
            {role === "seller" ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-slate-400">Customer</p>
                <p className="mt-1 break-words font-black text-white">{buyerDisplay}</p>
              </div>
            ) : null}
            <div className="mt-4 space-y-3 text-sm">
              <StatusRow
                label="Order Status"
                value={prettyStatus(order.status)}
              />
              <StatusRow
                label="Payment Status"
                value={prettyStatus(order.payment_status)}
              />
              <StatusRow
                label="Escrow Status"
                value={prettyStatus(order.escrow_status)}
              />
              <StatusRow
                label="Payment Method"
                value={order.payment_method || "-"}
              />
              <StatusRow
                label="Seller Payout"
                value={prettyStatus(order.seller_payout_status)}
              />
              <StatusRow
                label="Delivery SLA"
                value={prettyStatus(order.delivery_sla_status)}
              />
              <StatusRow
                label="Delivery Due"
                value={formatDate(order.delivery_due_at)}
              />
              <StatusRow
                label="Dispute"
                value={dispute ? prettyStatus(dispute.status) : "None"}
              />
            </div>
          </div>

          {role === "seller" && completed ? (
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
              <h3 className="flex items-center gap-2 text-xl font-black text-emerald-200">
                <FaWallet /> Payout Released
              </h3>
              <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-emerald-200/80">
                Net credited to seller wallet
              </p>
              <p className="mt-2 text-3xl font-black text-emerald-300">
                {formatPrice(numberPrice(order.seller_earning_amount))}
              </p>
              <div className="mt-5 space-y-2 border-t border-emerald-300/20 pt-4 text-sm text-slate-300">
                <StatusRow
                  label="Gross sale"
                  value={formatPrice(numberPrice(order.seller_gross_amount))}
                />
                <StatusRow
                  label="Marketplace fee"
                  value={`-${formatPrice(numberPrice(order.marketplace_fee_amount))}`}
                />
                <StatusRow
                  label={`Seller sales tax (${Number(order.seller_sales_tax_rate_percent ?? 0)}%)`}
                  value={`-${formatPrice(numberPrice(order.seller_sales_tax_amount))}`}
                />
              </div>
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-emerald-200">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">
              <FaExclamationTriangle className="mb-3" />
              {error}
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <h2 className="text-lg font-black">Actions</h2>
            <div className="mt-4 grid gap-2">
              {role ? (
                <Link
                  href={`/orders/${order.id}/invoice`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 px-5 py-4 text-center font-black text-slate-200 hover:border-cyan-400 hover:text-cyan-300"
                >
                  View Purchase Invoice
                </Link>
              ) : null}

              {role ? (
                <Link
                  href={`/chat?order=${order.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-400/50 px-5 py-4 text-center font-black text-cyan-200 hover:bg-cyan-400 hover:text-black"
                >
                  <FaComments /> Protected Order Chat
                </Link>
              ) : null}

              {paid && !completed && role ? (
                dispute ? (
                  <Link
                    href={`/resolution-center/${dispute.id}`}
                    className="rounded-2xl border border-orange-400/50 px-5 py-4 text-center font-black text-orange-200 hover:bg-orange-400 hover:text-black"
                  >
                    View Dispute Case
                  </Link>
                ) : (
                  <Link
                    href={`/resolution-center?orderId=${order.id}`}
                    className="rounded-2xl border border-orange-400/50 px-5 py-4 text-center font-black text-orange-200 hover:bg-orange-400 hover:text-black"
                  >
                    Cancel Order
                  </Link>
                )
              ) : null}

              {!paid && role === "buyer" ? (
                <Link
                  href={`/payment/${order.id}?method=paypal`}
                  className="rounded-2xl bg-cyan-400 px-5 py-4 text-center font-black text-black hover:bg-cyan-300"
                >
                  Continue Payment
                </Link>
              ) : null}

              {role === "buyer" && delivered && !completed && !disputed ? (
                <button
                  onClick={completeOrder}
                  disabled={submitting}
                  className="rounded-2xl bg-emerald-400 px-5 py-4 font-black text-black hover:bg-emerald-300 disabled:opacity-60"
                >
                  {submitting
                    ? "Releasing Payment..."
                    : "Confirm Received & Release Payment"}
                </button>
              ) : null}

              {completed && role === "buyer" ? (
                <Link
                  href={`/review/${order.id}`}
                  className="rounded-2xl bg-yellow-400 px-5 py-4 text-center font-black text-black hover:bg-yellow-300"
                >
                  Leave Review
                </Link>
              ) : null}

              <Link
                href={role === "seller" ? "/seller/orders" : "/my-orders"}
                className="rounded-2xl border border-cyan-400 px-5 py-4 text-center font-black text-cyan-300 hover:bg-cyan-400 hover:text-black"
              >
                {role === "seller" ? "Seller Orders" : "My Orders"}
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
            <h3 className="flex items-center gap-2 text-xl font-black text-emerald-200">
              <FaShieldAlt /> Escrow Protection
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Payment stays in escrow until the seller delivers and the buyer
              confirms receipt. Do not confirm before checking the delivery.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black">{value}</p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <span className="text-slate-300">{label}</span>
      <span className="text-right font-black text-cyan-200">{value}</span>
    </div>
  );
}

function TimelineStep({
  active,
  title,
  text,
  icon,
}: {
  active: boolean;
  title: string;
  text: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        active
          ? "border-cyan-400/30 bg-cyan-400/10"
          : "border-white/10 bg-black/30 opacity-55"
      }`}
    >
      <div className={active ? "text-cyan-300" : "text-slate-500"}>{icon}</div>
      <h3 className="mt-2 text-sm font-black">{title}</h3>
      <p className="mt-1 text-[11px] leading-4 text-slate-400">{text}</p>
    </div>
  );
}

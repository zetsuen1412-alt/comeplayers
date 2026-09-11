"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  FaArrowLeft,
  FaBalanceScale,
  FaCheckCircle,
  FaClock,
  FaDownload,
  FaExclamationTriangle,
  FaFileAlt,
  FaPaperPlane,
  FaShieldAlt,
  FaUpload,
  FaUserShield,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import { useCurrency } from "@/components/CurrencyProvider";

type Dispute = {
  id: number;
  order_id: number;
  buyer_id?: string | null;
  seller_id?: string | null;
  opened_by?: string | null;
  reason: string;
  description?: string | null;
  category?: string | null;
  requested_resolution?: string | null;
  priority?: string | null;
  status: string;
  admin_note?: string | null;
  response_due_at?: string | null;
  last_activity_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
};

type Order = {
  id: number;
  product_id?: number | null;
  product?: string | null;
  product_title?: string | null;
  seller_name?: string | null;
  game_name?: string | null;
  category?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  escrow_status?: string | null;
  total_amount?: string | number | null;
  total_price?: string | number | null;
  quantity?: number | null;
  created_at?: string | null;
  paid_at?: string | null;
  delivered_at?: string | null;
  completed_at?: string | null;
  delivery_due_at?: string | null;
  delivery_sla_status?: string | null;
};

type Message = {
  id: number;
  sender_id: string;
  sender_role: string;
  sender_display: string;
  message: string;
  is_internal: boolean;
  created_at: string;
};

type Evidence = {
  id: number;
  uploaded_by: string;
  uploader_display: string;
  file_name: string;
  mime_type?: string | null;
  size_bytes: number;
  caption?: string | null;
  created_at: string;
};

type DisputeEvent = {
  id: number;
  actor_id?: string | null;
  actor_display: string;
  event_type: string;
  old_status?: string | null;
  new_status?: string | null;
  note?: string | null;
  created_at: string;
};

type DetailResponse = {
  dispute: Dispute;
  order: Order | null;
  messages: Message[];
  evidence: Evidence[];
  events: DisputeEvent[];
  role: "admin" | "buyer" | "seller" | "participant";
  isAdmin: boolean;
  currentUserId: string;
};

const FINAL_STATUSES = new Set(["buyer_win", "seller_win", "closed"]);

function pretty(value?: string | null) {
  return String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClass(status: string) {
  if (status === "buyer_win") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "seller_win") {
    return "border-blue-400/30 bg-blue-400/10 text-blue-200";
  }
  if (status === "closed") {
    return "border-slate-400/30 bg-slate-400/10 text-slate-200";
  }
  if (status === "investigating") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200";
  }
  if (status.startsWith("awaiting")) {
    return "border-purple-400/30 bg-purple-400/10 text-purple-200";
  }
  return "border-orange-400/30 bg-orange-400/10 text-orange-200";
}

export default function ResolutionCasePage() {
  const params = useParams();
  const disputeId = Number(params?.id || 0);
  const { formatPrice } = useCurrency();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [message, setMessage] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [manualReference, setManualReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [adminUpdating, setAdminUpdating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isFinal = FINAL_STATUSES.has(String(data?.dispute.status || ""));
  const orderValue = Number(
    data?.order?.total_amount || data?.order?.total_price || 0
  );

  const publicMessages = useMemo(
    () => data?.messages.filter((item) => !item.is_internal) || [],
    [data]
  );
  const internalMessages = useMemo(
    () => data?.messages.filter((item) => item.is_internal) || [],
    [data]
  );

  async function loadCase(showLoader = false) {
    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      setError("Invalid dispute ID.");
      setLoading(false);
      return;
    }

    if (showLoader) setLoading(true);

    try {
      const response = await authenticatedFetchJson<DetailResponse>(
        `/api/disputes/${disputeId}`
      );
      setData(response);
      setAdminNote(response.dispute.admin_note || "");
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load dispute details."
      );
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCase(true);
    const timer = window.setInterval(() => loadCase(false), 20_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

  async function postMessage() {
    if (!message.trim()) return;

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      await authenticatedFetchJson(`/api/disputes/${disputeId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          message,
          internal: internalNote,
        }),
      });
      setMessage("");
      setInternalNote(false);
      setNotice("Message added to the case.");
      await loadCase(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to post the message."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadEvidence() {
    if (!file) return;

    setUploading(true);
    setError("");
    setNotice("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session?.access_token) {
        throw new Error("Please login again before uploading evidence.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("caption", caption);

      const response = await fetch(`/api/disputes/${disputeId}/evidence`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Evidence upload failed.");
      }

      setFile(null);
      setCaption("");
      setNotice("Evidence uploaded securely.");
      await loadCase(false);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Failed to upload evidence."
      );
    } finally {
      setUploading(false);
    }
  }

  async function openEvidence(evidenceId: number) {
    setError("");

    try {
      const response = await authenticatedFetchJson<{
        url: string;
      }>(`/api/disputes/${disputeId}/evidence/${evidenceId}`);
      window.open(response.url, "_blank", "noopener,noreferrer");
    } catch (viewError) {
      setError(
        viewError instanceof Error
          ? viewError.message
          : "Failed to open evidence."
      );
    }
  }

  async function updateAsAdmin(
    action: "investigating" | "buyer_win" | "seller_win" | "closed"
  ) {
    if (!data?.isAdmin) return;

    const confirmations: Record<typeof action, string> = {
      investigating: "Mark this case as investigating?",
      buyer_win: "Resolve for the buyer and process the applicable refund?",
      seller_win: "Resolve for the seller and release escrow when eligible?",
      closed: "Close this case without changing the financial result?",
    };

    if (!window.confirm(confirmations[action])) return;

    setAdminUpdating(true);
    setError("");
    setNotice("");

    try {
      await authenticatedFetchJson("/api/admin/disputes", {
        method: "PATCH",
        body: JSON.stringify({
          disputeId,
          action,
          note:
            adminNote.trim() ||
            `Admin updated this case to ${pretty(action)}.`,
          manualReference: manualReference.trim() || undefined,
        }),
      });
      setNotice(`Case updated to ${pretty(action)}.`);
      await loadCase(false);
    } catch (adminError) {
      setError(
        adminError instanceof Error
          ? adminError.message
          : "Failed to update dispute."
      );
    } finally {
      setAdminUpdating(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading dispute case...</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-5 text-white">
        <div className="max-w-lg rounded-3xl border border-red-400/30 bg-red-400/10 p-8 text-center">
          <FaExclamationTriangle className="mx-auto text-4xl text-red-300" />
          <h1 className="mt-4 text-3xl font-black">Case unavailable</h1>
          <p className="mt-3 text-slate-300">{error || "The dispute could not be loaded."}</p>
          <Link
            href="/resolution-center"
            className="mt-6 inline-flex rounded-full bg-cyan-400 px-6 py-3 font-black text-black"
          >
            Back to Resolution Center
          </Link>
        </div>
      </main>
    );
  }

  const { dispute, order } = data;

  return (
    <main className="min-h-screen bg-[#020617] px-5 py-10 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/resolution-center"
            className="inline-flex items-center gap-2 text-sm font-black text-cyan-300 hover:text-cyan-200"
          >
            <FaArrowLeft /> Resolution Center
          </Link>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/orders/${dispute.order_id}`}
              className="rounded-full border border-cyan-400/40 px-5 py-2 text-sm font-black text-cyan-200 hover:bg-cyan-400 hover:text-black"
            >
              View Order
            </Link>
            {data.isAdmin ? (
              <Link
                href="/admin/disputes"
                className="rounded-full border border-orange-400/40 px-5 py-2 text-sm font-black text-orange-200 hover:bg-orange-400 hover:text-black"
              >
                Admin Cases
              </Link>
            ) : null}
          </div>
        </div>

        <section className="mt-6 rounded-3xl border border-orange-400/20 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,.17),transparent_35%),rgba(255,255,255,.03)] p-7 md:p-10">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-sm font-black text-orange-200">
                <FaBalanceScale /> Case #{dispute.id}
              </p>
              <h1 className="mt-5 max-w-4xl text-3xl font-black md:text-5xl">
                {dispute.reason}
              </h1>
              <p className="mt-4 max-w-4xl whitespace-pre-line leading-7 text-slate-300">
                {dispute.description}
              </p>
            </div>

            <div className="grid min-w-64 gap-3">
              <span className={`rounded-2xl border px-5 py-3 text-center font-black ${statusClass(dispute.status)}`}>
                {pretty(dispute.status)}
              </span>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
                <p className="text-slate-500">Your Role</p>
                <p className="mt-1 font-black text-cyan-200">{pretty(data.role)}</p>
              </div>
            </div>
          </div>
        </section>

        {notice ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-emerald-200">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">
            <FaExclamationTriangle className="mt-1 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-3xl font-black">Case Conversation</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Messages are visible to the buyer, seller, and marketplace team.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-slate-300">
                  {publicMessages.length} messages
                </span>
              </div>

              <div className="mt-6 grid max-h-[640px] gap-4 overflow-y-auto pr-1">
                {publicMessages.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-500">
                    No messages yet.
                  </p>
                ) : (
                  publicMessages.map((item) => {
                    const ownMessage = item.sender_id === data.currentUserId;
                    return (
                      <div
                        key={item.id}
                        className={`max-w-[88%] rounded-2xl border p-4 ${
                          ownMessage
                            ? "ml-auto border-cyan-400/30 bg-cyan-400/10"
                            : item.sender_role === "admin"
                              ? "border-orange-400/30 bg-orange-400/10"
                              : "border-white/10 bg-black/30"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-black text-cyan-200">
                            {item.sender_display}
                          </span>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">
                            {pretty(item.sender_role)}
                          </span>
                          <span className="text-slate-500">{formatDate(item.created_at)}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-100">
                          {item.message}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              {!isFinal ? (
                <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={5}
                    maxLength={5000}
                    placeholder="Write a clear update for the case..."
                    className="w-full resize-none bg-transparent text-white outline-none placeholder:text-slate-500"
                  />

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                    {data.isAdmin ? (
                      <label className="flex items-center gap-2 text-xs font-black text-slate-300">
                        <input
                          type="checkbox"
                          checked={internalNote}
                          onChange={(event) => setInternalNote(event.target.checked)}
                        />
                        Internal admin note
                      </label>
                    ) : (
                      <span className="text-xs text-slate-500">{message.length}/5000</span>
                    )}

                    <button
                      onClick={postMessage}
                      disabled={submitting || !message.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-black text-black hover:bg-cyan-300 disabled:opacity-50"
                    >
                      <FaPaperPlane /> {submitting ? "Sending..." : "Send Message"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  This case is resolved and is now read-only.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-purple-400/20 bg-purple-400/10 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-3xl font-black">Evidence Vault</h2>
                  <p className="mt-2 text-sm text-slate-300">
                    Private evidence is stored in a protected bucket and opened through short-lived links.
                  </p>
                </div>
                <FaShieldAlt className="text-3xl text-purple-300" />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {data.evidence.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-purple-300/20 p-6 text-center text-slate-400 md:col-span-2">
                    No evidence uploaded yet.
                  </p>
                ) : (
                  data.evidence.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <FaFileAlt className="mt-1 shrink-0 text-xl text-purple-300" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-black">{item.file_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatBytes(Number(item.size_bytes || 0))} · {item.uploader_display}
                          </p>
                          {item.caption ? (
                            <p className="mt-3 text-sm leading-5 text-slate-300">{item.caption}</p>
                          ) : null}
                          <button
                            onClick={() => openEvidence(item.id)}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-purple-400/40 px-4 py-2 text-xs font-black text-purple-200 hover:bg-purple-400 hover:text-black"
                          >
                            <FaDownload /> Open Evidence
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {!isFinal ? (
                <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <label className="grid gap-2 text-sm font-black">
                    Evidence File
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                      className="block w-full rounded-xl border border-white/10 bg-[#020617] px-3 py-3 text-xs text-slate-300"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-black">
                    Caption
                    <input
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      maxLength={500}
                      placeholder="What does this file prove?"
                      className="rounded-xl border border-white/10 bg-[#020617] px-4 py-3 text-white outline-none placeholder:text-slate-500"
                    />
                  </label>
                  <button
                    onClick={uploadEvidence}
                    disabled={uploading || !file}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-400 px-5 py-3 font-black text-black hover:bg-purple-300 disabled:opacity-50"
                  >
                    <FaUpload /> {uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              ) : null}
            </div>

            {data.isAdmin && internalMessages.length > 0 ? (
              <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6">
                <h2 className="flex items-center gap-3 text-2xl font-black text-red-200">
                  <FaUserShield /> Internal Admin Notes
                </h2>
                <div className="mt-5 grid gap-3">
                  {internalMessages.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs font-black text-red-200">
                        {item.sender_display} · {formatDate(item.created_at)}
                      </p>
                      <p className="mt-2 whitespace-pre-line text-sm text-slate-200">{item.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-6">
              <h2 className="text-2xl font-black">Order Snapshot</h2>
              <div className="mt-5 space-y-3">
                <Info label="Order" value={`#${dispute.order_id}`} />
                <Info label="Product" value={order?.product_title || order?.product || "Product"} />
                <Info label="Seller" value={order?.seller_name || "Seller"} />
                <Info label="Game" value={order?.game_name || "-"} />
                <Info label="Value" value={formatPrice(orderValue)} />
                <Info label="Payment" value={pretty(order?.payment_status)} />
                <Info label="Escrow" value={pretty(order?.escrow_status)} />
                <Info label="Delivery SLA" value={pretty(order?.delivery_sla_status)} />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-2xl font-black">Case Details</h2>
              <div className="mt-5 space-y-3">
                <Info label="Category" value={pretty(dispute.category)} />
                <Info label="Requested" value={pretty(dispute.requested_resolution)} />
                <Info label="Priority" value={pretty(dispute.priority)} />
                <Info label="Opened" value={formatDate(dispute.created_at)} />
                <Info label="Response Due" value={formatDate(dispute.response_due_at)} />
                <Info label="Resolved" value={formatDate(dispute.resolved_at)} />
              </div>
              {dispute.admin_note ? (
                <div className="mt-5 rounded-2xl border border-orange-400/20 bg-orange-400/10 p-4">
                  <p className="text-xs font-black text-orange-200">Admin Decision Note</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-200">
                    {dispute.admin_note}
                  </p>
                </div>
              ) : null}
            </div>

            {data.isAdmin && !isFinal ? (
              <div className="rounded-3xl border border-orange-400/20 bg-orange-400/10 p-6">
                <h2 className="flex items-center gap-3 text-2xl font-black text-orange-100">
                  <FaUserShield /> Admin Resolution
                </h2>
                <textarea
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                  rows={6}
                  placeholder="Write the factual basis for the decision..."
                  className="mt-5 w-full resize-none rounded-2xl border border-white/10 bg-[#020617] px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-orange-400"
                />
                <input
                  value={manualReference}
                  onChange={(event) => setManualReference(event.target.value)}
                  placeholder="Manual refund reference (bank/QRIS only)"
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-[#020617] px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-orange-400"
                />
                <div className="mt-4 grid gap-3">
                  <button
                    onClick={() => updateAsAdmin("investigating")}
                    disabled={adminUpdating}
                    className="rounded-xl bg-yellow-400 px-4 py-3 font-black text-black disabled:opacity-50"
                  >
                    Mark Investigating
                  </button>
                  <button
                    onClick={() => updateAsAdmin("buyer_win")}
                    disabled={adminUpdating}
                    className="rounded-xl bg-emerald-500 px-4 py-3 font-black text-white disabled:opacity-50"
                  >
                    Buyer Wins / Refund
                  </button>
                  <button
                    onClick={() => updateAsAdmin("seller_win")}
                    disabled={adminUpdating}
                    className="rounded-xl bg-blue-500 px-4 py-3 font-black text-white disabled:opacity-50"
                  >
                    Seller Wins / Release
                  </button>
                  <button
                    onClick={() => updateAsAdmin("closed")}
                    disabled={adminUpdating}
                    className="rounded-xl bg-slate-600 px-4 py-3 font-black text-white disabled:opacity-50"
                  >
                    Close Without Financial Action
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="flex items-center gap-3 text-2xl font-black">
                <FaClock className="text-cyan-300" /> Timeline
              </h2>
              <div className="mt-5 grid gap-4">
                {data.events.map((event) => (
                  <div key={event.id} className="relative border-l border-cyan-400/30 pl-5">
                    <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-cyan-400" />
                    <p className="text-xs font-black text-cyan-200">{pretty(event.event_type)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.actor_display} · {formatDate(event.created_at)}
                    </p>
                    {event.note ? (
                      <p className="mt-2 text-sm leading-5 text-slate-300">{event.note}</p>
                    ) : null}
                    {event.new_status && event.new_status !== event.old_status ? (
                      <p className="mt-2 text-xs font-black text-purple-200">
                        {pretty(event.old_status)} → {pretty(event.new_status)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {isFinal ? (
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6 text-emerald-100">
                <FaCheckCircle className="text-3xl" />
                <h3 className="mt-4 text-xl font-black">Case Resolved</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  The final decision and financial result are recorded in the case timeline.
                </p>
              </div>
            ) : (
              <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-6 text-yellow-100">
                <FaShieldAlt className="text-3xl" />
                <h3 className="mt-4 text-xl font-black">Escrow Paused</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Do not exchange sensitive information outside the order delivery vault or this case.
                </p>
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="max-w-[65%] break-words text-right text-sm font-black text-slate-100">
        {value}
      </span>
    </div>
  );
}

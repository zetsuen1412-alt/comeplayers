"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";
import {
  getAdminIds,
  notifyAdminSupportReply,
  notifyUserSupportReply,
} from "@/lib/notification-event-helper";

type TicketStatus =
  | "open"
  | "waiting_user"
  | "waiting_admin"
  | "resolved"
  | "closed";

type TicketPriority = "low" | "normal" | "high" | "urgent";

type TicketCategory =
  | "general"
  | "order"
  | "payment"
  | "wallet"
  | "withdrawal"
  | "topup"
  | "seller"
  | "dispute"
  | "bug"
  | "other";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
  seller_name: string | null;
  avatar_url: string | null;
};

type SupportTicket = {
  id: number;
  user_id: string;
  order_id: number | null;
  product_id: number | null;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile | null;
};

type TicketMessage = {
  id: number;
  ticket_id: number;
  sender_id: string;
  sender_role: "user" | "admin" | "system";
  message: string;
  attachment_url: string | null;
  created_at: string;
  profiles?: Profile | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function getStatusClass(status: string) {
  if (status === "open") return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
  if (status === "waiting_admin") return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  if (status === "waiting_user") return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  if (status === "resolved") return "border-green-400/20 bg-green-400/10 text-green-300";
  if (status === "closed") return "border-gray-400/20 bg-gray-400/10 text-gray-300";
  return "border-white/10 bg-white/[0.04] text-gray-300";
}

function getPriorityClass(priority: string) {
  if (priority === "urgent") return "border-red-400/20 bg-red-400/10 text-red-300";
  if (priority === "high") return "border-orange-400/20 bg-orange-400/10 text-orange-300";
  if (priority === "normal") return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
  return "border-white/10 bg-white/[0.04] text-gray-300";
}

function getDisplayName(profile: Profile | null | undefined, fallback: string) {
  return profile?.seller_name || profile?.username || profile?.email || fallback;
}

function isClosedStatus(status: TicketStatus) {
  return status === "closed" || status === "resolved";
}

export default function SupportTicketDetailPageV1NotificationEvent() {
  const { formatPrice, currency } = useCurrency();
  const params = useParams();
  const ticketId = String(params.id || "");

  const [user, setUser] = useState<User | null>(null);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");

  const isAdmin = currentProfile?.role?.trim().toLowerCase() === "admin";

  const canAccessTicket = useMemo(() => {
    if (!user || !ticket) return false;
    return isAdmin || ticket.user_id === user.id;
  }, [user, ticket, isAdmin]);

  async function loadTicketAndMessages(currentUser: User, profile: Profile | null) {
    const isCurrentAdmin = profile?.role?.trim().toLowerCase() === "admin";

    const { data: ticketData, error: ticketError } = await supabase
      .from("support_tickets")
      .select(
        `
        *,
        profiles:user_id (
          id,
          email,
          username,
          role,
          seller_name,
          avatar_url
        )
      `
      )
      .eq("id", Number(ticketId))
      .maybeSingle();

    if (ticketError) {
      alert(ticketError.message);
      return;
    }

    if (!ticketData) {
      setTicket(null);
      setMessages([]);
      return;
    }

    const typedTicket = ticketData as unknown as SupportTicket;

    if (!isCurrentAdmin && typedTicket.user_id !== currentUser.id) {
      alert("You do not have access to this ticket.");
      window.location.href = "/support";
      return;
    }

    setTicket(typedTicket);

    const { data: messageData, error: messageError } = await supabase
      .from("support_ticket_messages")
      .select(
        `
        *,
        profiles:sender_id (
          id,
          email,
          username,
          role,
          seller_name,
          avatar_url
        )
      `
      )
      .eq("ticket_id", Number(ticketId))
      .order("id", { ascending: true });

    if (messageError) {
      alert(messageError.message);
      return;
    }

    setMessages((messageData || []) as unknown as TicketMessage[]);
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
        .select("id,email,username,role,seller_name,avatar_url")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError) {
        alert(profileError.message);
        setLoading(false);
        return;
      }

      const profile = profileData || null;
      setCurrentProfile(profile);

      await loadTicketAndMessages(userData.user, profile);

      setLoading(false);
    }

    if (ticketId) initializePage();
  }, [ticketId]);

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();

    if (!user || !ticket || !currentProfile) return;

    if (!replyMessage.trim()) {
      alert("Reply message is required.");
      return;
    }

    if (!canAccessTicket) {
      alert("You do not have access to this ticket.");
      return;
    }

    if (isClosedStatus(ticket.status)) {
      alert("This ticket is already closed/resolved.");
      return;
    }

    setSending(true);

    const senderRole = isAdmin ? "admin" : "user";
    const nextStatus: TicketStatus = isAdmin ? "waiting_user" : "waiting_admin";

    const { error: messageError } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_role: senderRole,
        message: replyMessage.trim(),
        attachment_url: null,
      });

    if (messageError) {
      alert(messageError.message);
      setSending(false);
      return;
    }

    const { error: ticketError } = await supabase
      .from("support_tickets")
      .update({
        status: nextStatus,
        last_message: replyMessage.trim(),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);

    if (ticketError) {
      alert(ticketError.message);
      setSending(false);
      return;
    }

    if (isAdmin) {
      await notifyUserSupportReply({
        adminId: user.id,
        userId: ticket.user_id,
        ticketId: ticket.id,
      });
    } else {
      const adminIds = await getAdminIds();

      await notifyAdminSupportReply({
        adminIds,
        actorId: user.id,
        ticketId: ticket.id,
        userEmail: user.email || "User",
      });
    }

    setReplyMessage("");

    await loadTicketAndMessages(user, currentProfile);
    setSending(false);
  }

  async function updateTicketStatus(nextStatus: TicketStatus) {
    if (!user || !ticket || !currentProfile) return;

    if (!canAccessTicket) {
      alert("You do not have access to this ticket.");
      return;
    }

    if (!isAdmin && !["closed"].includes(nextStatus)) {
      alert("Only admin can set this status.");
      return;
    }

    if (!confirm(`Change ticket #${ticket.id} status to ${nextStatus.replace("_", " ")}?`)) {
      return;
    }

    setUpdatingStatus(true);

    const systemMessage =
      nextStatus === "resolved"
        ? "Ticket marked as resolved."
        : nextStatus === "closed"
        ? "Ticket closed."
        : `Ticket status changed to ${nextStatus}.`;

    const { error: ticketError } = await supabase
      .from("support_tickets")
      .update({
        status: nextStatus,
        last_message: systemMessage,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);

    if (ticketError) {
      alert(ticketError.message);
      setUpdatingStatus(false);
      return;
    }

    await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_role: "system",
      message: systemMessage,
      attachment_url: null,
    });

    if (isAdmin && ticket.user_id !== user.id) {
      await notifyUserSupportReply({
        adminId: user.id,
        userId: ticket.user_id,
        ticketId: ticket.id,
      });
    }

    await loadTicketAndMessages(user, currentProfile);
    setUpdatingStatus(false);
  }

  async function reopenTicket() {
    if (!user || !ticket || !currentProfile) return;

    if (!canAccessTicket) {
      alert("You do not have access to this ticket.");
      return;
    }

    setUpdatingStatus(true);

    const systemMessage = "Ticket reopened.";

    const { error: ticketError } = await supabase
      .from("support_tickets")
      .update({
        status: "waiting_admin",
        last_message: systemMessage,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);

    if (ticketError) {
      alert(ticketError.message);
      setUpdatingStatus(false);
      return;
    }

    await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_role: "system",
      message: systemMessage,
      attachment_url: null,
    });

    if (isAdmin) {
      await notifyUserSupportReply({
        adminId: user.id,
        userId: ticket.user_id,
        ticketId: ticket.id,
      });
    } else {
      const adminIds = await getAdminIds();

      await notifyAdminSupportReply({
        adminIds,
        actorId: user.id,
        ticketId: ticket.id,
        userEmail: user.email || "User",
      });
    }

    await loadTicketAndMessages(user, currentProfile);
    setUpdatingStatus(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading ticket detail...
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-3xl font-black text-cyan-300">Login Required</h1>
          <p className="mt-4 text-gray-400">
            Please login first to view support ticket.
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

  if (!ticket) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">
            Ticket Not Found
          </h1>
          <Link
            href="/support"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Back to Support
          </Link>
        </div>
      </main>
    );
  }

  if (!canAccessTicket) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Access Denied</h1>
          <p className="mt-4 text-gray-300">
            You cannot access this support ticket.
          </p>
          <Link
            href="/support"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Back to Support
          </Link>
        </div>
      </main>
    );
  }

  const ticketOwnerName = getDisplayName(ticket.profiles, ticket.user_id);
  const ticketClosed = isClosedStatus(ticket.status);

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(168,85,247,.16),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Support Ticket #{ticket.id}
            </p>

            <h1 className="max-w-4xl text-4xl font-black md:text-6xl">
              {ticket.subject}
            </h1>

            <div className="mt-5 flex flex-wrap gap-3">
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(ticket.status)}`}>
                {ticket.status}
              </span>

              <span className={`rounded-full border px-3 py-1 text-xs font-black ${getPriorityClass(ticket.priority)}`}>
                {ticket.priority}
              </span>

              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-black text-gray-300">
                {ticket.category}
              </span>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              Created by {ticketOwnerName} · {formatDate(ticket.created_at)}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/support"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 px-6 font-bold text-gray-300 transition hover:bg-white hover:text-black"
            >
              Back to Support
            </Link>

            {ticket.order_id && (
              <Link
                href={`/order/${ticket.order_id}`}
                className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
              >
                View Order
              </Link>
            )}

            {ticket.product_id && (
              <Link
                href={`/product/${ticket.product_id}`}
                className="inline-flex h-12 items-center justify-center rounded-full border border-purple-400 px-6 font-bold text-purple-300 transition hover:bg-purple-400 hover:text-black"
              >
                View Product
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-8 py-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {messages.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center">
              <h2 className="text-2xl font-black">No messages yet.</h2>
            </div>
          ) : (
            messages.map((message) => {
              const isMine = message.sender_id === user.id;
              const isMessageAdmin = message.sender_role === "admin";
              const isSystem = message.sender_role === "system";

              if (isSystem) {
                return (
                  <div
                    key={message.id}
                    className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-center"
                  >
                    <p className="font-bold text-yellow-300">
                      {message.message}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDate(message.created_at)}
                    </p>
                  </div>
                );
              }

              return (
                <div
                  key={message.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-3xl rounded-3xl border p-5 shadow-2xl shadow-black/20 ${
                      isMine
                        ? "border-cyan-400/20 bg-cyan-400/10"
                        : isMessageAdmin
                        ? "border-purple-400/20 bg-purple-400/10"
                        : "border-white/10 bg-white/[0.035]"
                    }`}
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          isMessageAdmin
                            ? "bg-purple-400 text-black"
                            : "bg-cyan-400 text-black"
                        }`}
                      >
                        {isMessageAdmin ? "Admin" : "User"}
                      </span>

                      <span className="text-sm font-bold text-gray-300">
                        {getDisplayName(message.profiles, message.sender_id)}
                      </span>

                      <span className="text-xs text-gray-500">
                        {formatDate(message.created_at)}
                      </span>
                    </div>

                    <p className="whitespace-pre-line leading-7 text-gray-100">
                      {message.message}
                    </p>
                  </div>
                </div>
              );
            })
          )}

          {ticketClosed ? (
            <div className="rounded-3xl border border-gray-400/20 bg-gray-400/10 p-6 text-center">
              <h2 className="text-2xl font-black text-gray-300">
                Ticket is {ticket.status}
              </h2>

              <p className="mt-2 text-gray-400">
                You can reopen this ticket if you still need help.
              </p>

              <button
                onClick={reopenTicket}
                disabled={updatingStatus}
                className="mt-5 rounded-full bg-cyan-400 px-6 py-3 font-black text-black hover:bg-cyan-300 disabled:opacity-60"
              >
                {updatingStatus ? "Reopening..." : "Reopen Ticket"}
              </button>
            </div>
          ) : (
            <form
              onSubmit={sendReply}
              className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-6"
            >
              <h2 className="text-2xl font-black text-cyan-300">
                Reply to Ticket
              </h2>

              <textarea
                value={replyMessage}
                onChange={(event) => setReplyMessage(event.target.value)}
                placeholder="Write your reply..."
                rows={7}
                className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />

              <button
                type="submit"
                disabled={sending}
                className="mt-5 w-full rounded-2xl bg-cyan-400 py-4 font-black text-black hover:bg-cyan-300 disabled:opacity-60"
              >
                {sending ? "Sending Reply..." : "Send Reply"}
              </button>
            </form>
          )}
        </div>

        <aside className="h-fit space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30">
            <h2 className="text-2xl font-black">Ticket Info</h2>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs text-gray-500">Ticket ID</p>
                <p className="mt-1 font-black">#{ticket.id}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs text-gray-500">Status</p>
                <p className="mt-1 font-black">{ticket.status}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs text-gray-500">Category</p>
                <p className="mt-1 font-black">{ticket.category}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs text-gray-500">Priority</p>
                <p className="mt-1 font-black">{ticket.priority}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs text-gray-500">Created</p>
                <p className="mt-1 font-black">{formatDate(ticket.created_at)}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs text-gray-500">Updated</p>
                <p className="mt-1 font-black">{formatDate(ticket.updated_at)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-purple-400/20 bg-purple-400/10 p-6 shadow-2xl shadow-black/30">
            <h2 className="text-2xl font-black text-purple-300">
              Ticket Actions
            </h2>

            <div className="mt-5 flex flex-col gap-3">
              {!ticketClosed && (
                <button
                  onClick={() => updateTicketStatus("closed")}
                  disabled={updatingStatus}
                  className="rounded-2xl border border-gray-400/40 px-5 py-3 font-black text-gray-300 hover:bg-gray-400 hover:text-black disabled:opacity-60"
                >
                  Close Ticket
                </button>
              )}

              {isAdmin && !ticketClosed && (
                <>
                  <button
                    onClick={() => updateTicketStatus("resolved")}
                    disabled={updatingStatus}
                    className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white hover:bg-green-400 disabled:opacity-60"
                  >
                    Mark Resolved
                  </button>

                  <button
                    onClick={() => updateTicketStatus("waiting_user")}
                    disabled={updatingStatus}
                    className="rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-400 disabled:opacity-60"
                  >
                    Waiting User
                  </button>

                  <button
                    onClick={() => updateTicketStatus("waiting_admin")}
                    disabled={updatingStatus}
                    className="rounded-2xl bg-yellow-400 px-5 py-3 font-black text-black hover:bg-yellow-300 disabled:opacity-60"
                  >
                    Waiting Admin
                  </button>
                </>
              )}

              {updatingStatus && (
                <p className="text-center text-sm text-gray-400">
                  Updating ticket...
                </p>
              )}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
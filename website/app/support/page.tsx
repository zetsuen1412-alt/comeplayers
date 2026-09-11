"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";
import {
  getAdminIds,
  notifyAdminSupportCreated,
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
};

const categories: TicketCategory[] = [
  "general",
  "order",
  "payment",
  "wallet",
  "withdrawal",
  "topup",
  "seller",
  "dispute",
  "bug",
  "other",
];

const priorities: TicketPriority[] = ["low", "normal", "high", "urgent"];
const filters = [
  "all",
  "open",
  "waiting_admin",
  "waiting_user",
  "resolved",
  "closed",
];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function getStatusClass(status: string) {
  if (status === "open") {
    return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
  }

  if (status === "waiting_admin") {
    return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  }

  if (status === "waiting_user") {
    return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  }

  if (status === "resolved") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  if (status === "closed") {
    return "border-gray-400/20 bg-gray-400/10 text-gray-300";
  }

  return "border-white/10 bg-white/[0.04] text-gray-300";
}

function getPriorityClass(priority: string) {
  if (priority === "urgent") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  if (priority === "high") {
    return "border-orange-400/20 bg-orange-400/10 text-orange-300";
  }

  if (priority === "normal") {
    return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
  }

  return "border-white/10 bg-white/[0.04] text-gray-300";
}

export default function SupportTicketPageV1NotificationEvent() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory>("general");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [orderId, setOrderId] = useState("");
  const [productId, setProductId] = useState("");
  const [message, setMessage] = useState("");

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const matchesFilter =
        activeFilter === "all" || ticket.status === activeFilter;

      const matchesSearch =
        !query ||
        ticket.subject.toLowerCase().includes(query) ||
        ticket.category.toLowerCase().includes(query) ||
        ticket.priority.toLowerCase().includes(query) ||
        ticket.status.toLowerCase().includes(query) ||
        (ticket.last_message || "").toLowerCase().includes(query) ||
        String(ticket.id).includes(query) ||
        String(ticket.order_id || "").includes(query) ||
        String(ticket.product_id || "").includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [tickets, activeFilter, search]);

  const openCount = tickets.filter((ticket) => ticket.status === "open").length;

  const waitingAdminCount = tickets.filter(
    (ticket) => ticket.status === "waiting_admin"
  ).length;

  const resolvedCount = tickets.filter(
    (ticket) => ticket.status === "resolved"
  ).length;

  async function loadTickets(currentUser: User) {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setTickets(data || []);
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
      await loadTickets(userData.user);
      setLoading(false);
    }

    initializePage();
  }, []);

  function resetForm() {
    setSubject("");
    setCategory("general");
    setPriority("normal");
    setOrderId("");
    setProductId("");
    setMessage("");
  }

  async function createTicket(event: React.FormEvent) {
    event.preventDefault();

    if (!user) {
      alert("Please login first.");
      return;
    }

    if (!subject.trim()) {
      alert("Subject is required.");
      return;
    }

    if (!message.trim()) {
      alert("Message is required.");
      return;
    }

    setCreating(true);

    const { data: ticketData, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        order_id: orderId.trim() ? Number(orderId) : null,
        product_id: productId.trim() ? Number(productId) : null,
        subject: subject.trim(),
        category,
        priority,
        status: "waiting_admin",
        last_message: message.trim(),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (ticketError) {
      alert(ticketError.message);
      setCreating(false);
      return;
    }

    const { error: messageError } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticketData.id,
        sender_id: user.id,
        sender_role: "user",
        message: message.trim(),
        attachment_url: null,
      });

    if (messageError) {
      alert(messageError.message);
      setCreating(false);
      return;
    }

    const adminIds = await getAdminIds();

    await notifyAdminSupportCreated({
      adminIds,
      actorId: user.id,
      userEmail: user.email || "User",
      ticketId: ticketData.id,
      subject: ticketData.subject,
    });

    resetForm();
    await loadTickets(user);
    setCreating(false);

    alert("Support ticket created successfully.");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading support tickets...
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
            Please login first to contact support.
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(168,85,247,.16),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Support Center
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Support Tickets
            </h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Create a support ticket for orders, payments, wallet, withdrawal,
              seller issues, disputes, bugs, or general questions.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/my-orders"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 px-6 font-bold text-gray-300 transition hover:bg-white hover:text-black"
            >
              My Orders
            </Link>

            <Link
              href="/wallet"
              className="inline-flex h-12 items-center justify-center rounded-full border border-green-400 px-6 font-bold text-green-300 transition hover:bg-green-400 hover:text-black"
            >
              Wallet
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Tickets</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {tickets.length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Open</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {openCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Waiting Admin</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {waitingAdminCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Resolved</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {resolvedCount}
            </p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
          <form
            onSubmit={createTicket}
            className="h-fit rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-7 shadow-2xl shadow-black/30"
          >
            <h2 className="text-3xl font-black text-cyan-300">
              Create Ticket
            </h2>

            <p className="mt-2 text-sm text-gray-300">
              Explain your issue clearly so support can help faster.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-300">
                  Subject
                </label>

                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Example: Payment proof not verified"
                  className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-300">
                    Category
                  </label>

                  <select
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value as TicketCategory)
                    }
                    className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                  >
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-300">
                    Priority
                  </label>

                  <select
                    value={priority}
                    onChange={(event) =>
                      setPriority(event.target.value as TicketPriority)
                    }
                    className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none focus:border-cyan-400"
                  >
                    {priorities.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-300">
                    Order ID
                  </label>

                  <input
                    type="number"
                    value={orderId}
                    onChange={(event) => setOrderId(event.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-300">
                    Product ID
                  </label>

                  <input
                    type="number"
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-gray-300">
                  Message
                </label>

                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Describe your issue here..."
                  rows={8}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="mt-6 w-full rounded-2xl bg-cyan-400 py-4 font-black text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating Ticket..." : "Create Support Ticket"}
            </button>
          </form>

          <section>
            <div className="mb-6 grid gap-4 xl:grid-cols-[1fr_auto]">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tickets by subject, category, priority, status, order ID, product ID..."
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />

              <div className="flex flex-wrap gap-3">
                {filters.map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                      activeFilter === filter
                        ? "bg-cyan-400 text-black"
                        : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-cyan-400 hover:text-white"
                    }`}
                  >
                    {filter === "all" ? "All" : filter}
                  </button>
                ))}
              </div>
            </div>

            {filteredTickets.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
                <h2 className="text-3xl font-black">No tickets found.</h2>

                <p className="mt-3 text-gray-400">
                  Create your first support ticket from the form.
                </p>
              </div>
            ) : (
              <div className="grid gap-5">
                {filteredTickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    href={`/support/${ticket.id}`}
                    className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 transition hover:-translate-y-1 hover:border-cyan-400"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(
                          ticket.status
                        )}`}
                      >
                        {ticket.status}
                      </span>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${getPriorityClass(
                          ticket.priority
                        )}`}
                      >
                        {ticket.priority}
                      </span>

                      <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-black text-gray-300">
                        {ticket.category}
                      </span>

                      <span className="text-sm text-gray-500">
                        #{ticket.id}
                      </span>
                    </div>

                    <h2 className="mt-4 text-2xl font-black">
                      {ticket.subject}
                    </h2>

                    <p className="mt-3 line-clamp-2 leading-7 text-gray-300">
                      {ticket.last_message || "No message."}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-4 text-sm text-gray-500">
                      <span>Created: {formatDate(ticket.created_at)}</span>
                      <span>
                        Last Message:{" "}
                        {formatDate(ticket.last_message_at || ticket.updated_at)}
                      </span>
                      {ticket.order_id && <span>Order #{ticket.order_id}</span>}
                      {ticket.product_id && (
                        <span>Product #{ticket.product_id}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
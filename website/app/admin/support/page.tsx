"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
  seller_name: string | null;
};

type SupportTicket = {
  id: number;
  user_id: string;
  order_id: number | null;
  product_id: number | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  profiles: Profile | null;
};

const statusFilters = ["all", "open", "waiting_admin", "waiting_user", "resolved", "closed"];
const priorityFilters = ["all", "urgent", "high", "normal", "low"];
const categoryFilters = ["all", "general", "order", "payment", "wallet", "withdrawal", "topup", "seller", "dispute", "bug", "other"];

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

function getDisplayName(profile: Profile | null, fallback: string) {
  return profile?.seller_name || profile?.username || profile?.email || fallback;
}

export default function AdminSupportTicketManagementNotificationV1Page() {
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [activeStatus, setActiveStatus] = useState("all");
  const [activePriority, setActivePriority] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const profile = ticket.profiles;

      return (
        (activeStatus === "all" || ticket.status === activeStatus) &&
        (activePriority === "all" || ticket.priority === activePriority) &&
        (activeCategory === "all" || ticket.category === activeCategory) &&
        (!query ||
          ticket.subject.toLowerCase().includes(query) ||
          ticket.category.toLowerCase().includes(query) ||
          ticket.priority.toLowerCase().includes(query) ||
          ticket.status.toLowerCase().includes(query) ||
          (ticket.last_message || "").toLowerCase().includes(query) ||
          (profile?.email || "").toLowerCase().includes(query) ||
          (profile?.username || "").toLowerCase().includes(query) ||
          (profile?.seller_name || "").toLowerCase().includes(query) ||
          ticket.user_id.toLowerCase().includes(query) ||
          String(ticket.id).includes(query) ||
          String(ticket.order_id || "").includes(query) ||
          String(ticket.product_id || "").includes(query))
      );
    });
  }, [tickets, activeStatus, activePriority, activeCategory, search]);

  async function loadTickets() {
    const { data, error } = await supabase
      .from("support_tickets")
      .select(`
        *,
        profiles:user_id (
          id,
          email,
          username,
          role,
          seller_name
        )
      `)
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setTickets((data || []) as unknown as SupportTicket[]);
  }

  useEffect(() => {
    async function init() {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        setLoading(false);
        return;
      }

      setUser(userData.user);

      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("id,email,username,role,seller_name")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      setAdminProfile(profileData || null);

      if (profileData?.role?.trim().toLowerCase() === "admin") {
        await loadTickets();
      }

      setLoading(false);
    }

    init();
  }, []);

  async function updateTicketStatus(ticket: SupportTicket, nextStatus: string) {
    if (!user) return;
    if (!confirm(`Change ticket #${ticket.id} to ${nextStatus}?`)) return;

    try {
      setUpdatingId(ticket.id);
      await authenticatedFetchJson("/api/admin/support", {
        method: "PATCH",
        body: JSON.stringify({ ticketId: ticket.id, status: nextStatus }),
      });
      await loadTickets();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update support ticket.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading admin support...</p>
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Access Denied</h1>
          <p className="mt-4 text-gray-300">Only admin can access support management.</p>
          <Link href="/" className="mt-6 inline-flex rounded-full bg-cyan-400 px-6 py-3 font-black text-black">
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  const openCount = tickets.filter((t) => t.status === "open").length;
  const waitingAdminCount = tickets.filter((t) => t.status === "waiting_admin").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;
  const urgentCount = tickets.filter((t) => t.priority === "urgent").length;

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(168,85,247,.18),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-purple-400/30 bg-purple-400/10 px-4 py-2 text-sm font-black text-purple-300">
              Admin Support Center
            </p>

            <h1 className="text-5xl font-black md:text-7xl">Support Tickets</h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Manage user support requests, update ticket status, and send notification events automatically.
            </p>
          </div>

          <Link
            href="/admin"
            className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 hover:bg-cyan-400 hover:text-black"
          >
            Admin Home
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">{tickets.length}</p>
          </div>

          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-5">
            <p className="text-sm text-gray-300">Open</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">{openCount}</p>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <p className="text-sm text-gray-300">Waiting Admin</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">{waitingAdminCount}</p>
          </div>

          <div className="rounded-3xl border border-green-400/20 bg-green-400/10 p-5">
            <p className="text-sm text-gray-300">Resolved</p>
            <p className="mt-2 text-3xl font-black text-green-300">{resolvedCount}</p>
          </div>

          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-5">
            <p className="text-sm text-gray-300">Urgent</p>
            <p className="mt-2 text-3xl font-black text-red-300">{urgentCount}</p>
          </div>
        </div>

        <div className="mb-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ticket, user, email, order ID, product ID..."
            className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div>
              <p className="mb-3 text-sm font-black text-gray-400">Status</p>
              <div className="flex flex-wrap gap-2">
                {statusFilters.map((item) => (
                  <button
                    key={item}
                    onClick={() => setActiveStatus(item)}
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      activeStatus === item
                        ? "bg-cyan-400 text-black"
                        : "border border-white/10 bg-black/30 text-gray-300"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-black text-gray-400">Priority</p>
              <div className="flex flex-wrap gap-2">
                {priorityFilters.map((item) => (
                  <button
                    key={item}
                    onClick={() => setActivePriority(item)}
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      activePriority === item
                        ? "bg-purple-400 text-black"
                        : "border border-white/10 bg-black/30 text-gray-300"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-black text-gray-400">Category</p>
              <div className="flex flex-wrap gap-2">
                {categoryFilters.map((item) => (
                  <button
                    key={item}
                    onClick={() => setActiveCategory(item)}
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      activeCategory === item
                        ? "bg-green-400 text-black"
                        : "border border-white/10 bg-black/30 text-gray-300"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {filteredTickets.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center">
            <h2 className="text-3xl font-black">No tickets found.</h2>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredTickets.map((ticket) => {
              const ownerName = getDisplayName(ticket.profiles, ticket.user_id);

              return (
                <div
                  key={ticket.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
                >
                  <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(ticket.status)}`}>
                          {ticket.status}
                        </span>

                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${getPriorityClass(ticket.priority)}`}>
                          {ticket.priority}
                        </span>

                        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-black text-gray-300">
                          {ticket.category}
                        </span>

                        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-black text-gray-300">
                          #{ticket.id}
                        </span>
                      </div>

                      <h2 className="mt-4 text-3xl font-black">{ticket.subject}</h2>

                      <p className="mt-3 line-clamp-2 leading-7 text-gray-300">
                        {ticket.last_message || "No message."}
                      </p>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">User</p>
                          <p className="mt-1 font-black">{ownerName}</p>
                          <p className="mt-1 break-words text-sm text-gray-400">
                            {ticket.profiles?.email || ticket.user_id}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Last Message</p>
                          <p className="mt-1 font-black">
                            {formatDate(ticket.last_message_at || ticket.updated_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <Link
                        href={`/support/${ticket.id}`}
                        className="rounded-2xl bg-cyan-400 px-5 py-3 text-center font-black text-black hover:bg-cyan-300"
                      >
                        Open Ticket
                      </Link>

                      <button
                        onClick={() => updateTicketStatus(ticket, "waiting_user")}
                        disabled={updatingId === ticket.id}
                        className="rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-400 disabled:opacity-60"
                      >
                        Waiting User
                      </button>

                      <button
                        onClick={() => updateTicketStatus(ticket, "resolved")}
                        disabled={updatingId === ticket.id}
                        className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white hover:bg-green-400 disabled:opacity-60"
                      >
                        Mark Resolved
                      </button>

                      <button
                        onClick={() => updateTicketStatus(ticket, "closed")}
                        disabled={updatingId === ticket.id}
                        className="rounded-2xl border border-gray-400 px-5 py-3 font-black text-gray-300 hover:bg-gray-400 hover:text-black disabled:opacity-60"
                      >
                        Close Ticket
                      </button>

                      {updatingId === ticket.id && (
                        <p className="text-center text-sm text-gray-400">
                          Updating...
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
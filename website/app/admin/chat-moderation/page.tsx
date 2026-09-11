"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FaBan,
  FaCheckCircle,
  FaCommentSlash,
  FaExclamationTriangle,
  FaFlag,
  FaLock,
  FaShieldAlt,
  FaUnlock,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Profile = {
  id: string;
  email?: string | null;
  username?: string | null;
  full_name?: string | null;
};

type Message = {
  id: string;
  room_id: string;
  sender_id: string;
  receiver_id: string;
  message?: string | null;
  message_type?: string | null;
  moderation_status?: string | null;
  risk_score?: number | null;
  risk_flags?: string[] | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

type Room = {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_id?: number | null;
  order_id?: number | null;
  status?: string | null;
  room_type?: string | null;
};

type ModerationEvent = {
  id: number;
  room_id?: string | null;
  message_id?: string | null;
  user_id: string;
  event_type: string;
  risk_score: number;
  risk_level: string;
  flags: string[];
  redacted_excerpt?: string | null;
  status: string;
  review_note?: string | null;
  created_at: string;
  message: Message | null;
  room: Room | null;
  profile: Profile | null;
};

type ChatReport = {
  id: number;
  room_id: string;
  message_id: string;
  reported_by: string;
  reason: string;
  details?: string | null;
  status: string;
  created_at: string;
  message: Message | null;
  room: Room | null;
  reporter: Profile | null;
};

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

function profileName(profile?: Profile | null, fallback = "Unknown user") {
  return profile?.username || profile?.full_name || profile?.email || fallback;
}

export default function AdminChatModerationPage() {
  const [events, setEvents] = useState<ModerationEvent[]>([]);
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");

  async function load() {
    try {
      const data = await authenticatedFetchJson<{
        events: ModerationEvent[];
        reports: ChatReport[];
      }>("/api/admin/chat-moderation");
      setEvents(data.events || []);
      setReports(data.reports || []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load moderation queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const visibleEvents = useMemo(
    () => (filter === "open" ? events.filter((event) => event.status === "open") : events),
    [events, filter]
  );
  const visibleReports = useMemo(
    () => (filter === "open" ? reports.filter((report) => report.status === "open") : reports),
    [reports, filter]
  );

  async function action(payload: Record<string, unknown>, promptText?: string) {
    const note = promptText ? window.prompt(promptText, "Reviewed by moderator") || "" : "";
    setBusy(true);
    try {
      await authenticatedFetchJson("/api/admin/chat-moderation", {
        method: "PATCH",
        body: JSON.stringify({ ...payload, note }),
      });
      await load();
    } catch (actionError) {
      window.alert(actionError instanceof Error ? actionError.message : "Moderation action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-24 text-center text-white">
        Loading chat moderation...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-red-400/20 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,.18),transparent_38%)]">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <p className="inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-black text-red-300">
            <FaShieldAlt /> Trust & Safety Operations
          </p>
          <h1 className="mt-5 text-5xl font-black md:text-7xl">Chat Moderation</h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Review blocked contact sharing, off-platform payment attempts, suspicious messages, and reports from buyers or sellers.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin" className="font-black text-cyan-300">← Admin Dashboard</Link>
            <button
              onClick={() => setFilter(filter === "open" ? "all" : "open")}
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-black"
            >
              Show {filter === "open" ? "all" : "open only"}
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="Open safety events" value={String(events.filter((item) => item.status === "open").length)} icon={<FaExclamationTriangle />} />
          <Metric label="Open user reports" value={String(reports.filter((item) => item.status === "open").length)} icon={<FaFlag />} />
          <Metric label="Total reviewed items" value={String(events.length + reports.length)} icon={<FaShieldAlt />} />
        </div>

        <div className="mt-10 grid gap-8 xl:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-black">Automatic Safety Events</h2>
            <div className="mt-5 space-y-4">
              {visibleEvents.length === 0 ? (
                <p className="text-slate-400">No matching safety events.</p>
              ) : (
                visibleEvents.map((event) => (
                  <article key={event.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{pretty(event.event_type)}</p>
                        <p className="mt-1 text-sm text-cyan-300">
                          {profileName(event.profile, event.user_id)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${event.status === "open" ? "bg-red-400/10 text-red-300" : "bg-emerald-400/10 text-emerald-300"}`}>
                        {pretty(event.status)} · Risk {event.risk_score}
                      </span>
                    </div>
                    <p className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-slate-300">
                      {event.redacted_excerpt || event.message?.message || "Sensitive content was blocked before delivery."}
                    </p>
                    <p className="mt-3 text-xs text-slate-500">
                      {formatDate(event.created_at)} · {pretty(event.risk_level)} · {event.flags?.join(", ") || "No flags"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {event.status === "open" ? (
                        <>
                          <button disabled={busy} onClick={() => action({ action: "resolve_event", eventId: event.id }, "Resolution note")} className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-black text-emerald-300">
                            <FaCheckCircle className="mr-1 inline" /> Resolve
                          </button>
                          <button disabled={busy} onClick={() => action({ action: "dismiss_event", eventId: event.id }, "Dismissal note")} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-black text-slate-300">
                            Dismiss
                          </button>
                        </>
                      ) : null}
                      {event.message?.id && !event.message.deleted_at ? (
                        <button disabled={busy} onClick={() => action({ action: "remove_message", messageId: event.message?.id }, "Reason for removal")} className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-black text-red-300">
                          <FaCommentSlash className="mr-1 inline" /> Remove Message
                        </button>
                      ) : null}
                      {event.room?.id ? (
                        <button disabled={busy} onClick={() => action({ action: event.room?.status === "locked" ? "unlock_room" : "lock_room", roomId: event.room?.id }, "Room moderation note")} className="rounded-lg border border-yellow-400/40 px-3 py-2 text-xs font-black text-yellow-300">
                          {event.room.status === "locked" ? <FaUnlock className="mr-1 inline" /> : <FaLock className="mr-1 inline" />}
                          {event.room.status === "locked" ? "Unlock Room" : "Lock Room"}
                        </button>
                      ) : null}
                      <button disabled={busy} onClick={() => action({ action: "suspend_chat", userId: event.user_id, hours: 24 }, "Reason for 24-hour chat suspension")} className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-black text-red-300">
                        <FaBan className="mr-1 inline" /> Suspend 24h
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-black">User Reports</h2>
            <div className="mt-5 space-y-4">
              {visibleReports.length === 0 ? (
                <p className="text-slate-400">No matching chat reports.</p>
              ) : (
                visibleReports.map((report) => (
                  <article key={report.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{pretty(report.reason)}</p>
                        <p className="mt-1 text-sm text-cyan-300">
                          Reported by {profileName(report.reporter, report.reported_by)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${report.status === "open" ? "bg-yellow-400/10 text-yellow-300" : "bg-emerald-400/10 text-emerald-300"}`}>
                        {pretty(report.status)}
                      </span>
                    </div>
                    <p className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-slate-300">
                      {report.message?.message || "Message unavailable or removed."}
                    </p>
                    {report.details ? <p className="mt-3 text-sm text-slate-400">Reporter note: {report.details}</p> : null}
                    <p className="mt-3 text-xs text-slate-500">{formatDate(report.created_at)} · Room {report.room_id}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {report.status === "open" ? (
                        <>
                          <button disabled={busy} onClick={() => action({ action: "resolve_report", reportId: report.id }, "Resolution note")} className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-black text-emerald-300">Resolve</button>
                          <button disabled={busy} onClick={() => action({ action: "dismiss_report", reportId: report.id }, "Dismissal note")} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-black text-slate-300">Dismiss</button>
                        </>
                      ) : null}
                      {report.message?.id && !report.message.deleted_at ? (
                        <button disabled={busy} onClick={() => action({ action: "remove_message", messageId: report.message?.id }, "Reason for removal")} className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-black text-red-300">Remove Message</button>
                      ) : null}
                      {report.room?.id ? (
                        <button disabled={busy} onClick={() => action({ action: report.room?.status === "locked" ? "unlock_room" : "lock_room", roomId: report.room?.id }, "Room moderation note")} className="rounded-lg border border-yellow-400/40 px-3 py-2 text-xs font-black text-yellow-300">
                          {report.room.status === "locked" ? "Unlock Room" : "Lock Room"}
                        </button>
                      ) : null}
                      {report.message?.sender_id ? (
                        <button disabled={busy} onClick={() => action({ action: "suspend_chat", userId: report.message?.sender_id, hours: 24 }, "Reason for 24-hour chat suspension")} className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-black text-red-300">Suspend Sender</button>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-red-300">{icon}</div>
      <p className="mt-4 text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FaExclamationTriangle, FaShieldAlt, FaUserLock } from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type UserProfile = {
  id: string;
  email?: string | null;
  username?: string | null;
  full_name?: string | null;
  role?: string | null;
};

type RiskEvent = {
  id: number;
  user_id: string;
  event_type: string;
  severity: string;
  status: string;
  details: Record<string, unknown>;
  created_at: string;
  resolution_note?: string | null;
  profile: UserProfile | null;
};

type RiskProfile = {
  user_id: string;
  risk_score: number;
  risk_level: string;
  status: string;
  kyc_level: number;
  payout_daily_limit: number | string;
  reasons: string[];
  last_evaluated_at: string | null;
  review_note?: string | null;
  profile: UserProfile | null;
};

function pretty(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (item) => item.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function userLabel(profile: UserProfile | null, userId: string) {
  return profile?.username || profile?.full_name || profile?.email || userId;
}

export default function AdminRiskPage() {
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [profiles, setProfiles] = useState<RiskProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await authenticatedFetchJson<{ events: RiskEvent[]; profiles: RiskProfile[] }>("/api/admin/risk");
      setEvents(data.events);
      setProfiles(data.profiles);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load risk queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const openEvents = useMemo(() => events.filter((event) => event.status !== "resolved"), [events]);
  const blockedProfiles = useMemo(() => profiles.filter((profile) => profile.status === "blocked"), [profiles]);

  async function resolveEvent(eventId: number) {
    const note = prompt("Resolution note", "Reviewed by administrator") || "";
    setBusy(true);
    try {
      await authenticatedFetchJson("/api/admin/risk", {
        method: "PATCH",
        body: JSON.stringify({ action: "resolve_event", eventId, note }),
      });
      await load();
    } catch (actionError) {
      alert(actionError instanceof Error ? actionError.message : "Failed to resolve event.");
    } finally {
      setBusy(false);
    }
  }

  async function setRiskStatus(userId: string, status: "active" | "review" | "blocked") {
    const note = prompt(`Reason for ${status} status`, "Security review") || "";
    setBusy(true);
    try {
      await authenticatedFetchJson("/api/admin/risk", {
        method: "PATCH",
        body: JSON.stringify({ action: "set_risk_status", userId, status, note }),
      });
      await load();
    } catch (actionError) {
      alert(actionError instanceof Error ? actionError.message : "Failed to update risk status.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="min-h-screen bg-[#050816] px-4 py-24 text-center text-white">Loading risk queue...</main>;

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-red-400/20 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,.18),transparent_38%)]">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <p className="inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-black text-red-300"><FaShieldAlt /> Trust & Risk Operations</p>
          <h1 className="mt-5 text-5xl font-black md:text-7xl">Risk Queue</h1>
          <p className="mt-4 max-w-3xl text-slate-300">Review payout anomalies, PIN failures, device changes, and manually block suspicious withdrawals.</p>
          <Link href="/admin" className="mt-6 inline-flex text-sm font-black text-cyan-300">← Admin Dashboard</Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        {error ? <p className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="Open events" value={String(openEvents.length)} icon={<FaExclamationTriangle />} />
          <Metric label="Risk profiles" value={String(profiles.length)} icon={<FaShieldAlt />} />
          <Metric label="Blocked users" value={String(blockedProfiles.length)} icon={<FaUserLock />} />
        </div>

        <div className="mt-10 grid gap-8 xl:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-black">Security Events</h2>
            <div className="mt-5 space-y-4">
              {events.length === 0 ? <p className="text-slate-400">No security events.</p> : events.map((event) => (
                <div key={event.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-black">{pretty(event.event_type)}</p><p className="mt-1 text-sm text-cyan-300">{userLabel(event.profile, event.user_id)}</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${event.status === "resolved" ? "bg-emerald-400/10 text-emerald-300" : "bg-yellow-400/10 text-yellow-300"}`}>{pretty(event.status)}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{formatDate(event.created_at)} · {pretty(event.severity)}</p>
                  {event.status !== "resolved" ? <button disabled={busy} onClick={() => resolveEvent(event.id)} className="mt-4 rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-black text-emerald-300">Resolve Event</button> : null}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-black">User Risk Profiles</h2>
            <div className="mt-5 space-y-4">
              {profiles.length === 0 ? <p className="text-slate-400">Risk profiles appear after payout evaluation.</p> : profiles.map((profile) => (
                <div key={profile.user_id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-black">{userLabel(profile.profile, profile.user_id)}</p><p className="mt-1 text-xs text-slate-500">KYC {profile.kyc_level} · {formatDate(profile.last_evaluated_at)}</p></div>
                    <div className="text-right"><p className="text-2xl font-black text-yellow-300">{profile.risk_score}</p><p className="text-xs uppercase text-slate-400">{profile.risk_level}</p></div>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">Status: <strong>{pretty(profile.status)}</strong></p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => setRiskStatus(profile.user_id, "active")} className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-black text-emerald-300">Activate</button>
                    <button disabled={busy} onClick={() => setRiskStatus(profile.user_id, "review")} className="rounded-lg border border-yellow-400/40 px-3 py-2 text-xs font-black text-yellow-300">Review</button>
                    <button disabled={busy} onClick={() => setRiskStatus(profile.user_id, "blocked")} className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-black text-red-300">Block Payouts</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><div className="text-red-300">{icon}</div><p className="mt-4 text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>;
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FaArrowLeft,
  FaBolt,
  FaClock,
  FaMedal,
  FaSave,
  FaSignal,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import {
  formatDeliveryEta,
  serviceLevelClass,
  serviceLevelDescription,
  serviceLevelLabel,
  SELLER_SLA_OPTIONS,
  type SellerPresence,
} from "@/lib/sellerServiceLevel";

type ServiceProfile = {
  seller_name?: string | null;
  username?: string | null;
  seller_presence_mode?: SellerPresence | null;
  effective_presence?: SellerPresence;
  seller_last_seen_at?: string | null;
  seller_delivery_sla_minutes?: number | null;
  seller_avg_delivery_minutes?: number | null;
  seller_on_time_rate?: number | null;
  seller_total_deliveries?: number | null;
  seller_late_deliveries?: number | null;
  seller_service_level?: string | null;
  seller_service_metrics_updated_at?: string | null;
};

function presenceClass(value?: SellerPresence | null) {
  if (value === "online") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  }
  if (value === "away") {
    return "border-yellow-400/40 bg-yellow-400/10 text-yellow-200";
  }
  return "border-slate-400/30 bg-slate-400/10 text-slate-300";
}

function formatUpdatedAt(value?: string | null) {
  if (!value) return "Not calculated yet";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function SellerServiceLevelPage() {
  const [profile, setProfile] = useState<ServiceProfile | null>(null);
  const [presenceMode, setPresenceMode] = useState<SellerPresence>("offline");
  const [slaMinutes, setSlaMinutes] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadProfile() {
    setLoading(true);
    setError("");

    try {
      const result = await authenticatedFetchJson<{ profile: ServiceProfile }>(
        "/api/seller/service-level"
      );
      setProfile(result.profile);
      setPresenceMode(result.profile.seller_presence_mode || "offline");
      setSlaMinutes(Number(result.profile.seller_delivery_sla_minutes || 60));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load seller service level."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile();
  }, []);

  useEffect(() => {
    if (!profile || presenceMode === "offline") return;

    const heartbeat = async () => {
      try {
        await authenticatedFetchJson("/api/seller/service-level", {
          method: "POST",
          body: JSON.stringify({ action: "heartbeat" }),
        });
      } catch {
        // Presence gracefully becomes offline after the activity window.
      }
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [presenceMode, profile]);

  const completedOnTime = useMemo(() => {
    const total = Number(profile?.seller_total_deliveries || 0);
    const late = Number(profile?.seller_late_deliveries || 0);
    return Math.max(0, total - late);
  }, [profile]);

  async function saveSettings() {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const result = await authenticatedFetchJson<{
        profile: ServiceProfile;
      }>("/api/seller/service-level", {
        method: "PATCH",
        body: JSON.stringify({
          presenceMode,
          deliverySlaMinutes: slaMinutes,
        }),
      });

      setProfile(result.profile);
      setPresenceMode(result.profile.seller_presence_mode || "offline");
      setSlaMinutes(Number(result.profile.seller_delivery_sla_minutes || 60));
      setNotice("Seller presence and delivery SLA were updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save seller service settings."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-24 text-center text-white">
        Loading seller service level...
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-24 text-center text-white">
        <h1 className="text-4xl font-black">Seller Service Level</h1>
        <p className="mx-auto mt-4 max-w-xl text-red-200">{error}</p>
        <Link
          href="/seller"
          className="mt-8 inline-flex rounded-xl bg-cyan-400 px-6 py-4 font-black text-black"
        >
          Back to Seller Dashboard
        </Link>
      </main>
    );
  }

  const effectivePresence = profile.effective_presence || "offline";

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_38%)]">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <Link
            href="/seller"
            className="inline-flex items-center gap-2 text-sm font-black text-cyan-300"
          >
            <FaArrowLeft /> Seller Dashboard
          </Link>
          <div className="mt-7 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-300">
                Seller Performance
              </p>
              <h1 className="mt-3 text-5xl font-black">Service Level & Delivery SLA</h1>
              <p className="mt-4 max-w-3xl text-slate-300">
                Configure your public availability and promised delivery time. New paid
                orders receive a fixed SLA snapshot so buyers can track the deadline.
              </p>
            </div>
            <span
              className={`inline-flex rounded-full border px-5 py-3 text-sm font-black ${serviceLevelClass(
                profile.seller_service_level
              )}`}
            >
              <FaMedal className="mr-2" />
              {serviceLevelLabel(profile.seller_service_level)} Seller
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-emerald-200">
            {notice}
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={<FaBolt />}
            label="Average Delivery"
            value={formatDeliveryEta(profile.seller_avg_delivery_minutes)}
          />
          <Metric
            icon={<FaSignal />}
            label="On-Time Rate"
            value={`${Number(profile.seller_on_time_rate || 100).toFixed(1)}%`}
          />
          <Metric
            icon={<FaClock />}
            label="On-Time Deliveries"
            value={String(completedOnTime)}
          />
          <Metric
            icon={<FaMedal />}
            label="Late Deliveries"
            value={String(profile.seller_late_deliveries || 0)}
            attention={Number(profile.seller_late_deliveries || 0) > 0}
          />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-black">Public Seller Status</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Online and Away require an active seller page heartbeat. After five
              minutes without activity, the marketplace automatically displays you as
              offline.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {(["online", "away", "offline"] as SellerPresence[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPresenceMode(mode)}
                  className={`rounded-2xl border px-5 py-5 text-left transition ${
                    presenceMode === mode
                      ? presenceClass(mode)
                      : "border-white/10 bg-black/30 text-slate-300 hover:border-cyan-400/40"
                  }`}
                >
                  <span className="block font-black capitalize">{mode}</span>
                  <span className="mt-2 block text-xs opacity-75">
                    {mode === "online"
                      ? "Ready to process orders now"
                      : mode === "away"
                        ? "Available, but response may be slower"
                        : "Not currently available"}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-slate-400">Currently shown to buyers</p>
              <span
                className={`mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-black capitalize ${presenceClass(
                  effectivePresence
                )}`}
              >
                {effectivePresence}
              </span>
            </div>

            <div className="mt-8 border-t border-white/10 pt-8">
              <h2 className="text-2xl font-black">Default Delivery Promise</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                This value is applied to new paid orders unless a product-specific ETA
                is configured later.
              </p>

              <label className="mt-6 block text-sm font-black text-slate-200">
                Delivery SLA
              </label>
              <select
                value={slaMinutes}
                onChange={(event) => setSlaMinutes(Number(event.target.value))}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-4 text-white outline-none focus:border-cyan-400"
              >
                {SELLER_SLA_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes} className="bg-[#050816]">
                    {formatDeliveryEta(minutes)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={saving}
                onClick={saveSettings}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-6 py-4 font-black text-black hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FaSave /> {saving ? "Saving..." : "Save Service Settings"}
              </button>
            </div>
          </div>

          <aside className="space-y-6">
            <div
              className={`rounded-3xl border p-6 ${serviceLevelClass(
                profile.seller_service_level
              )}`}
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] opacity-80">
                Current Service Level
              </p>
              <p className="mt-3 text-4xl font-black">
                {serviceLevelLabel(profile.seller_service_level)}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                {serviceLevelDescription(profile.seller_service_level)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h3 className="text-xl font-black">How levels improve</h3>
              <div className="mt-5 space-y-4 text-sm text-slate-300">
                <p><strong className="text-white">Reliable:</strong> 10+ deliveries and at least 90% on time.</p>
                <p><strong className="text-white">Trusted:</strong> 30+ deliveries, 95% on time, average within four hours.</p>
                <p><strong className="text-white">Elite:</strong> 100+ deliveries, 98% on time, average within two hours.</p>
              </div>
              <p className="mt-6 text-xs leading-5 text-slate-500">
                Metrics last recalculated: {formatUpdatedAt(profile.seller_service_metrics_updated_at)}
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  attention = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 ${
        attention
          ? "border-red-400/30 bg-red-400/10"
          : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div className={attention ? "text-red-300" : "text-cyan-300"}>{icon}</div>
      <p className="mt-4 text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

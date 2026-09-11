"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
  seller_status: string | null;
  seller_name: string | null;
  bio: string | null;
  discord: string | null;
  avatar_url: string | null;
  created_at: string;
};

type SellerApplication = {
  id: number;
  user_id: string;
  email: string;
  seller_name: string;
  full_name: string;
  phone: string;
  discord: string | null;
  identity_number: string;
  identity_image: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function getStatusView(status: string | null | undefined) {
  if (status === "approved") {
    return {
      label: "Approved",
      title: "Seller Approved",
      icon: "✅",
      color: "text-green-300",
      border: "border-green-400/20",
      bg: "bg-green-400/10",
      message:
        "Your seller account is active. You can create products, manage orders, and grow your store on ComePlayers.",
    };
  }

  if (status === "pending") {
    return {
      label: "Pending Review",
      title: "Application Under Review",
      icon: "🟡",
      color: "text-yellow-300",
      border: "border-yellow-400/20",
      bg: "bg-yellow-400/10",
      message:
        "Your seller application has been submitted and is waiting for admin approval.",
    };
  }

  if (status === "rejected") {
    return {
      label: "Rejected",
      title: "Application Needs Review",
      icon: "⚠️",
      color: "text-red-300",
      border: "border-red-400/20",
      bg: "bg-red-400/10",
      message:
        "Your seller application was not approved. Review the notes below and submit again if needed.",
    };
  }

  return {
    label: "Not Applied",
    title: "Become a Seller",
    icon: "🚀",
    color: "text-cyan-300",
    border: "border-cyan-400/20",
    bg: "bg-cyan-400/10",
    message:
      "Complete your seller verification to unlock seller tools and start listing products.",
  };
}

export default function SellerVerificationPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializePage();
  }, []);

  async function initializePage() {
    try {
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
        .select("*")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError) {
        alert(profileError.message);
        setLoading(false);
        return;
      }

      if (!profileData) {
        alert("Profile not found.");
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: applicationData, error: applicationError } = await supabase
        .from("seller_applications")
        .select("*")
        .eq("user_id", userData.user.id)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (applicationError) {
        alert(applicationError.message);
        setLoading(false);
        return;
      }

      setApplication(applicationData || null);
      setLoading(false);
    } catch (error) {
      console.error("Seller verification page error:", error);
      alert("Failed to load seller verification.");
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading verification center...
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-3xl font-black text-cyan-300">
            Login Required
          </h1>

          <p className="mt-4 text-gray-400">
            Please login first to view your seller verification status.
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

  const sellerStatus =
    profile?.seller_status || application?.status || "not_applied";
  const statusView = getStatusView(sellerStatus);

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Seller Verification Center
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Verification Status
            </h1>

            <p className="mt-5 max-w-2xl text-gray-300">
              Track your seller approval status, identity review, and account
              readiness.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/seller"
              className="rounded-full border border-cyan-400 px-5 py-3 font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Seller Dashboard
            </Link>

            {sellerStatus !== "approved" ? (
              <Link
                href="/seller/apply"
                className="rounded-full bg-cyan-400 px-5 py-3 font-black text-black transition hover:bg-cyan-300"
              >
                Apply / Update
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-8 py-10 lg:grid-cols-[1fr_420px]">
        <div className={`rounded-3xl border ${statusView.border} ${statusView.bg} p-8`}>
          <p className="text-6xl">{statusView.icon}</p>

          <h2 className={`mt-5 text-4xl font-black ${statusView.color}`}>
            {statusView.title}
          </h2>

          <p className="mt-4 max-w-3xl text-gray-300">
            {statusView.message}
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-gray-400">Current Status</p>
              <p className={`mt-2 text-2xl font-black ${statusView.color}`}>
                {statusView.label}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-gray-400">Seller Name</p>
              <p className="mt-2 text-2xl font-black">
                {profile?.seller_name ||
                  application?.seller_name ||
                  profile?.username ||
                  "Not Set"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-gray-400">Account Email</p>
              <p className="mt-2 break-words text-xl font-black">
                {profile?.email || user.email || "-"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-gray-400">Profile Created</p>
              <p className="mt-2 text-xl font-black">
                {formatDate(profile?.created_at)}
              </p>
            </div>
          </div>

          {application?.notes ? (
            <div className="mt-8 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
              <h3 className="font-black text-yellow-300">Admin Notes</h3>
              <p className="mt-3 text-gray-300">{application.notes}</p>
            </div>
          ) : null}
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">Verification Checklist</h2>

            <div className="mt-7 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-sm font-black text-cyan-300">Step 1</p>
                <h3 className="mt-2 text-xl font-black">Application Submitted</h3>
                <p className="mt-2 text-sm text-gray-400">
                  {application
                    ? `Submitted on ${formatDate(application.created_at)}`
                    : "Not submitted yet."}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-sm font-black text-cyan-300">Step 2</p>
                <h3 className="mt-2 text-xl font-black">Identity Review</h3>
                <p className="mt-2 text-sm text-gray-400">
                  Admin reviews your seller identity and marketplace readiness.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-sm font-black text-cyan-300">Step 3</p>
                <h3 className="mt-2 text-xl font-black">Seller Access</h3>
                <p className="mt-2 text-sm text-gray-400">
                  Approved sellers can create listings and manage orders.
                </p>
              </div>
            </div>
          </div>

          {application ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
              <h2 className="text-2xl font-black">Latest Application</h2>

              <div className="mt-5 space-y-4 text-sm">
                <div className="flex justify-between border-b border-white/10 pb-3">
                  <span className="text-gray-400">Application ID</span>
                  <span className="font-black">#{application.id}</span>
                </div>

                <div className="flex justify-between border-b border-white/10 pb-3">
                  <span className="text-gray-400">Status</span>
                  <span className={`font-black ${statusView.color}`}>
                    {application.status || "-"}
                  </span>
                </div>

                <div className="flex justify-between border-b border-white/10 pb-3">
                  <span className="text-gray-400">Phone</span>
                  <span className="font-black">{application.phone || "-"}</span>
                </div>

                <div className="flex justify-between border-b border-white/10 pb-3">
                  <span className="text-gray-400">Discord</span>
                  <span className="font-black">{application.discord || "-"}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">Submitted</span>
                  <span className="font-black">
                    {formatDate(application.created_at)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-7">
              <h2 className="text-2xl font-black text-cyan-300">
                Ready to Sell?
              </h2>

              <p className="mt-3 text-gray-300">
                Submit a seller application to unlock seller features.
              </p>

              <Link
                href="/seller/apply"
                className="mt-6 inline-flex rounded-full bg-cyan-400 px-5 py-3 font-black text-black hover:bg-cyan-300"
              >
                Apply Now
              </Link>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
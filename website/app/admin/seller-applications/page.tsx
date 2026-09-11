"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

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
  created_at: string;
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
};

const applicationStatuses = ["all", "pending", "approved", "rejected"];

function getStatusClass(status: string | null) {
  if (status === "approved") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  if (status === "rejected") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

export default function SellerApplicationsAdminPage() {
  const { formatPrice, currency } = useCurrency();
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [updatingApplicationId, setUpdatingApplicationId] = useState<
    number | null
  >(null);

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  async function loadApplications() {
    const { data, error } = await supabase
      .from("seller_applications")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setApplications(data || []);
  }

  useEffect(() => {
    async function initializePage() {
      setLoading(true);

      const { data: userData, error: userError } =
        await supabase.auth.getUser();

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

      const { data: profileById, error: profileByIdError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileByIdError) {
        alert(profileByIdError.message);
        setLoading(false);
        return;
      }

      let profileData = profileById;

      if (!profileData && userData.user.email) {
        const { data: profileByEmail, error: profileByEmailError } =
          await supabase
            .from("profiles")
            .select("*")
            .eq("email", userData.user.email)
            .maybeSingle();

        if (profileByEmailError) {
          alert(profileByEmailError.message);
          setLoading(false);
          return;
        }

        profileData = profileByEmail;
      }

      setAdminProfile(profileData);

      if (profileData?.role?.trim().toLowerCase() !== "admin") {
        setLoading(false);
        return;
      }

      await loadApplications();
      setLoading(false);
    }

    initializePage();
  }, []);

  async function approveApplication(application: SellerApplication) {
    if (!confirm(`Approve ${application.seller_name} as a seller?`)) return;

    setUpdatingApplicationId(application.id);

    try {
      await authenticatedFetchJson("/api/admin/seller-applications", {
        method: "PATCH",
        body: JSON.stringify({ applicationId: application.id, action: "approve" }),
      });

      await loadApplications();
      alert("Seller application approved successfully.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to approve seller application.");
    } finally {
      setUpdatingApplicationId(null);
    }
  }

  async function rejectApplication(application: SellerApplication) {
    const rejectionNote = prompt(
      `Reject ${application.seller_name}? Add a required note:`,
      "Seller application rejected."
    );

    if (rejectionNote === null) return;
    const note = rejectionNote.trim();

    if (!note) {
      alert("A rejection note is required.");
      return;
    }

    setUpdatingApplicationId(application.id);

    try {
      await authenticatedFetchJson("/api/admin/seller-applications", {
        method: "PATCH",
        body: JSON.stringify({ applicationId: application.id, action: "reject", note }),
      });

      await loadApplications();
      alert("Seller application rejected.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to reject seller application.");
    } finally {
      setUpdatingApplicationId(null);
    }
  }

  async function resetApplication(application: SellerApplication) {
    if (!confirm(`Reset ${application.seller_name} application to pending?`)) return;

    setUpdatingApplicationId(application.id);

    try {
      await authenticatedFetchJson("/api/admin/seller-applications", {
        method: "PATCH",
        body: JSON.stringify({ applicationId: application.id, action: "reset" }),
      });

      await loadApplications();
      alert("Seller application reset to pending.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to reset seller application.");
    } finally {
      setUpdatingApplicationId(null);
    }
  }

  const filteredApplications = applications.filter((application) => {
    const matchesStatus =
      activeStatus === "all" || application.status === activeStatus;

    const query = search.toLowerCase();

    const matchesSearch =
      application.seller_name.toLowerCase().includes(query) ||
      application.email.toLowerCase().includes(query) ||
      application.full_name.toLowerCase().includes(query) ||
      application.phone.toLowerCase().includes(query) ||
      String(application.id).includes(query);

    return matchesStatus && matchesSearch;
  });

  const pendingCount = applications.filter(
    (application) => application.status === "pending"
  ).length;

  const approvedCount = applications.filter(
    (application) => application.status === "approved"
  ).length;

  const rejectedCount = applications.filter(
    (application) => application.status === "rejected"
  ).length;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading seller applications...
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
            Please login first to access the admin dashboard.
          </p>

          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-cyan-400 px-6 py-3 font-black text-black hover:bg-cyan-300"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Access Denied</h1>

          <p className="mt-4 text-gray-300">
            Only administrator accounts can access seller applications.
          </p>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-left text-sm text-gray-300">
            <p>Current user: {user.email}</p>
            <p>Detected role: {adminProfile?.role || "No profile found"}</p>
          </div>

          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-cyan-400 px-6 py-3 font-black text-black hover:bg-cyan-300"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_34%)]" />

        <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Admin Dashboard
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Seller Applications
            </h1>

            <p className="mt-5 max-w-2xl text-gray-300">
              Review seller verification requests, approve trusted sellers, and
              protect the ComePlayers marketplace.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <Link
            href="/admin"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            Back to Admin
          </Link>
        </div>
      </section>

      <section className="px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-4">
          <button
            onClick={() => setActiveStatus("all")}
            className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-left transition hover:border-cyan-400"
          >
            <p className="text-sm text-gray-400">Total Applications</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {applications.length}
            </p>
          </button>

          <button
            onClick={() => setActiveStatus("pending")}
            className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-left transition hover:border-yellow-400"
          >
            <p className="text-sm text-gray-400">Pending</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {pendingCount}
            </p>
          </button>

          <button
            onClick={() => setActiveStatus("approved")}
            className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-left transition hover:border-green-400"
          >
            <p className="text-sm text-gray-400">Approved</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {approvedCount}
            </p>
          </button>

          <button
            onClick={() => setActiveStatus("rejected")}
            className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-left transition hover:border-red-400"
          >
            <p className="text-sm text-gray-400">Rejected</p>
            <p className="mt-2 text-3xl font-black text-red-300">
              {rejectedCount}
            </p>
          </button>
        </div>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by seller name, email, full name, phone, or ID..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="flex flex-wrap gap-3">
            {applicationStatuses.map((status) => (
              <button
                key={status}
                onClick={() => setActiveStatus(status)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  activeStatus === status
                    ? "bg-cyan-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-cyan-400 hover:text-white"
                }`}
              >
                {status === "all"
                  ? "All"
                  : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredApplications.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center">
            <h2 className="text-3xl font-black">No applications found.</h2>
            <p className="mt-3 text-gray-400">
              Seller applications will appear here after users submit their
              verification forms.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredApplications.map((application) => (
              <div
                key={application.id}
                className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
              >
                <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black">
                        {application.seller_name}
                      </h2>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(
                          application.status
                        )}`}
                      >
                        {application.status || "pending"}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-gray-400">
                      Application ID: #{application.id}
                    </p>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="mt-1 break-words font-bold">
                          {application.email}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs text-gray-500">Full Name</p>
                        <p className="mt-1 font-bold">
                          {application.full_name}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs text-gray-500">Phone</p>
                        <p className="mt-1 font-bold">{application.phone}</p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs text-gray-500">Discord</p>
                        <p className="mt-1 font-bold">
                          {application.discord || "-"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs text-gray-500">
                          Identity Number
                        </p>
                        <p className="mt-1 break-words font-bold">
                          {application.identity_number}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs text-gray-500">Submitted At</p>
                        <p className="mt-1 font-bold">
                          {formatDate(application.created_at)}
                        </p>
                      </div>
                    </div>

                    {application.identity_image ? (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs text-gray-500">Identity Image</p>

                        <img
                          src={application.identity_image}
                          alt="Seller identity preview"
                          className="mt-3 max-h-72 w-full rounded-2xl border border-white/10 object-cover"
                        />

                        <a
                          href={application.identity_image}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-block font-bold text-cyan-300 hover:text-cyan-200"
                        >
                          Open Full Identity Image
                        </a>
                      </div>
                    ) : null}

                    {application.notes ? (
                      <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                        <p className="text-xs text-cyan-300">Admin Notes</p>
                        <p className="mt-2 text-sm text-gray-300">
                          {application.notes}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => approveApplication(application)}
                      disabled={updatingApplicationId === application.id}
                      className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white transition hover:bg-green-400 disabled:opacity-60"
                    >
                      Approve Seller
                    </button>

                    <button
                      onClick={() => rejectApplication(application)}
                      disabled={updatingApplicationId === application.id}
                      className="rounded-2xl bg-red-500 px-5 py-3 font-black text-white transition hover:bg-red-400 disabled:opacity-60"
                    >
                      Reject Seller
                    </button>

                    <button
                      onClick={() => resetApplication(application)}
                      disabled={updatingApplicationId === application.id}
                      className="rounded-2xl bg-yellow-400 px-5 py-3 font-black text-black transition hover:bg-yellow-300 disabled:opacity-60"
                    >
                      Reset to Pending
                    </button>

                    <Link
                      href={`/seller-profile/${application.user_id}`}
                      className="rounded-2xl border border-cyan-400/40 px-5 py-3 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
                    >
                      View Seller Profile
                    </Link>

                    {updatingApplicationId === application.id ? (
                      <p className="text-center text-sm text-gray-400">
                        Updating application...
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
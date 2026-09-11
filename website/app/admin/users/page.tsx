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
  seller_status: string | null;
  seller_name: string | null;
  bio: string | null;
  discord: string | null;
  avatar_url: string | null;
  created_at: string;
};

const roleFilters = ["all", "admin", "seller", "user"];
const sellerStatusFilters = [
  "all",
  "approved",
  "pending",
  "rejected",
  "not_applied",
];

const roleOptions = ["user", "seller", "admin"];
const sellerStatusOptions = ["not_applied", "pending", "approved", "rejected"];

function getRoleClass(role: string | null) {
  if (role === "admin") return "border-red-400/20 bg-red-400/10 text-red-300";
  if (role === "seller")
    return "border-green-400/20 bg-green-400/10 text-green-300";
  return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
}

function getSellerStatusClass(status: string | null) {
  if (status === "approved")
    return "border-green-400/20 bg-green-400/10 text-green-300";
  if (status === "pending")
    return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  if (status === "rejected")
    return "border-red-400/20 bg-red-400/10 text-red-300";
  return "border-white/10 bg-white/[0.04] text-gray-300";
}

export default function AdminUserManagementV1Page() {
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeRole, setActiveRole] = useState("all");
  const [activeSellerStatus, setActiveSellerStatus] = useState("all");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const isAdmin = adminProfile?.role?.trim().toLowerCase() === "admin";

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();

    return profiles.filter((profile) => {
      const role = profile.role || "user";
      const sellerStatus = profile.seller_status || "not_applied";

      const matchesRole = activeRole === "all" || role === activeRole;

      const matchesSellerStatus =
        activeSellerStatus === "all" || sellerStatus === activeSellerStatus;

      const matchesSearch =
        !query ||
        profile.id.toLowerCase().includes(query) ||
        (profile.email || "").toLowerCase().includes(query) ||
        (profile.username || "").toLowerCase().includes(query) ||
        (profile.seller_name || "").toLowerCase().includes(query) ||
        (profile.discord || "").toLowerCase().includes(query);

      return matchesRole && matchesSellerStatus && matchesSearch;
    });
  }, [profiles, search, activeRole, activeSellerStatus]);

  const totalUsers = profiles.length;
  const adminCount = profiles.filter((profile) => profile.role === "admin").length;
  const sellerCount = profiles.filter(
    (profile) => profile.seller_status === "approved" || profile.role === "seller"
  ).length;
  const pendingSellerCount = profiles.filter(
    (profile) => profile.seller_status === "pending"
  ).length;

  async function loadProfiles() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setProfiles(data || []);
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

      const { data: currentProfile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError) {
        alert(profileError.message);
        setLoading(false);
        return;
      }

      setAdminProfile(currentProfile || null);

      if (currentProfile?.role?.trim().toLowerCase() === "admin") {
        await loadProfiles();
      }

      setLoading(false);
    }

    initializePage();
  }, []);

  async function updateRole(profileId: string, role: string) {
    if (!isAdmin) return;

    setUpdatingUserId(profileId);

    try {
      await authenticatedFetchJson("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ profileId, role }),
      });

      await loadProfiles();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update user role.");
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function updateSellerStatus(profile: Profile, sellerStatus: string) {
    if (!isAdmin) return;

    setUpdatingUserId(profile.id);

    try {
      await authenticatedFetchJson("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ profileId: profile.id, sellerStatus }),
      });

      await loadProfiles();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update seller status.");
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function quickApproveSeller(profile: Profile) {
    if (!confirm(`Approve ${profile.email || profile.username} as seller?`)) {
      return;
    }

    await updateSellerStatus(profile, "approved");
  }

  async function quickRejectSeller(profile: Profile) {
    if (!confirm(`Reject seller access for ${profile.email || profile.username}?`)) {
      return;
    }

    await updateSellerStatus(profile, "rejected");
  }

  async function resetSeller(profile: Profile) {
    if (!confirm(`Reset seller status for ${profile.email || profile.username}?`)) {
      return;
    }

    await updateSellerStatus(profile, "not_applied");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading admin users...</p>
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Access Denied</h1>

          <p className="mt-4 text-gray-300">
            Only admin accounts can access user management.
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
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_34%)]" />

        <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Admin Dashboard
            </p>

            <h1 className="text-5xl font-black md:text-7xl">User Management</h1>

            <p className="mt-5 max-w-2xl text-gray-300">
              Manage user roles, seller permissions, and marketplace access.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <Link
            href="/admin"
            className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            Back to Admin
          </Link>
        </div>
      </section>

      <section className="px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Total Users</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">
              {totalUsers}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Admins</p>
            <p className="mt-2 text-3xl font-black text-red-300">
              {adminCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Sellers</p>
            <p className="mt-2 text-3xl font-black text-green-300">
              {sellerCount}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-sm text-gray-400">Pending Sellers</p>
            <p className="mt-2 text-3xl font-black text-yellow-300">
              {pendingSellerCount}
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by email, username, seller name, discord, or user ID..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="flex flex-wrap gap-3">
            {roleFilters.map((role) => (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  activeRole === role
                    ? "bg-cyan-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-cyan-400 hover:text-white"
                }`}
              >
                {role === "all" ? "All Roles" : role}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-3">
          {sellerStatusFilters.map((status) => (
            <button
              key={status}
              onClick={() => setActiveSellerStatus(status)}
              className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                activeSellerStatus === status
                  ? "bg-cyan-400 text-black"
                  : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-cyan-400 hover:text-white"
              }`}
            >
              {status === "all" ? "All Seller Status" : status}
            </button>
          ))}
        </div>

        {filteredProfiles.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center">
            <h2 className="text-3xl font-black">No users found.</h2>
            <p className="mt-3 text-gray-400">Try another filter or keyword.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredProfiles.map((profile) => {
              const role = profile.role || "user";
              const sellerStatus = profile.seller_status || "not_applied";

              return (
                <div
                  key={profile.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30"
                >
                  <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-cyan-400/30 bg-cyan-400/10">
                          {profile.avatar_url ? (
                            <img
                              src={profile.avatar_url}
                              alt={profile.username || profile.email || "User"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-xl font-black text-cyan-300">
                              {(profile.seller_name ||
                                profile.username ||
                                profile.email ||
                                "U")
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>

                        <div>
                          <h2 className="text-2xl font-black">
                            {profile.seller_name ||
                              profile.username ||
                              profile.email ||
                              "Unknown User"}
                          </h2>

                          <p className="text-sm text-gray-400">
                            {profile.email || "-"}
                          </p>
                        </div>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getRoleClass(
                            role
                          )}`}
                        >
                          {role}
                        </span>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getSellerStatusClass(
                            sellerStatus
                          )}`}
                        >
                          {sellerStatus}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">User ID</p>
                          <p className="mt-1 break-words text-sm font-bold">
                            {profile.id}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Username</p>
                          <p className="mt-1 font-bold">
                            {profile.username || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Seller Name</p>
                          <p className="mt-1 font-bold">
                            {profile.seller_name || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Discord</p>
                          <p className="mt-1 font-bold">
                            {profile.discord || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Created</p>
                          <p className="mt-1 font-bold">
                            {profile.created_at
                              ? new Date(profile.created_at).toLocaleString()
                              : "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs text-gray-500">Bio</p>
                          <p className="mt-1 line-clamp-2 text-sm text-gray-300">
                            {profile.bio || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <label className="text-sm font-bold text-gray-400">
                        Role
                      </label>

                      <select
                        value={role}
                        onChange={(event) =>
                          updateRole(profile.id, event.target.value)
                        }
                        disabled={updatingUserId === profile.id}
                        className="rounded-2xl border border-white/10 bg-black px-4 py-3 font-bold text-white outline-none focus:border-cyan-400 disabled:opacity-60"
                      >
                        {roleOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>

                      <label className="mt-2 text-sm font-bold text-gray-400">
                        Seller Status
                      </label>

                      <select
                        value={sellerStatus}
                        onChange={(event) =>
                          updateSellerStatus(profile, event.target.value)
                        }
                        disabled={updatingUserId === profile.id}
                        className="rounded-2xl border border-white/10 bg-black px-4 py-3 font-bold text-white outline-none focus:border-cyan-400 disabled:opacity-60"
                      >
                        {sellerStatusOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => quickApproveSeller(profile)}
                        disabled={updatingUserId === profile.id}
                        className="rounded-2xl bg-green-500 px-5 py-3 font-black text-white transition hover:bg-green-400 disabled:opacity-60"
                      >
                        Approve Seller
                      </button>

                      <button
                        onClick={() => quickRejectSeller(profile)}
                        disabled={updatingUserId === profile.id}
                        className="rounded-2xl bg-red-500 px-5 py-3 font-black text-white transition hover:bg-red-400 disabled:opacity-60"
                      >
                        Reject Seller
                      </button>

                      <button
                        onClick={() => resetSeller(profile)}
                        disabled={updatingUserId === profile.id}
                        className="rounded-2xl bg-yellow-400 px-5 py-3 font-black text-black transition hover:bg-yellow-300 disabled:opacity-60"
                      >
                        Reset Seller
                      </button>

                      <Link
                        href={`/seller-profile/${profile.id}`}
                        className="rounded-2xl border border-cyan-400/40 px-5 py-3 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
                      >
                        View Profile
                      </Link>

                      {updatingUserId === profile.id && (
                        <p className="text-center text-sm text-gray-400">
                          Updating user...
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
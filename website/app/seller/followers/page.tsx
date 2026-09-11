"use client";

import { useEffect, useMemo, useState } from "react";
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
  avatar_url: string | null;
  bio: string | null;
  discord: string | null;
  created_at: string;
};

type FollowerProfile = {
  id: string;
  email: string | null;
  username: string | null;
  seller_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

type FollowerRow = {
  id: number;
  follower_id: string;
  seller_id: string;
  created_at: string;
  profiles: FollowerProfile | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SellerFollowersPageV1() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followers, setFollowers] = useState<FollowerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const sellerDisplayName = useMemo(() => {
    return profile?.seller_name || profile?.username || user?.email || "Seller";
  }, [profile, user]);

  const filteredFollowers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return followers.filter((row) => {
      const follower = row.profiles;

      if (!follower) return false;

      return (
        !query ||
        follower.id.toLowerCase().includes(query) ||
        (follower.email || "").toLowerCase().includes(query) ||
        (follower.username || "").toLowerCase().includes(query) ||
        (follower.seller_name || "").toLowerCase().includes(query) ||
        (follower.bio || "").toLowerCase().includes(query)
      );
    });
  }, [followers, search]);

  async function loadFollowers(currentUser: User) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) {
      alert(profileError.message);
      return;
    }

    setProfile(profileData || null);

    if (!profileData || profileData.seller_status !== "approved") {
      return;
    }

    const { data, error } = await supabase
      .from("seller_followers")
      .select(
        `
        id,
        follower_id,
        seller_id,
        created_at,
        profiles:follower_id (
          id,
          email,
          username,
          seller_name,
          avatar_url,
          bio,
          created_at
        )
      `
      )
      .eq("seller_id", currentUser.id)
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setFollowers((data || []) as unknown as FollowerRow[]);
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
      await loadFollowers(userData.user);
      setLoading(false);
    }

    initializePage();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading seller followers...
        </p>
      </main>
    );
  }

  if (!user || profile?.seller_status !== "approved") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-lg rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-yellow-300">
            Seller Approval Required
          </h1>

          <p className="mt-4 text-gray-300">
            Only approved sellers can view followers.
          </p>

          <Link
            href="/seller"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Back to Seller Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,197,94,.16),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-green-400/30 bg-green-400/10 px-4 py-2 text-sm font-black text-green-300">
              Seller Followers
            </p>

            <h1 className="text-5xl font-black md:text-7xl">Followers</h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              See buyers who follow {sellerDisplayName} and track your seller
              community growth.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Logged in as {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/seller-profile/${user.id}`}
              className="inline-flex h-12 items-center justify-center rounded-full border border-green-400 px-6 font-bold text-green-300 transition hover:bg-green-400 hover:text-black"
            >
              Public Profile
            </Link>

            <Link
              href="/seller"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-[1fr_260px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search followers by email, username, name, or user ID..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
          />

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
            <p className="text-sm text-gray-400">Total Followers</p>
            <p className="text-2xl font-black text-green-300">
              {followers.length}
            </p>
          </div>
        </div>

        {filteredFollowers.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">No followers found.</h2>

            <p className="mt-3 text-gray-400">
              Followers will appear here after buyers follow your public seller
              profile.
            </p>

            <Link
              href={`/seller-profile/${user.id}`}
              className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
            >
              Open Public Profile
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredFollowers.map((row) => {
              const follower = row.profiles;
              if (!follower) return null;

              const followerDisplayName =
                follower.seller_name ||
                follower.username ||
                follower.email ||
                "User";

              return (
                <div
                  key={row.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/20"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-cyan-400/30 bg-cyan-400/10">
                      {follower.avatar_url ? (
                        <img
                          src={follower.avatar_url}
                          alt={followerDisplayName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-3xl font-black text-cyan-300">
                          {followerDisplayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div>
                      <h2 className="text-2xl font-black">
                        {followerDisplayName}
                      </h2>

                      <p className="mt-1 text-sm text-gray-400">
                        {follower.email || "-"}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        Followed on {formatDate(row.created_at)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 line-clamp-3 text-sm leading-6 text-gray-300">
                    {follower.bio || "No bio available."}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Link
                      href={`/seller-profile/${follower.id}`}
                      className="rounded-2xl border border-cyan-400 px-4 py-3 text-center font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
                    >
                      View Profile
                    </Link>

                    <Link
                      href="/seller/analytics"
                      className="rounded-2xl border border-green-400 px-4 py-3 text-center font-black text-green-300 transition hover:bg-green-400 hover:text-black"
                    >
                      Analytics
                    </Link>
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
"use client";

import "react-phone-number-input/style.css";

import { useEffect, useState } from "react";
import Link from "next/link";
import PhoneInput from "react-phone-number-input";
import type { E164Number } from "libphonenumber-js/core";
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

export default function SellerApplicationPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [existingApplication, setExistingApplication] =
    useState<SellerApplication | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [sellerName, setSellerName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState<E164Number | undefined>();
  const [discord, setDiscord] = useState("");
  const [identityNumber, setIdentityNumber] = useState("");
  const [identityImage, setIdentityImage] = useState("");

  useEffect(() => {
    initializePage();
  }, []);

  async function getOrCreateProfile(currentUser: User) {
    const { data: profileById, error: profileByIdError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileByIdError) {
      throw new Error(profileByIdError.message);
    }

    if (profileById) {
      return profileById as Profile;
    }

    const fallbackUsername =
      currentUser.user_metadata?.username ||
      currentUser.email?.split("@")[0] ||
      "ComePlayers User";

    const { data: upsertedProfile, error: upsertError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: currentUser.id,
          email: currentUser.email || "",
          username: fallbackUsername,
          role: "user",
          seller_status: "not_applied",
          seller_name: null,
          avatar_url: null,
          bio: "ComePlayers user.",
          discord: null,
        },
        {
          onConflict: "id",
          ignoreDuplicates: false,
        }
      )
      .select("*")
      .single();

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    return upsertedProfile as Profile;
  }

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

      const profileData = await getOrCreateProfile(userData.user);
      setProfile(profileData);

      setSellerName(
        profileData.seller_name || profileData.username || "ComePlayers Seller"
      );

      if (profileData.discord) {
        setDiscord(profileData.discord);
      }

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

      setExistingApplication(applicationData || null);
      setLoading(false);
    } catch (error) {
      console.error("Initialize seller application error:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to initialize seller application."
      );
      setLoading(false);
    }
  }

  async function submitSellerApplication(event: React.FormEvent) {
    event.preventDefault();

    if (!user) {
      alert("User not found. Please login again.");
      return;
    }

    if (!profile) {
      alert("Profile not found. Please refresh this page.");
      return;
    }

    if (!sellerName.trim()) {
      alert("Seller name is required.");
      return;
    }

    if (!fullName.trim()) {
      alert("Full legal name is required.");
      return;
    }

    if (!phone) {
      alert("Phone number is required.");
      return;
    }

    if (!identityNumber.trim()) {
      alert("Identity number is required.");
      return;
    }

    if (profile.seller_status === "approved") {
      alert("Your seller account is already approved.");
      return;
    }

    if (
      profile.seller_status === "pending" ||
      existingApplication?.status === "pending"
    ) {
      alert("Your seller application is already under review.");
      return;
    }

    setSubmitting(true);

    const { error: applicationError } = await supabase
      .from("seller_applications")
      .insert({
        user_id: user.id,
        email: user.email || profile.email || "",
        seller_name: sellerName.trim(),
        full_name: fullName.trim(),
        phone: String(phone),
        discord: discord.trim() || null,
        identity_number: identityNumber.trim(),
        identity_image: identityImage.trim() || null,
        status: "pending",
        notes: null,
      });

    if (applicationError) {
      alert(`Database Error: ${applicationError.message}`);
      setSubmitting(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        seller_status: "pending",
        seller_name: sellerName.trim(),
        discord: discord.trim() || null,
        bio: "Seller application submitted. Waiting for approval.",
      })
      .eq("id", user.id);

    if (profileError) {
      alert(`Profile Update Error: ${profileError.message}`);
      setSubmitting(false);
      return;
    }

    alert("Seller application submitted successfully.");
    window.location.reload();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading seller application...
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
            Please login first to apply as a seller.
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

  const sellerStatus = profile?.seller_status || "not_applied";

  if (sellerStatus === "approved") {
    return (
      <main className="min-h-screen bg-[#020617] px-8 py-16 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-green-400/20 bg-green-400/10 p-10 text-center">
          <h1 className="text-4xl font-black text-green-300">
            Seller Approved
          </h1>

          <p className="mt-4 text-gray-300">
            Your seller account has already been approved.
          </p>

          <Link
            href="/seller"
            className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Open Seller Dashboard
          </Link>
        </div>
      </main>
    );
  }

  if (sellerStatus === "pending" || existingApplication?.status === "pending") {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_34%)]" />

          <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
            <div>
              <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
                Seller Verification
              </p>

              <h1 className="text-5xl font-black md:text-7xl">
                Application Under Review
              </h1>

              <p className="mt-5 max-w-2xl text-gray-300">
                Your seller application is being reviewed by ComePlayers.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex h-12 shrink-0 items-center justify-center self-start rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Back to Home
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-8 py-10">
          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-8">
            <h2 className="text-3xl font-black text-yellow-300">
              Pending Review
            </h2>

            <p className="mt-4 text-gray-300">
              Your application has been submitted and is waiting for admin
              approval.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <style jsx global>{`
        .phone-input-dark {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: #000;
          padding: 0 1.25rem;
          height: 56px;
          color: white;
        }

        .phone-input-dark:focus-within {
          border-color: rgb(34 211 238);
        }

        .phone-input-dark .PhoneInputCountry {
          margin-right: 0.75rem;
        }

        .phone-input-dark .PhoneInputCountrySelect {
          color: white;
          background: #020617;
        }

        .phone-input-dark .PhoneInputCountrySelect option {
          color: white;
          background: #020617;
        }

        .phone-input-dark .PhoneInputCountryIcon {
          width: 1.5rem;
          height: 1rem;
          box-shadow: none;
        }

        .phone-input-dark .PhoneInputInput {
          height: 54px;
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          color: white;
          font-size: 1rem;
        }

        .phone-input-dark .PhoneInputInput::placeholder {
          color: rgb(107 114 128);
        }

        .phone-input-dark .PhoneInputCountrySelectArrow {
          color: white;
          opacity: 0.8;
        }
      `}</style>

      <section className="relative overflow-hidden border-b border-white/10 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
              Seller Verification
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Apply to Become a Seller
            </h1>

            <p className="mt-5 max-w-2xl text-gray-300">
              Complete your seller application so our team can verify your
              identity and unlock the Seller Dashboard.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex h-12 shrink-0 items-center justify-center self-start rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
          >
            Back to Home
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-8 py-10 lg:grid-cols-[1fr_420px]">
        <form
          onSubmit={submitSellerApplication}
          className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30"
        >
          <h2 className="text-3xl font-black">Seller Information</h2>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Seller Name
              </label>

              <input
                value={sellerName}
                onChange={(event) => setSellerName(event.target.value)}
                placeholder="Example: EvoGaming Store"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Full Legal Name
              </label>

              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your legal full name"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Phone Number
              </label>

              <PhoneInput
                international
                defaultCountry="ID"
                value={phone}
                onChange={setPhone}
                placeholder="Enter phone number"
                className="phone-input-dark"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Discord Username
              </label>

              <input
                value={discord}
                onChange={(event) => setDiscord(event.target.value)}
                placeholder="username#0000"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Identity Number
              </label>

              <input
                value={identityNumber}
                onChange={(event) => setIdentityNumber(event.target.value)}
                placeholder="ID / Passport number"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Identity Image URL
              </label>

              <input
                value={identityImage}
                onChange={(event) => setIdentityImage(event.target.value)}
                placeholder="https://example.com/identity-image.jpg"
                className="w-full rounded-2xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="mt-7 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <h3 className="font-black text-yellow-300">Important Notice</h3>

            <p className="mt-3 text-sm leading-6 text-gray-300">
              Seller approval is not instant. ComePlayers will review your
              identity and marketplace readiness before unlocking seller
              features.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-8 w-full rounded-2xl bg-cyan-400 py-4 text-lg font-black text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting Application..." : "Submit Application"}
          </button>
        </form>

        <aside className="h-fit rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30">
          <h2 className="text-3xl font-black">Verification Steps</h2>

          <div className="mt-7 space-y-5">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm font-black text-cyan-300">Step 1</p>
              <h3 className="mt-2 text-xl font-black">Submit Application</h3>
              <p className="mt-2 text-sm text-gray-400">
                Provide your seller identity and contact information.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm font-black text-cyan-300">Step 2</p>
              <h3 className="mt-2 text-xl font-black">Manual Review</h3>
              <p className="mt-2 text-sm text-gray-400">
                ComePlayers reviews your seller application.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm font-black text-cyan-300">Step 3</p>
              <h3 className="mt-2 text-xl font-black">Seller Approval</h3>
              <p className="mt-2 text-sm text-gray-400">
                Once approved, your Seller Dashboard will be unlocked.
              </p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
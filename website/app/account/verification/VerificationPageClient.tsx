"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountShell from "@/components/account/AccountShell";
import { supabase } from "@/lib/supabase";
import PhoneVerificationForm from "@/components/account/PhoneVerificationForm";

type VerificationState = {
  phone_verified: boolean;
  email_verified: boolean;
  identity_verified: boolean;
  phone_number: string;
};

function maskPhone(phone: string) {
  if (!phone) return "Not set";
  return `${phone.slice(0, 4)}*****${phone.slice(-2)}`;
}

export default function VerificationPageClient() {
  const router = useRouter();
  const [verification, setVerification] = useState<VerificationState>({
    phone_verified: false,
    email_verified: false,
    identity_verified: false,
    phone_number: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVerification = async () => {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        router.push("/");
        return;
      }

      const { data: accountData } = await supabase
        .from("user_account_settings")
        .select("phone_number")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      const { data: verificationData } = await supabase
        .from("user_verifications")
        .select("phone_verified,email_verified,identity_verified,phone_number")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      setVerification({
        phone_verified: Boolean(authData.user.phone_confirmed_at && authData.user.phone && (!accountData?.phone_number || accountData.phone_number === `+${authData.user.phone.replace(/^\+/, "")}`)),
        email_verified: Boolean(
          authData.user.email_confirmed_at || verificationData?.email_verified
        ),
        identity_verified: Boolean(verificationData?.identity_verified),
        phone_number:
          accountData?.phone_number || (authData.user.phone ? `+${authData.user.phone.replace(/^\+/, "")}` : ""),
      });

      setLoading(false);
    };

    void loadVerification();
  }, [router]);

  const completed = [
    verification.email_verified,
    verification.phone_verified,
    verification.identity_verified,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <AccountShell>
        <div className="flex min-h-[420px] items-center justify-center p-8 text-sm font-bold text-amber-200">
          Loading verification status...
        </div>
      </AccountShell>
    );
  }

  return (
    <AccountShell>
      <section className="border-b border-amber-400/15 px-6 py-7 md:px-8 md:py-9">
        <p className="inline-flex rounded-full border border-amber-400/35 bg-amber-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
          Verification
        </p>
        <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
          Account verification
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Review your account verification status. Phone verification is optional
          while WhatsApp verification is being prepared.
        </p>

        <div className="mt-7 rounded-2xl border border-amber-400/20 bg-black/25 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500">Verification progress</p>
              <p className="mt-1 text-2xl font-black text-amber-300">
                {completed} of 3 complete
              </p>
            </div>
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300">
              {Math.round((completed / 3) * 100)}%
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-amber-500 transition-all"
              style={{ width: `${(completed / 3) * 100}%` }}
            />
          </div>
        </div>
      </section>

      <section className="px-6 py-7 md:px-8 md:py-8">
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-400">
            Trust status
          </p>
          <h2 className="mt-2 text-xl font-black md:text-2xl">
            Verification checks
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review the current status of each verification requirement.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <VerificationCard
            title="Email"
            value={
              verification.email_verified
                ? "Email address confirmed"
                : "Email address is not verified"
            }
            verified={verification.email_verified}
            step="1"
          />
          <VerificationCard
            title="Mobile number"
            value={maskPhone(verification.phone_number)}
            verified={verification.phone_verified}
            step="2"
          />
          <VerificationCard
            title="Identity"
            value={
              verification.identity_verified
                ? "Identity verification complete"
                : "Identity verification not submitted"
            }
            verified={verification.identity_verified}
            step="3"
          />
        </div>
        <PhoneVerificationForm onSaved={(phone, verified) => setVerification(v => ({ ...v, phone_verified: verified, phone_number: phone }))} />
      </section>
    </AccountShell>
  );
}

function VerificationCard({
  title,
  value,
  verified,
  step,
}: {
  title: string;
  value: string;
  verified: boolean;
  step: string;
}) {
  return (
    <article
      className={`min-h-[190px] rounded-2xl border p-5 ${
        verified
          ? "border-emerald-400/25 bg-emerald-400/[0.055]"
          : "border-amber-400/20 bg-black/25"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-sm font-black text-amber-300">
          {step}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            verified
              ? "bg-emerald-400/10 text-emerald-300"
              : "bg-amber-400/10 text-amber-300"
          }`}
        >
          {verified ? "Verified" : "Not verified"}
        </span>
      </div>
      <h3 className="mt-5 text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{value}</p>
    </article>
  );
}

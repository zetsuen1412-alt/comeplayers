"use client";

import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountCommerce from "@/components/account/AccountCommerce";
import GoogleDriveBackupSettings from "@/components/account/GoogleDriveBackupSettings";
import AccountShell from "@/components/account/AccountShell";
import { supabase } from "@/lib/supabase";
import { accountRequest } from "@/lib/accountClient";

type AccountSettings = {
  first_name: string;
  last_name: string;
  national_identity_number: string;
  gender: "male" | "female" | "rather_not_say" | "";
  date_of_birth: string;
  instant_messenger_type: string;
  instant_messenger_value: string;
  phone_number: string;
};

type BillingProfile = {
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  tax_country_code: string;
  tax_identification_number: string;
};

const emptyAccount: AccountSettings = {
  first_name: "",
  last_name: "",
  national_identity_number: "",
  gender: "",
  date_of_birth: "",
  instant_messenger_type: "",
  instant_messenger_value: "",
  phone_number: "",
};

const emptyBilling: BillingProfile = {
  address_line_1: "",
  address_line_2: "",
  city: "",
  state: "",
  postal_code: "",
  country_code: "ID",
  tax_country_code: "ID",
  tax_identification_number: "",
};

function getUsernameFromEmail(email?: string | null) {
  const localPart = (email || "").split("@")[0]?.trim();

  if (!localPart) return "player";

  return (
    localPart
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "player"
  );
}

function sanitizeUsername(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function AccountPageClient() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [usernameChanges, setUsernameChanges] = useState(0);
  const [account, setAccount] = useState<AccountSettings>(emptyAccount);
  const [billing, setBilling] = useState<BillingProfile>(emptyBilling);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadAccount = async () => {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        router.push("/");
        return;
      }

      const currentUserId = authData.user.id;
      const currentEmail = authData.user.email || "";

      setUserId(currentUserId);
      setAuthEmail(currentEmail);

      const [
        { data: profileData },
        { data: accountData },
        { data: billingData },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("username,username_changes")
          .eq("id", currentUserId)
          .maybeSingle(),
        supabase
          .from("user_account_settings")
          .select("*")
          .eq("user_id", currentUserId)
          .maybeSingle(),
        supabase
          .from("user_billing_profiles")
          .select("*")
          .eq("user_id", currentUserId)
          .maybeSingle(),
      ]);

      setUsername(profileData?.username || getUsernameFromEmail(currentEmail));
      setOriginalUsername(profileData?.username || "");
      setUsernameChanges(Number(profileData?.username_changes || 0));

      if (accountData) {
        setAccount({
          first_name: accountData.first_name || "",
          last_name: accountData.last_name || "",
          national_identity_number:
            accountData.national_identity_number || "",
          gender: accountData.gender || "",
          date_of_birth: accountData.date_of_birth || "",
          instant_messenger_type: accountData.instant_messenger_type || "",
          instant_messenger_value: accountData.instant_messenger_value || "",
          phone_number: accountData.phone_number || "",
        });
      }

      if (billingData) {
        setBilling({
          address_line_1: billingData.address_line_1 || "",
          address_line_2: billingData.address_line_2 || "",
          city: billingData.city || "",
          state: billingData.state || "",
          postal_code: billingData.postal_code || "",
          country_code: billingData.country_code || "ID",
          tax_country_code: billingData.tax_country_code || "ID",
          tax_identification_number:
            billingData.tax_identification_number || "",
        });
      }

      setLoading(false);
    };

    void loadAccount();
  }, [router]);

  const updateAccount = (field: keyof AccountSettings, value: string) => {
    setAccount((current) => ({ ...current, [field]: value }));
  };

  const updateBilling = (field: keyof BillingProfile, value: string) => {
    setBilling((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userId) return;

    const cleanUsername = username === originalUsername ? username : sanitizeUsername(username);

    if (cleanUsername.length < 3) {
      alert("The username must contain at least 3 characters.");
      return;
    }

    setSaving(true);

    const { data: existingUsername } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanUsername)
      .neq("id", userId)
      .maybeSingle();

    if (existingUsername) {
      setSaving(false);
      alert("This username is already in use.");
      return;
    }

    let profileError: Error | null = null;
    if (cleanUsername !== originalUsername) {
      if (!window.confirm(`Change your username to @${cleanUsername}? This uses your one free change.`)) { setSaving(false); return; }
      try { await accountRequest("/api/account/preferences", { action: "username", username: cleanUsername }, "PATCH"); setOriginalUsername(cleanUsername); if (originalUsername) setUsernameChanges(1); }
      catch (e) { profileError = e instanceof Error ? e : new Error("Username change failed."); }
    }
    const profileResult = { error: profileError };
    if (profileError) { setSaving(false); alert(profileError.message); return; }

    const accountPayload = {
      user_id: userId,
      ...account,
      // Phone editing has its own country-aware form and never grants verification.
      phone_number: undefined,
      gender: account.gender || null,
      date_of_birth: account.date_of_birth || null,
      updated_at: new Date().toISOString(),
    };

    const billingPayload = {
      user_id: userId,
      ...billing,
      updated_at: new Date().toISOString(),
    };

    const [accountResult, billingResult] = await Promise.all([
      supabase
        .from("user_account_settings")
        .upsert(accountPayload, { onConflict: "user_id" }),
      supabase
        .from("user_billing_profiles")
        .upsert(billingPayload, { onConflict: "user_id" }),
    ]);

    setSaving(false);

    if (profileResult.error || accountResult.error || billingResult.error) {
      alert(
        profileResult.error?.message ||
          accountResult.error?.message ||
          billingResult.error?.message ||
          "Failed to save account."
      );
      return;
    }

    setUsername(cleanUsername);
    alert("Account saved successfully.");
  };

  if (loading) {
    return (
      <AccountShell>

        <div className="flex min-h-[420px] items-center justify-center p-8 text-sm font-bold text-amber-200">
          Loading account settings...
        </div>
      </AccountShell>
    );
  }

  return (
    <AccountShell>
      <AccountCommerce key={userId} />
      <GoogleDriveBackupSettings userId={userId} email={authEmail} />
      <form onSubmit={handleSave}>
        <section className="border-b border-amber-400/15 px-6 py-7 md:px-8 md:py-9">
          <p className="inline-flex rounded-full border border-amber-400/35 bg-amber-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
            Account Settings
          </p>

          <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
            Account Information
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Manage your ComePlayers profile, contact details, billing address,
            and tax information from one secure page.
          </p>
        </section>

        <FormSection
          eyebrow="Profile"
          title="Personal information"
          description="Keep your marketplace identity and contact details accurate."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Username"
              value={username}
              onChange={(value) => setUsername(sanitizeUsername(value))}
              disabled={usernameChanges >= 1}
              helper={usernameChanges >= 1 ? "Your one free username change has been used." : "You may change your username once for free."}
            />

            <Field
              label="Email"
              value={authEmail}
              onChange={() => undefined}
              disabled
            />

            <Field
              label="First name"
              value={account.first_name}
              onChange={(value) => updateAccount("first_name", value)}
            />

            <Field
              label="Last name"
              value={account.last_name}
              onChange={(value) => updateAccount("last_name", value)}
            />

            <Field
              label="National identity number"
              value={account.national_identity_number}
              onChange={(value) =>
                updateAccount("national_identity_number", value)
              }
            />

            <div><p className="mb-3 text-sm font-bold text-slate-300">Mobile number (optional)</p><p className="text-sm text-slate-400">{account.phone_number || "Not set"}</p><a href="/account/verification" className="mt-2 inline-block text-sm text-amber-300">Manage phone number and verification status</a></div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-bold text-slate-300">Gender</p>
              <div className="flex min-h-12 flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-2">
                {[
                  ["male", "Male"],
                  ["female", "Female"],
                  ["rather_not_say", "Rather not say"],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 text-sm text-slate-300"
                  >
                    <input
                      type="radio"
                      name="gender"
                      checked={account.gender === value}
                      onChange={() => updateAccount("gender", value)}
                      className="accent-yellow-400"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <Field
              type="date"
              label="Date of birth"
              value={account.date_of_birth}
              onChange={(value) => updateAccount("date_of_birth", value)}
            />
          </div>
        </FormSection>

        <FormSection
          eyebrow="Contact"
          title="Instant messenger"
          description="Choose the account buyers or sellers can use for order communication."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-300">
                Messenger service
              </span>
              <select
                value={account.instant_messenger_type}
                onChange={(event) =>
                  updateAccount("instant_messenger_type", event.target.value)
                }
                className="min-h-12 w-full rounded-xl border border-white/10 bg-[#080a0e] px-4 py-3 text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10"
              >
                <option value="">Please select</option>
                <option value="discord">Discord</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="line">LINE</option>
              </select>
            </label>

            <Field
              label="Messenger ID / number"
              value={account.instant_messenger_value}
              onChange={(value) =>
                updateAccount("instant_messenger_value", value)
              }
            />
          </div>
        </FormSection>

        <FormSection
          eyebrow="Billing"
          title="Billing address"
          description="This information is used for invoices and marketplace records."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Address"
              value={billing.address_line_1}
              onChange={(value) => updateBilling("address_line_1", value)}
            />
            <Field
              label="Address line 2"
              value={billing.address_line_2}
              onChange={(value) => updateBilling("address_line_2", value)}
            />
            <Field
              label="City"
              value={billing.city}
              onChange={(value) => updateBilling("city", value)}
            />
            <Field
              label="State / province"
              value={billing.state}
              onChange={(value) => updateBilling("state", value)}
            />
            <Field
              label="Postal code"
              value={billing.postal_code}
              onChange={(value) => updateBilling("postal_code", value)}
            />
            <Field
              label="Country / region"
              value={billing.country_code}
              onChange={(value) => updateBilling("country_code", value.toUpperCase())}
            />
          </div>
        </FormSection>

        <FormSection
          eyebrow="Tax"
          title="Tax information"
          description="Optional tax details stored with your billing profile."
          last
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Tax country"
              value={billing.tax_country_code}
              onChange={(value) =>
                updateBilling("tax_country_code", value.toUpperCase())
              }
            />
            <Field
              label="Tax identification number"
              value={billing.tax_identification_number}
              onChange={(value) =>
                updateBilling("tax_identification_number", value)
              }
            />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-amber-400/15 pt-6">
            <button
              type="button"
              onClick={() => router.refresh()}
              className="min-h-12 rounded-xl border border-white/15 px-6 font-black text-slate-300 transition hover:border-amber-400/40 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-12 rounded-xl border border-yellow-300/70 bg-gradient-to-r from-yellow-300 to-amber-400 px-8 font-black text-black shadow-[0_8px_28px_rgba(245,158,11,0.16)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving changes..." : "Save changes"}
            </button>
          </div>
        </FormSection>
      </form>
    </AccountShell>
  );
}

function FormSection({
  eyebrow,
  title,
  description,
  children,
  last = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <section
      className={`px-6 py-7 md:px-8 md:py-8 ${
        last ? "" : "border-b border-amber-400/15"
      }`}
    >
      <div className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-400">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-black md:text-2xl">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-xl border border-white/10 bg-[#080a0e] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10 disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-slate-500"
      />
      {helper ? (
        <span className="mt-1.5 block text-xs text-slate-600">{helper}</span>
      ) : null}
    </label>
  );
}

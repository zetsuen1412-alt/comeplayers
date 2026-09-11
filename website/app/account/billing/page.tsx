"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import AccountShell from "@/components/account/AccountShell";
import { supabase } from "@/lib/supabase";

type BillingForm = {
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  taxCountryCode: string;
  taxIdentificationNumber: string;
};

const emptyForm: BillingForm = {
  legalName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  countryCode: "ID",
  taxCountryCode: "ID",
  taxIdentificationNumber: "",
};

export default function BillingProfilePage() {
  const [form, setForm] = useState<BillingForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const accessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Please login again.");
    return data.session.access_token;
  }, []);

  const load = useCallback(async () => {
    try {
      const token = await accessToken();
      const response = await fetch("/api/account/billing", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to load billing profile.");
      const row = json.billing || {};
      setForm({
        legalName: row.legal_name || "",
        addressLine1: row.address_line_1 || "",
        addressLine2: row.address_line_2 || "",
        city: row.city || "",
        state: row.state || "",
        postalCode: row.postal_code || "",
        countryCode: row.country_code || "ID",
        taxCountryCode: row.tax_country_code || "ID",
        taxIdentificationNumber: row.tax_identification_number || "",
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load billing profile.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function update(field: keyof BillingForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const token = await accessToken();
      const response = await fetch("/api/account/billing", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to save billing profile.");
      setMessage("Billing profile saved.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save billing profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccountShell>
      <section className="border-b border-amber-400/15 px-6 py-7 md:px-8 md:py-9">
        <p className="inline-flex rounded-full border border-amber-400/35 bg-amber-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
          Billing & Invoice
        </p>
        <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
          Billing profile
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Keep your legal name, billing address, and invoice information ready
          for ComePlayers marketplace transactions.
        </p>
      </section>

      <form onSubmit={save} className="px-6 py-7 md:px-8 md:py-8">
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-400">
            Invoice details
          </p>
          <h2 className="mt-2 text-xl font-black md:text-2xl">
            Billing information
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Your address is saved with purchase invoices. Seller fees and tax
            treatment continue to follow the existing marketplace rules.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="Legal / billing name"
            value={form.legalName}
            onChange={(value) => update("legalName", value)}
            required
            className="md:col-span-2"
          />
          <Field
            label="Address line 1"
            value={form.addressLine1}
            onChange={(value) => update("addressLine1", value)}
            required
            className="md:col-span-2"
          />
          <Field
            label="Address line 2"
            value={form.addressLine2}
            onChange={(value) => update("addressLine2", value)}
            className="md:col-span-2"
          />
          <Field
            label="City"
            value={form.city}
            onChange={(value) => update("city", value)}
            required
          />
          <Field
            label="State / province"
            value={form.state}
            onChange={(value) => update("state", value)}
          />
          <Field
            label="Postal code"
            value={form.postalCode}
            onChange={(value) => update("postalCode", value)}
            required
          />
          <Field
            label="Billing country (ISO-2)"
            value={form.countryCode}
            onChange={(value) => update("countryCode", value.toUpperCase())}
            required
            maxLength={2}
          />
          <Field
            label="Tax identification number (optional)"
            value={form.taxIdentificationNumber}
            onChange={(value) => update("taxIdentificationNumber", value)}
            className="md:col-span-2"
          />
        </div>

        {(error || message) && (
          <div
            className={`mt-6 rounded-xl border p-4 text-sm ${
              error
                ? "border-red-400/30 bg-red-400/10 text-red-200"
                : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
            }`}
          >
            {error || message}
          </div>
        )}

        <div className="mt-8 flex justify-end border-t border-amber-400/15 pt-6">
          <button
            disabled={saving || loading}
            className="min-h-12 rounded-xl border border-yellow-300/70 bg-gradient-to-r from-yellow-300 to-amber-400 px-7 font-black text-black shadow-[0_8px_28px_rgba(245,158,11,0.16)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving billing profile..."
              : loading
                ? "Loading billing profile..."
                : "Save billing profile"}
          </button>
        </div>
      </form>
    </AccountShell>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  maxLength,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-bold text-slate-300">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        maxLength={maxLength}
        className="min-h-12 w-full rounded-xl border border-white/10 bg-[#080a0e] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10"
      />
    </label>
  );
}

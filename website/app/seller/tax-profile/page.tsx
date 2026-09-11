"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Residency = {
  country_code?: string | null;
  legal_name?: string | null;
  tax_identifier_last4?: string | null;
  residency_since?: string | null;
  evidence_reference?: string | null;
  status?: string | null;
  rejection_reason?: string | null;
  submitted_at?: string | null;
  verified_at?: string | null;
};

export default function SellerTaxProfilePage() {
  const [residency, setResidency] = useState<Residency | null>(null);
  const [countryCode, setCountryCode] = useState("ID");
  const [legalName, setLegalName] = useState("");
  const [taxIdentifier, setTaxIdentifier] = useState("");
  const [residencySince, setResidencySince] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const payload = await authenticatedFetchJson<{ taxResidency: Residency | null }>("/api/seller/tax-profile", { cache: "no-store" });
      const row = payload.taxResidency;
      setResidency(row);
      if (row) {
        setCountryCode(String(row.country_code || "ID"));
        setLegalName(String(row.legal_name || ""));
        setResidencySince(String(row.residency_since || "").slice(0, 10));
        setEvidenceReference(String(row.evidence_reference || ""));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load tax profile.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = await authenticatedFetchJson<{ taxResidency: Residency }>("/api/seller/tax-profile", {
        method: "PUT",
        body: JSON.stringify({ countryCode, legalName, taxIdentifier, residencySince, evidenceReference }),
      });
      setResidency(payload.taxResidency);
      setTaxIdentifier("");
      setMessage("Tax residency submitted for admin verification.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Submission failed.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/seller" className="font-black text-cyan-300">← Seller dashboard</Link>
        <p className="mt-6 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">V23 Verified Tax Residency</p>
        <h1 className="mt-4 text-4xl font-black md:text-6xl">Seller tax profile</h1>
        <p className="mt-4 text-slate-400">Tax identifiers are encrypted. Only the final four characters are shown after submission.</p>

        {(error || message) && <div className={`mt-6 rounded-2xl border p-4 ${error ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>{error || message}</div>}
        {residency && <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6"><p className="text-sm text-slate-400">Current status</p><p className="mt-2 text-2xl font-black capitalize text-cyan-300">{residency.status || "pending"}</p><p className="mt-2 text-sm text-slate-400">Tax ID ending {residency.tax_identifier_last4 || "—"}</p>{residency.rejection_reason && <p className="mt-3 text-red-300">{residency.rejection_reason}</p>}</div>}

        <form onSubmit={submit} className="mt-8 space-y-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <Field label="Tax country code"><input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))} required className="input" placeholder="ID" /></Field>
          <Field label="Legal name"><input value={legalName} onChange={(e) => setLegalName(e.target.value)} required className="input" /></Field>
          <Field label={residency ? "Tax identifier (leave blank to keep existing)" : "Tax identifier"}><input value={taxIdentifier} onChange={(e) => setTaxIdentifier(e.target.value)} required={!residency} className="input" autoComplete="off" /></Field>
          <Field label="Resident since"><input type="date" value={residencySince} onChange={(e) => setResidencySince(e.target.value)} className="input" /></Field>
          <Field label="Evidence/reference"><textarea value={evidenceReference} onChange={(e) => setEvidenceReference(e.target.value)} required className="input min-h-28" placeholder="Document reference, secure storage location, or verification note" /></Field>
          <button disabled={busy} className="w-full rounded-xl bg-cyan-400 px-5 py-4 font-black text-black disabled:opacity-50">{busy ? "Submitting..." : "Submit for verification"}</button>
        </form>
      </div>
      <style jsx>{`.input{width:100%;border-radius:.75rem;border:1px solid rgba(255,255,255,.12);background:#070b18;padding:.9rem 1rem;color:white;outline:none}.input:focus{border-color:#22d3ee}`}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-300">{label}</span>{children}</label>;
}

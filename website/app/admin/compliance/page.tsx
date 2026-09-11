"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Dashboard = {
  metrics: Record<string, number>;
  asOf: string;
  sellerTaxSettings: Record<string, unknown> | null;
  marketplaceFeeSettings: Array<Record<string, unknown>>;
  sellerTaxRates: Array<Record<string, unknown>>;
  rateChangeRequests: Array<Record<string, unknown>>;
  taxResidencies: Array<Record<string, unknown>>;
  fxRates: Array<Record<string, unknown>>;
  accountingPeriods: Array<Record<string, unknown>>;
  taxStatements: Array<Record<string, unknown>>;
  withdrawalTaxRates: Array<Record<string, unknown>>;
  policyReviews: Array<Record<string, unknown>>;
  privacyRequests: Array<Record<string, unknown>>;
  settlements: Array<Record<string, unknown>>;
  riskFeedback: Array<Record<string, unknown>>;
};

function n(value: unknown) { return Number(value || 0); }
function money(value: unknown) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n(value)); }
function currencyMoney(value: unknown, currency: unknown) {
  const code = String(currency || "IDR").toUpperCase();
  try {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: code, maximumFractionDigits: code === "IDR" ? 0 : 2 }).format(n(value));
  } catch {
    return `${code} ${n(value).toLocaleString("id-ID")}`;
  }
}
function date(value: unknown) { return value ? new Date(String(value)).toLocaleString("id-ID") : "-"; }

export default function AdminCompliancePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const payload = await authenticatedFetchJson<Dashboard>("/api/admin/compliance", { cache: "no-store" });
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load compliance dashboard.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function review(reviewId: number, decision: "approved" | "rejected") {
    const note = window.prompt(decision === "approved" ? "Approval evidence / note:" : "Rejection reason:")?.trim();
    if (!note) return;
    setBusy(`review:${reviewId}`); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", {
        method: "PATCH",
        body: JSON.stringify({ reviewId, decision, note }),
      });
      setMessage(`Policy review ${decision}.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Review failed.");
    } finally { setBusy(""); }
  }

  async function retryPrivacyDeletion(requestId: string) {
    if (!window.confirm("Retry this failed account deletion now?")) return;
    setBusy(`privacy:${requestId}`); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", {
        method: "POST",
        body: JSON.stringify({ action: "retry_privacy_deletion", requestId }),
      });
      setMessage("Privacy deletion queued for retry.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Privacy retry failed.");
    } finally { setBusy(""); }
  }

  async function generateSettlement() {
    setBusy("settlement"); setError(""); setMessage("");
    try {
      const periodEnd = new Date().toISOString();
      const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await authenticatedFetchJson("/api/admin/compliance", {
        method: "POST",
        body: JSON.stringify({ action: "generate_settlement", periodStart, periodEnd }),
      });
      setMessage("Provider settlement report generated.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Settlement report failed.");
    } finally { setBusy(""); }
  }

  async function proposeRateChange(rateType: "marketplace_fee" | "seller_sales_tax") {
    const ratePercent = window.prompt(rateType === "marketplace_fee" ? "New marketplace fee percentage:" : "New seller sales-tax percentage:", "5")?.trim();
    if (ratePercent === undefined || ratePercent === null || ratePercent === "") return;
    const sourceReference = window.prompt("Policy/legal source reference:")?.trim();
    const reason = window.prompt("Reason for the rate change:")?.trim();
    if (!sourceReference || !reason) return;
    setBusy(`rate:${rateType}`); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "propose_rate_change", rateType, ratePercent: Number(ratePercent), fixedAmount: 0, effectiveFrom: new Date().toISOString(), sourceReference, reason }) });
      setMessage("Rate change proposed. Two distinct admin approvals are required.");
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Rate proposal failed."); }
    finally { setBusy(""); }
  }

  async function reviewRateChange(requestId: string, decision: "approve" | "reject") {
    const note = window.prompt(decision === "approve" ? "Approval note:" : "Rejection reason:")?.trim();
    if (decision === "reject" && !note) return;
    setBusy(`rate-review:${requestId}`); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "review_rate_change", requestId, decision, note }) });
      setMessage(`Rate request ${decision === "approve" ? "approved" : "rejected"}.`);
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Rate review failed."); }
    finally { setBusy(""); }
  }

  async function addFxRate() {
    const baseCurrency = window.prompt("Wallet/base currency:", "IDR")?.trim().toUpperCase();
    const quoteCurrency = window.prompt("Payout/quote currency:", "USD")?.trim().toUpperCase();
    const rate = window.prompt(`1 ${baseCurrency || "IDR"} equals how many ${quoteCurrency || "USD"}?`)?.trim();
    const sourceReference = window.prompt("FX provider/source reference:")?.trim();
    if (!baseCurrency || !quoteCurrency || !rate || !sourceReference) return;
    setBusy("fx"); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "save_fx_rate", baseCurrency, quoteCurrency, rate: Number(rate), provider: "manual", sourceReference, validFrom: new Date().toISOString() }) });
      setMessage("FX rate saved."); await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "FX rate failed."); }
    finally { setBusy(""); }
  }

  async function createAccountingPeriod() {
    const periodKey = window.prompt("Accounting month (YYYY-MM):", new Date().toISOString().slice(0, 7))?.trim();
    if (!periodKey) return;
    setBusy("period-create"); setError(""); setMessage("");
    try { await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "create_accounting_period", periodKey }) }); setMessage("Accounting period created."); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Accounting period failed."); }
    finally { setBusy(""); }
  }

  async function closeAccountingPeriod(periodId: string) {
    if (!window.confirm("Close this accounting period and freeze all seller tax statements?")) return;
    setBusy(`period:${periodId}`); setError(""); setMessage("");
    try { await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "close_accounting_period", periodId }) }); setMessage("Accounting period closed."); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Accounting close failed."); }
    finally { setBusy(""); }
  }

  async function reviewResidency(sellerId: string, decision: "verified" | "rejected") {
    const note = window.prompt(decision === "verified" ? "Verification note (optional):" : "Rejection reason:")?.trim() || "";
    if (decision === "rejected" && !note) return;
    setBusy(`residency:${sellerId}`); setError(""); setMessage("");
    try { await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "review_tax_residency", sellerId, decision, note }) }); setMessage(`Tax residency ${decision}.`); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Residency review failed."); }
    finally { setBusy(""); }
  }

  async function createWithdrawalTaxRate() {
    const countryCode = window.prompt("Seller payout country code (for example ID):")?.trim().toUpperCase();
    if (!countryCode) return;
    const payoutMethod = window.prompt("Payout method: bank_transfer, paypal, or wise", "bank_transfer")?.trim().toLowerCase();
    if (!payoutMethod) return;
    const ratePercent = window.prompt("Withdrawal tax percentage:", "0")?.trim();
    if (ratePercent === undefined || ratePercent === null || ratePercent === "") return;
    const fixedAmount = window.prompt("Fixed withholding amount in payout currency:", "0")?.trim();
    if (fixedAmount === undefined || fixedAmount === null || fixedAmount === "") return;
    const currency = window.prompt("Currency code:", countryCode === "ID" ? "IDR" : "USD")?.trim().toUpperCase();
    if (!currency) return;
    const sourceReference = window.prompt("Legal/source reference and review date (required for active rules):")?.trim();
    const activate = window.confirm("Request activation through dual approval? Cancel creates it as draft.");
    const reason = activate ? window.prompt("Reason for this withdrawal-tax change:")?.trim() : "Draft withdrawal tax rule";
    if (activate && !reason) return;
    setBusy("withdrawal-tax"); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", {
        method: "POST",
        body: JSON.stringify({
          action: "save_withdrawal_tax_rate",
          countryCode,
          payoutMethod,
          ratePercent: Number(ratePercent),
          fixedAmount: Number(fixedAmount),
          currency,
          status: activate ? "active" : "draft",
          sourceReference,
          reason,
          validFrom: new Date().toISOString(),
        }),
      });
      setMessage(activate ? "Withdrawal tax change proposed for dual approval." : "Withdrawal tax draft saved.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Withdrawal tax rule failed.");
    } finally { setBusy(""); }
  }

  if (!data) {
    return <main className="min-h-screen bg-slate-950 p-10 text-center text-white">{error || "Loading commerce compliance..."}</main>;
  }

  const pendingReviews = data.policyReviews.filter((row) => row.status === "pending");
  const pendingPrivacy = data.privacyRequests.filter((row) => ["pending", "processing"].includes(String(row.status)));
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-cyan-400/20 px-4 py-12">
        <div className="mx-auto max-w-7xl">
          <Link href="/admin" className="font-black text-cyan-300">← Admin dashboard</Link>
          <p className="mt-6 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">V23 Finance Governance</p>
          <h1 className="mt-4 text-5xl font-black md:text-7xl">Post-launch control center</h1>
          <p className="mt-4 max-w-3xl text-slate-400">Immutable order-rate snapshots, dual-approved fee changes, verified seller tax residency, FX evidence, accounting close, provider payout execution, and post-launch compliance.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        {(error || message) && <div className={`mb-6 rounded-2xl border p-4 ${error ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>{error || message}</div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="30d created orders" value={String(n(data.metrics.createdOrders))} />
          <Metric label="Checkout → paid" value={`${n(data.metrics.checkoutToPaidPercent).toFixed(1)}%`} />
          <Metric label="Gross volume" value={money(data.metrics.grossVolume)} />
          <Metric label="Seller sales tax withheld" value={money(data.metrics.sellerSalesTaxWithheld)} />
          <Metric label="Withdrawal tax withheld" value={money(data.metrics.withdrawalTaxWithheld)} />
          <Metric label="Marketplace fees" value={money(data.metrics.marketplaceFees)} />
          <Metric label="Delivery p95" value={`${n(data.metrics.deliveryP95Minutes).toFixed(0)} min`} />
          <Metric label="Pending policy reviews" value={String(pendingReviews.length)} attention />
          <Metric label="Pending privacy ops" value={String(pendingPrivacy.length)} attention />
        </div>

        <div className="mt-10 grid gap-8 xl:grid-cols-2">
          <Panel title="Governed marketplace fee" action={<button disabled={Boolean(busy)} onClick={() => proposeRateChange("marketplace_fee")} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Propose change</button>}>
            {(data.marketplaceFeeSettings || []).slice(0, 5).map((row) => <Card key={String(row.id)} title={`${n(row.rate_percent).toFixed(2)}% · ${row.status}`} meta={`Effective ${date(row.valid_from)} · ${String(row.source_reference || "No source")}`} />)}
            {(data.marketplaceFeeSettings || []).length === 0 && <Empty text="No marketplace fee history." />}
          </Panel>

          <Panel title="Governed seller sales tax" action={<button disabled={Boolean(busy)} onClick={() => proposeRateChange("seller_sales_tax")} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Propose change</button>}>
            {(data.sellerTaxRates || []).slice(0, 5).map((row) => <Card key={String(row.id)} title={`${n(row.rate_percent).toFixed(2)}% · ${row.status}`} meta={`Effective ${date(row.valid_from)} · ${String(row.source_reference || "No source")}`} />)}
            {(data.sellerTaxRates || []).length === 0 && <Empty text="No seller tax rate history." />}
          </Panel>

          <Panel title="Dual-approval rate requests">
            {(data.rateChangeRequests || []).length === 0 ? <Empty text="No rate change requests." /> : data.rateChangeRequests.slice(0, 20).map((row) => <div key={String(row.id)} className="rounded-2xl border border-white/10 bg-black/30 p-4"><h3 className="font-black">{String(row.rate_type).replace(/_/g, " ")} · {n(row.proposed_rate_percent)}% · {String(row.status)}</h3><p className="mt-2 text-sm text-slate-400">Effective {date(row.effective_from)} · requested by {String(row.requested_by)}</p>{["pending","partially_approved"].includes(String(row.status)) && <div className="mt-3 flex gap-2"><button disabled={Boolean(busy)} onClick={() => reviewRateChange(String(row.id), "approve")} className="rounded-lg bg-emerald-300 px-3 py-2 font-black text-black">Approve</button><button disabled={Boolean(busy)} onClick={() => reviewRateChange(String(row.id), "reject")} className="rounded-lg bg-red-300 px-3 py-2 font-black text-black">Reject</button></div>}</div>)}
          </Panel>

          <Panel title="FX rates" action={<button disabled={Boolean(busy)} onClick={addFxRate} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Add FX rate</button>}>
            {(data.fxRates || []).length === 0 ? <Empty text="No FX rates configured." /> : data.fxRates.slice(0, 15).map((row) => <Card key={String(row.id)} title={`${row.base_currency} → ${row.quote_currency} · ${row.rate}`} meta={`${row.status} · ${row.provider} · from ${date(row.valid_from)}`} />)}
          </Panel>

          <Panel title="Accounting periods" action={<button disabled={Boolean(busy)} onClick={createAccountingPeriod} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Open month</button>}>
            {(data.accountingPeriods || []).length === 0 ? <Empty text="No accounting periods." /> : data.accountingPeriods.slice(0, 12).map((row) => <div key={String(row.id)} className="rounded-2xl border border-white/10 bg-black/30 p-4"><h3 className="font-black">{String(row.period_key)} · {String(row.status)}</h3><p className="mt-2 text-sm text-slate-400">{date(row.period_start)} → {date(row.period_end)}</p>{row.status === "open" && <button disabled={Boolean(busy)} onClick={() => closeAccountingPeriod(String(row.id))} className="mt-3 rounded-lg bg-yellow-300 px-3 py-2 font-black text-black">Close period</button>}</div>)}
          </Panel>

          <Panel title="Seller tax residency review">
            {(data.taxResidencies || []).length === 0 ? <Empty text="No seller tax residency submissions." /> : data.taxResidencies.slice(0, 20).map((row) => <div key={String(row.seller_id)} className="rounded-2xl border border-white/10 bg-black/30 p-4"><h3 className="font-black">{String(row.legal_name)} · {String(row.country_code)} · {String(row.status)}</h3><p className="mt-2 text-sm text-slate-400">Tax ID ending {String(row.tax_identifier_last4 || "—")} · submitted {date(row.submitted_at)}</p>{row.status === "pending" && <div className="mt-3 flex gap-2"><button disabled={Boolean(busy)} onClick={() => reviewResidency(String(row.seller_id), "verified")} className="rounded-lg bg-emerald-300 px-3 py-2 font-black text-black">Verify</button><button disabled={Boolean(busy)} onClick={() => reviewResidency(String(row.seller_id), "rejected")} className="rounded-lg bg-red-300 px-3 py-2 font-black text-black">Reject</button></div>}</div>)}
          </Panel>

          <Panel title="Legacy tax compatibility">
            <Card
              title="V22 compatibility row"
              meta={`${n(data.sellerTaxSettings?.sales_tax_rate_percent || 5).toFixed(2)}% · ${String(data.sellerTaxSettings?.status || "active")} · buyer checkout tax disabled`}
            />
            <p className="text-sm leading-6 text-slate-400">V23 order settlement uses the effective version in seller_sales_tax_rates and freezes it per order. This row remains synchronized for legacy reporting paths.</p>
          </Panel>

          <Panel title="Withdrawal tax rules" action={<button disabled={Boolean(busy)} onClick={createWithdrawalTaxRate} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Add rule</button>}>
            {data.withdrawalTaxRates.length === 0 ? <Empty text="No withdrawal tax rules. Seller withdrawals remain blocked until an active country + payout-method + currency rule exists." /> : data.withdrawalTaxRates.map((row) => (
              <Card key={String(row.id)} title={`${row.country_code} · ${String(row.payout_method).replace(/_/g, " ")}`} meta={`${n(row.rate_percent)}%${n(row.fixed_amount) ? ` + ${currencyMoney(row.fixed_amount, row.currency)}` : ""} · ${row.currency} · ${row.status} · from ${date(row.valid_from)}`} />
            ))}
          </Panel>

          <Panel title="Provider settlement" action={<button disabled={Boolean(busy)} onClick={generateSettlement} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Generate 24h report</button>}>
            {data.settlements.length === 0 ? <Empty text="No settlement reports yet." /> : data.settlements.slice(0, 10).map((row) => (
              <Card key={String(row.id)} title={`${row.provider} · ${row.status}`} meta={`${row.line_count} lines · gross delta ${row.gross_delta} · ${date(row.period_end)}`} />
            ))}
          </Panel>

          <Panel title="Product policy queue">
            {pendingReviews.length === 0 ? <Empty text="No pending product reviews." /> : pendingReviews.map((row) => {
              const product = (row.product || {}) as Record<string, unknown>;
              const seller = (row.seller || {}) as Record<string, unknown>;
              return (
                <div key={String(row.id)} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <div className="flex flex-wrap justify-between gap-3"><h3 className="font-black">{String(product.title || `Product #${row.product_id}`)}</h3><span className="text-yellow-300">{String(row.severity)}</span></div>
                  <p className="mt-2 text-sm text-slate-400">Seller: {String(seller.seller_name || seller.username || seller.email || row.seller_id)}</p>
                  <p className="mt-3 text-sm text-red-200">{Array.isArray(row.reasons) ? row.reasons.join(" · ") : "Policy match"}</p>
                  <div className="mt-4 flex gap-3"><button disabled={busy === `review:${row.id}`} onClick={() => review(Number(row.id), "approved")} className="rounded-lg bg-emerald-400 px-4 py-2 font-black text-black">Approve</button><button disabled={busy === `review:${row.id}`} onClick={() => review(Number(row.id), "rejected")} className="rounded-lg bg-red-400 px-4 py-2 font-black text-black">Reject + strike</button></div>
                </div>
              );
            })}
          </Panel>

          <Panel title="Privacy operations">
            {data.privacyRequests.length === 0 ? <Empty text="No privacy requests." /> : data.privacyRequests.slice(0, 20).map((row) => (
              <div key={String(row.id)} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black capitalize">{String(row.request_type)} · {String(row.status)}</h3>
                    <p className="mt-2 text-sm text-slate-400">User {String(row.user_id)} · requested {date(row.requested_at)} · scheduled {date(row.scheduled_for)}</p>
                    {row.failure_reason ? <p className="mt-2 text-sm text-red-300">{String(row.failure_reason)}</p> : null}
                  </div>
                  {row.request_type === "delete" && row.status === "failed" ? (
                    <button disabled={busy === `privacy:${row.id}`} onClick={() => retryPrivacyDeletion(String(row.id))} className="rounded-lg bg-yellow-300 px-4 py-2 font-black text-black disabled:opacity-50">Retry</button>
                  ) : null}
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Fraud feedback loop">
            {data.riskFeedback.length === 0 ? <Empty text="No dispute outcomes have fed the risk model yet." /> : data.riskFeedback.slice(0, 20).map((row) => (
              <Card key={String(row.id)} title={`${row.reason} · ${n(row.score_delta) >= 0 ? "+" : ""}${row.score_delta}`} meta={`User ${row.subject_user_id} · ${row.outcome} · ${date(row.created_at)}`} />
            ))}
          </Panel>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return <div className={`rounded-3xl border p-5 ${attention ? "border-yellow-400/20 bg-yellow-400/10" : "border-white/10 bg-white/[0.04]"}`}><p className="text-sm text-slate-400">{label}</p><p className={`mt-2 text-3xl font-black ${attention ? "text-yellow-300" : "text-cyan-300"}`}>{value}</p></div>;
}
function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black">{title}</h2>{action}</div><div className="mt-5 space-y-3">{children}</div></section>; }
function Card({ title, meta }: { title: string; meta: string }) { return <div className="rounded-2xl border border-white/10 bg-black/30 p-4"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm text-slate-400">{meta}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">{text}</p>; }

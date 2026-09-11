"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Statement = Record<string, unknown>;
type Line = Record<string, unknown>;

function money(value: unknown, currency: unknown) {
  const code = String(currency || "IDR");
  try { return new Intl.NumberFormat("id-ID", { style: "currency", currency: code, maximumFractionDigits: code === "IDR" ? 0 : 2 }).format(Number(value || 0)); }
  catch { return `${code} ${Number(value || 0).toLocaleString("id-ID")}`; }
}

export default function SellerTaxStatementsPage() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [selected, setSelected] = useState<Statement | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [periodKey, setPeriodKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [currency, setCurrency] = useState("IDR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const payload = await authenticatedFetchJson<{ statements: Statement[] }>("/api/seller/tax-statements", { cache: "no-store" });
      setStatements(payload.statements || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Failed to load statements."); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function generate() {
    setBusy(true); setError("");
    try {
      await authenticatedFetchJson("/api/seller/tax-statements", { method: "POST", body: JSON.stringify({ periodKey, currency }) });
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Statement generation failed."); }
    finally { setBusy(false); }
  }

  async function open(statementId: string) {
    setBusy(true); setError("");
    try {
      const payload = await authenticatedFetchJson<{ statement: Statement; lines: Line[] }>(`/api/seller/tax-statements?statementId=${encodeURIComponent(statementId)}`, { cache: "no-store" });
      setSelected(payload.statement); setLines(payload.lines || []);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Failed to open statement."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#050816] px-4 py-12 text-white"><div className="mx-auto max-w-6xl">
    <Link href="/seller" className="font-black text-cyan-300">← Seller dashboard</Link>
    <h1 className="mt-6 text-4xl font-black md:text-6xl">Seller tax statements</h1>
    <p className="mt-3 text-slate-400">Monthly evidence for seller sales-tax and withdrawal-tax withholding.</p>
    {error && <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</div>}
    <div className="mt-8 flex flex-wrap gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <input type="month" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3" />
      <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} className="w-28 rounded-xl border border-white/10 bg-black/30 px-4 py-3" />
      <button disabled={busy} onClick={generate} className="rounded-xl bg-cyan-400 px-5 py-3 font-black text-black disabled:opacity-50">Generate / refresh</button>
    </div>
    <div className="mt-8 grid gap-5 lg:grid-cols-2">
      <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">Statements</h2>{statements.length === 0 ? <p className="text-slate-500">No statements yet.</p> : statements.map((row) => <button key={String(row.id)} onClick={() => open(String(row.id))} className="block w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-left hover:border-cyan-400/40"><p className="font-black">{String(row.statement_number)}</p><p className="mt-2 text-sm text-slate-400">{String(row.period_start).slice(0,10)} → {String(row.period_end).slice(0,10)} · {money(row.total_tax_amount,row.currency)} · {String(row.status)}</p></button>)}</section>
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><h2 className="text-2xl font-black">Statement detail</h2>{!selected ? <p className="mt-4 text-slate-500">Select a statement.</p> : <><div className="mt-4 grid grid-cols-2 gap-3"><Summary label="Sales tax" value={money(selected.sales_tax_amount,selected.currency)} /><Summary label="Withdrawal tax" value={money(selected.withdrawal_tax_amount,selected.currency)} /><Summary label="Total tax" value={money(selected.total_tax_amount,selected.currency)} /><Summary label="Lines" value={String(selected.line_count || 0)} /></div><div className="mt-5 max-h-[32rem] space-y-2 overflow-auto">{lines.map((line) => <div key={String(line.id)} className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm"><p className="font-bold">{String(line.tax_type).replace(/_/g," ")} · {money(line.tax_amount,line.currency)}</p><p className="mt-1 text-slate-400">{String(line.source_type)} #{String(line.source_id)} · taxable {money(line.taxable_amount,line.currency)} · {Number(line.rate_percent || 0)}%</p></div>)}</div></>}</section>
    </div>
  </div></main>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-black text-cyan-300">{value}</p></div>; }

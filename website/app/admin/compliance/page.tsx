"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
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
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat dasbor kepatuhan.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function review(reviewId: number, decision: "approved" | "rejected") {
    const note = window.prompt(decision === "approved" ? "Bukti / catatan persetujuan:" : "Alasan penolakan:")?.trim();
    if (!note) return;
    setBusy(`review:${reviewId}`); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", {
        method: "PATCH",
        body: JSON.stringify({ reviewId, decision, note }),
      });
      setMessage(`Peninjauan kebijakan ${decision}.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Peninjauan gagal.");
    } finally { setBusy(""); }
  }

  async function retryPrivacyDeletion(requestId: string) {
    if (!window.confirm("Coba ulang penghapusan akun yang gagal ini sekarang?")) return;
    setBusy(`privacy:${requestId}`); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", {
        method: "POST",
        body: JSON.stringify({ action: "retry_privacy_deletion", requestId }),
      });
      setMessage("Penghapusan data privasi masuk antrean untuk dicoba kembali.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Percobaan ulang penghapusan privasi gagal.");
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
      setMessage("Laporan penyelesaian pembayaran penyedia dibuat.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Gagal membuat laporan penyelesaian pembayaran.");
    } finally { setBusy(""); }
  }

  async function proposeRateChange(rateType: "marketplace_fee" | "seller_sales_tax") {
    const ratePercent = window.prompt(rateType === "marketplace_fee" ? "Persentase biaya marketplace baru:" : "Persentase pajak penjualan penjual baru:", "5")?.trim();
    if (ratePercent === undefined || ratePercent === null || ratePercent === "") return;
    const sourceReference = window.prompt("Referensi sumber kebijakan/hukum:")?.trim();
    const reason = window.prompt("Alasan perubahan tarif:")?.trim();
    if (!sourceReference || !reason) return;
    setBusy(`rate:${rateType}`); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "propose_rate_change", rateType, ratePercent: Number(ratePercent), fixedAmount: 0, effectiveFrom: new Date().toISOString(), sourceReference, reason }) });
      setMessage("Perubahan tarif diajukan. Diperlukan persetujuan dua admin yang berbeda.");
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Pengajuan tarif gagal."); }
    finally { setBusy(""); }
  }

  async function reviewRateChange(requestId: string, decision: "approve" | "reject") {
    const note = window.prompt(decision === "approve" ? "Catatan persetujuan:" : "Alasan penolakan:")?.trim();
    if (decision === "reject" && !note) return;
    setBusy(`rate-review:${requestId}`); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "review_rate_change", requestId, decision, note }) });
      setMessage(`Permintaan tarif ${decision === "approve" ? "approved" : "rejected"}.`);
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Peninjauan tarif gagal."); }
    finally { setBusy(""); }
  }

  async function addFxRate() {
    const baseCurrency = window.prompt("Mata uang dompet/dasar:", "IDR")?.trim().toUpperCase();
    const quoteCurrency = window.prompt("Mata uang pencairan/penawaran:", "USD")?.trim().toUpperCase();
    const rate = window.prompt(`1 ${baseCurrency || "IDR"} setara dengan berapa ${quoteCurrency || "USD"}?`)?.trim();
    const sourceReference = window.prompt("Referensi penyedia/sumber kurs:")?.trim();
    if (!baseCurrency || !quoteCurrency || !rate || !sourceReference) return;
    setBusy("fx"); setError(""); setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "save_fx_rate", baseCurrency, quoteCurrency, rate: Number(rate), provider: "manual", sourceReference, validFrom: new Date().toISOString() }) });
      setMessage("Kurs disimpan."); await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Gagal menyimpan kurs."); }
    finally { setBusy(""); }
  }

  async function createAccountingPeriod() {
    const periodKey = window.prompt("Bulan pembukuan (YYYY-MM):", new Date().toISOString().slice(0, 7))?.trim();
    if (!periodKey) return;
    setBusy("period-create"); setError(""); setMessage("");
    try { await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "create_accounting_period", periodKey }) }); setMessage("Periode pembukuan dibuat."); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Gagal membuat periode pembukuan."); }
    finally { setBusy(""); }
  }

  async function closeAccountingPeriod(periodId: string) {
    if (!window.confirm("Tutup periode pembukuan ini dan kunci seluruh laporan pajak penjual?")) return;
    setBusy(`period:${periodId}`); setError(""); setMessage("");
    try { await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "close_accounting_period", periodId }) }); setMessage("Periode pembukuan ditutup."); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Penutupan pembukuan gagal."); }
    finally { setBusy(""); }
  }

  async function reviewResidency(sellerId: string, decision: "verified" | "rejected") {
    const note = window.prompt(decision === "verified" ? "Catatan verifikasi (opsional):" : "Alasan penolakan:")?.trim() || "";
    if (decision === "rejected" && !note) return;
    setBusy(`residency:${sellerId}`); setError(""); setMessage("");
    try { await authenticatedFetchJson("/api/admin/compliance", { method: "POST", body: JSON.stringify({ action: "review_tax_residency", sellerId, decision, note }) }); setMessage(`Domisili pajak ${decision}.`); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Peninjauan domisili pajak gagal."); }
    finally { setBusy(""); }
  }

  async function createWithdrawalTaxRate() {
    const countryCode = window.prompt("Kode negara pencairan penjual (contoh ID):")?.trim().toUpperCase();
    if (!countryCode) return;
    const payoutMethod = window.prompt("Metode pencairan: bank_transfer, paypal, atau wise", "bank_transfer")?.trim().toLowerCase();
    if (!payoutMethod) return;
    const ratePercent = window.prompt("Persentase pajak penarikan:", "0")?.trim();
    if (ratePercent === undefined || ratePercent === null || ratePercent === "") return;
    const fixedAmount = window.prompt("Potongan tetap dalam mata uang pencairan:", "0")?.trim();
    if (fixedAmount === undefined || fixedAmount === null || fixedAmount === "") return;
    const currency = window.prompt("Kode mata uang:", countryCode === "ID" ? "IDR" : "USD")?.trim().toUpperCase();
    if (!currency) return;
    const sourceReference = window.prompt("Referensi hukum/sumber dan tanggal peninjauan (wajib untuk aturan aktif):")?.trim();
    const activate = window.confirm("Ajukan pengaktifan melalui persetujuan ganda? Pilih Batal untuk menyimpan sebagai draf.");
    const reason = activate ? window.prompt("Alasan perubahan pajak penarikan ini:")?.trim() : "Draf aturan pajak penarikan";
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
      setMessage(activate ? "Perubahan pajak penarikan diajukan untuk persetujuan ganda." : "Draf pajak penarikan disimpan.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Gagal menyimpan aturan pajak penarikan.");
    } finally { setBusy(""); }
  }

  if (!data) {
    return <main className="min-h-screen bg-slate-950 p-10 text-center text-white">{adminText(error || "Memuat kepatuhan perdagangan...")}</main>;
  }

  const pendingReviews = data.policyReviews.filter((row) => row.status === "pending");
  const pendingPrivacy = data.privacyRequests.filter((row) => ["pending", "processing"].includes(String(row.status)));
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-cyan-400/20 px-4 py-12">
        <div className="mx-auto max-w-7xl">
          <Link href="/admin" className="font-black text-cyan-300">← Dasbor admin</Link>
          <p className="mt-6 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">Tata Kelola Keuangan V23</p>
          <h1 className="mt-4 text-5xl font-black md:text-7xl">Pusat kendali setelah peluncuran</h1>
          <p className="mt-4 max-w-3xl text-slate-400">Rekaman tarif pesanan yang terkunci, perubahan biaya dengan persetujuan ganda, verifikasi domisili pajak penjual, bukti kurs, tutup buku, pencairan melalui penyedia, dan kepatuhan setelah peluncuran.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        {(error || message) && <div className={`mb-6 rounded-2xl border p-4 ${error ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>{adminText(error || message)}</div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={"Pesanan dibuat dalam 30 hari"} value={String(n(data.metrics.createdOrders))} />
          <Metric label={"Pembayaran → lunas"} value={`${n(data.metrics.checkoutToPaidPercent).toFixed(1)}%`} />
          <Metric label={"Nilai transaksi bruto"} value={money(data.metrics.grossVolume)} />
          <Metric label={"Pajak penjualan penjual dipotong"} value={money(data.metrics.sellerSalesTaxWithheld)} />
          <Metric label={"Pajak penarikan dipotong"} value={money(data.metrics.withdrawalTaxWithheld)} />
          <Metric label={"Biaya marketplace"} value={money(data.metrics.marketplaceFees)} />
          <Metric label={"Waktu pengiriman p95"} value={`${n(data.metrics.deliveryP95Minutes).toFixed(0)} menit`} />
          <Metric label={"Peninjauan kebijakan menunggu"} value={String(pendingReviews.length)} attention />
          <Metric label={"Permintaan privasi menunggu"} value={String(pendingPrivacy.length)} attention />
        </div>

        <div className="mt-10 grid gap-8 xl:grid-cols-2">
          <Panel title={"Tata kelola biaya marketplace"} action={<button disabled={Boolean(busy)} onClick={() => proposeRateChange("marketplace_fee")} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Ajukan perubahan</button>}>
            {(data.marketplaceFeeSettings || []).slice(0, 5).map((row) => <Card key={String(row.id)} title={`${n(row.rate_percent).toFixed(2)}% · ${row.status}`} meta={`Effective ${date(row.valid_from)} · ${String(row.source_reference || "No source")}`} />)}
            {(data.marketplaceFeeSettings || []).length === 0 && <Empty text={"Belum ada riwayat biaya marketplace."} />}
          </Panel>

          <Panel title={"Tata kelola pajak penjualan penjual"} action={<button disabled={Boolean(busy)} onClick={() => proposeRateChange("seller_sales_tax")} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Ajukan perubahan</button>}>
            {(data.sellerTaxRates || []).slice(0, 5).map((row) => <Card key={String(row.id)} title={`${n(row.rate_percent).toFixed(2)}% · ${row.status}`} meta={`Effective ${date(row.valid_from)} · ${String(row.source_reference || "No source")}`} />)}
            {(data.sellerTaxRates || []).length === 0 && <Empty text={"Belum ada riwayat tarif pajak penjual."} />}
          </Panel>

          <Panel title={"Permintaan tarif dengan persetujuan ganda"}>
            {(data.rateChangeRequests || []).length === 0 ? <Empty text={"Belum ada permintaan perubahan tarif."} /> : data.rateChangeRequests.slice(0, 20).map((row) => <div key={String(row.id)} className="rounded-2xl border border-white/10 bg-black/30 p-4"><h3 className="font-black">{String(row.rate_type).replace(/_/g, " ")} · {n(row.proposed_rate_percent)}% · {adminLabel(String(row.status))}</h3><p className="mt-2 text-sm text-slate-400">Berlaku {date(row.effective_from)} · diajukan oleh {String(row.requested_by)}</p>{["pending","partially_approved"].includes(String(row.status)) && <div className="mt-3 flex gap-2"><button disabled={Boolean(busy)} onClick={() => reviewRateChange(String(row.id), "approve")} className="rounded-lg bg-emerald-300 px-3 py-2 font-black text-black">Setujui</button><button disabled={Boolean(busy)} onClick={() => reviewRateChange(String(row.id), "reject")} className="rounded-lg bg-red-300 px-3 py-2 font-black text-black">Tolak</button></div>}</div>)}
          </Panel>

          <Panel title={"Kurs mata uang"} action={<button disabled={Boolean(busy)} onClick={addFxRate} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Tambah kurs</button>}>
            {(data.fxRates || []).length === 0 ? <Empty text={"Belum ada kurs yang dikonfigurasi."} /> : data.fxRates.slice(0, 15).map((row) => <Card key={String(row.id)} title={`${row.base_currency} → ${row.quote_currency} · ${row.rate}`} meta={`${row.status} · ${row.provider} · from ${date(row.valid_from)}`} />)}
          </Panel>

          <Panel title={"Periode pembukuan"} action={<button disabled={Boolean(busy)} onClick={createAccountingPeriod} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Buka bulan</button>}>
            {(data.accountingPeriods || []).length === 0 ? <Empty text={"Belum ada periode pembukuan."} /> : data.accountingPeriods.slice(0, 12).map((row) => <div key={String(row.id)} className="rounded-2xl border border-white/10 bg-black/30 p-4"><h3 className="font-black">{String(row.period_key)} · {adminLabel(String(row.status))}</h3><p className="mt-2 text-sm text-slate-400">{date(row.period_start)} → {date(row.period_end)}</p>{row.status === "open" && <button disabled={Boolean(busy)} onClick={() => closeAccountingPeriod(String(row.id))} className="mt-3 rounded-lg bg-yellow-300 px-3 py-2 font-black text-black">Tutup periode</button>}</div>)}
          </Panel>

          <Panel title={"Peninjauan domisili pajak penjual"}>
            {(data.taxResidencies || []).length === 0 ? <Empty text={"Belum ada pengajuan domisili pajak penjual."} /> : data.taxResidencies.slice(0, 20).map((row) => <div key={String(row.seller_id)} className="rounded-2xl border border-white/10 bg-black/30 p-4"><h3 className="font-black">{String(row.legal_name)} · {String(row.country_code)} · {adminLabel(String(row.status))}</h3><p className="mt-2 text-sm text-slate-400">Akhiran nomor pajak {String(row.tax_identifier_last4 || "—")} · diajukan {date(row.submitted_at)}</p>{row.status === "pending" && <div className="mt-3 flex gap-2"><button disabled={Boolean(busy)} onClick={() => reviewResidency(String(row.seller_id), "verified")} className="rounded-lg bg-emerald-300 px-3 py-2 font-black text-black">Verifikasi</button><button disabled={Boolean(busy)} onClick={() => reviewResidency(String(row.seller_id), "rejected")} className="rounded-lg bg-red-300 px-3 py-2 font-black text-black">Tolak</button></div>}</div>)}
          </Panel>

          <Panel title={"Kompatibilitas pajak lama"}>
            <Card
              title={"Baris kompatibilitas V22"}
              meta={`${n(data.sellerTaxSettings?.sales_tax_rate_percent || 5).toFixed(2)}% · ${String(data.sellerTaxSettings?.status || "active")} · buyer checkout tax disabled`}
            />
            <p className="text-sm leading-6 text-slate-400">Penyelesaian pesanan V23 menggunakan versi yang berlaku di seller_sales_tax_rates dan menguncinya per pesanan. Baris ini tetap disinkronkan untuk jalur pelaporan lama.</p>
          </Panel>

          <Panel title={"Aturan pajak penarikan"} action={<button disabled={Boolean(busy)} onClick={createWithdrawalTaxRate} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Tambah aturan</button>}>
            {data.withdrawalTaxRates.length === 0 ? <Empty text={"Belum ada aturan pajak penarikan. Penarikan penjual tetap diblokir sampai tersedia aturan aktif untuk negara + metode pencairan + mata uang."} /> : data.withdrawalTaxRates.map((row) => (
              <Card key={String(row.id)} title={`${row.country_code} · ${String(row.payout_method).replace(/_/g, " ")}`} meta={`${n(row.rate_percent)}%${n(row.fixed_amount) ? ` + ${currencyMoney(row.fixed_amount, row.currency)}` : ""} · ${row.currency} · ${row.status} · from ${date(row.valid_from)}`} />
            ))}
          </Panel>

          <Panel title={"Penyelesaian pembayaran penyedia"} action={<button disabled={Boolean(busy)} onClick={generateSettlement} className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-black">Buat laporan 24 jam</button>}>
            {data.settlements.length === 0 ? <Empty text={"Belum ada laporan penyelesaian pembayaran."} /> : data.settlements.slice(0, 10).map((row) => (
              <Card key={String(row.id)} title={`${row.provider} · ${row.status}`} meta={`${row.line_count} lines · gross delta ${row.gross_delta} · ${date(row.period_end)}`} />
            ))}
          </Panel>

          <Panel title={"Antrean kebijakan produk"}>
            {pendingReviews.length === 0 ? <Empty text={"Tidak ada peninjauan produk yang menunggu."} /> : pendingReviews.map((row) => {
              const product = (row.product || {}) as Record<string, unknown>;
              const seller = (row.seller || {}) as Record<string, unknown>;
              return (
                <div key={String(row.id)} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <div className="flex flex-wrap justify-between gap-3"><h3 className="font-black">{String(product.title || `Produk #${row.product_id}`)}</h3><span className="text-yellow-300">{adminLabel(String(row.severity))}</span></div>
                  <p className="mt-2 text-sm text-slate-400">Penjual: {String(seller.seller_name || seller.username || seller.email || row.seller_id)}</p>
                  <p className="mt-3 text-sm text-red-200">{Array.isArray(row.reasons) ? row.reasons.join(" · ") : "Kecocokan kebijakan"}</p>
                  <div className="mt-4 flex gap-3"><button disabled={busy === `review:${row.id}`} onClick={() => review(Number(row.id), "approved")} className="rounded-lg bg-emerald-400 px-4 py-2 font-black text-black">Setujui</button><button disabled={busy === `review:${row.id}`} onClick={() => review(Number(row.id), "rejected")} className="rounded-lg bg-red-400 px-4 py-2 font-black text-black">Tolak + beri pelanggaran</button></div>
                </div>
              );
            })}
          </Panel>

          <Panel title={"Pengelolaan privasi"}>
            {data.privacyRequests.length === 0 ? <Empty text={"Belum ada permintaan privasi."} /> : data.privacyRequests.slice(0, 20).map((row) => (
              <div key={String(row.id)} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black capitalize">{String(row.request_type)} · {adminLabel(String(row.status))}</h3>
                    <p className="mt-2 text-sm text-slate-400">Pengguna {String(row.user_id)} · diminta {date(row.requested_at)} · dijadwalkan {date(row.scheduled_for)}</p>
                    {row.failure_reason ? <p className="mt-2 text-sm text-red-300">{String(row.failure_reason)}</p> : null}
                  </div>
                  {row.request_type === "delete" && row.status === "failed" ? (
                    <button disabled={busy === `privacy:${row.id}`} onClick={() => retryPrivacyDeletion(String(row.id))} className="rounded-lg bg-yellow-300 px-4 py-2 font-black text-black disabled:opacity-50">Coba Lagi</button>
                  ) : null}
                </div>
              </div>
            ))}
          </Panel>

          <Panel title={"Umpan balik penipuan"}>
            {data.riskFeedback.length === 0 ? <Empty text={"Belum ada hasil sengketa yang menjadi masukan model risiko."} /> : data.riskFeedback.slice(0, 20).map((row) => (
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

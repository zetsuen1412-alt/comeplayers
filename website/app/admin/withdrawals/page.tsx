"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FaCheck,
  FaClock,
  FaEye,
  FaMoneyBillWave,
  FaSpinner,
  FaTimes,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Withdrawal = {
  id: number;
  user_id: string;
  wallet_id: number;
  payout_account_id: number | null;
  amount: number | string;
  fee_amount: number | string;
  tax_amount: number | string;
  tax_rate_percent: number | string;
  tax_fixed_amount: number | string;
  tax_country_code?: string | null;
  tax_payout_method?: string | null;
  tax_source_reference?: string | null;
  net_amount: number | string;
  currency: string;
  source_amount?: number | string | null;
  source_currency?: string | null;
  payout_currency?: string | null;
  fx_rate?: number | string | null;
  payout_gross_amount?: number | string | null;
  payout_tax_amount?: number | string | null;
  payout_net_amount?: number | string | null;
  provider_batch_id?: string | null;
  provider_item_id?: string | null;
  payout_provider_fee?: number | string | null;
  payout_method: string;
  payout_account_name: string;
  payout_account_number: string;
  payout_note: string | null;
  status: string;
  admin_note: string | null;
  payout_reference: string | null;
  payout_provider: string | null;
  provider_status: string | null;
  eligible_at: string | null;
  approved_at: string | null;
  processing_at: string | null;
  paid_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  processed_at: string | null;
  created_at: string;
  profiles: {
    email?: string | null;
    username?: string | null;
    seller_name?: string | null;
    seller_status?: string | null;
  } | null;
  wallets: {
    balance?: number | string;
    total_withdrawn?: number | string;
    status?: string | null;
  } | null;
  payout_accounts: {
    method?: string | null;
    label?: string | null;
    account_name?: string | null;
    account_last4?: string | null;
    bank_name?: string | null;
    verification_status?: string | null;
  } | null;
};

type AdminPayload = { withdrawals: Withdrawal[] };

type ActionInput = {
  note: string;
  reference: string;
  provider: string;
  feeAmount: string;
  overrideHold: boolean;
};

const emptyAction: ActionInput = {
  note: "",
  reference: "",
  provider: "Manual Transfer",
  feeAmount: "0",
  overrideHold: false,
};

const statuses = ["all", "pending", "approved", "processing", "paid", "rejected", "failed", "cancelled"];

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function currencyMoney(value: unknown, currency: unknown) {
  const code = String(currency || "IDR").toUpperCase();
  try { return new Intl.NumberFormat("id-ID", { style: "currency", currency: code, maximumFractionDigits: code === "IDR" ? 0 : 2 }).format(numberValue(value)); }
  catch { return `${code} ${numberValue(value).toLocaleString("id-ID")}`; }
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function pretty(value?: string | null) {
  return adminLabel(value);
}

function statusClass(status: string) {
  if (status === "paid") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "approved" || status === "processing") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  if (status === "pending") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
  if (["rejected", "failed", "cancelled"].includes(status)) return "border-red-400/30 bg-red-400/10 text-red-300";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

export default function AdminWithdrawalManagementPage() {
  const { formatIdrPrice: formatPrice } = useCurrency();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [actions, setActions] = useState<Record<number, ActionInput>>({});
  const [revealed, setRevealed] = useState<Record<number, Record<string, string>>>({});
  const [renderNow] = useState(() => Date.now());

  async function loadWithdrawals() {
    try {
      const payload = await authenticatedFetchJson<AdminPayload>("/api/admin/withdrawals");
      setWithdrawals(payload.withdrawals || []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat penarikan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWithdrawals();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return withdrawals.filter((item) => {
      const profile = item.profiles;
      const matchesStatus = activeStatus === "all" || item.status === activeStatus;
      const matchesSearch =
        !query ||
        String(item.id).includes(query) ||
        item.user_id.toLowerCase().includes(query) ||
        String(item.payout_method || "").toLowerCase().includes(query) ||
        String(item.payout_account_name || "").toLowerCase().includes(query) ||
        String(item.payout_reference || "").toLowerCase().includes(query) ||
        String(profile?.email || "").toLowerCase().includes(query) ||
        String(profile?.username || "").toLowerCase().includes(query) ||
        String(profile?.seller_name || "").toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [withdrawals, activeStatus, search]);

  const metrics = useMemo(() => ({
    pending: withdrawals.filter((item) => item.status === "pending").length,
    processing: withdrawals.filter((item) => ["approved", "processing"].includes(item.status)).length,
    paid: withdrawals.filter((item) => item.status === "paid").reduce((sum, item) => sum + numberValue(item.amount), 0),
    queued: withdrawals.filter((item) => ["pending", "approved", "processing"].includes(item.status)).reduce((sum, item) => sum + numberValue(item.amount), 0),
  }), [withdrawals]);

  function actionInput(id: number) {
    return actions[id] || emptyAction;
  }

  function updateInput(id: number, values: Partial<ActionInput>) {
    setActions((current) => ({
      ...current,
      [id]: { ...emptyAction, ...(current[id] || {}), ...values },
    }));
  }

  async function revealDetails(item: Withdrawal) {
    const reason = prompt("Alasan membuka rincian pencairan:", "Pemrosesan pencairan manual") || "";
    if (!reason.trim()) return;

    setUpdatingId(item.id);
    try {
      const payload = await authenticatedFetchJson<{ details: Record<string, string> }>("/api/admin/withdrawals", {
        method: "POST",
        body: JSON.stringify({ withdrawalId: item.id, action: "reveal", reason }),
      });
      setRevealed((current) => ({ ...current, [item.id]: payload.details }));
    } catch (actionError) {
      alert(adminText(actionError instanceof Error ? actionError.message : "Gagal membuka rincian pencairan."));
    } finally {
      setUpdatingId(null);
    }
  }

  async function providerAction(item: Withdrawal, action: "execute_provider" | "sync_provider") {
    const label = action === "execute_provider" ? "kirim pencairan ini ke PayPal" : "sinkronkan pencairan PayPal ini";
    if (!confirm(`Konfirmasi ${label} untuk penarikan #${item.id}?`)) return;
    setUpdatingId(item.id);
    try {
      await authenticatedFetchJson("/api/admin/withdrawals", {
        method: "POST",
        body: JSON.stringify({ withdrawalId: item.id, action }),
      });
      await loadWithdrawals();
    } catch (actionError) {
      alert(adminText(actionError instanceof Error ? actionError.message : "Tindakan pencairan penyedia gagal."));
    } finally { setUpdatingId(null); }
  }

  async function process(item: Withdrawal, action: string) {
    const input = actionInput(item.id);
    const labels: Record<string, string> = {
      approve: "approve",
      processing: "ubah menjadi diproses",
      paid: "tandai dibayar",
      reject: "tolak dan kembalikan dana",
      fail: "tandai gagal dan kembalikan dana",
    };

    if ((action === "reject" || action === "fail") && !input.note.trim()) {
      alert("Catatan admin wajib diisi untuk pencairan yang ditolak atau gagal.");
      return;
    }
    if (action === "paid" && !input.reference.trim()) {
      alert("Referensi pencairan wajib diisi sebelum menandai dibayar.");
      return;
    }
    if (!confirm(`Konfirmasi ${labels[action] || action} untuk penarikan #${item.id}?`)) return;

    setUpdatingId(item.id);
    try {
      await authenticatedFetchJson("/api/admin/withdrawals", {
        method: "PATCH",
        body: JSON.stringify({
          withdrawalId: item.id,
          action,
          note: input.note,
          reference: input.reference,
          provider: input.provider,
          feeAmount: input.feeAmount,
          overrideHold: input.overrideHold,
        }),
      });
      await loadWithdrawals();
    } catch (actionError) {
      alert(adminText(actionError instanceof Error ? actionError.message : "Gagal memproses penarikan."));
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-[#020617] px-6 py-24 text-center text-white">Memuat antrean pencairan...</main>;
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#020617] px-6 py-24 text-center text-white">
        <h1 className="text-4xl font-black text-red-300">Pengelolaan Penarikan Tidak Tersedia</h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-300">{adminText(error)}</p>
        <Link href="/admin" className="mt-8 inline-flex rounded-xl bg-cyan-400 px-6 py-4 font-black text-black">Beranda Admin</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_36%)] px-6 py-14">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300"><FaMoneyBillWave /> Operasional Pencairan Admin</p>
            <h1 className="mt-5 text-5xl font-black md:text-7xl">Antrean Penarikan</h1>
            <p className="mt-4 max-w-3xl text-slate-300">Tinjau, buka rincian rekening terenkripsi, setujui, cocokkan, selesaikan, atau kembalikan dana pencairan penjual.</p>
          </div>
          <Link href="/admin/audit-logs" className="rounded-xl border border-cyan-400 px-5 py-3 font-black text-cyan-300">Buka Riwayat Audit</Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label={"Menunggu Peninjauan"} value={String(metrics.pending)} />
          <Metric label={"Sedang Diproses"} value={String(metrics.processing)} />
          <Metric label={"Jumlah dalam Antrean"} value={formatPrice(metrics.queued)} />
          <Metric label={"Jumlah Dibayar"} value={formatPrice(metrics.paid)} />
        </div>

        <div className="mt-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={"Cari permintaan, penjual, email, metode, atau referensi pencairan..."} className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none focus:border-cyan-400" />
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <button key={status} onClick={() => setActiveStatus(status)} className={`rounded-full px-4 py-3 text-sm font-black ${activeStatus === status ? "bg-cyan-400 text-black" : "border border-white/10 bg-white/[0.04] text-slate-300"}`}>{pretty(status)}</button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-6">
          {filtered.length === 0 ? (
            <p className="rounded-3xl border border-white/10 bg-white/[0.04] p-12 text-center text-slate-400">Tidak ada permintaan penarikan yang sesuai filter ini.</p>
          ) : filtered.map((item) => {
            const input = actionInput(item.id);
            const details = revealed[item.id];
            const displayName = item.profiles?.seller_name || item.profiles?.username || item.profiles?.email || item.user_id;
            const eligible = !item.eligible_at || Date.parse(item.eligible_at) <= renderNow;

            return (
              <article key={item.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <div className="grid gap-7 xl:grid-cols-[1fr_360px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black">Penarikan #{item.id}</h2>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(item.status)}`}>{pretty(item.status)}</span>
                      {!eligible && ["pending", "approved", "processing"].includes(item.status) ? (
                        <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-black text-yellow-300"><FaClock className="mr-1 inline" /> Tahan hingga {formatDate(item.eligible_at)}</span>
                      ) : null}
                    </div>

                    <p className="mt-4 text-4xl font-black text-emerald-300">{formatPrice(item.amount)}</p>
                    <p className="mt-2 text-sm text-slate-400">Pengurangan dompet {currencyMoney(item.source_amount || item.amount, item.source_currency || "IDR")} · pencairan bruto {currencyMoney(item.payout_gross_amount || item.amount, item.payout_currency || item.currency)} · pajak penarikan {currencyMoney(item.payout_tax_amount || item.tax_amount, item.payout_currency || item.currency)} ({numberValue(item.tax_rate_percent).toFixed(2)}%) · penjual menerima {currencyMoney(item.payout_net_amount || item.net_amount, item.payout_currency || item.currency)}</p>

                    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <Info label={"Penjual"} value={displayName} subvalue={item.profiles?.email || item.user_id} />
                      <Info label={"Metode"} value={pretty(item.payout_method)} subvalue={item.payout_accounts?.bank_name || item.payout_accounts?.label || ""} />
                      <Info label={"Rekening Disamarkan"} value={item.payout_account_number || `****${item.payout_accounts?.account_last4 || ""}`} subvalue={item.payout_account_name} />
                      <Info label={"Diajukan"} value={formatDate(item.created_at)} />
                      <Info label={"Penyedia"} value={item.payout_provider || "Belum ditetapkan"} subvalue={`${item.provider_status || "queued"} · fee ${currencyMoney(item.payout_provider_fee || 0, item.payout_currency || item.currency)}`} />
                      <Info label={"Rekaman kurs"} value={`${item.source_currency || "IDR"} → ${item.payout_currency || item.currency} @ ${numberValue(item.fx_rate || 1)}`} />
                      <Info label={"Kelompok pencairan penyedia"} value={item.provider_batch_id || "Belum diajukan"} subvalue={item.provider_item_id || ""} />
                      <Info label={"Referensi"} value={item.payout_reference || "Belum diselesaikan"} />
                      <Info label={"Yurisdiksi pajak"} value={`${item.tax_country_code || "-"} · ${pretty(item.tax_payout_method)}`} subvalue={item.tax_source_reference || "No source reference"} />
                    </div>

                    {details ? (
                      <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-5">
                        <p className="font-black text-red-200">Rincian pencairan sensitif — akses dicatat dalam audit</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <Info label={"Nama Pemilik Rekening"} value={details.accountName} />
                          <Info label={"Rekening / Email"} value={details.accountIdentifier} />
                          <Info label="Bank" value={details.bankName || "-"} />
                          <Info label={"Negara / Mata Uang"} value={`${details.countryCode} / ${details.currency}`} />
                        </div>
                      </div>
                    ) : null}

                    {item.payout_note ? <p className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">Catatan penjual: {item.payout_note}</p> : null}
                    {item.admin_note ? <p className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm text-yellow-100">Catatan admin: {item.admin_note}</p> : null}
                  </div>

                  <aside className="rounded-2xl border border-white/10 bg-black/30 p-5">
                    <h3 className="text-lg font-black">Tindakan Pencairan</h3>
                    <div className="mt-4 grid gap-3">
                      <input value={input.provider} onChange={(event) => updateInput(item.id, { provider: event.target.value })} placeholder={"Penyedia"} className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white" />
                      <input value={input.reference} onChange={(event) => updateInput(item.id, { reference: event.target.value })} placeholder={"Referensi pencairan"} className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white" />
                      <input type="number" min="0" value={input.feeAmount} onChange={(event) => updateInput(item.id, { feeAmount: event.target.value })} placeholder={"Jumlah biaya penyedia"} className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white" />
                      <textarea rows={4} value={input.note} onChange={(event) => updateInput(item.id, { note: event.target.value })} placeholder={"Catatan admin"} className="resize-none rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white" />
                      <label className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={input.overrideHold} onChange={(event) => updateInput(item.id, { overrideHold: event.target.checked })} /> Lewati penahanan pencairan</label>

                      <button disabled={updatingId === item.id} onClick={() => revealDetails(item)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/40 px-4 py-3 font-black text-red-300"><FaEye /> Buka Rincian Pencairan</button>

                      {item.status === "pending" ? (
                        <>
                          <button disabled={updatingId === item.id} onClick={() => process(item, "approve")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-black text-black"><FaCheck /> Setujui</button>
                          <button disabled={updatingId === item.id} onClick={() => process(item, "reject")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 font-black"><FaTimes /> Tolak &amp; Kembalikan Dana</button>
                        </>
                      ) : null}

                      {item.status === "approved" ? (
                        <>
                          {String(item.tax_payout_method || item.payout_method).toLowerCase() === "paypal" ? <button disabled={updatingId === item.id} onClick={() => providerAction(item, "execute_provider")} className="rounded-xl bg-indigo-400 px-4 py-3 font-black text-black">Jalankan Pencairan PayPal</button> : null}
                          <button disabled={updatingId === item.id} onClick={() => process(item, "processing")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 font-black"><FaSpinner /> Mulai Pemrosesan</button>
                          <button disabled={updatingId === item.id} onClick={() => process(item, "paid")} className="rounded-xl bg-emerald-500 px-4 py-3 font-black">Tandai Dibayar</button>
                          <button disabled={updatingId === item.id} onClick={() => process(item, "reject")} className="rounded-xl bg-red-500 px-4 py-3 font-black">Tolak &amp; Kembalikan Dana</button>
                        </>
                      ) : null}

                      {item.status === "processing" ? (
                        <>
                          {item.provider_batch_id ? <button disabled={updatingId === item.id} onClick={() => providerAction(item, "sync_provider")} className="rounded-xl bg-indigo-400 px-4 py-3 font-black text-black">Sinkronkan Status PayPal</button> : null}
                          <button disabled={updatingId === item.id} onClick={() => process(item, "paid")} className="rounded-xl bg-emerald-500 px-4 py-3 font-black">Tandai Dibayar</button>
                          <button disabled={updatingId === item.id} onClick={() => process(item, "fail")} className="rounded-xl bg-red-500 px-4 py-3 font-black">Tandai Gagal &amp; Kembalikan Dana</button>
                        </>
                      ) : null}

                      {updatingId === item.id ? <p className="text-center text-sm text-slate-400">Memproses tindakan...</p> : null}
                    </div>
                  </aside>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-black text-cyan-300">{value}</p></div>;
}

function Info({ label, value, subvalue }: { label: string; value: string; subvalue?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-black">{value || "-"}</p>{subvalue ? <p className="mt-1 break-words text-xs text-slate-400">{subvalue}</p> : null}</div>;
}


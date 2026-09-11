"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FaBuilding,
  FaCheckCircle,
  FaClock,
  FaCreditCard,
  FaHistory,
  FaMoneyBillWave,
  FaPaypal,
  FaPlus,
  FaShieldAlt,
  FaStar,
  FaTimesCircle,
  FaWallet,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

const DEVICE_KEY_STORAGE = "comeplayers_security_device_id";

function getDeviceKey() {
  let value = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY_STORAGE, value);
  }
  return value;
}

function currentDeviceName() {
  const platform = navigator.platform || "Device";
  const browser = navigator.userAgent.includes("Edg/")
    ? "Edge"
    : navigator.userAgent.includes("Chrome/")
      ? "Chrome"
      : navigator.userAgent.includes("Firefox/")
        ? "Firefox"
        : "Browser";
  return `${browser} on ${platform}`.slice(0, 120);
}

type PayoutAccount = {
  id: number;
  method: string;
  label: string;
  account_name: string;
  account_last4: string;
  masked_identifier: string;
  bank_name: string;
  country_code: string;
  currency: string;
  is_default: boolean;
  status: string;
  verification_status: string;
  created_at: string;
};

type WithdrawalTaxRate = {
  id: number;
  country_code: string;
  payout_method: string;
  rate_percent: number | string;
  fixed_amount: number | string;
  currency: string;
  valid_from: string;
  valid_to?: string | null;
  source_reference?: string | null;
};

type Withdrawal = {
  id: number;
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
  payout_provider_fee?: number | string | null;
  provider_batch_id?: string | null;
  provider_item_id?: string | null;
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
  created_at: string;
  processed_at: string | null;
  risk_score?: number | null;
  risk_level?: string | null;
  risk_reasons?: string[] | null;
  security_review_status?: string | null;
};


type WithdrawalQuote = {
  source_amount: number | string;
  source_currency: string;
  payout_currency: string;
  fx_rate: number | string;
  payout_gross_amount: number | string;
  rate_percent: number | string;
  fixed_amount: number | string;
  tax_amount: number | string;
  payout_net_amount: number | string;
  country_code: string;
  payout_method: string;
};

type PayoutOverview = {
  wallet: {
    id: number;
    balance: number | string;
    pending_balance: number | string;
    total_earned: number | string;
    total_spent: number | string;
    total_withdrawn: number | string;
    status: string;
  };
  accounts: PayoutAccount[];
  withdrawals: Withdrawal[];
  withdrawalTaxRates: WithdrawalTaxRate[];
  settings: {
    minimumAmount: number;
    maximumAmount: number;
    holdHours: number;
    minimumKycLevel: number;
    kycLevel: number;
    dailyLimit: number;
    riskLevel: string;
    riskStatus: string;
    pinSet: boolean;
    pinLockedUntil: string | null;
    payoutCooldownUntil: string | null;
    cooldownReason: string | null;
    mfaRequiredForPayout: boolean;
    currentAal: string;
  };
};

const emptyAccountForm = {
  method: "bank_transfer",
  label: "",
  accountName: "",
  accountIdentifier: "",
  bankName: "",
  countryCode: "ID",
  currency: "IDR",
  isDefault: true,
};

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
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function pretty(value?: string | null) {
  return String(value || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "paid") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (normalized === "approved" || normalized === "processing") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  }
  if (normalized === "pending") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
  if (["rejected", "failed", "cancelled"].includes(normalized)) {
    return "border-red-400/30 bg-red-400/10 text-red-300";
  }
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function methodIcon(method: string) {
  if (method === "paypal") return <FaPaypal />;
  if (method === "bank_transfer") return <FaBuilding />;
  return <FaCreditCard />;
}

export default function SellerPayoutCenterPage() {
  const { formatPrice } = useCurrency();
  const [data, setData] = useState<PayoutOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [renderNow] = useState(() => Date.now());
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [withdrawalQuoteState, setWithdrawalQuoteState] = useState<{ key: string; quote: WithdrawalQuote } | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [withdrawalForm, setWithdrawalForm] = useState({
    payoutAccountId: "",
    amount: "",
    note: "",
    withdrawalPin: "",
  });

  async function loadData() {
    try {
      const payload = await authenticatedFetchJson<PayoutOverview>("/api/withdrawals", {
        headers: {
          "X-Device-ID": getDeviceKey(),
          "X-Device-Name": currentDeviceName(),
        },
      });
      setData(payload);
      setError("");
      const defaultAccount = payload.accounts.find((account) => account.is_default) || payload.accounts[0];
      setWithdrawalForm((current) => ({
        ...current,
        payoutAccountId: current.payoutAccountId || String(defaultAccount?.id || ""),
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load payout center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const pendingAmount = useMemo(
    () =>
      (data?.withdrawals || [])
        .filter((item) => ["pending", "approved", "processing"].includes(item.status))
        .reduce((sum, item) => sum + numberValue(item.amount), 0),
    [data]
  );

  const cooldownActive = Boolean(
    data?.settings.payoutCooldownUntil &&
      new Date(data.settings.payoutCooldownUntil).getTime() > renderNow
  );
  const pinLocked = Boolean(
    data?.settings.pinLockedUntil &&
      new Date(data.settings.pinLockedUntil).getTime() > renderNow
  );
  const mfaBlocked = Boolean(
    data?.settings.mfaRequiredForPayout && data.settings.currentAal !== "aal2"
  );
  const selectedPayoutAccount = data?.accounts.find(
    (account) => String(account.id) === withdrawalForm.payoutAccountId
  );
  const selectedWithdrawalTaxRate = data?.withdrawalTaxRates.find(
    (rule) =>
      rule.country_code.toUpperCase() ===
        String(selectedPayoutAccount?.country_code || "").toUpperCase() &&
      rule.payout_method.toLowerCase() ===
        String(selectedPayoutAccount?.method || "").toLowerCase() &&
      rule.currency.toUpperCase() ===
        String(selectedPayoutAccount?.currency || "").toUpperCase()
  );
  const quoteKey = `${withdrawalForm.payoutAccountId}:${withdrawalForm.amount}`;
  const withdrawalQuote = withdrawalQuoteState?.key === quoteKey ? withdrawalQuoteState.quote : null;

  useEffect(() => {
    const payoutAccountId = Number(withdrawalForm.payoutAccountId || 0);
    const amount = numberValue(withdrawalForm.amount);
    if (!Number.isInteger(payoutAccountId) || payoutAccountId <= 0 || amount <= 0) return;
    const key = `${payoutAccountId}:${withdrawalForm.amount}`;
    const timer = window.setTimeout(async () => {
      try {
        const payload = await authenticatedFetchJson<{ quote: WithdrawalQuote }>(`/api/withdrawals/quote?payoutAccountId=${payoutAccountId}&amount=${encodeURIComponent(String(amount))}`, { cache: "no-store" });
        setWithdrawalQuoteState({ key, quote: payload.quote });
        setQuoteError("");
      } catch (loadError) {
        setQuoteError(loadError instanceof Error ? loadError.message : "Unable to calculate payout quote.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [withdrawalForm.payoutAccountId, withdrawalForm.amount]);

  async function addAccount(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);

    try {
      await authenticatedFetchJson("/api/payout-accounts", {
        method: "POST",
        body: JSON.stringify(accountForm),
      });
      setAccountForm(emptyAccountForm);
      await loadData();
    } catch (submitError) {
      alert(submitError instanceof Error ? submitError.message : "Failed to add payout account.");
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(accountId: number) {
    setBusy(true);
    try {
      await authenticatedFetchJson("/api/payout-accounts", {
        method: "PATCH",
        body: JSON.stringify({ accountId, action: "set_default" }),
      });
      await loadData();
    } catch (actionError) {
      alert(actionError instanceof Error ? actionError.message : "Failed to update payout account.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateAccount(accountId: number) {
    if (!confirm("Deactivate this payout account?")) return;
    setBusy(true);
    try {
      await authenticatedFetchJson("/api/payout-accounts", {
        method: "PATCH",
        body: JSON.stringify({ accountId, action: "deactivate" }),
      });
      await loadData();
    } catch (actionError) {
      alert(actionError instanceof Error ? actionError.message : "Failed to deactivate payout account.");
    } finally {
      setBusy(false);
    }
  }

  async function requestWithdrawal(event: React.FormEvent) {
    event.preventDefault();
    if (!data) return;

    const amount = Number(withdrawalForm.amount || 0);
    if (amount > numberValue(data.wallet.balance)) {
      alert("Withdrawal amount exceeds your available balance.");
      return;
    }

    setBusy(true);
    try {
      await authenticatedFetchJson("/api/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          payoutAccountId: withdrawalForm.payoutAccountId,
          amount,
          note: withdrawalForm.note,
          withdrawalPin: withdrawalForm.withdrawalPin,
          deviceKey: getDeviceKey(),
          deviceName: currentDeviceName(),
          requestKey: crypto.randomUUID(),
        }),
      });
      setWithdrawalForm((current) => ({ ...current, amount: "", note: "", withdrawalPin: "" }));
      await loadData();
    } catch (submitError) {
      alert(submitError instanceof Error ? submitError.message : "Failed to request withdrawal.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelWithdrawal(withdrawalId: number) {
    if (!confirm(`Cancel withdrawal #${withdrawalId} and return the balance?`)) return;
    setBusy(true);
    try {
      await authenticatedFetchJson("/api/withdrawals", {
        method: "PATCH",
        body: JSON.stringify({ withdrawalId, action: "cancel" }),
      });
      await loadData();
    } catch (actionError) {
      alert(actionError instanceof Error ? actionError.message : "Failed to cancel withdrawal.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-24 text-center text-white">
        Loading seller payout center...
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-24 text-center text-white">
        <h1 className="text-4xl font-black">Payout Center Unavailable</h1>
        <p className="mx-auto mt-4 max-w-xl text-red-300">{error}</p>
        <Link href="/seller" className="mt-8 inline-flex rounded-xl bg-cyan-400 px-6 py-4 font-black text-black">
          Seller Dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_38%)]">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-4 py-14 lg:flex-row lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-300">
              <FaMoneyBillWave /> Seller Payout Center
            </p>
            <h1 className="mt-5 text-5xl font-black md:text-7xl">Withdraw Earnings</h1>
            <p className="mt-4 max-w-3xl text-slate-300">
              Add encrypted payout accounts, request withdrawals, and track every payout from review to settlement.
            </p>
          </div>
          <Link href="/wallet" className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400 px-6 py-4 font-black text-cyan-300 hover:bg-cyan-400 hover:text-black">
            <FaWallet /> Open Wallet
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Available Balance" value={formatPrice(data.wallet.balance)} icon={<FaWallet />} />
          <Metric label="Pending Payouts" value={formatPrice(pendingAmount)} icon={<FaClock />} />
          <Metric label="Total Withdrawn" value={formatPrice(data.wallet.total_withdrawn)} icon={<FaCheckCircle />} />
          <Metric label="Payout Accounts" value={String(data.accounts.length)} icon={<FaCreditCard />} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">KYC level</p>
            <p className="mt-2 text-2xl font-black text-cyan-300">{data.settings.kycLevel}</p>
            <p className="mt-1 text-xs text-slate-500">Minimum required: {data.settings.minimumKycLevel}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Risk level</p>
            <p className="mt-2 text-2xl font-black text-yellow-300">{pretty(data.settings.riskLevel)}</p>
            <p className="mt-1 text-xs text-slate-500">Daily limit: {formatPrice(data.settings.dailyLimit)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Withdrawal protection</p>
            <p className="mt-2 text-lg font-black text-emerald-300">{data.settings.pinSet ? "PIN active" : "PIN not configured"}</p>
            <Link href="/account/security" className="mt-2 inline-block text-xs font-black text-cyan-300">Open Security Center →</Link>
          </div>
        </div>

        {!data.settings.pinSet || cooldownActive || pinLocked || mfaBlocked ? (
          <div className="mt-6 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-5 text-sm text-yellow-100">
            {!data.settings.pinSet ? <p>Set a withdrawal PIN in Account Security before requesting payout.</p> : null}
            {cooldownActive ? <p>Security cooldown active until {formatDate(data.settings.payoutCooldownUntil)} ({data.settings.cooldownReason || "security change"}).</p> : null}
            {pinLocked ? <p>Withdrawal PIN is locked until {formatDate(data.settings.pinLockedUntil)}.</p> : null}
            {mfaBlocked ? <p>MFA verification is required for payout. Re-authenticate with your authenticator first.</p> : null}
          </div>
        ) : null}

        <div className="mt-10 grid gap-8 xl:grid-cols-2">
          <form onSubmit={requestWithdrawal} className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.06] p-6">
            <h2 className="flex items-center gap-3 text-2xl font-black"><FaMoneyBillWave className="text-emerald-300" /> New Withdrawal</h2>
            <p className="mt-2 text-sm text-slate-400">
              Minimum {formatPrice(data.settings.minimumAmount)}. Hold period: {data.settings.holdHours} hour(s).
            </p>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Payout account
                <select
                  value={withdrawalForm.payoutAccountId}
                  onChange={(event) => setWithdrawalForm((current) => ({ ...current, payoutAccountId: event.target.value }))}
                  required
                  className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white outline-none focus:border-cyan-400"
                >
                  <option value="">Select account</option>
                  {data.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label} · {account.masked_identifier}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Amount
                <input
                  type="number"
                  min={data.settings.minimumAmount}
                  max={Math.min(data.settings.maximumAmount, numberValue(data.wallet.balance))}
                  step="1"
                  value={withdrawalForm.amount}
                  onChange={(event) => setWithdrawalForm((current) => ({ ...current, amount: event.target.value }))}
                  required
                  placeholder={String(data.settings.minimumAmount)}
                  className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              {selectedPayoutAccount && !selectedWithdrawalTaxRate ? (
                <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">
                  Withdrawal tax is not configured for {selectedPayoutAccount.country_code} · {pretty(selectedPayoutAccount.method)}. Contact support before requesting payout.
                </div>
              ) : null}

              {quoteError && withdrawalForm.amount ? <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{quoteError}</div> : null}
              {withdrawalQuote && selectedWithdrawalTaxRate ? (
                <div className="rounded-xl border border-cyan-400/20 bg-black/30 p-4 text-sm">
                  <div className="flex justify-between gap-4 text-slate-300"><span>Wallet debit</span><strong>{currencyMoney(withdrawalQuote.source_amount, withdrawalQuote.source_currency)}</strong></div>
                  <div className="mt-2 flex justify-between gap-4 text-slate-300"><span>FX snapshot</span><strong>{withdrawalQuote.source_currency} → {withdrawalQuote.payout_currency} @ {numberValue(withdrawalQuote.fx_rate)}</strong></div>
                  <div className="mt-2 flex justify-between gap-4 text-slate-300"><span>Payout gross</span><strong>{currencyMoney(withdrawalQuote.payout_gross_amount, withdrawalQuote.payout_currency)}</strong></div>
                  <div className="mt-2 flex justify-between gap-4 text-yellow-200"><span>Withdrawal tax ({numberValue(withdrawalQuote.rate_percent).toFixed(2)}%{numberValue(withdrawalQuote.fixed_amount) ? ` + ${currencyMoney(withdrawalQuote.fixed_amount, withdrawalQuote.payout_currency)}` : ""})</span><strong>-{currencyMoney(withdrawalQuote.tax_amount, withdrawalQuote.payout_currency)}</strong></div>
                  <div className="mt-3 flex justify-between gap-4 border-t border-white/10 pt-3 text-emerald-200"><span>Seller receives before provider fee</span><strong>{currencyMoney(withdrawalQuote.payout_net_amount, withdrawalQuote.payout_currency)}</strong></div>
                  <p className="mt-2 text-xs text-slate-500">Country {withdrawalQuote.country_code} · {pretty(withdrawalQuote.payout_method)}. FX and tax are snapshotted when the request is created.</p>
                </div>
              ) : null}

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Note (optional)
                <textarea
                  value={withdrawalForm.note}
                  onChange={(event) => setWithdrawalForm((current) => ({ ...current, note: event.target.value }))}
                  rows={3}
                  maxLength={500}
                  className="resize-none rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white outline-none focus:border-cyan-400"
                  placeholder="Payout instructions or internal reference"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Withdrawal PIN
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={withdrawalForm.withdrawalPin}
                  onChange={(event) => setWithdrawalForm((current) => ({ ...current, withdrawalPin: event.target.value.replace(/\D/g, "") }))}
                  required
                  placeholder="6-digit PIN"
                  className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <button
                type="submit"
                disabled={busy || data.accounts.length === 0 || !selectedWithdrawalTaxRate || numberValue(data.wallet.balance) < data.settings.minimumAmount || !data.settings.pinSet || cooldownActive || pinLocked || mfaBlocked || withdrawalForm.withdrawalPin.length !== 6}
                className="rounded-xl bg-emerald-400 px-5 py-4 font-black text-black hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Request Withdrawal Securely
              </button>
            </div>
          </form>

          <form onSubmit={addAccount} className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.06] p-6">
            <h2 className="flex items-center gap-3 text-2xl font-black"><FaPlus className="text-cyan-300" /> Add Payout Account</h2>
            <p className="mt-2 text-sm text-slate-400">Account numbers and payout emails are encrypted on the server.</p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Method
                <select
                  value={accountForm.method}
                  onChange={(event) => setAccountForm((current) => ({ ...current, method: event.target.value }))}
                  className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="paypal">PayPal</option>
                  <option value="wise">Wise</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Label
                <input value={accountForm.label} onChange={(event) => setAccountForm((current) => ({ ...current, label: event.target.value }))} placeholder="Primary bank" className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white" />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Account name
                <input required value={accountForm.accountName} onChange={(event) => setAccountForm((current) => ({ ...current, accountName: event.target.value }))} className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white" />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                {accountForm.method === "bank_transfer" ? "Account number" : "Payout email"}
                <input required value={accountForm.accountIdentifier} onChange={(event) => setAccountForm((current) => ({ ...current, accountIdentifier: event.target.value }))} className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white" />
              </label>

              {accountForm.method === "bank_transfer" ? (
                <label className="grid gap-2 text-sm font-bold text-slate-300">
                  Bank name
                  <input required value={accountForm.bankName} onChange={(event) => setAccountForm((current) => ({ ...current, bankName: event.target.value }))} placeholder="BCA, BRI, Mandiri..." className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-white" />
                </label>
              ) : null}

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Payout country
                <input
                  required
                  maxLength={2}
                  value={accountForm.countryCode}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      countryCode: event.target.value.replace(/[^a-z]/gi, "").toUpperCase(),
                    }))
                  }
                  placeholder="ID"
                  className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 uppercase text-white"
                />
                <span className="text-xs font-normal text-slate-500">Two-letter country code used to select the withdrawal tax rule.</span>
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Payout currency
                <input
                  required
                  maxLength={3}
                  value={accountForm.currency}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      currency: event.target.value.replace(/[^a-z]/gi, "").toUpperCase(),
                    }))
                  }
                  placeholder="IDR"
                  className="rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 uppercase text-white"
                />
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#090d1d] px-4 py-3 text-sm font-bold text-slate-300">
                <input type="checkbox" checked={accountForm.isDefault} onChange={(event) => setAccountForm((current) => ({ ...current, isDefault: event.target.checked }))} />
                Make default
              </label>
            </div>

            <button type="submit" disabled={busy} className="mt-5 w-full rounded-xl bg-cyan-400 px-5 py-4 font-black text-black hover:bg-cyan-300 disabled:opacity-50">
              Save Encrypted Account
            </button>
          </form>
        </div>

        <div className="mt-10 grid gap-8 xl:grid-cols-[420px_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-black">Payout Accounts</h2>
            <div className="mt-5 space-y-4">
              {data.accounts.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-black/30 p-5 text-slate-400">Add a payout account before requesting withdrawal.</p>
              ) : (
                data.accounts.map((account) => (
                  <div key={account.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <div className="mt-1 text-cyan-300">{methodIcon(account.method)}</div>
                        <div>
                          <p className="font-black">{account.label || pretty(account.method)}</p>
                          <p className="mt-1 text-sm text-slate-400">{account.account_name}</p>
                          <p className="mt-1 font-mono text-sm text-slate-300">{account.masked_identifier}</p>
                          <p className="mt-1 text-xs text-slate-500">{account.country_code} · {account.currency}</p>
                        </div>
                      </div>
                      {account.is_default ? <FaStar className="text-yellow-300" title="Default" /> : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!account.is_default ? (
                        <button disabled={busy} onClick={() => setDefault(account.id)} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-black text-cyan-300">Set Default</button>
                      ) : null}
                      <button disabled={busy} onClick={() => deactivateAccount(account.id)} className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-black text-red-300">Deactivate</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="flex items-center gap-3 text-2xl font-black"><FaHistory className="text-cyan-300" /> Withdrawal History</h2>
            <div className="mt-5 space-y-4">
              {data.withdrawals.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-black/30 p-6 text-slate-400">No withdrawal requests yet.</p>
              ) : (
                data.withdrawals.map((withdrawal) => (
                  <div key={withdrawal.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-black">Withdrawal #{withdrawal.id}</p>
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(withdrawal.status)}`}>{pretty(withdrawal.status)}</span>
                        </div>
                        <p className="mt-3 text-3xl font-black text-emerald-300">{currencyMoney(withdrawal.payout_net_amount || withdrawal.net_amount, withdrawal.payout_currency || withdrawal.currency)}</p>
                        <p className="mt-2 text-sm text-slate-400">{pretty(withdrawal.payout_method)} · {withdrawal.payout_account_number}</p>
                      </div>
                      <div className="text-right text-sm text-slate-400">
                        <p>Requested: {formatDate(withdrawal.created_at)}</p>
                        <p className="mt-1">Eligible: {formatDate(withdrawal.eligible_at)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-1 text-sm text-slate-300 sm:grid-cols-3">
                      <p>Wallet debit: {currencyMoney(withdrawal.source_amount || withdrawal.amount, withdrawal.source_currency || "IDR")}</p>
                      <p>FX: {withdrawal.source_currency || "IDR"} → {withdrawal.payout_currency || withdrawal.currency} @ {numberValue(withdrawal.fx_rate || 1)}</p>
                      <p>Withdrawal tax: {currencyMoney(withdrawal.payout_tax_amount || withdrawal.tax_amount, withdrawal.payout_currency || withdrawal.currency)} ({numberValue(withdrawal.tax_rate_percent).toFixed(2)}%)</p>
                      <p>Provider fee: {currencyMoney(withdrawal.payout_provider_fee || withdrawal.fee_amount, withdrawal.payout_currency || withdrawal.currency)}</p>
                      <p className="font-black text-emerald-300">Net payout: {currencyMoney(withdrawal.payout_net_amount || withdrawal.net_amount, withdrawal.payout_currency || withdrawal.currency)}</p>
                    </div>
                    {withdrawal.payout_reference ? <p className="mt-3 text-sm text-cyan-300">Reference: {withdrawal.payout_reference}</p> : null}
                    {withdrawal.admin_note ? <p className="mt-3 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm text-yellow-100">{withdrawal.admin_note}</p> : null}
                    {withdrawal.risk_level ? <p className="mt-3 text-xs text-slate-400">Security: {pretty(withdrawal.risk_level)} risk · score {withdrawal.risk_score || 0} · {pretty(withdrawal.security_review_status)}</p> : null}
                    {withdrawal.status === "pending" ? (
                      <button disabled={busy} onClick={() => cancelWithdrawal(withdrawal.id)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-400/40 px-4 py-2 text-sm font-black text-red-300">
                        <FaTimesCircle /> Cancel & Return Balance
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
          <h2 className="flex items-center gap-2 text-xl font-black text-emerald-200"><FaShieldAlt /> Payout Protection</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Withdrawal funds are reserved immediately, payout account identifiers are encrypted, and every admin reveal or status change is written to the audit log.
          </p>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-cyan-300">{icon}</div>
      <p className="mt-4 text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}
